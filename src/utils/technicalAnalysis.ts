/**
 * Phân tích kỹ thuật ICT - FVG & Order Block
 * Dùng làm tầng hợp lưu (confluence) cho tín hiệu CRAZII.
 */

import type { Candle, FVG, OrderBlock } from '../types/index.js';

// ============================================================
// FVG - FAIR VALUE GAP (Khoảng trống giá trị hợp lý)
// Bullish FVG: low của nến [i] > high của nến [i-2]
//   -> có khoảng trống chưa lấp giữa 2 nến, giá hay quay lại test
// Bearish FVG: high của nến [i] < low của nến [i-2]
// ============================================================
export function detectFVG(candles: Candle[], maxLookback = 200): FVG[] {
  const fvgs: FVG[] = [];
  const start = Math.max(2, candles.length - maxLookback);

  for (let i = start; i < candles.length; i++) {
    const c0 = candles[i];
    const c2 = candles[i - 2];

    // Bullish FVG
    if (c0.low > c2.high) {
      const top = c0.low;
      const bottom = c2.high;
      // Kiểm tra đã bị lấp chưa (giá sau đó quay xuống chạm bottom)
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= bottom) { filled = true; break; }
      }
      fvgs.push({ time: c0.time, type: 'bullish', top, bottom, filled });
    }

    // Bearish FVG
    if (c0.high < c2.low) {
      const top = c2.low;
      const bottom = c0.high;
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= top) { filled = true; break; }
      }
      fvgs.push({ time: c0.time, type: 'bearish', top, bottom, filled });
    }
  }

  return fvgs;
}

// ============================================================
// ORDER BLOCK (Khối lệnh tổ chức)
// Bullish OB: nến GIẢM cuối cùng trước một cú đẩy tăng mạnh
//   -> vùng giá mà tổ chức gom hàng, hay được test lại làm hỗ trợ
// Bearish OB: nến TĂNG cuối cùng trước một cú đẩy giảm mạnh
// ============================================================
export function detectOrderBlocks(
  candles: Candle[],
  maxLookback = 200,
  impulseFactor = 1.5
): OrderBlock[] {
  const obs: OrderBlock[] = [];
  const start = Math.max(1, candles.length - maxLookback);

  // Biên độ trung bình để xác định "cú đẩy mạnh"
  const avgRange =
    candles.slice(-maxLookback).reduce((s, c) => s + (c.high - c.low), 0) /
    Math.min(maxLookback, candles.length);

  for (let i = start; i < candles.length - 2; i++) {
    const c = candles[i];
    const next = candles[i + 1];
    const isDown = c.close < c.open;
    const isUp = c.close > c.open;
    const nextRange = next.high - next.low;
    const nextBody = Math.abs(next.close - next.open);

    // Cú đẩy mạnh = nến tiếp theo body lớn + range lớn
    const strongImpulse = nextRange > avgRange * impulseFactor && nextBody > nextRange * 0.6;

    // Bullish OB: nến giảm + sau đó đẩy tăng mạnh
    if (isDown && strongImpulse && next.close > next.open && next.close > c.high) {
      let mitigated = false;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].low <= c.high) { mitigated = true; break; }
      }
      obs.push({ time: c.time, type: 'bullish', top: c.high, bottom: c.low, mitigated });
    }

    // Bearish OB: nến tăng + sau đó đẩy giảm mạnh
    if (isUp && strongImpulse && next.close < next.open && next.close < c.low) {
      let mitigated = false;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].high >= c.low) { mitigated = true; break; }
      }
      obs.push({ time: c.time, type: 'bearish', top: c.high, bottom: c.low, mitigated });
    }
  }

  return obs;
}

/** Kiểm tra giá có nằm trong vùng FVG chưa lấp cùng hướng không */
export function priceInFVG(price: number, fvgs: FVG[], side: 'buy' | 'sell'): FVG | null {
  const wantType = side === 'buy' ? 'bullish' : 'bearish';
  for (const fvg of fvgs) {
    if (fvg.type === wantType && !fvg.filled && price >= fvg.bottom && price <= fvg.top) {
      return fvg;
    }
  }
  return null;
}

/** Kiểm tra giá có nằm trong vùng Order Block cùng hướng không */
export function priceInOB(price: number, obs: OrderBlock[], side: 'buy' | 'sell'): OrderBlock | null {
  const wantType = side === 'buy' ? 'bullish' : 'bearish';
  for (const ob of obs) {
    if (ob.type === wantType && price >= ob.bottom && price <= ob.top) {
      return ob;
    }
  }
  return null;
}

