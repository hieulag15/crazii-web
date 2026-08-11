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
    const url = `${TD_BASE}/time_series?symbol=XAU/USD&interval=${tdInterval}&outputsize=${outputsize}&timezone=UTC&apikey=${TD_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code) {
      console.error('[CRAZII] Twelve Data error:', json.code, json.message);
      return [];
    }
    if (json.values && json.values.length > 0) {
      const candles: Candle[] = json.values.map((v: any) => ({
        // &timezone=UTC → datetime là UTC thuần → thêm Z để parse đúng
        time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
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
 * Real-time: Polling Binance REST ticker mỗi 2s + offset correction
 * WS bị ISP VN block hoàn toàn → dùng REST ticker thay thế
 * Endpoint /ticker/price rất nhẹ (~100 bytes), không bị rate limit
 */
export interface LiveGoldCandle extends Candle {
  isClosed: boolean;
}

export function connectGoldWebSocket(
  interval: string,
  onUpdate: (candle: LiveGoldCandle) => void
): { close: () => void } {
  let isClosed = false;
  let offset = 0;
  let offsetTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastCandleTime = 0;
  let candleOpen = 0;
  let candleHigh = -Infinity;
  let candleLow = Infinity;
  let currentPrice = 0;

  // Tính interval duration (seconds)
  const intervalSec: Record<string, number> = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '4h': 14400, '1d': 86400,
  };
  const candleDuration = intervalSec[interval] || 300;

  // Tính offset ngay khi khởi tạo
  calculateOffset().then(o => {
    offset = o;
    console.log(`[CRAZII] Initial offset: ${offset.toFixed(2)}`);
  });

  // Recalc offset mỗi 60s
  offsetTimer = setInterval(async () => {
    if (!isClosed) {
      offset = await calculateOffset();
    }
  }, 60000);

  // Poll giá mỗi 2s từ Binance REST ticker
  const poll = async () => {
    if (isClosed) return;
    try {
      const url = `${BINANCE_FUTURES}/ticker/price?symbol=XAUUSDT`;
      const res = await fetchBinance(url);
      const json = await res.json();
      const rawPrice = parseFloat(json.price);
      currentPrice = rawPrice + offset;

      // Tính candle time hiện tại
      const now = Math.floor(Date.now() / 1000);
      const candleTime = Math.floor(now / candleDuration) * candleDuration;

      // Nến mới?
      if (candleTime !== lastCandleTime) {
        // Nến cũ đã đóng
        if (lastCandleTime > 0) {
          onUpdate({
            time: lastCandleTime,
            open: candleOpen,
            high: candleHigh,
            low: candleLow,
            close: currentPrice,
            volume: 0,
            isClosed: true,
          });
        }
        // Reset cho nến mới
        lastCandleTime = candleTime;
        candleOpen = currentPrice;
        candleHigh = currentPrice;
        candleLow = currentPrice;
      }

      // Update nến đang mở
      candleHigh = Math.max(candleHigh, currentPrice);
      candleLow = Math.min(candleLow, currentPrice);

      onUpdate({
        time: candleTime,
        open: candleOpen,
        high: candleHigh,
        low: candleLow,
        close: currentPrice,
        volume: 0,
        isClosed: false,
      });
    } catch { /* silent */ }
  };

  console.log('[CRAZII-TICK] Starting price ticker polling every 2s');
  poll();
  pollTimer = setInterval(poll, 2000);

  return {
    close: () => {
      isClosed = true;
      if (offsetTimer) clearInterval(offsetTimer);
      if (pollTimer) clearInterval(pollTimer);
    },
  };
}
