/**
 * CRAZII Data Service
 * Strategy: Twelve Data (giá chính xác OANDA) + Binance WS (real-time tick)
 * 
 * - Candle history: Twelve Data XAU/USD (FX Spot = OANDA)
 * - Real-time tick: Binance XAUUSDT WS → trừ offset → giá ≈ OANDA
 * - Offset = (Twelve Data price) - (Binance price) tại cùng thời điểm
 * - Offset recalc mỗi 60s
 */

import type { Candle } from '../types/index.js';

const TD_BASE = 'https://api.twelvedata.com';
const TD_KEY = (import.meta as any).env?.VITE_TWELVEDATA_KEY || '';
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const CORS_PROXY = 'https://corsproxy.io/?';

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
 * Lấy XAU/USD candles từ Twelve Data (giá chính xác FX Spot)
 */
export async function fetchOandaGoldCandles(
  interval = '5m',
  limit = 1000
): Promise<Candle[]> {
  if (!TD_KEY) {
    console.error('[CRAZII] Missing VITE_TWELVEDATA_KEY');
    return [];
  }
  const tdInterval = TD_INTERVALS[interval] || '5min';
  const outputsize = Math.min(limit, 800);
  try {
    const url = `${TD_BASE}/time_series?symbol=XAU/USD&interval=${tdInterval}&outputsize=${outputsize}&apikey=${TD_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code) {
      console.error('[CRAZII] Twelve Data error:', json.code, json.message);
      return [];
    }
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
    return [];
  } catch (e) {
    console.error('[CRAZII] Twelve Data fetch error:', e);
    return [];
  }
}

export async function fetchOandaGoldDaily(limit = 10): Promise<Candle[]> {
  return fetchOandaGoldCandles('1d', limit);
}

/**
 * Lấy giá Binance XAUUSDT hiện tại (để tính offset)
 */
async function getBinancePrice(): Promise<number | null> {
  try {
    const url = `${BINANCE_FUTURES}/ticker/price?symbol=XAUUSDT`;
    const res = await fetchBinance(url);
    const json = await res.json();
    return parseFloat(json.price);
  } catch { return null; }
}

/**
 * Tính offset giữa Twelve Data (OANDA) và Binance
 * offset = tdPrice - binancePrice
 * Khi stream Binance WS: displayPrice = binanceWsPrice + offset
 */
async function calculateOffset(): Promise<number> {
  try {
    // Lấy giá mới nhất từ Twelve Data
    const url = `${TD_BASE}/price?symbol=XAU/USD&apikey=${TD_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    const tdPrice = parseFloat(json.price);

    // Lấy giá Binance
    const binPrice = await getBinancePrice();

    if (tdPrice && binPrice) {
      const offset = tdPrice - binPrice;
      console.log(`[CRAZII] Offset: TD=${tdPrice} - Bin=${binPrice} = ${offset.toFixed(2)}`);
      return offset;
    }
  } catch (e) {
    console.warn('[CRAZII] Offset calc failed:', e);
  }
  return 0; // fallback: no offset
}

/**
 * Real-time streaming: Binance WS + offset correction
 * Stream tick mỗi giây, trừ offset để giá ≈ OANDA
 * Offset recalc mỗi 60s
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
  let offset = 0;
  let offsetTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let hasReceivedWsData = false;

  // Tính offset ngay
  calculateOffset().then(o => { offset = o; });

  // Recalc offset mỗi 60s
  offsetTimer = setInterval(async () => {
    if (!isClosed) offset = await calculateOffset();
  }, 60000);

  function connect() {
    if (isClosed) return;
    ws = new WebSocket('wss://fstream.binance.com/ws');

    ws.onopen = () => {
      console.log('[CRAZII-WS] Connected, subscribing:', stream);
      ws!.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream], id: 1 }));

      // Timeout: nếu 8s không nhận data → fallback polling
      setTimeout(() => {
        if (!hasReceivedWsData && !isClosed) {
          console.warn('[CRAZII-WS] No data, falling back to polling');
          try { ws?.close(); } catch {}
          startPolling();
        }
      }, 8000);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id || data.result !== undefined) return;
        const kline = data.k;
        if (!kline) return;

        hasReceivedWsData = true;
        // Apply offset: giá hiển thị = Binance + offset
        onUpdate({
          time: Math.floor(kline.t / 1000),
          open: parseFloat(kline.o) + offset,
          high: parseFloat(kline.h) + offset,
          low: parseFloat(kline.l) + offset,
          close: parseFloat(kline.c) + offset,
          volume: parseFloat(kline.v),
          isClosed: kline.x,
        });
      } catch { /* skip */ }
    };

    ws.onerror = () => { /* silent */ };

    ws.onclose = () => {
      if (!isClosed && hasReceivedWsData) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
  }

  // Fallback polling khi WS bị block
  function startPolling() {
    if (isClosed) return;
    console.log('[CRAZII-POLL] Starting REST polling 3s with offset');

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
            open: parseFloat(last[1] as string) + offset,
            high: parseFloat(last[2] as string) + offset,
            low: parseFloat(last[3] as string) + offset,
            close: parseFloat(last[4] as string) + offset,
            volume: parseFloat(last[5] as string),
            isClosed: false,
          });
        }
      } catch { /* silent */ }
    };
    poll();
    pollTimer = setInterval(poll, 3000);
  }

  connect();

  return {
    close: () => {
      isClosed = true;
      if (offsetTimer) clearInterval(offsetTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (ws) { try { ws.close(); } catch {} }
    },
  };
}
