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

  // Mode: High+Low — lấy TẤT CẢ high và low làm data points cho K-Means
  // Đây chính xác là cách indicator "Key Levels [K-Means] + EMA" hoạt động
  const dataPoints: number[] = [];
  for (const c of slice) {
    dataPoints.push(c.high);
    dataPoints.push(c.low);
  }

  const minPrice = Math.min(...dataPoints);
  const maxPrice = Math.max(...dataPoints);
  const range = maxPrice - minPrice;
  if (range === 0) return [];

  // Quantile Initialization — match chính xác indicator TradingView
  // Chọn centers ban đầu tại các quantile đều nhau trong sorted data
  const sortedPoints = [...dataPoints].sort((a, b) => a - b);
  const centers: number[] = Array.from({ length: numLevels }, (_, i) =>
    sortedPoints[Math.floor(sortedPoints.length * (i + 0.5) / numLevels)]
  );

  // Iterate K-Means (max 100 iterations)
  let currentCenters = [...centers];
  for (let iter = 0; iter < 100; iter++) {
    const clusters: number[][] = Array.from({ length: numLevels }, () => []);

    for (const price of dataPoints) {
      let minDist = Infinity;
      let closest = 0;
      for (let c = 0; c < currentCenters.length; c++) {
        const dist = Math.abs(price - currentCenters[c]);
        if (dist < minDist) { minDist = dist; closest = c; }
      }
      clusters[closest].push(price);
    }

    let converged = true;
    const newCenters = currentCenters.map((oldCenter, i) => {
      const pts = clusters[i];
      if (pts.length === 0) return oldCenter;
      const mean = pts.reduce((s, p) => s + p, 0) / pts.length;
      if (Math.abs(mean - oldCenter) > range * 0.0001) converged = false;
      return mean;
    });

    currentCenters = newCenters;
    if (converged) break;
  }

  // Score: đếm số lần high/low chạm vào vùng (proximity 0.3%)
  const currentPrice = candles[candles.length - 1].close;
  const proximityPct = 0.003; // 0.3% — matching indicator setting

  const levels: KeyLevel[] = currentCenters
    .filter(c => c > 0)
    .map(price => {
      let touches = 0;
      for (const c of slice) {
        if (Math.abs(c.high - price) / price < proximityPct) touches++;
        if (Math.abs(c.low - price) / price < proximityPct) touches++;
      }
      const type: 'support' | 'resistance' = price < currentPrice ? 'support' : 'resistance';
      return { price, type, strength: touches, touches };
    })
    .sort((a, b) => b.touches - a.touches);

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

    // Hammer — Pattern trung tính (râu dưới dài, thân nhỏ ở trên)
    // Pine Script gốc: KHÔNG phân biệt bullish/bearish, chỉ là dấu hiệu
    if ((h - l > 3 * Math.abs(o - cl)) &&
        (cl - l) / (0.001 + h - l) > 0.6 &&
        (o - l) / (0.001 + h - l) > 0.6) {
      // Chỉ là bullish signal nếu nến bullish + sau xu hướng giảm
      const isBullishHammer = cl >= o && prev.close < prev.open;
      patterns.push({ time: c.time, index: i, type: 'hammer', direction: isBullishHammer ? 'bullish' : 'neutral', name: 'Hammer' });
    }

    // Inverted Hammer — Pattern trung tính (râu trên dài, thân nhỏ ở dưới)
    if ((h - l > 3 * Math.abs(o - cl)) &&
        (h - cl) / (0.001 + h - l) > 0.6 &&
        (h - o) / (0.001 + h - l) > 0.6) {
      const isBullishIH = cl >= o && prev.close < prev.open;
      patterns.push({ time: c.time, index: i, type: 'inverted_hammer', direction: isBullishIH ? 'bullish' : 'neutral', name: 'Inverted Hammer' });
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
  volumeData: VolumeAnalysis[]
): KeyLevelSignal[] {
  const signals: KeyLevelSignal[] = [];
  // Nến cuối từ Binance = nến ĐANG CHẠY (chưa đóng)
  // Nến áp cuối (length - 2) = nến VỪA ĐÓNG → đây mới là nến cần xét
  const closedCandleIndex = candles.length - 2; // Nến H4 vừa đóng

  for (const pattern of patterns) {
    const i = pattern.index;
    // CHỈ lấy pattern tại ĐÚNG nến vừa đóng, không lấy nến cũ hơn
    if (i !== closedCandleIndex) continue;
    if (pattern.direction === 'neutral') continue;

    // ===== CẢI THIỆN #4: Chỉ trade pattern mạnh (loại Inverted Hammer, Hammer — 100% SL theo backtest) =====
    const STRONG: CandlePatternType[] = ['bullish_engulfing','bearish_engulfing','morning_star','evening_star','bullish_kicker','bearish_kicker','bullish_harami','bearish_harami'];
    if (!STRONG.includes(pattern.type)) continue;

    const c = candles[i];
    const price = c.close;
    const trend = detectTrend(emaData, i);
    const vol = volumeData[i];

    // ===== CẢI THIỆN #1: Block signal ngược trend (nới lỏng cho Engulfing/Kicker/Star) =====
    const SUPER_STRONG: CandlePatternType[] = ['bullish_engulfing','bearish_engulfing','morning_star','evening_star','bullish_kicker','bearish_kicker'];
    const isCounterTrend = (pattern.direction === 'bullish' && trend.direction === 'downtrend') ||
                           (pattern.direction === 'bearish' && trend.direction === 'uptrend');
    // Harami ngược trend → block hoàn toàn
    // Engulfing/Kicker/Star ngược trend → cho phép (vì data cho thấy vẫn win)
    if (isCounterTrend && !SUPER_STRONG.includes(pattern.type)) continue;

    // ===== CẢI THIỆN #3: Volume filter (backtest: thua hầu hết khi vol thấp) =====
    // Engulfing/Kicker/Star = pattern mạnh → chỉ cần vol >= 0.8x avg
    // Harami = pattern yếu hơn → cần vol >= 1.2x avg để đảm bảo xác nhận
    const WEAK_PATTERNS: CandlePatternType[] = ['bullish_harami', 'bearish_harami'];
    const volThreshold = WEAK_PATTERNS.includes(pattern.type) ? 1.2 : 0.8;
    if (vol && vol.volumeRatio < volThreshold) continue;

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

    // ===== NÂNG CẤP V2: Lessons from 41-trade backtest (WR 60.7%) =====
    // Pattern thua: Harami sideway (100% SL), mọi pattern khi wick KHÔNG chạm level
    // Pattern thắng: Engulfing tại Key Level trùng EMA (vùng hợp lưu)

    // RULE 1: Block HOÀN TOÀN Harami trong sideway (data: 100% SL)
    if (WEAK_PATTERNS.includes(pattern.type) && trend.direction === 'sideway') continue;

    // RULE 2: Engulfing/Kicker trong sideway chỉ cho phép nếu gần EMA mạnh
    if (trend.direction === 'sideway' && !WEAK_PATTERNS.includes(pattern.type)) {
      const nearEma34 = Math.abs(price - emaData.ema34[i]) / price * 100 < 0.5;
      const nearEma89 = Math.abs(price - emaData.ema89[i]) / price * 100 < 0.8;
      const nearEma200 = Math.abs(price - emaData.ema200[i]) / price * 100 < 1.0;
      // Phải gần ít nhất 1 EMA (đóng vai trò hỗ trợ/kháng cự động)
      if (!nearEma34 && !nearEma89 && !nearEma200) continue;
    }

    // RULE 3: Wick PHẢI chạm level — tolerance nghiêm ngặt hơn
    // Data: 71% lệnh thua do wick không chạm level
    // Key Level tĩnh: tolerance 0.2% (chặt)
    // EMA động: tolerance 0.5% (nới hơn vì EMA di chuyển)
    const isEmaLevel = nearLevel.strength <= 3; // EMA-based level có strength thấp hơn
    const touchTolerance = nearLevel.price * (isEmaLevel ? 0.005 : 0.002);
    const wickTouched = side === 'buy'
      ? c.low <= nearLevel.price + touchTolerance
      : c.high >= nearLevel.price - touchTolerance;
    if (!wickTouched) continue; // STRICT: không chạm = không trade

    // RULE 4: Vùng hợp lưu (Key Level tĩnh + EMA trong 1.5% = cực mạnh)
    // Data: tất cả lệnh thắng lớn đều có Key Level trùng EMA
    let hasConfluence = false;
    const emaValues = [emaData.ema34[i], emaData.ema89[i], emaData.ema200[i]];
    for (const ema of emaValues) {
      if (Math.abs(nearLevel.price - ema) / nearLevel.price * 100 < 1.5) {
        hasConfluence = true;
        break;
      }
    }
    // Nếu dùng EMA làm level thay vì Key Level tĩnh → yêu cầu confluence bắt buộc
    if (isEmaLevel && !hasConfluence) continue;

    // Nguyên tắc bất biến: không Sell gần hỗ trợ, không Buy gần kháng cự
    if (side === 'sell') {
      const nearSupport = findNearestLevel(price, keyLevels, 'support', 0.5);
      if (nearSupport) continue;
    }
    if (side === 'buy') {
      const nearResistance = findNearestLevel(price, keyLevels, 'resistance', 0.5);
      if (nearResistance) continue;
    }

    // Tính confidence (V2 — dựa trên pattern thắng/thua thực tế)
    let confidence = 50;

    // +15 cùng xu hướng (data: win rate cao nhất khi trend đúng)
    if ((side === 'buy' && trend.direction === 'uptrend') ||
        (side === 'sell' && trend.direction === 'downtrend')) {
      confidence += 15;
    }
    if (trend.direction === 'sideway') confidence += 3; // sideway ít điểm hơn

    // Counter-trend penalty (data: 9/21 lệnh thua là counter-trend = 43%)
    // Data mới: Engulfing ngược trend WIN chỉ khi có confluence cực mạnh (Key Level + EMA)
    // Không có confluence → block hoàn toàn counter-trend
    if (isCounterTrend) {
      if (!hasConfluence) continue; // Block counter-trend không có confluence
      confidence -= 15; // Penalty mạnh hơn cho counter-trend dù có confluence
    }

    // +10 Volume xác nhận (data: strong correlation)
    const volumeConfirm = vol && vol.isHighVolume;
    if (volumeConfirm) confidence += 10;
    if (vol && vol.isVeryHighVolume) confidence += 8;

    // +5 Level mạnh (nhiều touches = đáng tin hơn)
    if (nearLevel.touches >= 5) confidence += 5;
    if (nearLevel.touches >= 8) confidence += 5;

    // +10 Pattern cực mạnh (data: Engulfing/Kicker win rate cao nhất)
    if (SUPER_STRONG.includes(pattern.type)) confidence += 10;

    // +8 Vùng hợp lưu (Key Level + EMA — data: THẮNG hầu hết khi có confluence)
    if (hasConfluence) confidence += 8;

    // +5 Wick touch (đã bắt buộc, nhưng vẫn tính vào score)
    confidence += 5;

    // +3 Money flow
    if (vol && side === 'buy' && vol.moneyFlow > 0) confidence += 3;
    if (vol && side === 'sell' && vol.moneyFlow < 0) confidence += 3;

    confidence = Math.min(100, Math.max(0, confidence));

    // ===== CẢI THIỆN #5: Threshold 75% (V2 — chặt hơn để giảm SL) =====
    if (confidence < 75) continue;

    // ===== CẢI THIỆN #2: SL = swing low/high 5 nến + buffer % (phù hợp mọi coin) =====
    const slLookback = 5;
    let sl: number;
    // Buffer = max(0.5% giá, 30% thân nến) — coin nhỏ cần buffer % lớn hơn
    const percentBuffer = price * 0.005; // 0.5% giá
    const candleBuffer = (c.high - c.low) * 0.3;
    const buffer = Math.max(percentBuffer, candleBuffer);

    if (side === 'buy') {
      const swingLow = Math.min(...candles.slice(Math.max(0, i - slLookback), i + 1).map(x => x.low));
      sl = swingLow - buffer;
    } else {
      const swingHigh = Math.max(...candles.slice(Math.max(0, i - slLookback), i + 1).map(x => x.high));
      sl = swingHigh + buffer;
    }

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
