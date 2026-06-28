/**
 * CRAZII Trading System Engine (TypeScript)
 * Core logic bám sát tài liệu đào tạo Dubai Smart Trading
 *
 * Các chỉ báo:
 * - OP: Giá mở cửa 5h sáng (quan trọng nhất)
 * - MLP: Trung bình giá OP hôm qua và hôm nay
 * - KTR: Chỉ số chốt lời trong ngày
 * - KSI: Chỉ số cá mập (Boys Selling/Buying)
 * - KCX: Lực nén thị trường
 * - PIVOT: Trung bình giá phiên trước
 * - GTH: Thời gian trading tốt nhất
 * - Kim Cương: Tín hiệu quan trọng
 */

import type {
  Candle, OPData, MLPData, KTRData, HACandle,
  KSIData, KCXData, PivotData, GTHStatus,
  DiamondSignal, DJDDSignal, TradeSignal, CraziiResult,
} from '../types/index.js';
import { ema, sma, atr } from './helpers.js';
import { detectFVG, detectOrderBlocks } from './technicalAnalysis.js';
import { enhanceSignals } from './signalEnhancer.js';

// ============================================================
// OP - GIÁ MỞ CỬA CỦA MỖI PHIÊN (QUAN TRỌNG NHẤT)
// Academy: "OP is the opening price at the start of a trading session"
// Price above OP -> ưu tiên BUY | Price below OP -> ưu tiên SELL
// ============================================================
export function calculateOP(candles: Candle[], opHour = 5): OPData[] {
  const ops: OPData[] = [];
  let currentOP: number | null = null;
  let yesterdayOP: number | null = null;
  let prevClose: number | null = null; // Close của phiên trước (nến ngay trước OP mới)

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const date = new Date(candle.time * 1000);
    let hour = date.getUTCHours() + 7; // UTC+7 Vietnam
    if (hour >= 24) hour -= 24;

    if (hour === opHour && date.getUTCMinutes() === 0) {
      yesterdayOP = currentOP;
      // Close của phiên trước = close của nến ngay trước nến mở phiên mới
      prevClose = i > 0 ? candles[i - 1].close : candle.open;
      currentOP = candle.open;
    }

    ops.push({ time: candle.time, op: currentOP, yesterdayOP, prevClose });
  }

  return ops;
}

// ============================================================
// MLP - MID-LEVEL PRICE
// Academy: "MLP is the average of the Opening and Closing prices
//           of the PREVIOUS session" (giữa phiên hôm qua)
// Price above OP + above MLP -> Uptrend bền vững
// ============================================================
export function calculateMLP(ops: OPData[]): MLPData[] {
  return ops.map((item) => ({
    time: item.time,
    // MLP = (OP phiên trước + Close phiên trước) / 2
    mlp: item.yesterdayOP !== null && item.prevClose !== null
      ? (item.yesterdayOP + item.prevClose) / 2
      : null,
  }));
}


// ============================================================
// KTR - VOLATILITY STATISTICS / PROJECTED DAILY RANGE
// Academy: "forecasts the potential price extension for the session...
//   daily projected range divided into levels (KTR +1,+2,+3 / -1,-2,-3)...
//   remain UNCHANGED throughout the session"
// Cách tính: tại mỗi phiên (OP bar), lấy biên độ biến động (ATR) làm
//   "projected range", CỐ ĐỊNH suốt phiên, chiếu các level từ OP.
// Price above OP -> TP đầu tiên là KTR+ | below OP -> KTR-
// ============================================================
export function calculateKTR(
  candles: Candle[],
  ops: OPData[],
  multiplier = 1.0,
  dailyRange: number | null = null
): KTRData[] {
  const period = 14;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const atrValues = atr(highs, lows, closes, period);

  // Giữ cố định base (OP) và unit (biên độ) trong suốt phiên
  let sessionBase: number | null = null;
  let sessionUnit: number | null = null;
  let lastOP: number | null = null;

  return candles.map((candle, i) => {
    const op = ops[i]?.op ?? null;

    // Phát hiện phiên mới: OP thay đổi -> khóa lại base & unit của phiên
    if (op !== null && op !== lastOP) {
      lastOP = op;
      sessionBase = op;
      // Ưu tiên dùng biên độ NGÀY (ADR) chia 3 làm 1 bước KTR.
      // Nếu không có, fallback về ATR nội phiên tại thời điểm mở phiên.
      if (dailyRange !== null && dailyRange > 0) {
        sessionUnit = dailyRange / 3;
      } else {
        sessionUnit = atrValues[i] ?? null;
      }
    }

    if (sessionBase === null || sessionUnit === null) {
      return { time: candle.time, levels: null };
    }

    const unit = sessionUnit * multiplier;
    return {
      time: candle.time,
      levels: {
        plus1: sessionBase + unit * 1.0,
        plus2: sessionBase + unit * 2.0,
        plus3: sessionBase + unit * 3.0,
        minus1: sessionBase - unit * 1.0,
        minus2: sessionBase - unit * 2.0,
        minus3: sessionBase - unit * 3.0,
      },
    };
  });
}

