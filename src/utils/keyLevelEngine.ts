/**
 * Key Level Trading Engine
 * Hệ thống giao dịch dựa trên Key Level + Candlestick Pattern + EMA + Volume
 * Hoàn toàn độc lập với CRAZII engine
 */

import type { Candle } from '../types/index.js';

// ============================================================
// TYPES
// ============================================================

export interface KeyLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number; // số lần giá phản ứng
  touches: number;
}

export interface EMAData {
  ema34: number[];
  ema89: number[];
  ema200: number[];
}

export type TrendDirection = 'uptrend' | 'downtrend' | 'sideway';

export interface TrendInfo {
  direction: TrendDirection;
  ema34: number;
  ema89: number;
  ema200: number;
}

export type CandlePatternType =
  | 'doji'
  | 'bullish_harami' | 'bearish_harami'
  | 'bullish_engulfing' | 'bearish_engulfing'
  | 'piercing_line'
  | 'bullish_belt' | 'bullish_kicker' | 'bearish_kicker'
  | 'hanging_man' | 'evening_star' | 'morning_star'
  | 'shooting_star' | 'hammer' | 'inverted_hammer';

export interface CandlePattern {
  time: number;
  index: number;
  type: CandlePatternType;
  direction: 'bullish' | 'bearish' | 'neutral';
  name: string;
}

export interface VolumeAnalysis {
  time: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number; // volume / avgVolume
  isHighVolume: boolean; // > 1.5x avg
  isVeryHighVolume: boolean; // > 2.5x avg
  moneyFlow: number; // dòng tiền tích lũy
  obv: number; // On Balance Volume
  vwap: number;
}

export interface KeyLevelSignal {
  time: number;
  side: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  confidence: number; // 0-100
  pattern: CandlePattern;
  nearLevel: KeyLevel;
  trend: TrendDirection;
  volumeConfirm: boolean;
  reason: string;
}

export interface KeyLevelResult {
  keyLevels: KeyLevel[];
  emaData: EMAData;
  trend: TrendInfo;
  patterns: CandlePattern[];
  volumeAnalysis: VolumeAnalysis[];
  signals: KeyLevelSignal[];
}

// ============================================================
// EMA CALCULATION
// ============================================================

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  if (data.length === 0) return result;

  const multiplier = 2 / (period + 1);
  result[0] = data[0];

  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  return result;
}

export function calculateEMAs(candles: Candle[]): EMAData {
  const closes = candles.map(c => c.close);
  return {
    ema34: calculateEMA(closes, 34),
    ema89: calculateEMA(closes, 89),
    ema200: calculateEMA(closes, 200),
  };
}

// ============================================================
// TREND DETECTION (EMA 34 > 89 > 200)
// ============================================================

export function detectTrend(emaData: EMAData, index: number): TrendInfo {
  const e34 = emaData.ema34[index] ?? 0;
  const e89 = emaData.ema89[index] ?? 0;
  const e200 = emaData.ema200[index] ?? 0;

  let direction: TrendDirection;
  if (e34 > e89 && e89 > e200) {
    direction = 'uptrend';
  } else if (e34 < e89 && e89 < e200) {
    direction = 'downtrend';
  } else {
    direction = 'sideway';
  }

  return { direction, ema34: e34, ema89: e89, ema200: e200 };
}

// ============================================================
// KEY LEVELS (Volume-Weighted Price Reaction Clustering)
// Approach: Phát hiện vùng giá có reaction mạnh nhất (bounce/reject)
// kết hợp volume profile để xác định vùng S/R có dòng tiền
// ============================================================

