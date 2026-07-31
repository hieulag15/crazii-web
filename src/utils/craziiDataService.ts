/**
 * CRAZII Data Service - Riêng biệt cho hệ thống CRAZII
 * Nguồn data: Binance Futures XAUUSDT (giá vàng spot, chênh OANDA ~$3)
 * Hoàn toàn tách biệt với dataService.ts (Key Level - Crypto)
 *
 * Lý do dùng Binance: OANDA/TradingView không có public API free.
 * Binance XAUUSDT perpetual futures tracking giá spot, chênh rất nhỏ.
 * Logic CRAZII (OP, MLP, KTR) dựa trên biến động tương đối nên không bị ảnh hưởng.
 */

import type { Candle } from '../types/index.js';

const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const CORS_PROXY = 'https://corsproxy.io/?';

async function fetchBinance(url: string): Promise<Response> {
  try {
    const res = await fetch(url);
    if (res.ok) return res;
  } catch { /* CORS */ }
  return fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
}

/**
 * Lấy XAUUSDT candles từ Binance Futures
 */
export async function fetchOandaGoldCandles(
  interval = '5m',
  limit = 1000
): Promise<Candle[]> {
  try {
    const url = `${BINANCE_FUTURES}/klines?symbol=XAUUSDT&interval=${interval}&limit=${limit}`;
    const response = await fetchBinance(url);
    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) return [];

    return data.map((k: unknown[]) => ({
      time: Math.floor((k[0] as number) / 1000),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  } catch (e) {
    console.error('[CRAZII] Fetch failed:', e);
    return [];
  }
}

/**
 * Lấy nến ngày cho Pivot
 */
export async function fetchOandaGoldDaily(limit = 10): Promise<Candle[]> {
  return fetchOandaGoldCandles('1d', limit);
}
