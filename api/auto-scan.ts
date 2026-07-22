/**
 * API: Auto-scan H4 - Chạy bởi Vercel Cron mỗi 4h
 * Scan tất cả coin, phát hiện signal, lưu vào MongoDB
 * Cron: 0 3,7,11,15,19,23 * * * (UTC+7 = 20,0,4,8,12,16 UTC)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';

const BINANCE_API = 'https://api.binance.com/api/v3';

const COIN_LIST = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT',
  'AVAXUSDT','DOTUSDT','LINKUSDT','MATICUSDT','NEARUSDT','LTCUSDT','UNIUSDT',
  'ATOMUSDT','APTUSDT','FILUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'SEIUSDT','TIAUSDT','JUPUSDT','WLDUSDT','FETUSDT','RENDERUSDT','RUNEUSDT',
  'PENDLEUSDT','WIFUSDT','AAVEUSDT','MKRUSDT','LDOUSDT','CRVUSDT','ENSUSDT',
  'SSVUSDT','RPLUSDT','COMPUSDT',
];

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

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

// Simplified signal detection (server-side version)
function detectSignal(candles: Candle[]): any | null {
  if (candles.length < 50) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (!last || !prev) return null;

  // EMA calculation
  const closes = candles.map(c => c.close);
  const ema = (data: number[], period: number) => {
    const result: number[] = [data[0]];
    const m = 2 / (period + 1);
    for (let i = 1; i < data.length; i++) result[i] = (data[i] - result[i-1]) * m + result[i-1];
    return result;
  };
  const ema34 = ema(closes, 34);
  const ema89 = ema(closes, 89);
  const ema200 = ema(closes, 200);
  const i = candles.length - 1;

  // Trend
  let trend = 'sideway';
  if (ema34[i] > ema89[i] && ema89[i] > ema200[i]) trend = 'uptrend';
  if (ema34[i] < ema89[i] && ema89[i] < ema200[i]) trend = 'downtrend';

  // Pattern detection (simplified - last candle)
  const c = last;
  const range = c.high - c.low;
  if (range === 0) return null;
  const body = Math.abs(c.close - c.open);
  const isBullish = c.close > c.open;

  let pattern = '';
  let direction: 'bullish' | 'bearish' | null = null;

  // Hammer
  if ((c.high - c.low > 3 * body) && (c.close - c.low) / (0.001 + range) > 0.6 && (c.open - c.low) / (0.001 + range) > 0.6) {
    pattern = 'Hammer'; direction = 'bullish';
  }
  // Shooting Star
  if (prev.close < prev.open === false && c.open > prev.close && (c.high - Math.max(c.open, c.close)) >= body * 3 && (Math.min(c.close, c.open) - c.low) <= body) {
    pattern = 'Shooting Star'; direction = 'bearish';
  }
  // Bullish Engulfing
  if (prev.open > prev.close && c.close > c.open && c.close >= prev.open && prev.close >= c.open && (c.close - c.open) > (prev.open - prev.close)) {
    pattern = 'Bullish Engulfing'; direction = 'bullish';
  }
  // Bearish Engulfing
  if (prev.close > prev.open && c.open > c.close && c.open >= prev.close && prev.open >= c.close && (c.open - c.close) > (prev.close - prev.open)) {
    pattern = 'Bearish Engulfing'; direction = 'bearish';
  }

  if (!pattern || !direction) return null;

  // Check near key level (simplified: near EMA)
  const price = c.close;
  const distEma34 = Math.abs(price - ema34[i]) / price * 100;
  const distEma89 = Math.abs(price - ema89[i]) / price * 100;
  const nearLevel = distEma34 < 1.0 || distEma89 < 1.5;
  if (!nearLevel) return null;

  // Side validation
  const side = direction === 'bullish' ? 'buy' : 'sell';

  // Confidence
  let confidence = 55;
  if ((side === 'buy' && trend === 'uptrend') || (side === 'sell' && trend === 'downtrend')) confidence += 15;
  if ((side === 'buy' && trend === 'downtrend') || (side === 'sell' && trend === 'uptrend')) confidence -= 15;
  // Volume check
  const avgVol = candles.slice(-20).reduce((s, x) => s + x.volume, 0) / 20;
  const volConfirm = c.volume > avgVol * 1.5;
  if (volConfirm) confidence += 10;

  if (confidence < 55) return null;

  // SL/TP
  const wickBuffer = range * 0.15;
  const sl = side === 'buy' ? c.low - wickBuffer : c.high + wickBuffer;
  const risk = Math.abs(price - sl);
  const tp = side === 'buy' ? price + risk * 2 : price - risk * 2;
  const rr = Math.abs(tp - price) / Math.abs(price - sl);
  if (rr < 1.5) return null;

  return {
    symbol: '', time: c.time, side, entry: price, sl, tp, confidence, pattern,
    trend, volumeConfirm: volConfirm, rr,
    reason: `${pattern} | ${trend} | Vol: ${volConfirm ? '✅' : '⚠️'} | R:R ${rr.toFixed(1)}`,
    createdAt: Date.now(),
    outcome: 'pending', closedAt: null, closePrice: null, rAchieved: null,
    maxFavorable: price, maxAdverse: price,
    nearLevelPrice: ema34[i], nearLevelType: 'ema_dynamic',
    timeframe: '4h', notes: '', tags: [],
    marketContext: { ema34: ema34[i], ema89: ema89[i], ema200: ema200[i], volumeRatio: c.volume / avgVol, prevCandles: [] },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = await getDB();
    const col = db.collection('kl_signals');
    const results: string[] = [];

    for (const symbol of COIN_LIST) {
      try {
        const candles = await fetchCandles(symbol);
        const signal = detectSignal(candles);
        if (signal) {
          signal.symbol = symbol;
          // Check duplicate
          const exists = await col.findOne({ symbol, time: signal.time, side: signal.side });
          if (!exists) {
            await col.insertOne(signal);
            results.push(`${symbol}: ${signal.side.toUpperCase()} ${signal.pattern} (${signal.confidence}%)`);
          }
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 100));
    }

    return res.json({ ok: true, scanned: COIN_LIST.length, signals: results.length, details: results });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