export function calculateKeyLevels(
  candles: Candle[],
  lookback = 500,
  numLevels = 5
): KeyLevel[] {
  const slice = candles.slice(-lookback);
  if (slice.length < 50) return [];

  // 1. Thu thập điểm đảo chiều (reaction points) có trọng số volume
  interface ReactionPoint { price: number; weight: number; }
  const reactions: ReactionPoint[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const c = slice[i];
    const vol = c.volume || 1;
    const prevH = Math.max(slice[i - 1].high, slice[i - 2].high);
    const prevL = Math.min(slice[i - 1].low, slice[i - 2].low);
    const nextH = Math.max(slice[i + 1].high, slice[i + 2].high);
    const nextL = Math.min(slice[i + 1].low, slice[i + 2].low);

    // Swing High: nến hiện tại high > 2 nến trước và 2 nến sau
    if (c.high >= prevH && c.high >= nextH) {
      reactions.push({ price: c.high, weight: vol });
    }
    // Swing Low
    if (c.low <= prevL && c.low <= nextL) {
      reactions.push({ price: c.low, weight: vol });
    }

    // Rejection wicks (râu dài = rejection mạnh)
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    if (upperWick > body * 2 && upperWick > (c.high - c.low) * 0.5) {
      reactions.push({ price: c.high, weight: vol * 1.5 });
    }
    if (lowerWick > body * 2 && lowerWick > (c.high - c.low) * 0.5) {
      reactions.push({ price: c.low, weight: vol * 1.5 });
    }
  }

  if (reactions.length < numLevels * 2) return [];

  // 2. Volume Profile: chia price range thành bins, tính volume mỗi bin
  const allPrices = slice.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const range = maxPrice - minPrice;
  if (range === 0) return [];

  const numBins = 100;
  const binSize = range / numBins;
  const volumeProfile: number[] = new Array(numBins).fill(0);

  for (const c of slice) {
    const midPrice = (c.high + c.low) / 2;
    const bin = Math.min(numBins - 1, Math.floor((midPrice - minPrice) / binSize));
    volumeProfile[bin] += c.volume || 1;
  }

  // 3. Cluster reaction points có trọng số (Weighted K-Means)
  // Initialize bằng giá trị spread đều
  let centers = Array.from({ length: numLevels }, (_, i) =>
    minPrice + range * ((i + 0.5) / numLevels)
  );

  for (let iter = 0; iter < 50; iter++) {
    const clusters: { points: ReactionPoint[] }[] = Array.from({ length: numLevels }, () => ({ points: [] }));

    for (const r of reactions) {
      let minDist = Infinity;
      let closest = 0;
      for (let c = 0; c < centers.length; c++) {
        const dist = Math.abs(r.price - centers[c]);
        if (dist < minDist) { minDist = dist; closest = c; }
      }
      clusters[closest].points.push(r);
    }

    let converged = true;
    const newCenters = centers.map((oldCenter, i) => {
      const pts = clusters[i].points;
      if (pts.length === 0) return oldCenter;
      // Weighted mean
      const totalWeight = pts.reduce((s, p) => s + p.weight, 0);
      const weightedMean = pts.reduce((s, p) => s + p.price * p.weight, 0) / totalWeight;
      if (Math.abs(weightedMean - oldCenter) > 0.1) converged = false;
      return weightedMean;
    });

    centers = newCenters;
    if (converged) break;
  }

  // 4. Score: kết hợp số reaction + volume tại vùng
  const currentPrice = candles[candles.length - 1].close;
  const proximityPct = 0.005; // 0.5%

  const levels: KeyLevel[] = centers
    .filter(c => c > 0)
    .map(price => {
      let touches = 0;
      let volScore = 0;
      for (const c of slice) {
        if (Math.abs(c.high - price) / price < proximityPct ||
            Math.abs(c.low - price) / price < proximityPct) {
          touches++;
          volScore += c.volume || 1;
        }
      }
      // Bonus từ volume profile
      const bin = Math.min(numBins - 1, Math.floor((price - minPrice) / binSize));
      const vpBonus = volumeProfile[bin] > 0 ? Math.log10(volumeProfile[bin]) : 0;

      const strength = touches + Math.round(vpBonus);
      const type: 'support' | 'resistance' = price > currentPrice ? 'resistance' : 'support';
      return { price, type, strength, touches: strength };
    })
    .sort((a, b) => b.strength - a.strength);

  return levels;
}

