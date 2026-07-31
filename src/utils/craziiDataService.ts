/**
 * CRAZII Data Service - Riêng biệt cho hệ thống CRAZII
 * Nguồn data chính: Twelve Data API (XAU/USD Forex Spot - giá khớp OANDA)
 * Fallback: Binance Futures XAUUSDT
 *
 * Twelve Data free tier: 800 req/ngày, 8 req/phút
 * Hỗ trợ: 1min, 5min, 15min, 30min, 1h, 4h, 1day
 * Symbol: XAU/USD (Gold Spot giống OANDA)
 *
 * Để sử dụng: Đăng ký free tại https://twelvedata.com
 * Lấy API key, đặt vào .env: VITE_TWELVEDATA_KEY=your_key
 */

import type { Candle } from '../types/index.js';

// Twelve Data config
const TWELVE_DATA_BASE = 'https://api.twelvedata.com';
const TWELVE_DATA_KEY = (import.meta as any).env?.VITE_TWELVEDATA_KEY || '';

// Binance fallback
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const CORS_PROXY = 'https://corsproxy.io/?';

// Interval mapping for Twelve Data
const TD_INTERVALS: Record<string, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min',
  '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1day',
};

async function fetchBinance(url: string): Promise<Response> {
  try {
    const res = await fetch(url);
    if (res.ok) return res;
  } catch { /* CORS */ }
  return fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
}

/**
 * Lấy XAU/USD candles từ Twelve Data (giá FX Spot chính xác)
 * Fallback sang Binance XAUUSDT nếu không có API key hoặc lỗi
 */
export async function fetchOandaGoldCandles(
  interval = '5m',
  limit = 1000
): Promise<Candle[]> {
  // Thử Twelve Data trước (nếu có API key)
  if (TWELVE_DATA_KEY) {
    try {
      const tdInterval = TD_INTERVALS[interval] || '5min';
      const url = `${TWELVE_DATA_BASE}/time_series?symbol=XAU/USD&interval=${tdInterval}&outputsize=${Math.min(limit, 800)}&apikey=${TWELVE_DATA_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.values && data.values.length > 0) {
          // Twelve Data trả về mới nhất ở đầu, cần reverse
          const candles: Candle[] = data.values.map((v: any) => ({
            time: Math.floor(new Date(v.datetime).getTime() / 1000),
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseFloat(v.volume || '0'),
          })).reverse();
          return candles;
        }
      }
    } catch (e) {
      console.warn('[CRAZII] Twelve Data failed, using Binance fallback:', e);
    }
  }

  // Fallback: Binance XAUUSDT Futures
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
    console.error('[CRAZII] All sources failed:', e);
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
 * WebSocket real-time cho XAU/USD
 * Thử nhiều endpoint: Binance Futures WS → Spot WS
 * Nếu cả 2 đều bị block → dùng REST polling 5s
 */
export interface LiveGoldCandle extends Candle {
  isClosed: boolean;
}

export function connectGoldWebSocket(
  interval: string,
  onUpdate: (candle: LiveGoldCandle) => void
): { close: () => void } {
  const stream = `xauusdt@kline_${interval}`;
  let isClosed = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let hasReceivedData = false;

  // WS endpoints to try (order of priority)
  const WS_ENDPOINTS = [
    'wss://fstream.binance.com/ws',   // Futures (chính xác nhất cho XAUUSDT)
    'wss://stream.binance.com:9443/ws', // Spot (fallback, ổn định hơn)
  ];
  let endpointIdx = 0;

  function connect() {
    if (isClosed) return;
    const url = WS_ENDPOINTS[endpointIdx];
    console.log(`[CRAZII-WS] Trying ${url}...`);

    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`[CRAZII-WS] Connected, subscribing: ${stream}`);
      ws!.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream], id: 1 }));

      // Nếu sau 8s không nhận data → thử endpoint khác hoặc fallback polling
      setTimeout(() => {
        if (!hasReceivedData && !isClosed) {
          console.warn('[CRAZII-WS] No data after 8s, trying next...');
          try { ws?.close(); } catch {}
          endpointIdx++;
          if (endpointIdx < WS_ENDPOINTS.length) {
            connect();
          } else {
            // Tất cả WS bị block → fallback REST polling 5s
            startPolling();
          }
        }
      }, 8000);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id || data.result !== undefined) return;
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
      } catch { /* skip */ }
    };

    ws.onerror = () => {
      if (!isClosed && !hasReceivedData) {
        console.warn('[CRAZII-WS] Error on', url);
      }
    };

    ws.onclose = () => {
      if (!isClosed && hasReceivedData) {
        // Đã từng nhận data → reconnect cùng endpoint
        console.log('[CRAZII-WS] Disconnected, reconnecting in 3s...');
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
  }

  // REST polling fallback khi WS bị block hoàn toàn
  function startPolling() {
    if (isClosed) return;
    console.log('[CRAZII-POLL] WS unavailable, starting REST polling every 5s');

    const poll = async () => {
      if (isClosed) return;
      try {
        const url = `${BINANCE_FUTURES}/klines?symbol=XAUUSDT&interval=${interval}&limit=2`;
        const res = await fetchBinance(url);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const last = data[data.length - 1];
          onUpdate({
            time: Math.floor((last[0] as number) / 1000),
            open: parseFloat(last[1] as string),
            high: parseFloat(last[2] as string),
            low: parseFloat(last[3] as string),
            close: parseFloat(last[4] as string),
            volume: parseFloat(last[5] as string),
            isClosed: false,
          });
        }
      } catch { /* silent */ }
    };

    poll();
    pollTimer = setInterval(poll, 5000);
  }

  connect();

  return {
    close: () => {
      isClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (ws) { try { ws.close(); } catch {} }
    },
  };
}
