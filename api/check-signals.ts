/**
 * /api/check-signals — Cron trigger mỗi 5 phút
 * 1. Chạy CRAZII engine trên XAU/USD (Twelve Data) tại nến vừa đóng
 * 2. Lưu signal mới vào MongoDB crazii_signals
 * 3. Gửi Telegram notification cho signal mới
 *
 * Cron-job.org gọi URL này mỗi 5 phút
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';
import { calculateAll, calculateADR, calculatePivot } from '../src/utils/craziiEngine.js';
import type { Candle, EnhancedSignal } from '../src/types/index.js';

const TD_BASE = 'https://api.twelvedata.com';
const TELEGRAM_API = 'https://api.telegram.org';
const STRATEGY_VERSION = 'crazii-v2';

function getTDKey(): string {
  return process.env.TWELVEDATA_KEY || process.env.VITE_TWELVEDATA_KEY || '';
}

async function fetchTDCandles(interval: string, outputsize: number): Promise<Candle[]> {
  const key = getTDKey();
  if (!key) throw new Error('Missing TWELVEDATA_KEY');
  const tdInterval: Record<string, string> = {
    '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day',
  };
  const url = `${TD_BASE}/time_series?symbol=XAU/USD&interval=${tdInterval[interval] || interval}&outputsize=${outputsize}&apikey=${key}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.code) throw new Error(`Twelve Data: ${json.code} ${json.message}`);
  if (!json.values || json.values.length === 0) return [];
  return json.values.map((v: any) => ({
    time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume ? parseFloat(v.volume) : 0,
  })).reverse();
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch { return false; }
}

function formatSignalMessage(sig: EnhancedSignal): string {
  const isBuy = sig.side === 'buy';
  const emoji = isBuy ? '🟢🔼' : '🔴🔽';
  const action = isBuy ? 'BUY' : 'SELL';
  const timeStr = new Date(sig.time * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  });

  const passed = sig.confluences.filter(c => c.passed);
  const lines = [
    `${emoji} <b>CRAZII SIGNAL — ${action}</b>`,
    `━━━━━━━━━━━━━━━`,
    `📊 <b>XAU/USD (Vàng OANDA)</b> · M5`,
    `🎯 Loại: <b>${sig.source || sig.label}</b>`,
    `📈 Confidence: <b>${sig.confidence}%</b> · R:R 1:${sig.rr.toFixed(1)}`,
    `━━━━━━━━━━━━━━━`,
    `💰 Entry: <b>${sig.entry.toFixed(2)}</b>`,
    `🛑 SL: <b>${sig.sl.toFixed(2)}</b>`,
    `🎯 TP1: ${sig.tp1.toFixed(2)}`,
    `━━━━━━━━━━━━━━━`,
    `✅ Hợp lưu (${passed.length}/${sig.confluences.length}):`,
    ...sig.confluences.map(c => `${c.passed ? '✅' : '❌'} ${c.name}: ${c.detail}`),
    `━━━━━━━━━━━━━━━`,
    `🕐 ${timeStr} (GMT+7)`,
    `⚠️ <i>Tín hiệu tự động - không phải lời khuyên đầu tư</i>`,
  ];
  return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Bảo vệ endpoint (optional)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const db = await getDB();
    const col = db.collection('crazii_signals');
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const nowEpoch = Math.floor(Date.now() / 1000);

    // 1. Fetch data
    const [candles5m, dailyCandles] = await Promise.all([
      fetchTDCandles('5m', 500),
      fetchTDCandles('1d', 10),
    ]);

    if (candles5m.length < 50) {
      return res.json({ ok: true, message: 'Not enough candles', candles: candles5m.length });
    }

    // 2. Tìm nến vừa đóng (index length-2 = nến đã closed, length-1 = đang chạy)
    const closedCandle = candles5m[candles5m.length - 2];
    const latestCandle = candles5m[candles5m.length - 1];

    // 3. Chạy CRAZII engine
    const pivot = calculatePivot(dailyCandles);
    const adr = calculateADR(dailyCandles, 5);
    const craziiResult = calculateAll(candles5m, {
      opHour: 5, ktrMultiplier: 1.0, haSmooth: 6,
      dailyRange: adr, pivot, minConfidence: 55,
    });

    // 4. Lấy signal tại nến vừa đóng
    const freshSignals = craziiResult.enhancedSignals
      .filter(s => s.confidence >= 55)
      .filter(s => s.time === closedCandle.time || s.time === latestCandle.time)
      .filter(s => s.time <= nowEpoch + 60);

    const newSignals: string[] = [];
    const sentTelegram: string[] = [];

    for (const sig of freshSignals) {
      // Kiểm tra đã lưu chưa (tránh duplicate)
      const exists = await col.findOne({ time: sig.time, side: sig.side, strategyVersion: STRATEGY_VERSION });
      if (exists) continue;

      // TP1 = tp1 từ EnhancedSignal, SL = sl
      // Tính SL/TP đơn giản nếu cần
      const atrVal = Math.abs(sig.tp1 - sig.entry) / sig.rr; // risk = reward / rr
      const sl = sig.side === 'buy' ? sig.entry - atrVal : sig.entry + atrVal;
      const tp = sig.tp1;

      // Lưu vào DB
      const doc = {
        time: sig.time,
        timeVN: sig.time + 7 * 3600,
        strategyVersion: STRATEGY_VERSION,
        side: sig.side,
        source: sig.source || sig.label,
        entry: sig.entry,
        sl: sig.sl ?? sl,
        tp: tp,
        rr: Math.round(sig.rr * 100) / 100,
        confidence: sig.confidence,
        reason: sig.reason,
        confluences: sig.confluences,
        outcome: 'pending',
        createdAt: new Date(),
        sentTelegram: false,
      };
      await col.insertOne(doc);
      newSignals.push(`${sig.side.toUpperCase()} @ ${sig.entry.toFixed(2)} (${sig.confidence}%)`);

      // 5. Gửi Telegram
      if (chatId) {
        const msg = formatSignalMessage(sig);
        const ok = await sendTelegram(chatId, msg);
        if (ok) {
          await col.updateOne({ time: sig.time, side: sig.side, strategyVersion: STRATEGY_VERSION }, { $set: { sentTelegram: true } });
          sentTelegram.push(`${sig.side.toUpperCase()} @ ${sig.entry.toFixed(2)}`);
        }
      }
    }

    return res.json({
      ok: true,
      scannedCandle: new Date(closedCandle.time * 1000).toISOString(),
      newSignals,
      sentTelegram,
      totalFreshSignals: freshSignals.length,
    });
  } catch (err: any) {
    console.error('[check-signals]', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