// ============================================================
// CANDLESTICK PATTERN DETECTION
// Port từ Pine Script "Candlestick Patterns Identified"
// ============================================================

export function detectCandlePatterns(
  candles: Candle[],
  trendBars = 5,
  dojiSize = 0.05
): CandlePattern[] {
  const patterns: CandlePattern[] = [];

  for (let i = trendBars; i < candles.length; i++) {
    const c = candles[i];
    const o = c.open, h = c.high, l = c.low, cl = c.close;
    const range = h - l;
    if (range === 0) continue;

    const prev = candles[i - 1];
    const prev2 = i >= 2 ? candles[i - 2] : null;
    const trendOpen = candles[i - trendBars].open;

    // Doji
    if (Math.abs(o - cl) <= range * dojiSize) {
      patterns.push({ time: c.time, index: i, type: 'doji', direction: 'neutral', name: 'Doji' });
    }

    // Bearish Harami
    if (prev.close > prev.open && o > cl &&
        o <= prev.close && prev.open <= cl &&
        o - cl < prev.close - prev.open && trendOpen < o) {
      patterns.push({ time: c.time, index: i, type: 'bearish_harami', direction: 'bearish', name: 'Bearish Harami' });
    }

    // Bullish Harami
    if (prev.open > prev.close && cl > o &&
        cl <= prev.open && prev.close <= o &&
        cl - o < prev.open - prev.close && trendOpen > o) {
      patterns.push({ time: c.time, index: i, type: 'bullish_harami', direction: 'bullish', name: 'Bullish Harami' });
    }

    // Bearish Engulfing
    if (prev.close > prev.open && o > cl &&
        o >= prev.close && prev.open >= cl &&
        o - cl > prev.close - prev.open && trendOpen < o) {
      patterns.push({ time: c.time, index: i, type: 'bearish_engulfing', direction: 'bearish', name: 'Bearish Engulfing' });
    }

    // Bullish Engulfing
    if (prev.open > prev.close && cl > o &&
        cl >= prev.open && prev.close >= o &&
        cl - o > prev.open - prev.close && trendOpen > o) {
      patterns.push({ time: c.time, index: i, type: 'bullish_engulfing', direction: 'bullish', name: 'Bullish Engulfing' });
    }

    // Piercing Line
    if (prev.close < prev.open && o < prev.low &&
        cl > prev.close + (prev.open - prev.close) / 2 &&
        cl < prev.open && trendOpen > o) {
      patterns.push({ time: c.time, index: i, type: 'piercing_line', direction: 'bullish', name: 'Piercing Line' });
    }

    // Bullish Belt
    const lower10 = Math.min(...candles.slice(Math.max(0, i - 10), i).map(x => x.low));
    if (l === o && o < lower10 && o < cl &&
        cl > (prev.high - prev.low) / 2 + prev.low && trendOpen > o) {
      patterns.push({ time: c.time, index: i, type: 'bullish_belt', direction: 'bullish', name: 'Bullish Belt' });
    }

    // Bullish Kicker
    if (prev.open > prev.close && o >= prev.open && cl > o && trendOpen > o) {
      patterns.push({ time: c.time, index: i, type: 'bullish_kicker', direction: 'bullish', name: 'Bullish Kicker' });
    }

    // Bearish Kicker
    if (prev.open < prev.close && o <= prev.open && cl <= o && trendOpen < o) {
      patterns.push({ time: c.time, index: i, type: 'bearish_kicker', direction: 'bearish', name: 'Bearish Kicker' });
    }

    // Hanging Man
    if ((h - l > 4 * Math.abs(o - cl)) &&
        (cl - l) / (0.001 + h - l) >= 0.75 &&
        (o - l) / (0.001 + h - l) >= 0.75 &&
        trendOpen < o &&
        (i >= 2 && candles[i - 1].high < o && candles[i - 2].high < o)) {
      patterns.push({ time: c.time, index: i, type: 'hanging_man', direction: 'bearish', name: 'Hanging Man' });
    }

    // Evening Star
    if (prev2 && prev2.close > prev2.open &&
        Math.min(prev.open, prev.close) > prev2.close &&
        o < Math.min(prev.open, prev.close) && cl < o) {
      patterns.push({ time: c.time, index: i, type: 'evening_star', direction: 'bearish', name: 'Evening Star' });
    }

    // Morning Star
    if (prev2 && prev2.close < prev2.open &&
        Math.max(prev.open, prev.close) < prev2.close &&
        o > Math.max(prev.open, prev.close) && cl > o) {
      patterns.push({ time: c.time, index: i, type: 'morning_star', direction: 'bullish', name: 'Morning Star' });
    }

    // Shooting Star
    if (prev.open < prev.close && o > prev.close &&
        h - Math.max(o, cl) >= Math.abs(o - cl) * 3 &&
        Math.min(cl, o) - l <= Math.abs(o - cl)) {
      patterns.push({ time: c.time, index: i, type: 'shooting_star', direction: 'bearish', name: 'Shooting Star' });
    }

    // Hammer
    if ((h - l > 3 * Math.abs(o - cl)) &&
        (cl - l) / (0.001 + h - l) > 0.6 &&
        (o - l) / (0.001 + h - l) > 0.6) {
      patterns.push({ time: c.time, index: i, type: 'hammer', direction: 'bullish', name: 'Hammer' });
    }

    // Inverted Hammer
    if ((h - l > 3 * Math.abs(o - cl)) &&
        (h - cl) / (0.001 + h - l) > 0.6 &&
        (h - o) / (0.001 + h - l) > 0.6) {
      patterns.push({ time: c.time, index: i, type: 'inverted_hammer', direction: 'bullish', name: 'Inverted Hammer' });
    }
  }

  // Dedup: 1 nến chỉ giữ 1 pattern (ưu tiên pattern nhiều nến > 1 nến)
  const PATTERN_PRIORITY: Record<string, number> = {
    'morning_star': 10, 'evening_star': 10,       // 3 nến = cao nhất
    'bullish_engulfing': 9, 'bearish_engulfing': 9, // 2 nến
    'bullish_harami': 8, 'bearish_harami': 8,       // 2 nến
    'piercing_line': 8, 'bullish_kicker': 8, 'bearish_kicker': 8,
    'shooting_star': 5, 'hanging_man': 5,           // 1 nến nhưng context
    'hammer': 4, 'inverted_hammer': 4,              // 1 nến
    'bullish_belt': 3, 'doji': 1,                   // thấp nhất
  };

  // Group by candle index, keep highest priority
  const byIndex = new Map<number, CandlePattern>();
  for (const p of patterns) {
    const existing = byIndex.get(p.index);
    if (!existing || (PATTERN_PRIORITY[p.type] ?? 0) > (PATTERN_PRIORITY[existing.type] ?? 0)) {
      byIndex.set(p.index, p);
    }
  }

  return Array.from(byIndex.values());
}