// Average Daily Range - biên độ ngày trung bình N ngày gần nhất
export function calculateADR(dailyCandles: Candle[], period = 14): number | null {
  if (!dailyCandles || dailyCandles.length < 2) return null;
  const ranges = dailyCandles.map((c) => c.high - c.low);
  const recent = ranges.slice(-period);
  if (recent.length === 0) return null;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// ============================================================
// 4. NẾN ĐỎ VÀ NẾN VÀNG (Heiken Ashi Smoothed)
// Nến màu vàng thể hiện xu hướng tăng
// Nến màu đỏ thể hiện xu hướng giảm
// Dạng nến được làm mượt từ dữ liệu giá
// Có thể dùng để xác định các điểm đánh đảo chiều
// ============================================================
export function calculateHeikenAshi(candles: Candle[], smoothLen = 6): HACandle[] {
  // Step 1: Standard Heiken Ashi
  const ha: { open: number; close: number; high: number; low: number }[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      ha.push({
        open: (c.open + c.close) / 2,
        close: (c.open + c.high + c.low + c.close) / 4,
        high: c.high,
        low: c.low,
      });
    } else {
      const haOpen = (ha[i - 1].open + ha[i - 1].close) / 2;
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      ha.push({
        open: haOpen,
        close: haClose,
        high: Math.max(c.high, haOpen, haClose),
        low: Math.min(c.low, haOpen, haClose),
      });
    }
  }

  // Step 2: Smooth with EMA
  const emaOpen = ema(ha.map((h) => h.open), smoothLen);
  const emaClose = ema(ha.map((h) => h.close), smoothLen);
  const emaHigh = ema(ha.map((h) => h.high), smoothLen);
  const emaLow = ema(ha.map((h) => h.low), smoothLen);

  return candles.map((_, i) => ({
    time: candles[i].time,
    open: emaOpen[i],
    close: emaClose[i],
    high: emaHigh[i],
    low: emaLow[i],
    isBull: emaClose[i] > emaOpen[i],
  }));
}


// ============================================================
// 7. KSI - BOYS SELLING - CHỈ SỐ CÁ MẬP HÀNH ĐỘNG TRÊN GIÁ
// Cột xanh = volume cá mập mua
// Cột đỏ = volume cá mập bán
// Indicator động lượng - Hỗ trợ tốt khi đi cùng KCX
// ============================================================
export function calculateKSI(candles: Candle[], period = 14, smooth = 3): KSIData[] {
  const volumes = candles.map((c) => c.volume || 1);
  const avgVol = sma(volumes, period);

  // Raw money flow
  const rawMF: number[] = candles.map((c, i) => {
    if (i === 0 || avgVol[i] === null) return 0;
    const priceChange = c.close - candles[i - 1].close;
    const volNorm = volumes[i] / (avgVol[i] as number);
    return priceChange * volNorm;
  });

  // Smooth: SMA then EMA
  const smoothed = sma(rawMF, period);
  const finalValues = ema(
    smoothed.map((v) => v ?? 0),
    smooth
  );

  return candles.map((c, i) => {
    const value = finalValues[i] ?? 0;
    const volNorm = avgVol[i] ? volumes[i] / (avgVol[i] as number) : 1;

    const boysBuying = i > 0 && value > 0 && value > (finalValues[i - 1] ?? 0) && volNorm > 1.5;
    const boysSelling = i > 0 && value < 0 && value < (finalValues[i - 1] ?? 0) && volNorm > 1.5;

    return {
      time: c.time,
      value,
      volNorm,
      isBullish: value > 0,
      boysBuying,
      boysSelling,
    };
  });
}

