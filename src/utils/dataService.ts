/**
 * Data Service - Lấy dữ liệu real-time từ Binance
 * WebSocket cho live updates
 * CHÚ Ý: File này dành cho hệ thống KEY LEVEL (crypto)
 * Hệ thống CRAZII dùng file riêng: craziiDataService.ts
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

// Proxy endpoint cho trường hợp CORS bị chặn
const CORS_PROXY = 'https://corsproxy.io/?';

// Symbols cần dùng futures API
const FUTURES_SYMBOLS = ['XAUUSDT'];

function isFuturesSymbol(symbol: string): boolean {
  return FUTURES_SYMBOLS.includes(symbol);
}

async function fetchWithFallback(url: string): Promise<Response> {
  try {
    const res = await fetch(url);
    if (res.ok) return res;
  } catch {
    // CORS blocked, try proxy
  }
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
    const futuresUrl = `${BINANCE_FUTURES}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    let response = await fetchWithFallback(futuresUrl);
    let data = await response.json();

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
 * WebSocket real-time - Dùng SUBSCRIBE method (ổn định nhất)
 */
export function connectWebSocket(
  symbol: string,
  interval: string,
  onUpdate: (candle: LiveCandle) => void
): WebSocket {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  let isClosed = false;

  // Dùng raw WS endpoint + subscribe message
  const wsBaseUrl = isFuturesSymbol(symbol)
    ? 'wss://fstream.binance.com/ws'
    : 'wss://stream.binance.com:9443/ws';

  const ws = new WebSocket(wsBaseUrl);

  ws.onopen = () => {
    console.log(`[WS] Connected, subscribing: ${stream}`);
    ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream], id: 1 }));
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.id || data.result !== undefined) return; // skip ack
      const kline = data.k;
      if (!kline) return;

      onUpdate({
        time: Math.floor(kline.t / 1000),
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
        isClosed: kline.x,
      });
    } catch { /* skip */ }
  };

  ws.onerror = (error) => {
    if (!isClosed) console.error('[WS] Error:', error);
  };

  ws.onclose = () => {
    if (!isClosed) {
      console.log('[WS] Closed, reconnecting in 5s...');
      setTimeout(() => { if (!isClosed) connectWebSocket(symbol, interval, onUpdate); }, 5000);
    }
  };

  const originalClose = ws.close.bind(ws);
  ws.close = () => { isClosed = true; originalClose(); };

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