// ============================================================
// VOLUME ANALYSIS - Dòng tiền & Xác nhận
// ============================================================

export function analyzeVolume(candles: Candle[], period = 20): VolumeAnalysis[] {
  const result: VolumeAnalysis[] = [];
  let obv = 0;
  let cumulativeTPV = 0; // cumulative (typical price * volume)
  let cumulativeVol = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const vol = c.volume || 1;

    // OBV
    if (i > 0) {
      if (c.close > candles[i - 1].close) obv += vol;
      else if (c.close < candles[i - 1].close) obv -= vol;
    }

    // VWAP (running)
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * vol;
    cumulativeVol += vol;
    const vwap = cumulativeVol > 0 ? cumulativeTPV / cumulativeVol : c.close;

    // Average volume
    const start = Math.max(0, i - period + 1);
    const volSlice = candles.slice(start, i + 1).map(x => x.volume || 1);
    const avgVol = volSlice.reduce((s, v) => s + v, 0) / volSlice.length;
    const ratio = vol / avgVol;

    // Money Flow (CMF-like)
    const range = c.high - c.low;
    const mfMultiplier = range !== 0
      ? ((c.close - c.low) - (c.high - c.close)) / range
      : 0;
    const moneyFlow = mfMultiplier * vol;

    result.push({
      time: c.time,
      volume: vol,
      avgVolume: avgVol,
      volumeRatio: ratio,
      isHighVolume: ratio > 1.5,
      isVeryHighVolume: ratio > 2.5,
      moneyFlow,
      obv,
      vwap,
    });
  }
  return result;
}

