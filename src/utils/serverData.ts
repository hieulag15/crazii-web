/**
 * Server-side data fetch (dùng cho /api/scan).
 * Chạy trên Node runtime của Vercel -> KHÔNG bị CORS,
 * gọi thẳng Binance API.
 */

import type { Candle } from '../types';

const SPOT = 'https://api.binance.com/api/v3';
const FUTURES = 'https://fapi.binance.com/fapi/v1';
const FUTURES_SYMBOLS = ['XAUUSDT'];

export async function fetchCandlesServer(
  symbol: string,
  interval: string,
  limit = 500
): Promise<Candle[]> {
  const base = FUTURES_SYMBOLS.includes(symbol) ? FUTURES : SPOT;
  const url = `${base}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error(`Binance error: ${JSON.stringify(data)}`);
  }

  return data.map((k: unknown[]) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}
