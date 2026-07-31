/**
 * CRAZII Data Service - OANDA XAU/USD (FX Spot)
 * Nguồn data: Twelve Data API (XAU/USD = giá chính xác OANDA)
 * Real-time: Polling mỗi 8s (free tier: 8 req/phút)
 *
 * Hoàn toàn tách biệt với dataService.ts (Key Level - Crypto)
 */

import type { Candle } from '../types/index.js';

const TD_BASE = 'https://api.twelvedata.com';
const TD_KEY = (import.meta as any).env?.VITE_TWELVEDATA_KEY || '';

// Twelve Data interval format
const TD_INTERVALS: Record<string, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min',
  '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1day',
};

/**
 * Lấy XAU/USD (FX Spot) candles từ Twelve Data
 */
export async function fetchOandaGoldCandles(
  interval = '5m',
  limit = 1000
): Promise<Candle[]> {
  if (!TD_KEY) {
    console.error('[CRAZII] Missing VITE_TWELVEDATA_KEY in .env');
    return [];
  }

  const tdInterval = TD_INTERVALS[interval] || '5min';
  // Twelve Data max outputsize = 5000 (free tier thường giới hạn ~800)
  const outputsize = Math.min(limit, 800);

  try {
    const url = `${TD_BASE}/time_series?symbol=XAU/USD&interval=${tdInterval}&outputsize=${outputsize}&apikey=${TD_KEY}`;
    console.log('[CRAZII] Fetching from Twelve Data...');
    const res = await fetch(url);
    const json = await res.json();

    // Twelve Data error response
    if (json.code) {
      console.error('[CRAZII] Twelve Data error:', json.code, json.message);
      return [];
    }

    // Success: json.values = [{datetime, open, high, low, close, volume}, ...]
    // Ordered newest first → reverse
    if (json.values && json.values.length > 0) {
      const candles: Candle[] = json.values.map((v: any) => ({
        time: Math.floor(new Date(v.datetime + ' GMT').getTime() / 1000),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: v.volume ? parseFloat(v.volume) : 0,
      })).reverse();

      console.log(`[CRAZII] Loaded ${candles.length} candles (XAU/USD FX Spot)`);
      return candles;
    }

    console.warn('[CRAZII] No data from Twelve Data:', json);
    return [];
  } catch (e) {
    console.error('[CRAZII] Fetch error:', e);
    return [];
  }
}

/**
 * Lấy nến ngày cho Pivot
 */
export async function fetchOandaGoldDaily(limit = 10): Promise<Candle[]> {
  return fetchOandaGoldCandles('1d', limit);
}

/**
 * Live polling: lấy 2 nến mới nhất mỗi 8s
 * Free tier Twelve Data: 8 req/phút = 1 req mỗi 7.5s
 */
export interface LiveGoldCandle extends Candle {
  isClosed: boolean;
}

export function connectGoldWebSocket(
  interval: string,
  onUpdate: (candle: LiveGoldCandle) => void
): { close: () => void } {
  let active = true;

  const poll = async () => {
    if (!active || !TD_KEY) return;
    try {
      const tdInterval = TD_INTERVALS[interval] || '5min';
      const url = `${TD_BASE}/time_series?symbol=XAU/USD&interval=${tdInterval}&outputsize=2&apikey=${TD_KEY}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.values && json.values.length > 0) {
        // Newest candle = json.values[0]
        const v = json.values[0];
        const time = Math.floor(new Date(v.datetime + ' GMT').getTime() / 1000);

        onUpdate({
          time,
          open: parseFloat(v.open),
          high: parseFloat(v.high),
          low: parseFloat(v.low),
          close: parseFloat(v.close),
          volume: v.volume ? parseFloat(v.volume) : 0,
          isClosed: false, // Twelve Data trả nến đang mở
        });
      }
    } catch { /* silent */ }
  };

  // Poll ngay + lặp mỗi 8s
  poll();
  const timer = setInterval(poll, 8000);

  return {
    close: () => {
      active = false;
      clearInterval(timer);
    },
  };
}