// ============================================================
// 9. KCX - CHỈ SỐ LỰC NÉN CỦA THỊ TRƯỜNG
// 1. Đen - nhà đầu tư nhỏ lẻ đang mua
// 2. Xanh dương - nhà đầu tư nhỏ lẻ đang bán
// 3. Xanh lá nhấp nháy - NĐT nhỏ lẻ đã bán gần hết (Xtreme)
// ============================================================
export function calculateKCX(candles: Candle[], period = 20): KCXData[] {
  const volumes = candles.map((c) => c.volume || 1);
  const ranges = candles.map((c) => c.high - c.low);
  const avgVol = sma(volumes, period);
  const avgRange = sma(ranges, period);

  return candles.map((c, i) => {
    if (avgVol[i] === null || avgRange[i] === null || avgRange[i] === 0) {
      return { time: c.time, state: 'neutral' as const, value: 0 };
    }

    const volRatio = volumes[i] / (avgVol[i] as number);
    const rangeRatio = ranges[i] / (avgRange[i] as number);
    const isUp = c.close > (candles[i - 1]?.close ?? c.open);

    let state: KCXData['state'] = 'retailBuy';
    if (volRatio < 0.5 && rangeRatio < 0.5) {
      state = 'exhaustion';
    } else if (!isUp && volRatio > 1.0) {
      state = 'retailSell';
    }

    return {
      time: c.time,
      state,
      value: -volRatio * (isUp ? 1 : -1),
      volRatio,
      rangeRatio,
    };
  });
}

// ============================================================
// 12. PIVOT - CHỈ SỐ TRUNG BÌNH GIÁ CỦA PHIÊN NGÀY HÔM TRƯỚC
// ============================================================
export function calculatePivot(dailyCandles: Candle[]): PivotData | null {
  if (!dailyCandles || dailyCandles.length < 2) return null;

  const prev = dailyCandles[dailyCandles.length - 2];
  const pp = (prev.high + prev.low + prev.close) / 3;

  return {
    pp,
    r1: 2 * pp - prev.low,
    s1: 2 * pp - prev.high,
    r2: pp + (prev.high - prev.low),
    s2: pp - (prev.high - prev.low),
  };
}

// ============================================================
// GTH - GOLDEN TRADING HOURS
// Academy: "Golden Hours of the day: 11:30 AM - 10:30 PM (GMT+7)"
// Đây là khung thanh khoản & biến động cao nhất, nên giao dịch.
// ============================================================
export function getGTHStatus(timestamp: number): GTHStatus {
  const date = new Date(timestamp * 1000);
  // Tính phút trong ngày theo GMT+7
  let hour = date.getUTCHours() + 7;
  if (hour >= 24) hour -= 24;
  const minutes = hour * 60 + date.getUTCMinutes();

  const start = 11 * 60 + 30; // 11:30
  const end = 22 * 60 + 30;   // 22:30 (10:30 PM)

  if (minutes >= start && minutes <= end) {
    return 'good';
  }
  return 'bad';
}


// ============================================================
// 14. KIM CƯƠNG - TÍN HIỆU QUAN TRỌNG
// Kim cương xanh: cuối sóng giảm đầu sóng tăng, tạo đáy
// Kim cương vỡ: volume lớn, biến động mạnh
// Kim cương lồng: khả năng bay mạnh
// ============================================================
export function detectDiamonds(
  candles: Candle[],
  haCandles: HACandle[],
  lookback = 5
): DiamondSignal[] {
  const volumes = candles.map((c) => c.volume || 1);
  const avgVol = sma(volumes, 20);
  const signals: DiamondSignal[] = [];

  for (let i = lookback; i < candles.length; i++) {
    // Lowest in lookback
    let lowestLow = Infinity;
    for (let j = i - lookback; j < i; j++) {
      lowestLow = Math.min(lowestLow, candles[j].low);
    }

    const isBull = haCandles[i]?.isBull;
    const wasBear = haCandles[i - 1]?.isBull === false;

    // Kim cương xanh: giá tạo đáy + đảo chiều tăng
    const blueDiamond =
      candles[i].low <= lowestLow &&
      candles[i].close > candles[i].open &&
      isBull && wasBear;

    // Kim cương vỡ: volume đột biến
    const avgV = avgVol[i];
    const brokenDiamond =
      avgV !== null &&
      volumes[i] > avgV * 2 &&
      Math.abs(candles[i].close - candles[i].open) >
        Math.abs((candles[i - 1]?.close ?? 0) - (candles[i - 1]?.open ?? 0)) * 1.5;

    if (blueDiamond) {
      signals.push({ time: candles[i].time, type: 'blue', price: candles[i].low });
    } else if (brokenDiamond && !blueDiamond) {
      signals.push({ time: candles[i].time, type: 'broken', price: candles[i].high });
    }
  }

  return signals;
}

