/**
 * API: Auto-scan H4 - Chạy bởi cron-job.org mỗi 4h
 * Scan tất cả coin bằng CÙNG engine với client (keyLevelEngine)
 * Phát hiện signal → lưu vào MongoDB
 * Đồng thời check TP/SL cho pending signals
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';

// Import engine chính (cùng logic với frontend)
import {
  calculateKeyLevelSystem,
  type KeyLevelSignal,
} from '../src/utils/keyLevelEngine.js';
import type { Candle } from '../src/types/index.js';

const BINANCE_API = 'https://api.binance.com/api/v3';

const COIN_LIST = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT',
  'AVAXUSDT','DOTUSDT','LINKUSDT','MATICUSDT','NEARUSDT','LTCUSDT','UNIUSDT',
  'ATOMUSDT','APTUSDT','FILUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'SEIUSDT','TIAUSDT','JUPUSDT','WLDUSDT','FETUSDT','RENDERUSDT','RUNEUSDT',
  'PENDLEUSDT','WIFUSDT','AAVEUSDT','MKRUSDT','LDOUSDT','CRVUSDT','ENSUSDT',
  'SSVUSDT','RPLUSDT','COMPUSDT',
];

async function fetchCandles(symbol: string): Promise<Candle[]> {
  const url = `${BINANCE_API}/klines?symbol=${symbol}&interval=4h&limit=500`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((k: any[]) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = await getDB();
    const col = db.collection('kl_signals');
    const newSignals: string[] = [];
    const trackResults: string[] = [];

    // PHASE 1: Check TP/SL cho pending signals
    const pending = await col.find({ outcome: 'pending' }).toArray();
    const pendingSymbols = [...new Set(pending.map(s => s.symbol as string))];

    for (const sym of pendingSymbols) {
      try {
        const candles = await fetchCandles(sym);
        if (candles.length === 0) continue;
        const symSignals = pending.filter(s => s.symbol === sym);

        for (const sig of symSignals) {
          // Chỉ check nến SAU entry
          const entryTime = Math.floor((sig.createdAt as number) / 1000);
          const after = candles.filter(c => c.time > entryTime);
          if (after.length === 0) continue;

          let hit = false;
          for (const c of after) {
            if (sig.side === 'buy') {
              if (c.low <= sig.sl) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'sl', rAchieved: -1, closedAt: c.time * 1000, closePrice: sig.sl } });
                trackResults.push(`${sym}: SL`); hit = true; break;
              }
              if (c.high >= sig.tp) {
                const r = Math.abs(sig.tp - sig.entry) / Math.abs(sig.entry - sig.sl);
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'tp', rAchieved: r, closedAt: c.time * 1000, closePrice: sig.tp } });
                trackResults.push(`${sym}: TP (${r.toFixed(1)}R)`); hit = true; break;
              }
            } else {
              if (c.high >= sig.sl) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'sl', rAchieved: -1, closedAt: c.time * 1000, closePrice: sig.sl } });
                trackResults.push(`${sym}: SL`); hit = true; break;
              }
              if (c.low <= sig.tp) {
                const r = Math.abs(sig.entry - sig.tp) / Math.abs(sig.sl - sig.entry);
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'tp', rAchieved: r, closedAt: c.time * 1000, closePrice: sig.tp } });
                trackResults.push(`${sym}: TP (${r.toFixed(1)}R)`); hit = true; break;
              }
            }
          }

          // Update max favorable/adverse
          if (!hit && after.length > 0) {
            const updates: Record<string, number> = {};
            if (sig.side === 'buy') {
              const maxH = Math.max(...after.map(c => c.high));
              const minL = Math.min(...after.map(c => c.low));
              if (maxH > (sig.maxFavorable || sig.entry)) updates.maxFavorable = maxH;
              if (minL < (sig.maxAdverse || sig.entry)) updates.maxAdverse = minL;
            } else {
              const minL = Math.min(...after.map(c => c.low));
              const maxH = Math.max(...after.map(c => c.high));
              if (minL < (sig.maxFavorable || sig.entry)) updates.maxFavorable = minL;
              if (maxH > (sig.maxAdverse || sig.entry)) updates.maxAdverse = maxH;
            }
            if (Object.keys(updates).length > 0) await col.updateOne({ _id: sig._id }, { $set: updates });
          }
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 50));
    }

    // PHASE 2: Scan signal mới bằng engine chính
    for (const symbol of COIN_LIST) {
      try {
        const candles = await fetchCandles(symbol);
        if (candles.length < 50) continue;

        const result = calculateKeyLevelSystem(candles);
        if (result.signals.length === 0) continue;

        // Lấy signal đầu tiên (mới nhất, confidence cao nhất)
        const sig = result.signals[0];

        // Check duplicate: cùng symbol + cùng time nến + cùng side
        const exists = await col.findOne({ symbol, side: sig.side, entry: sig.entry, timeframe: '4h' });
        if (exists) continue;

        // Build document để lưu (format giống client TrackedSignal)
        const lastIdx = candles.length - 1;
        const prevCandles = candles.slice(Math.max(0, lastIdx - 9), lastIdx + 1)
          .map(c => [c.open, c.high, c.low, c.close, c.volume]);

        const doc = {
          symbol,
          timeframe: '4h',
          time: sig.time,
          side: sig.side,
          entry: sig.entry,
          sl: sig.sl,
          tp: sig.tp,
          confidence: sig.confidence,
          pattern: sig.pattern.name,
          trend: sig.trend,
          volumeConfirm: sig.volumeConfirm,
          nearLevelPrice: sig.nearLevel.price,
          nearLevelType: sig.nearLevel.type,
          reason: sig.reason,
          rr: sig.rr,
          createdAt: Date.now(),
          outcome: 'pending',
          closedAt: null,
          closePrice: null,
          rAchieved: null,
          maxFavorable: sig.entry,
          maxAdverse: sig.entry,
          notes: '',
          tags: [],
          marketContext: {
            ema34: result.emaData.ema34[lastIdx] ?? 0,
            ema89: result.emaData.ema89[lastIdx] ?? 0,
            ema200: result.emaData.ema200[lastIdx] ?? 0,
            volumeRatio: result.volumeAnalysis[lastIdx]?.volumeRatio ?? 0,
            prevCandles,
          },
        };

        await col.insertOne(doc);
        newSignals.push(`${symbol}: ${sig.side.toUpperCase()} ${sig.pattern.name} (${sig.confidence}%) E:${sig.entry} SL:${sig.sl.toFixed(4)} TP:${sig.tp.toFixed(4)} R:R ${sig.rr.toFixed(1)}`);

        // AI đánh giá signal mới (nếu có GROQ_API_KEY)
        if (process.env.GROQ_API_KEY) {
          try {
            const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
              body: JSON.stringify({
                model: 'llama-3.1-70b-versatile',
                messages: [
                  { role: 'system', content: 'Bạn là AI trading assistant. Đánh giá nhanh signal trading bằng tiếng Việt (2-3 câu). Dựa trên phương pháp Key Level + Nến đảo chiều + EMA 34/89/200. Trả lời: NÊN VÀO / CẨN TRỌNG / KHÔNG NÊN + lý do ngắn.' },
                  { role: 'user', content: `${symbol} ${sig.side.toUpperCase()} | Pattern: ${sig.pattern.name} | Trend: ${sig.trend} | Entry: $${sig.entry} | SL: $${sig.sl.toFixed(4)} | TP: $${sig.tp.toFixed(4)} | R:R: ${sig.rr.toFixed(1)} | Volume: ${sig.volumeConfirm ? 'Xác nhận' : 'Thấp'} | Confidence: ${sig.confidence}%\nLý do: ${sig.reason}` },
                ],
                temperature: 0.3, max_tokens: 200,
              }),
            });
            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const aiText = aiData.choices?.[0]?.message?.content || '';
              if (aiText) {
                await col.updateOne({ symbol, side: sig.side, entry: sig.entry, timeframe: '4h' }, { $set: { notes: `🤖 ${aiText}` } });
              }
            }
          } catch { /* AI fail silently */ }
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 100));
    }

    return res.json({
      ok: true,
      scanned: COIN_LIST.length,
      newSignals: newSignals.length,
      tracked: trackResults.length,
      signals: newSignals,
      trackDetails: trackResults,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