export interface SRZone {
  high: number;
  low: number;
  strength: number;
}

/**
 * Calculates Support and Resistance Zones based on Pivot Points & OHLC touches
 * Ports the Pine Script S/R Zones MTF logic to TS.
 */
export function calculateSRZones(
  candles: Candle[],
  prd = 5,
  loopback = 250,
  ChannelW = 6,
  minstrength = 1
): SRZone[] {
  if (candles.length < prd * 2 + 1) return [];

  const actualLoopback = Math.min(loopback, candles.length);
  const slice = candles.slice(-actualLoopback);
  const highs = slice.map((c) => c.high);
  const lows = slice.map((c) => c.low);

  const pivotvals: number[] = [];

  // 1. Calculate Pivot Points in slice
  for (let x = prd; x < highs.length - prd; x++) {
    // Pivot High
    let isPivotHigh = true;
    for (let i = x - prd; i <= x + prd; i++) {
      if (highs[i] > highs[x]) {
        isPivotHigh = false;
        break;
      }
    }
    if (isPivotHigh) pivotvals.push(highs[x]);

    // Pivot Low
    let isPivotLow = true;
    for (let i = x - prd; i <= x + prd; i++) {
      if (lows[i] < lows[x]) {
        isPivotLow = false;
        break;
      }
    }
    if (isPivotLow) pivotvals.push(lows[x]);
  }

  if (pivotvals.length === 0) return [];

  // 2. Channel Width calculation
  const prdhighest = Math.max(...pivotvals);
  const prdlowest = Math.min(...pivotvals);
  const cwidth = ((prdhighest - prdlowest) * ChannelW) / 100;

  // Group pivots to find S/R boundaries and base strength
  const supres: number[] = []; // stores [strength, high, low] flat list
  for (let x = 0; x < pivotvals.length; x++) {
    const loVal = pivotvals[x];
    let lo = loVal;
    let hi = lo;
    let numpp = 0;

    for (let y = 0; y < pivotvals.length; y++) {
      const cpp = pivotvals[y];
      const wdth = cpp <= hi ? hi - cpp : cpp - lo;
      if (wdth <= cwidth) {
        if (cpp <= hi) {
          lo = Math.min(lo, cpp);
        } else {
          hi = Math.max(hi, cpp);
        }
        numpp += 20;
      }
    }
    supres.push(numpp, hi, lo);
  }

  // 3. Refine strength by checking OHLC touches of the last 500 candles
  const touchSlice = candles.slice(-500);
  for (let x = 0; x < pivotvals.length; x++) {
    const h = supres[x * 3 + 1];
    const l = supres[x * 3 + 2];
    let s = 0;
    for (let y = 0; y < touchSlice.length; y++) {
      const c = touchSlice[y];
      if (
        (c.high <= h && c.high >= l) ||
        (c.low <= h && c.low >= l) ||
        (c.open <= h && c.open >= l) ||
        (c.close <= h && c.close >= l)
      ) {
        s += 1;
      }
    }
    supres[x * 3] += s;
  }

  // 4. Select strongest non-overlapping S/R channels
  const selectedZones: SRZone[] = [];
  for (let step = 0; step < 10; step++) {
    let maxStv = -1;
    let bestIdx = -1;

    for (let y = 0; y < pivotvals.length; y++) {
      const stv = supres[y * 3];
      if (stv > maxStv && stv >= minstrength * 20) {
        maxStv = stv;
        bestIdx = y;
      }
    }

    if (bestIdx >= 0) {
      const hh = supres[bestIdx * 3 + 1];
      const ll = supres[bestIdx * 3 + 2];
      selectedZones.push({ high: hh, low: ll, strength: maxStv });

      // Clear strength of overlapping pivot points to avoid picking redundant zones
      for (let y = 0; y < pivotvals.length; y++) {
        const pHi = supres[y * 3 + 1];
        const pLo = supres[y * 3 + 2];
        if ((pHi <= hh && pHi >= ll) || (pLo <= hh && pLo >= ll)) {
          supres[y * 3] = -1;
        }
      }
    } else {
      break;
    }
  }

  // Sort S/R zones by strength descending
  return selectedZones.sort((a, b) => b.strength - a.strength);
}
