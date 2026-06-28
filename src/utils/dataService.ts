/**
 * Data Service - Lấy dữ liệu real-time từ Binance
 * WebSocket cho live updates
 */

import type { Candle } from '../types/index.js';

// Sử dụng nhiều endpoint để tránh CORS
const BINANCE_REST_ENDPOINTS = [
  'https://api.binance.com/api/v3',
  'https://api1.binance.com/api/v3',
  'https://api2.binance.com/api/v3',
  'https://api3.binance.com/api/v3',
];
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const BINANCE_WS = 'wss://stream.binance.com:9443/ws';
const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/market/ws';

// Proxy endpoint cho trường hợp CORS bị chặn
const CORS_PROXY = 'https://corsproxy.io/?';

// Symbols cần dùng futures API
const FUTURES_SYMBOLS = ['XAUUSDT'];

function isFuturesSymbol(symbol: string): boolean {
  return FUTURES_SYMBOLS.includes(symbol);
}

async function fetchWithFallback(url: string): Promise<Response> {
  // Thử trực tiếp trước
  try {
    const res = await fetch(url);
    if (res.ok) return res;
  } catch {
    // CORS blocked, try proxy
  }
  // Fallback qua CORS proxy
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
  return fetch(proxyUrl);
}

export interface LiveCandle extends Candle {
  isClosed: boolean;
}

/**
 * Lấy dữ liệu lịch sử (candles)
 */
export async function fetchCandles(
  symbol = 'BTCUSDT',
  interval = '5m',
  limit = 500
): Promise<Candle[]> {
  try {
    const baseUrl = isFuturesSymbol(symbol)
      ? `${BINANCE_FUTURES}/klines`
      : `${BINANCE_REST_ENDPOINTS[0]}/klines`;
    const url = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetchWithFallback(url);
    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error('Invalid response:', data);
      return [];
    }

    return data.map((kline: unknown[]) => ({
      time: Math.floor((kline[0] as number) / 1000),
      open: parseFloat(kline[1] as string),
      high: parseFloat(kline[2] as string),
      low: parseFloat(kline[3] as string),
      close: parseFloat(kline[4] as string),
      volume: parseFloat(kline[5] as string),
    }));
  } catch (error) {
    console.error('Error fetching candles:', error);
    return [];
  }
}

/**
 * Lấy dữ liệu nến ngày cho Pivot
 */
export async function fetchDailyCandles(
  symbol = 'BTCUSDT',
  limit = 5
): Promise<Candle[]> {
  return fetchCandles(symbol, '1d', limit);
}

/**
 * WebSocket real-time
 */
export function connectWebSocket(
  symbol: string,
  interval: string,
  onUpdate: (candle: LiveCandle) => void
): WebSocket {
  let wsUrl: string;
  if (isFuturesSymbol(symbol)) {
    // Futures: dùng /market/ws endpoint (sau 2026-04-23 upgrade)
    wsUrl = `${BINANCE_FUTURES_WS}/${symbol.toLowerCase()}@kline_${interval}`;
  } else {
    wsUrl = `${BINANCE_WS}/${symbol.toLowerCase()}@kline_${interval}`;
  }

  const ws = new WebSocket(wsUrl);
  let isClosed = false;

  ws.onopen = () => {
    console.log('[WS] Connected:', symbol, interval);
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      const kline = data.k;
      if (!kline) return; // Skip invalid messages

      onUpdate({
        time: Math.floor(kline.t / 1000),
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
        isClosed: kline.x,
      });
    } catch {
      // Skip malformed messages
    }
  };

  ws.onerror = (error) => {
    if (!isClosed) console.error('[WS] Error:', error);
  };

  ws.onclose = () => {
    if (!isClosed) {
      console.log('[WS] Closed, reconnecting in 5s...');
      setTimeout(() => {
        if (!isClosed) {
          connectWebSocket(symbol, interval, onUpdate);
        }
      }, 5000);
    }
  };

  // Override close to set flag
  const originalClose = ws.close.bind(ws);
  ws.close = () => {
    isClosed = true;
    originalClose();
  };

  return ws;
}

/** Symbols hỗ trợ */
export const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT (Bitcoin)' },
  { value: 'ETHUSDT', label: 'ETH/USDT (Ethereum)' },
  { value: 'XAUUSDT', label: 'XAU/USDT (Gold - Futures)' },
  { value: 'SOLUSDT', label: 'SOL/USDT (Solana)' },
  { value: 'BNBUSDT', label: 'BNB/USDT (Binance)' },
  { value: 'XRPUSDT', label: 'XRP/USDT (Ripple)' },
  { value: 'DOGEUSDT', label: 'DOGE/USDT (Dogecoin)' },
] as const;

/** Timeframes */
export const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
] as const;