// ============================================================
// DJDD - DOJI DEFINING THE DIRECTIONAL DAY
// Academy: "candle body ≤ 15% of the daily range AND body shorter
//   than at least one of the shadows -> indecision / compression"
// Phiên sau DJDD = Directional Day (biến động mạnh theo hướng OP)
// ============================================================
export function detectDJDD(candles: Candle[]): DJDDSignal[] {
  const signals: DJDDSignal[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    if (range <= 0) continue;

    const body = Math.abs(c.close - c.open);
    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;

    // Body <= 15% range VÀ body ngắn hơn ít nhất 1 bóng
    const isDoji =
      body <= range * 0.15 &&
      (body < upperShadow || body < lowerShadow);

    if (isDoji) {
      signals.push({ time: c.time, type: 'djdd' });
    }
  }

  return signals;
}

// ============================================================
// CCRY / CCYR - CANDLE COLOR CHANGE (Tín hiệu đổi màu nến)
// Academy: "CCRY: Red candle changes to Yellow -> BUY signal
//           CCYR: Yellow candle changes to Red -> SELL signal"
// CCRY chỉ có ý nghĩa khi giá TRÊN OP; CCYR khi giá DƯỚI OP.
// ============================================================
export function detectEngulfing(
  candles: Candle[],
  haCandles: HACandle[],
  ops: OPData[]
): TradeSignal[] {
  const signals: TradeSignal[] = [];

  for (let i = 1; i < haCandles.length; i++) {
    const op = ops[i]?.op;
    if (op === null || op === undefined) continue;

    // CCRY: nến trước ĐỎ, nến này VÀNG + giá trên OP -> BUY
    if (
      haCandles[i].isBull &&
      !haCandles[i - 1].isBull &&
      candles[i].close > op
    ) {
      signals.push({
        time: candles[i].time,
        type: 'buy',
        price: candles[i].low,
        source: 'ccry',
        reason: `CCRY - Đổi màu BUY:\n• Nến ĐỎ chuyển sang nến VÀNG\n• Giá đóng trên OP (${op.toFixed(2)})\n→ Tín hiệu BUY hợp lệ theo academy CRAZII`,
      });
    }

    // CCYR: nến trước VÀNG, nến này ĐỎ + giá dưới OP -> SELL
    if (
      !haCandles[i].isBull &&
      haCandles[i - 1].isBull &&
      candles[i].close < op
    ) {
      signals.push({
        time: candles[i].time,
        type: 'sell',
        price: candles[i].high,
        source: 'ccyr',
        reason: `CCYR - Đổi màu SELL:\n• Nến VÀNG chuyển sang nến ĐỎ\n• Giá đóng dưới OP (${op.toFixed(2)})\n→ Tín hiệu SELL hợp lệ theo academy CRAZII`,
      });
    }
  }

  return signals;
}