// ============================================================
// SIGNAL GENERATOR - Kết hợp tất cả để ra tín hiệu
// ============================================================

function findNearestLevel(
  price: number,
  levels: KeyLevel[],
  type: 'support' | 'resistance',
  proximityPct = 0.5
): KeyLevel | null {
  for (const lv of levels) {
    if (lv.type !== type) continue;
    const dist = Math.abs(price - lv.price) / price * 100;
    if (dist < proximityPct) return lv;
  }
  return null;
}

function findNextLevel(
  price: number,
  levels: KeyLevel[],
  direction: 'up' | 'down'
): number | null {
  const sorted = [...levels].sort((a, b) =>
    direction === 'up' ? a.price - b.price : b.price - a.price
  );
  for (const lv of sorted) {
    if (direction === 'up' && lv.price > price * 1.002) return lv.price;
    if (direction === 'down' && lv.price < price * 0.998) return lv.price;
  }
  return null;
}

export function generateSignals(
  candles: Candle[],
  keyLevels: KeyLevel[],
  emaData: EMAData,
  patterns: CandlePattern[],
  volumeData: VolumeAnalysis[],
  maxAge = 1
): KeyLevelSignal[] {
  const signals: KeyLevelSignal[] = [];
  // Nhưng dùng toàn bộ data trước đó để xác định trend, key level, context
  const minIndex = Math.max(5, candles.length - maxAge);

  for (const pattern of patterns) {
    const i = pattern.index;
    if (i < minIndex || i >= candles.length) continue;
    if (pattern.direction === 'neutral') continue;

    const c = candles[i];
    const price = c.close; // Entry = giá đóng nến đảo chiều
    const trend = detectTrend(emaData, i);
    const vol = volumeData[i];

    // Bước 1: Xác định side dựa trên pattern direction
    let nearLevel: KeyLevel | null = null;
    let side: 'buy' | 'sell' | null = null;

    if (pattern.direction === 'bullish') {
      // Tìm hỗ trợ gần — nến wick phải "chạm" vào vùng
      nearLevel = findNearestLevel(price, keyLevels, 'support', 1.0);
      if (!nearLevel) {
        // Kiểm tra low of candle chạm level (wick touch)
        nearLevel = findNearestLevel(c.low, keyLevels, 'support', 0.5);
      }
      if (!nearLevel) {
        // EMA như hỗ trợ động
        const ema34Dist = Math.abs(price - emaData.ema34[i]) / price * 100;
        const ema89Dist = Math.abs(price - emaData.ema89[i]) / price * 100;
        const ema200Dist = Math.abs(price - emaData.ema200[i]) / price * 100;
        if (price > emaData.ema34[i] && ema34Dist < 0.8) {
          nearLevel = { price: emaData.ema34[i], type: 'support', strength: 2, touches: 2 };
        } else if (price > emaData.ema89[i] && ema89Dist < 1.2) {
          nearLevel = { price: emaData.ema89[i], type: 'support', strength: 2, touches: 3 };
        } else if (price > emaData.ema200[i] && ema200Dist < 1.5) {
          nearLevel = { price: emaData.ema200[i], type: 'support', strength: 3, touches: 3 };
        }
      }
      if (nearLevel) side = 'buy';
    } else {
      // Tìm kháng cự gần
      nearLevel = findNearestLevel(price, keyLevels, 'resistance', 1.0);
      if (!nearLevel) {
        nearLevel = findNearestLevel(c.high, keyLevels, 'resistance', 0.5);
      }
      if (!nearLevel) {
        const ema34Dist = Math.abs(price - emaData.ema34[i]) / price * 100;
        const ema89Dist = Math.abs(price - emaData.ema89[i]) / price * 100;
        const ema200Dist = Math.abs(price - emaData.ema200[i]) / price * 100;
        if (price < emaData.ema34[i] && ema34Dist < 0.8) {
          nearLevel = { price: emaData.ema34[i], type: 'resistance', strength: 2, touches: 2 };
        } else if (price < emaData.ema89[i] && ema89Dist < 1.2) {
          nearLevel = { price: emaData.ema89[i], type: 'resistance', strength: 2, touches: 3 };
        } else if (price < emaData.ema200[i] && ema200Dist < 1.5) {
          nearLevel = { price: emaData.ema200[i], type: 'resistance', strength: 3, touches: 3 };
        }
      }
      if (nearLevel) side = 'sell';
    }

    if (!side || !nearLevel) continue;

    // Nguyên tắc bất biến: không Sell gần hỗ trợ, không Buy gần kháng cự
    if (side === 'sell') {
      const nearSupport = findNearestLevel(price, keyLevels, 'support', 0.5);
      if (nearSupport) continue;
    }
    if (side === 'buy') {
      const nearResistance = findNearestLevel(price, keyLevels, 'resistance', 0.5);
      if (nearResistance) continue;
    }

    // Bước xác nhận: Nến phải thực sự "chạm" vào vùng (wick touch)
    // Kiểm tra wick đã touch level (cho phép tolerance 0.3%)
    const touchTolerance = nearLevel.price * 0.003;
    const wickTouched = side === 'buy'
      ? c.low <= nearLevel.price + touchTolerance  // Wick phải chạm xuống gần support
      : c.high >= nearLevel.price - touchTolerance; // Wick phải chạm lên gần resistance

    // Nếu key level tĩnh (strength >= 3), yêu cầu wick phải touch
    // EMA động (strength <= 3) thì chỉ cần gần là ok
    if (nearLevel.strength >= 4 && !wickTouched) continue;

    // Tính confidence
    let confidence = 40; // base

    // +15 nếu cùng xu hướng chính (Bước 1)
    if ((side === 'buy' && trend.direction === 'uptrend') ||
        (side === 'sell' && trend.direction === 'downtrend')) {
      confidence += 15;
    }
    // -15 nếu ngược xu hướng → tín hiệu counter-trend rủi ro cao
    if ((side === 'buy' && trend.direction === 'downtrend') ||
        (side === 'sell' && trend.direction === 'uptrend')) {
      confidence -= 15;
    }

    // +15 Volume xác nhận
    const volumeConfirm = vol && vol.isHighVolume;
    if (volumeConfirm) confidence += 15;
    if (vol && vol.isVeryHighVolume) confidence += 10;

    // +10 Level mạnh (nhiều touches)
    if (nearLevel.touches >= 5) confidence += 10;
    if (nearLevel.touches >= 8) confidence += 5;

    // +10 Pattern mạnh (engulfing, morning/evening star, kicker)
    const strongPatterns: CandlePatternType[] = [
      'bullish_engulfing', 'bearish_engulfing',
      'morning_star', 'evening_star',
      'bullish_kicker', 'bearish_kicker'
    ];
    if (strongPatterns.includes(pattern.type)) confidence += 10;

    // +5 Wick đã touch chính xác vào level
    if (wickTouched) confidence += 5;

    // +5 Money flow đúng hướng
    if (vol && side === 'buy' && vol.moneyFlow > 0) confidence += 5;
    if (vol && side === 'sell' && vol.moneyFlow < 0) confidence += 5;

    // Cap at 100
    confidence = Math.min(100, Math.max(0, confidence));

    // Chỉ lấy signal >= 55% confidence
    if (confidence < 55) continue;

    // Tính SL: Scan vùng sideway gần đó, lấy chân râu dài nhất
    // Nếu có nhiều nến thả râu tại vùng → SL sau chân râu cây nến dài nhất
    const slLookback = 5; // Scan 5 nến gần vùng
    let extremeWick: number;

    if (side === 'buy') {
      // Tìm low thấp nhất trong vùng sideway gần support
      const nearbyLows = candles.slice(Math.max(0, i - slLookback), i + 1)
        .filter(candle => Math.abs(candle.low - nearLevel.price) / nearLevel.price < 0.01)
        .map(candle => candle.low);
      extremeWick = nearbyLows.length > 0 ? Math.min(...nearbyLows) : c.low;
    } else {
      // Tìm high cao nhất trong vùng sideway gần resistance
      const nearbyHighs = candles.slice(Math.max(0, i - slLookback), i + 1)
        .filter(candle => Math.abs(candle.high - nearLevel.price) / nearLevel.price < 0.01)
        .map(candle => candle.high);
      extremeWick = nearbyHighs.length > 0 ? Math.max(...nearbyHighs) : c.high;
    }

    // SL = extreme wick + buffer nhỏ (tránh quét)
    const wickBuffer = (c.high - c.low) * 0.15;
    const sl = side === 'buy'
      ? extremeWick - wickBuffer
      : extremeWick + wickBuffer;

    // Tính TP: Key level kế tiếp phía giá đang đi (S/R thực)
    // Ưu tiên key level, fallback sang EMA, cuối cùng ATR
    const nextKeyLevel = findNextLevel(price, keyLevels, side === 'buy' ? 'up' : 'down');
    const nextEma = side === 'buy'
      ? [emaData.ema34[i], emaData.ema89[i], emaData.ema200[i]].filter(e => e > price * 1.003).sort((a, b) => a - b)[0]
      : [emaData.ema34[i], emaData.ema89[i], emaData.ema200[i]].filter(e => e < price * 0.997).sort((a, b) => b - a)[0];

    let tp: number;
    if (nextKeyLevel) {
      tp = nextKeyLevel;
    } else if (nextEma) {
      tp = nextEma;
    } else {
      // Fallback: ATR-based (2x risk)
      const risk = Math.abs(price - sl);
      tp = side === 'buy' ? price + risk * 2 : price - risk * 2;
    }

    const rr = Math.abs(tp - price) / Math.abs(price - sl);

    // Chỉ lấy RR >= 1.5
    if (rr < 1.5) continue;

    const reason = [
      `${pattern.name} tại ${side === 'buy' ? 'hỗ trợ' : 'kháng cự'} ${nearLevel.price.toFixed(2)}`,
      `Xu hướng: ${trend.direction === 'uptrend' ? '⬆️ Tăng' : trend.direction === 'downtrend' ? '⬇️ Giảm' : '↔️ Sideway'}`,
      volumeConfirm ? '✅ Volume xác nhận' : '⚠️ Volume thấp',
      `R:R = ${rr.toFixed(1)}`,
      wickTouched ? '🎯 Wick chạm level' : '',
    ].filter(Boolean).join(' | ');

    signals.push({
      time: c.time,
      side,
      entry: price,
      sl,
      tp,
      rr,
      confidence,
      pattern,
      nearLevel,
      trend: trend.direction,
      volumeConfirm: !!volumeConfirm,
      reason,
    });
  }

  // Sắp xếp theo thời gian mới nhất
  return signals.sort((a, b) => b.time - a.time);
}

