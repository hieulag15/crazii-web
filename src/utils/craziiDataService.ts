/**
 * CRAZII Data Service - Riêng biệt cho hệ thống CRAZII
 * Nguồn data: OANDA:XAUUSD (Vàng / Đô la Mỹ) qua TradingView public API
 * Hoàn toàn tách biệt với dataService.ts (Key Level - Crypto)
 *
 * TradingView public endpoint cho phép lấy historical bars
 * mà không cần API key. Real-time thì dùng polling mỗi 10s.
 */

import type { Candle } from '../types/index.js';

export interface LiveCandle extends Candle {
  isClosed: boolean;
}

// TradingView resolution mapping
const TV_RESOLUTIONS: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': '1D',
};

// CORS proxy (TradingView blocks direct browser requests)
const CORS_PROXY = 'https://corsproxy.io/?';

/**
 * Lấy OANDA XAU/USD candles từ TradingView public API
 * Endpoint: https://tvc4.forexpros.com hoặc TradingView UDF
 */
export async function fetchOandaGoldCandles(
  interval = '5m',
  limit = 1000
): Promise<Candle[]> {
  const resolution = TV_RESOLUTIONS[interval] || '5';

  // Tính thời gian: from = now - limit * interval_seconds
  const intervalSeconds: Record<string, number> = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '4h': 14400, '1d': 86400,
  };
  const seconds = intervalSeconds[interval] || 300;
  const now = Math.floor(Date.now() / 1000);
  const from = now - limit * seconds;

  try {
    // Method 1: TradingView UDF compatible endpoint (Investing.com proxy)
    const tvUrl = `https://tvc6.forexpros.com/init.php?family_prefix=tvc6&carrier=0f815e70e6a13b1a73e3aad3b0346098&time=${now}&domain_ID=1&lang_ID=1&timezone_ID=8`;
    // Actual history endpoint
    const historyUrl = `https://tvc6.forexpros.com/a]956f7d47be0f825e8e24d3e1/1/1/8/history?symbol=8830&resolution=${resolution}&from=${from}&to=${now}`;

    const response = await fetch(`${CORS_PROXY}${encodeURIComponent(historyUrl)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.s === 'ok' && data.t && data.t.length > 0) {
        return data.t.map((time: number, i: number) => ({
          time,
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v ? data.v[i] : 0,
        }));
      }
    }
  } catch (e) {
    console.warn('[CRAZII Data] TVC6 failed, trying fallback...', e);
  }

  try {
    // Method 2: Fallback - Binance XAUUSDT Futures (chênh ~$3-5 nhưng vẫn dùng được)
    const binanceUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=${interval}&limit=${limit}`;
    let response = await fetch(binanceUrl);
    if (!response.ok) {
      response = await fetch(`${CORS_PROXY}${encodeURIComponent(binanceUrl)}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data.map((k: unknown[]) => ({
        time: Math.floor((k[0] as number) / 1000),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      }));
    }
  } catch (e) {
    console.error('[CRAZII Data] All sources failed:', e);
  }

  return [];
}

/**
 * Lấy nến ngày cho Pivot calculation
 */
export async function fetchOandaGoldDaily(limit = 10): Promise<Candle[]> {
  return fetchOandaGoldCandles('1d', limit);
}

/**
 * Polling-based real-time update
 * Vì OANDA/TradingView không có public WebSocket,
 * ta dùng polling REST mỗi interval (10-15s)
 * Trả về cleanup function
 */
export function startOandaGoldPolling(
  interval: string,
  onUpdate: (candles: Candle[]) => void,
  pollIntervalMs = 10000
): { stop: () => void } {
  let active = true;

  const poll = async () => {
    if (!active) return;
    try {
      const candles = await fetchOandaGoldCandles(interval, 5);
      if (candles.length > 0 && active) {
        onUpdate(candles);
      }
    } catch { /* silent */ }
  };

  // Poll ngay lập tức rồi lặp lại
  poll();
  const timer = setInterval(poll, pollIntervalMs);

  return {
    stop: () => {
      active = false;
      clearInterval(timer);
    },
  };
}