// ============================================================
// TAM ĐIỂM HỘI TỤ - BIG BUY / BIG SELL
// Academy: "Above OP -> Yellow Candle -> Above Pivot -> Green KSI,
//   Black KCX -> BIG BUY" (và ngược lại cho SELL)
// Pivot là tùy chọn: nếu có thì thêm vào điều kiện hợp lưu.
// ============================================================
export function detectTamDiem(
  candles: Candle[],
  haCandles: HACandle[],
  ops: OPData[],
  ksi: KSIData[],
  kcx: KCXData[],
  pivot: PivotData | null = null
): TradeSignal[] {
  const signals: TradeSignal[] = [];

  for (let i = 3; i < haCandles.length; i++) {
    const op = ops[i]?.op;
    if (op === null || op === undefined || !ksi[i] || !kcx[i]) continue;

    // Tam điểm BUY: 3 nến vàng tăng dần
    const risingBull =
      haCandles[i].isBull &&
      haCandles[i - 1].isBull &&
      haCandles[i - 2].isBull &&
      haCandles[i].close > haCandles[i - 1].close &&
      haCandles[i - 1].close > haCandles[i - 2].close;

    // Điều kiện Pivot (academy): trên Pivot cho BUY
    const abovePivot = pivot === null || candles[i].close > pivot.pp;
    const belowPivot = pivot === null || candles[i].close < pivot.pp;

    if (
      risingBull &&
      candles[i].close > op &&
      abovePivot &&
      ksi[i].isBullish &&
      kcx[i].state === 'retailBuy'
    ) {
      const pivotNote = pivot !== null ? `\n• Giá trên Pivot (${pivot.pp.toFixed(2)})` : '';
      signals.push({
        time: candles[i].time,
        type: 'buy',
        price: candles[i].low,
        source: 'tamDiem',
        reason: `BIG BUY - Hội Tụ Đa Tầng:\n• 3 nến VÀNG tăng dần liên tiếp\n• Giá đóng trên OP (${op.toFixed(2)})${pivotNote}\n• KSI xanh = Cá mập đang gom hàng\n• KCX đen = Nhỏ lẻ đang mua\n→ Tất cả điều kiện hội tụ theo academy CRAZII`,
      });
    }

    // Tam điểm SELL: 3 nến đỏ giảm dần
    const fallingBear =
      !haCandles[i].isBull &&
      !haCandles[i - 1].isBull &&
      !haCandles[i - 2].isBull &&
      haCandles[i].close < haCandles[i - 1].close &&
      haCandles[i - 1].close < haCandles[i - 2].close;

    if (
      fallingBear &&
      candles[i].close < op &&
      belowPivot &&
      !ksi[i].isBullish &&
      kcx[i].state === 'retailSell'
    ) {
      const pivotNote = pivot !== null ? `\n• Giá dưới Pivot (${pivot.pp.toFixed(2)})` : '';
      signals.push({
        time: candles[i].time,
        type: 'sell',
        price: candles[i].high,
        source: 'tamDiem',
        reason: `BIG SELL - Hội Tụ Đa Tầng:\n• 3 nến ĐỎ giảm dần liên tiếp\n• Giá đóng dưới OP (${op.toFixed(2)})${pivotNote}\n• KSI đỏ = Cá mập đang xả hàng\n• KCX xanh dương = Nhỏ lẻ đang bán\n→ Tất cả điều kiện hội tụ theo academy CRAZII`,
      });
    }
  }

  return signals;
}

// ============================================================
// DML - DIAMOND LINE BREAK (Kim Cương Nhấn Chìm)
// Academy: "When Diamond appears, Diamond Line (DML) is established at
//   closing price of most recent Diamond candle.
//   - Price closes above DML + Above OP + Yellow Candle -> Strong Buy
//   - Price rejected at DML + Below OP + Red Candle -> Strong Sell"
// ============================================================
export function detectDiamondBreak(
  candles: Candle[],
  haCandles: HACandle[],
  ops: OPData[],
  diamonds: DiamondSignal[]
): TradeSignal[] {
  const signals: TradeSignal[] = [];
  if (diamonds.length === 0) return signals;

  // Map time -> diamond để tra cứu nhanh
  const diamondByTime = new Map<number, DiamondSignal>();
  diamonds.forEach((d) => diamondByTime.set(d.time, d));

  let activeDML: { price: number; type: DiamondSignal['type'] } | null = null;

  for (let i = 0; i < candles.length; i++) {
    // Nếu nến này là nến kim cương -> thiết lập DML mới tại close
    const diamond = diamondByTime.get(candles[i].time);
    if (diamond) {
      activeDML = { price: candles[i].close, type: diamond.type };
      continue; // không vào lệnh ngay tại nến kim cương
    }

    if (!activeDML) continue;
    const op = ops[i]?.op;
    if (op === null || op === undefined) continue;

    // Strong Buy: đóng trên DML + trên OP + nến vàng
    if (
      candles[i].close > activeDML.price &&
      candles[i].close > op &&
      haCandles[i].isBull
    ) {
      signals.push({
        time: candles[i].time,
        type: 'buy',
        price: candles[i].low,
        source: 'dml',
        reason: `Kim Cương Nhấn Chìm BUY (DML):\n• Giá đóng VƯỢT đường Diamond Line (${activeDML.price.toFixed(2)})\n• Giá trên OP (${op.toFixed(2)})\n• Nến VÀNG xác nhận lực mua\n→ Strong Buy theo academy CRAZII`,
      });
      activeDML = null; // DML đã bị phá, reset
    }
    // Strong Sell: đóng dưới DML + dưới OP + nến đỏ
    else if (
      candles[i].close < activeDML.price &&
      candles[i].close < op &&
      !haCandles[i].isBull
    ) {
      signals.push({
        time: candles[i].time,
        type: 'sell',
        price: candles[i].high,
        source: 'dml',
        reason: `Kim Cương Nhấn Chìm SELL (DML):\n• Giá đóng THỦNG đường Diamond Line (${activeDML.price.toFixed(2)})\n• Giá dưới OP (${op.toFixed(2)})\n• Nến ĐỎ xác nhận lực bán\n→ Strong Sell theo academy CRAZII`,
      });
      activeDML = null;
    }
  }

  return signals;
}