// ============================================================
// MAIN: Calculate All
// ============================================================

export interface MultiTimeframeContext {
  daily: { trend: TrendDirection; volumeTrend: 'buying' | 'selling' | 'neutral'; avgVolRatio: number } | null;
  weekly: { trend: TrendDirection; structure: string } | null;
}

/** Analyze higher timeframe context (D1/W1 candles) */
export function analyzeMultiTimeframe(
  dailyCandles: Candle[],
  weeklyCandles: Candle[]
): MultiTimeframeContext {
  let daily: MultiTimeframeContext['daily'] = null;
  let weekly: MultiTimeframeContext['weekly'] = null;

  // Daily analysis
  if (dailyCandles.length >= 30) {
    const dEma = calculateEMAs(dailyCandles);
    const dTrend = detectTrend(dEma, dailyCandles.length - 1);

    // Volume trend: kiểm tra vol mua vs vol bán 5 nến gần nhất
    const last5 = dailyCandles.slice(-5);
    let buyVol = 0, sellVol = 0;
    for (const c of last5) {
      if (c.close > c.open) buyVol += c.volume;
      else sellVol += c.volume;
    }
    const volumeTrend = buyVol > sellVol * 1.3 ? 'buying' as const
      : sellVol > buyVol * 1.3 ? 'selling' as const : 'neutral' as const;

    // Average volume ratio
    const vol5 = last5.reduce((s, c) => s + c.volume, 0) / 5;
    const vol20 = dailyCandles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    const avgVolRatio = vol20 > 0 ? vol5 / vol20 : 1;

    daily = { trend: dTrend.direction, volumeTrend, avgVolRatio };
  }

  // Weekly analysis - detect classic patterns
  if (weeklyCandles.length >= 10) {
    const wEma = calculateEMAs(weeklyCandles);
    const wTrend = detectTrend(wEma, weeklyCandles.length - 1);

    // Simple structure detection (2 đỉnh, 2 đáy, trending)
    const last10 = weeklyCandles.slice(-10);
    const highs = last10.map(c => c.high);
    const lows = last10.map(c => c.low);

    // Count local highs/lows
    let peaks = 0, valleys = 0;
    for (let j = 1; j < highs.length - 1; j++) {
      if (highs[j] > highs[j - 1] && highs[j] > highs[j + 1]) peaks++;
      if (lows[j] < lows[j - 1] && lows[j] < lows[j + 1]) valleys++;
    }

    let structure = 'trending';
    if (peaks >= 2 && valleys >= 1) structure = 'double_top_risk';
    if (valleys >= 2 && peaks >= 1) structure = 'double_bottom_potential';
    if (peaks >= 3) structure = 'triple_top_risk';
    if (valleys >= 3) structure = 'triple_bottom_potential';

    // Higher highs + higher lows = uptrend
    const lastHigh = Math.max(...highs.slice(-3));
    const prevHigh = Math.max(...highs.slice(0, 5));
    const lastLow = Math.min(...lows.slice(-3));
    const prevLow = Math.min(...lows.slice(0, 5));

    if (lastHigh > prevHigh && lastLow > prevLow) structure = 'higher_highs_lows';
    if (lastHigh < prevHigh && lastLow < prevLow) structure = 'lower_highs_lows';

    weekly = { trend: wTrend.direction, structure };
  }

  return { daily, weekly };
}

export function calculateKeyLevelSystem(candles: Candle[]): KeyLevelResult {
  if (candles.length < 50) {
    return {
      keyLevels: [],
      emaData: { ema34: [], ema89: [], ema200: [] },
      trend: { direction: 'sideway', ema34: 0, ema89: 0, ema200: 0 },
      patterns: [],
      volumeAnalysis: [],
      signals: [],
    };
  }

  const emaData = calculateEMAs(candles);
  const keyLevels = calculateKeyLevels(candles);
  const patterns = detectCandlePatterns(candles);
  const volumeAnalysis = analyzeVolume(candles);
  const trend = detectTrend(emaData, candles.length - 1);
  const signals = generateSignals(candles, keyLevels, emaData, patterns, volumeAnalysis);

  return { keyLevels, emaData, trend, patterns, volumeAnalysis, signals };
}
