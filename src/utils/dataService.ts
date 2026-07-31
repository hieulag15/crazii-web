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
    // Ưu tiên Futures API (Perpetual) vì trade futures
    const futuresUrl = `${BINANCE_FUTURES}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    let response = await fetchWithFallback(futuresUrl);
    let data = await response.json();

    // Fallback sang Spot nếu Futures không có symbol
    if (!Array.isArray(data) || data.length === 0) {
      const spotUrl = `${BINANCE_REST_ENDPOINTS[0]}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      response = await fetchWithFallback(spotUrl);
      data = await response.json();
    }

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
 * Binance Futures WS cho XAUUSDT, Spot WS fallback cho các symbol khác
 * Sử dụng combined stream format để ổn định hơn
 */
export function connectWebSocket(
  symbol: string,
  interval: string,
  onUpdate: (candle: LiveCandle) => void
): WebSocket {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  
  // Thử Futures combined stream trước (ổn định hơn single stream)
  // Nếu timeout 10s không nhận data → fallback Spot
  let ws: WebSocket;
  let isClosed = false;
  let hasReceivedData = false;
  let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  let fallbackWs: WebSocket | null = null;

  function createWs(url: string, label: string): WebSocket {
    const socket = new WebSocket(url);

    socket.onopen = () => {
      console.log(`[WS-${label}] Connected:`, symbol, interval);
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        let data = JSON.parse(event.data);
        // Combined stream wraps data in { stream, data }
        if (data.data) data = data.data;
        const kline = data.k;
        if (!kline) return;

        hasReceivedData = true;
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

    socket.onerror = (error) => {
      if (!isClosed) console.error(`[WS-${label}] Error:`, error);
    };

    socket.onclose = () => {
      if (!isClosed) {
        console.log(`[WS-${label}] Closed, reconnecting in 5s...`);
        setTimeout(() => {
          if (!isClosed) {
            connectWebSocket(symbol, interval, onUpdate);
          }
        }, 5000);
      }
    };

    return socket;
  }

  // Strategy: try Spot stream directly (more reliable from browser)
  // Binance Spot WS works well for XAUUSDT too (same kline data)
  const spotUrl = `wss://stream.binance.com:9443/stream?streams=${stream}`;
  const futuresUrl = `wss://fstream.binance.com/stream?streams=${stream}`;

  // For XAUUSDT (Gold), use futures; others use spot
  const primaryUrl = isFuturesSymbol(symbol) ? futuresUrl : spotUrl;
  const fallbackUrl = isFuturesSymbol(symbol) ? spotUrl : futuresUrl;

  ws = createWs(primaryUrl, 'primary');

  // Fallback: if no data in 8s, try the other endpoint
  fallbackTimeout = setTimeout(() => {
    if (!hasReceivedData && !isClosed) {
      console.log('[WS] No data from primary, trying fallback...');
      fallbackWs = createWs(fallbackUrl, 'fallback');
      // Close primary after fallback connects
      try { ws.close(); } catch {}
    }
  }, 8000);

  // Override close to set flag and cleanup
  const originalClose = ws.close.bind(ws);
  ws.close = () => {
    isClosed = true;
    if (fallbackTimeout) clearTimeout(fallbackTimeout);
    if (fallbackWs) try { fallbackWs.close(); } catch {}
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