// ============================================================
// MASTER: Tính toán tất cả chỉ báo CRAZII
// ============================================================
export function calculateAll(
  candles: Candle[],
  options: { opHour?: number; ktrMultiplier?: number; haSmooth?: number; dailyRange?: number | null; pivot?: PivotData | null; minConfidence?: number } = {}
): CraziiResult {
  const { opHour = 5, ktrMultiplier = 1.0, haSmooth = 6, dailyRange = null, pivot = null, minConfidence } = options;

  const ops = calculateOP(candles, opHour);
  const mlps = calculateMLP(ops);
  const ktrs = calculateKTR(candles, ops, ktrMultiplier, dailyRange);
  const haCandles = calculateHeikenAshi(candles, haSmooth);
  const ksi = calculateKSI(candles);
  const kcx = calculateKCX(candles);
  const diamonds = detectDiamonds(candles, haCandles);
  const djdd = detectDJDD(candles);
  const engulfing = detectEngulfing(candles, haCandles, ops);
  const tamDiem = detectTamDiem(candles, haCandles, ops, ksi, kcx, pivot);
  const diamondBreak = detectDiamondBreak(candles, haCandles, ops, diamonds);

  // D) Phân tích kỹ thuật ICT
  const fvgs = detectFVG(candles);
  const orderBlocks = detectOrderBlocks(candles);

  // EMA200 dạng mảng số để chấm điểm hợp lưu
  const ema200Arr = ema(candles.map((c) => c.close), 200);

  // Gom tín hiệu thô
  const rawSignals: { signal: TradeSignal; label: string }[] = [];
  tamDiem.forEach((s) => rawSignals.push({ signal: s, label: s.type === 'buy' ? 'BIG BUY (Hội Tụ)' : 'BIG SELL (Hội Tụ)' }));
  diamondBreak.forEach((s) => rawSignals.push({ signal: s, label: s.type === 'buy' ? 'Kim Cương Phá BUY' : 'Kim Cương Phá SELL' }));
  engulfing.forEach((s) => rawSignals.push({ signal: s, label: s.type === 'buy' ? 'Đổi màu BUY (CCRY)' : 'Đổi màu SELL (CCYR)' }));

  // A+B+C+D: nâng cấp + chấm điểm + lọc nhiễu
  const enhancedSignals = enhanceSignals(rawSignals, {
    candles, ops, mlps, ktrs, ksi, kcx, pivot,
    ema200: ema200Arr, fvgs, orderBlocks, djdd,
  }, { minConfidence });

  return {
    ops, mlps, ktrs, haCandles, ksi, kcx, diamonds, djdd,
    engulfing, tamDiem, diamondBreak,
    fvgs, orderBlocks, enhancedSignals,
  };
}

// ============================================================
// EMA200 - Đường trung bình động 200 phiên
// Hỗ trợ kháng cự mạnh, xác nhận xu hướng dài hạn
// ============================================================
export function calculateEMA200(candles: Candle[]): { time: number; value: number }[] {
  const closes = candles.map((c) => c.close);
  const ema200 = ema(closes, 200);
  return candles.map((c, i) => ({ time: c.time, value: ema200[i] }));
}


// ============================================================
// Gom tất cả tín hiệu giao dịch (BUY/SELL) kèm label hiển thị
// Dùng cho Telegram notifier để biết tín hiệu nào cần gửi.
// ============================================================
export function collectTradeSignals(
  crazii: CraziiResult
): { signal: TradeSignal; label: string }[] {
  const out: { signal: TradeSignal; label: string }[] = [];

  crazii.tamDiem.forEach((s) => {
    out.push({ signal: s, label: s.type === 'buy' ? 'BIG BUY (Hội Tụ)' : 'BIG SELL (Hội Tụ)' });
  });
  crazii.diamondBreak.forEach((s) => {
    out.push({ signal: s, label: s.type === 'buy' ? 'Kim Cương Phá BUY' : 'Kim Cương Phá SELL' });
  });
  crazii.engulfing.forEach((s) => {
    out.push({ signal: s, label: s.type === 'buy' ? 'Đổi màu BUY (CCRY)' : 'Đổi màu SELL (CCYR)' });
  });

  return out;
}
