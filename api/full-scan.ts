/**
 * API: Full Market Scan
 * Scan top 200+ coins từ Binance Futures (tất cả USDT perpetual pairs)
 * Dùng engine keyLevelSystem chạy trên H4
 * Lưu kết quả vào MongoDB collection kl_full_scan_results
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';
import {
  calculateKeyLevelSystem,
} from '../src/utils/keyLevelEngine.js';
import type { Candle } from '../src/types/index.js';

const BINANCE_FAPI = 'https://fapi.binance.com/fapi/v1';
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

/** Fetch tất cả USDT perpetual pairs đang active từ Binance Futures */
async function getAllUSDTPairs(): Promise<string[]> {
  const res = await fetch(`${BINANCE_FAPI}/exchangeInfo`);
  if (!res.ok) throw new Error('Failed to fetch exchangeInfo');
  const data = await res.json();
  return data.symbols
    .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING' && s.contractType === 'PERPETUAL')
    .map((s: any) => s.symbol)
    .sort();
}

/** Fetch H4 candles cho 1 symbol */
async function fetchCandles(symbol: string): Promise<Candle[]> {
  const url = `${BINANCE_FAPI}/klines?symbol=${symbol}&interval=4h&limit=100`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((k: any[]) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

/** Process 1 batch of symbols */
async function processBatch(symbols: string[]): Promise<any[]> {
  const results: any[] = [];

  await Promise.all(symbols.map(async (symbol) => {
    try {
      const candles = await fetchCandles(symbol);
      if (candles.length < 50) return;

      const result = calculateKeyLevelSystem(candles);
      if (result.signals.length === 0) return;

      // Lấy signals có confidence >= 60%
      const validSignals = result.signals.filter(sig => sig.confidence >= 60);
      if (validSignals.length === 0) return;

      const lastPrice = candles[candles.length - 1].close;

      results.push({
        symbol,
        lastPrice,
        signals: validSignals.map(sig => ({
          side: sig.side,
          confidence: sig.confidence,
          entry: sig.entry,
          sl: sig.sl,
          tp1: sig.tp,
          pattern: sig.pattern.name,
          time: sig.time,
          rr: sig.rr,
          volumeConfirm: sig.volumeConfirm,
          reason: sig.reason,
        })),
        trend: result.trend.direction,
        scanTime: new Date(),
        timeframe: '4h',
      });
    } catch {
      // Skip failed symbols silently
    }
  }));

  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await getDB();
    const col = db.collection('kl_full_scan_results');

    // Fetch tất cả USDT perpetual pairs
    const allPairs = await getAllUSDTPairs();
    console.log(`[Full Scan] Found ${allPairs.length} USDT perpetual pairs`);

    const allResults: any[] = [];

    // Process in batches to avoid rate limit
    for (let i = 0; i < allPairs.length; i += BATCH_SIZE) {
      const batch = allPairs.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(batch);
      allResults.push(...batchResults);

      // Delay between batches (trừ batch cuối)
      if (i + BATCH_SIZE < allPairs.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // Sort by highest confidence
    allResults.sort((a, b) => {
      const confA = Math.max(...a.signals.map((s: any) => s.confidence));
      const confB = Math.max(...b.signals.map((s: any) => s.confidence));
      return confB - confA;
    });

    // Clear old scan results and save new ones
    await col.deleteMany({});
    if (allResults.length > 0) {
      await col.insertMany(allResults);
    }

    // Return top 30
    const top30 = allResults.slice(0, 30);

    return res.json({
      ok: true,
      total: allPairs.length,
      withSignals: allResults.length,
      results: top30,
    });
  } catch (err) {
    console.error('[Full Scan] Error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
