/**
 * Signal Enhancer - Nâng cấp tín hiệu CRAZII
 * A) Tính Entry / SL / TP1-2-3 + R:R
 * B) Chấm điểm Confidence theo hợp lưu (OP, MLP, KSI, KCX, Pivot, EMA200, FVG, OB)
 * C) Lọc nhiễu (debounce + bỏ vùng sideway/DJDD)
 * D) Tích hợp FVG & Order Block làm điều kiện hợp lưu
 */

import type {
  Candle, OPData, MLPData, KTRData, KSIData, KCXData, PivotData,
  TradeSignal, FVG, OrderBlock, EnhancedSignal, Confluence, DJDDSignal, SRZone,
} from '../types/index.js';
import { priceInFVG, priceInOB } from './technicalAnalysis.js';

export interface EnhanceContext {
  candles: Candle[];
  ops: OPData[];
  mlps: MLPData[];
  ktrs: KTRData[];
  ksi: KSIData[];
  kcx: KCXData[];
  pivot: PivotData | null;
  ema200: (number | null)[];
  fvgs: FVG[];
  orderBlocks: OrderBlock[];
  djdd: DJDDSignal[];
  srZones: SRZone[];
}

// Trọng số điểm cho từng yếu tố hợp lưu (tổng tối đa = 100)
const WEIGHTS = {
  op: 25,       // luật OP - quan trọng nhất
  mlp: 12,
  ksi: 15,      // dòng tiền cá mập
  kcx: 10,
  pivot: 10,
  ema200: 10,
  fvg: 10,      // ICT
  ob: 8,        // ICT
};

// Ngưỡng confidence tối thiểu để giữ tín hiệu
export const MIN_CONFIDENCE = 55;
// Số nến tối thiểu giữa 2 tín hiệu cùng hướng (debounce)
const DEBOUNCE_BARS = 3;
// Sideways detection params
const SW_LOOKBACK = 20;       // số nến để phát hiện sideway
const SW_ATR_RATIO = 0.6;    // ATR hiện tại / ATR dài hạn < ratio này = sideway
const SW_OP_CROSS_MAX = 4;   // giá cross OP > N lần trong lookback = sideway
const SW_PENALTY = 30;       // trừ bao nhiêu điểm confidence khi sideway

/**
 * Phát hiện thị trường đang sideways tại 1 vị trí.
 * Trả về true nếu:
 * 1. ATR gần đây thấp hơn ATR dài hạn (biên độ nén)
 * 2. Giá cross OP nhiều lần (giằng co quanh OP)
 * 3. Nến đổi màu liên tục (zebra)
 */
function isSideways(candles: Candle[], ops: OPData[], idx: number): boolean {
  if (idx < SW_LOOKBACK + 14) return false;

  // 1. ATR ratio: so sánh ATR ngắn hạn (SW_LOOKBACK) vs dài hạn (50)
  let shortATR = 0;
  for (let i = idx - SW_LOOKBACK + 1; i <= idx; i++) {
    shortATR += candles[i].high - candles[i].low;
  }
  shortATR /= SW_LOOKBACK;

  let longATR = 0;
  const longPeriod = Math.min(50, idx);
  for (let i = idx - longPeriod + 1; i <= idx; i++) {
    longATR += candles[i].high - candles[i].low;
  }
  longATR /= longPeriod;

  const atrRatio = longATR > 0 ? shortATR / longATR : 1;

  // 2. OP cross count: giá cross qua OP bao nhiêu lần
  let opCrosses = 0;
  for (let i = idx - SW_LOOKBACK + 2; i <= idx; i++) {
    const op = ops[i]?.op;
    if (op === null) continue;
    const prevAbove = candles[i - 1].close > op;
    const currAbove = candles[i].close > op;
    if (prevAbove !== currAbove) opCrosses++;
  }

  // 3. Zebra: nến đổi hướng liên tục (đếm lần body đổi chiều)
  let colorChanges = 0;
  for (let i = idx - SW_LOOKBACK + 2; i <= idx; i++) {
    const prevBull = candles[i - 1].close > candles[i - 1].open;
    const currBull = candles[i].close > candles[i].open;
    if (prevBull !== currBull) colorChanges++;
  }
  const zebraRatio = colorChanges / (SW_LOOKBACK - 1); // > 0.7 = nhiều đổi màu

  // Sideways nếu ít nhất 2 trong 3 điều kiện thỏa
  let score = 0;
  if (atrRatio < SW_ATR_RATIO) score++;
  if (opCrosses >= SW_OP_CROSS_MAX) score++;
  if (zebraRatio > 0.65) score++;

  return score >= 2;
}

/** Tìm swing low/high gần nhất để đặt SL */
function findSwingLow(candles: Candle[], idx: number, lookback = 10): number {
  let low = candles[idx].low;
  for (let i = Math.max(0, idx - lookback); i <= idx; i++) {
    low = Math.min(low, candles[i].low);
  }
  return low;
}
function findSwingHigh(candles: Candle[], idx: number, lookback = 10): number {
  let high = candles[idx].high;
  for (let i = Math.max(0, idx - lookback); i <= idx; i++) {
    high = Math.max(high, candles[i].high);
  }
  return high;
}

/** Tìm index của candle theo time */
function indexByTime(candles: Candle[], time: number): number {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].time === time) return i;
  }
  return -1;
}

/** ATR cục bộ tại 1 index (đo biên độ gần đây để đặt SL/đệm) */
function localATR(candles: Candle[], idx: number, period = 14): number {
  const start = Math.max(1, idx - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= idx; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : (candles[idx].high - candles[idx].low);
}

/**
 * Nâng cấp 1 tín hiệu thô thành EnhancedSignal đầy đủ.
 * Trả về null nếu tín hiệu không đạt chuẩn (confidence thấp / R:R kém).
 */
function enhanceOne(
  signal: TradeSignal,
  label: string,
  ctx: EnhanceContext
): EnhancedSignal | null {
  const idx = indexByTime(ctx.candles, signal.time);
  if (idx < 0) return null;

  const candle = ctx.candles[idx];
  const isBuy = signal.type === 'buy';
  const entry = candle.close;

  const op = ctx.ops[idx]?.op ?? null;
  const mlp = ctx.mlps[idx]?.mlp ?? null;
  const ktr = ctx.ktrs[idx]?.levels ?? null;
  const ksi = ctx.ksi[idx];
  const kcx = ctx.kcx[idx];
  const ema = ctx.ema200[idx];

  // ===== A) TP/SL =====
  // SL dựa trên swing gần nhất + đệm ATR. TP tính theo mốc hỗ trợ/kháng cự (SRZone).
  // Nếu không có mốc SRZone phù hợp thì fallback về mốc R hoặc KTR.
  const atrVal = localATR(ctx.candles, idx, 14);
  let sl: number;
  let tp1: number, tp2: number, tp3: number;

  if (isBuy) {
    const swingLow = findSwingLow(ctx.candles, idx, 10);
    const rawSL = swingLow - atrVal * 0.3;
    const minSL = entry - atrVal * 1.5;
    sl = Math.min(rawSL, minSL);

    // Tinh chỉnh SL theo vùng Hỗ trợ phía dưới entry
    let supportSL = sl;
    const supportZones = (ctx.srZones || []).filter((z) => z.high < entry);
    if (supportZones.length > 0) {
      supportZones.sort((a, b) => b.high - a.high); // lấy vùng gần nhất
      const closestSupport = supportZones[0];
      const targetSL = closestSupport.low - atrVal * 0.1;
      if (targetSL < entry && targetSL > entry - atrVal * 3.5) {
        supportSL = targetSL;
      }
    }
    sl = Math.min(sl, supportSL);
    sl = Math.max(sl, entry - atrVal * 3.5); // giới hạn SL tối đa 3.5 ATR

    const risk = entry - sl;

    // TP mặc định theo bội số R
    tp1 = entry + risk * 1.5;
    tp2 = entry + risk * 2.5;
    tp3 = entry + risk * 4.0;

    // Tinh chỉnh TP theo vùng Kháng cự phía trên entry
    const resistanceZones = (ctx.srZones || []).filter((z) => z.low > entry);
    if (resistanceZones.length > 0) {
      resistanceZones.sort((a, b) => a.low - b.low); // gần nhất xếp trước
      tp1 = resistanceZones[0].low - atrVal * 0.1;
      if (resistanceZones.length > 1) {
        tp2 = resistanceZones[1].low - atrVal * 0.1;
      } else {
        tp2 = tp1 + risk * 1.2;
      }
      if (resistanceZones.length > 2) {
        tp3 = resistanceZones[2].low - atrVal * 0.1;
      } else {
        tp3 = tp2 + risk * 1.5;
      }
    } else if (ktr) {
      if (ktr.plus1 > entry) tp1 = ktr.plus1;
      if (ktr.plus2 > entry) tp2 = ktr.plus2;
      if (ktr.plus3 > entry) tp3 = ktr.plus3;
    }
  } else {
    const swingHigh = findSwingHigh(ctx.candles, idx, 10);
    const rawSL = swingHigh + atrVal * 0.3;
    const minSL = entry + atrVal * 1.5;
    sl = Math.max(rawSL, minSL);

    // Tinh chỉnh SL theo vùng Kháng cự phía trên entry
    let resistanceSL = sl;
    const resistanceZones = (ctx.srZones || []).filter((z) => z.low > entry);
    if (resistanceZones.length > 0) {
      resistanceZones.sort((a, b) => a.low - b.low);
      const closestResistance = resistanceZones[0];
      const targetSL = closestResistance.high + atrVal * 0.1;
      if (targetSL > entry && targetSL < entry + atrVal * 3.5) {
        resistanceSL = targetSL;
      }
    }
    sl = Math.max(sl, resistanceSL);
    sl = Math.min(sl, entry + atrVal * 3.5); // giới hạn tối đa 3.5 ATR

    const risk = sl - entry;

    // TP mặc định theo bội số R
    tp1 = entry - risk * 1.5;
    tp2 = entry - risk * 2.5;
    tp3 = entry - risk * 4.0;

    // Tinh chỉnh TP theo vùng Hỗ trợ phía dưới entry
    const supportZones = (ctx.srZones || []).filter((z) => z.high < entry);
    if (supportZones.length > 0) {
      supportZones.sort((a, b) => b.high - a.high);
      tp1 = supportZones[0].high + atrVal * 0.1;
      if (supportZones.length > 1) {
        tp2 = supportZones[1].high + atrVal * 0.1;
      } else {
        tp2 = tp1 - risk * 1.2;
      }
      if (supportZones.length > 2) {
        tp3 = supportZones[2].high + atrVal * 0.1;
      } else {
        tp3 = tp2 - risk * 1.5;
      }
    } else if (ktr) {
      if (ktr.minus1 < entry) tp1 = ktr.minus1;
      if (ktr.minus2 < entry) tp2 = ktr.minus2;
      if (ktr.minus3 < entry) tp3 = ktr.minus3;
    }
  }

  // Đảm bảo TP tăng/giảm dần đúng thứ tự
  if (isBuy) {
    tp2 = Math.max(tp2, tp1);
    tp3 = Math.max(tp3, tp2);
  } else {
    tp2 = Math.min(tp2, tp1);
    tp3 = Math.min(tp3, tp2);
  }

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp1 - entry);
  const rr = risk > 0 ? reward / risk : 0;

  // Đánh giá mức độ rủi ro (Risk Grading)
  const riskPercent = entry > 0 ? (risk / entry) * 100 : 0;
  let riskLevel: 'Low' | 'Medium' | 'High' = 'Medium';
  if (riskPercent <= 0.6) riskLevel = 'Low';
  else if (riskPercent > 1.4) riskLevel = 'High';

  // ===== B) Confidence scoring =====
  const confluences: Confluence[] = [];
  const addCon = (name: string, passed: boolean, weight: number, detail: string) =>
    confluences.push({ name, passed, weight, detail });

  // OP rule
  const opPass = op !== null && (isBuy ? entry > op : entry < op);
  addCon('OP', opPass, WEIGHTS.op,
    op === null ? 'Chưa có OP' : isBuy ? `Giá ${entry.toFixed(2)} ${opPass ? '>' : '<'} OP ${op.toFixed(2)}` : `Giá ${entry.toFixed(2)} ${opPass ? '<' : '>'} OP ${op.toFixed(2)}`);

  // MLP
  const mlpPass = mlp !== null && (isBuy ? entry > mlp : entry < mlp);
  addCon('MLP', mlpPass, WEIGHTS.mlp,
    mlp === null ? 'Chưa có MLP' : `Giá ${mlpPass ? 'đúng phía' : 'sai phía'} MLP`);

  // KSI (dòng tiền cá mập)
  const ksiPass = ksi ? (isBuy ? ksi.isBullish : !ksi.isBullish) : false;
  addCon('KSI', ksiPass, WEIGHTS.ksi,
    ksiPass ? 'Cá mập cùng hướng' : 'Cá mập ngược hướng');

  // KCX
  const kcxPass = kcx ? (isBuy ? (kcx.state === 'retailBuy' || kcx.state === 'exhaustion') : kcx.state === 'retailSell') : false;
  addCon('KCX', kcxPass, WEIGHTS.kcx,
    kcxPass ? 'Lực nén ủng hộ' : 'Lực nén chưa ủng hộ');

  // Pivot
  const pivotPass = ctx.pivot ? (isBuy ? entry > ctx.pivot.pp : entry < ctx.pivot.pp) : false;
  addCon('Pivot', pivotPass, WEIGHTS.pivot,
    ctx.pivot ? `Giá ${pivotPass ? 'đúng phía' : 'sai phía'} Pivot` : 'Chưa có Pivot');

  // EMA200
  const emaPass = ema != null && (isBuy ? entry > ema : entry < ema);
  addCon('EMA200', emaPass, WEIGHTS.ema200,
    ema == null ? 'Chưa đủ data EMA200' : `Giá ${emaPass ? 'đúng phía' : 'sai phía'} EMA200`);

  // D) FVG
  const fvg = priceInFVG(entry, ctx.fvgs, signal.type);
  addCon('FVG', fvg !== null, WEIGHTS.fvg,
    fvg ? 'Giá trong vùng FVG chưa lấp' : 'Không có FVG hợp lưu');

  // D) Order Block
  const ob = priceInOB(entry, ctx.orderBlocks, signal.type);
  addCon('OB', ob !== null, WEIGHTS.ob,
    ob ? 'Giá trong vùng Order Block' : 'Không có OB hợp lưu');

  // Tính tổng điểm
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const earned = confluences.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
  let confidence = Math.round((earned / totalWeight) * 100);

  // Phát hiện sideways: trừ mạnh confidence nếu thị trường đang đi ngang
  const sideways = isSideways(ctx.candles, ctx.ops, idx);
  if (sideways) {
    confidence = Math.max(0, confidence - SW_PENALTY);
    confluences.push({
      name: 'Sideways',
      passed: false,
      weight: 0,
      detail: `⚠️ Thị trường đang SIDEWAY (biên độ nén + giá giằng co OP) → -${SW_PENALTY}%`,
    });
  }

  // Tìm vùng S/R gần nhất để đưa vào mô tả
  let srDetail = '';
  if (ctx.srZones && ctx.srZones.length > 0) {
    const nearestZone = isBuy
      ? (ctx.srZones.find((z) => z.low > entry) || ctx.srZones[0])
      : (ctx.srZones.find((z) => z.high < entry) || ctx.srZones[0]);
    const zoneType = nearestZone.high < entry ? 'Hỗ trợ' : 'Kháng cự';
    const zoneStrength = nearestZone.strength >= 40 ? 'Mạnh' : 'Nhẹ';
    srDetail = `\n🏛️ S/R gần nhất: ${zoneType} ${zoneStrength} [${nearestZone.low.toFixed(2)} - ${nearestZone.high.toFixed(2)}] (Lực: ${nearestZone.strength})`;
  }

  // ===== Reason text =====
  const checkList = confluences
    .map((c) => `${c.passed ? '✅' : '❌'} ${c.name}: ${c.detail}`)
    .join('\n');
  const swNote = sideways ? ' ⚠️ SIDEWAY' : '';
  const reason = `${label} (${signal.type.toUpperCase()})${swNote}\n` +
    `📊 Confidence: ${confidence}% | R:R = 1:${rr.toFixed(1)}\n` +
    `🛡️ Rủi ro: ${riskLevel === 'Low' ? 'Thấp 🟢' : riskLevel === 'Medium' ? 'Vừa 🟡' : 'Cao 🔴'} (${riskPercent.toFixed(2)}%)${srDetail}\n` +
    `━━━━━━━━━━━━\n${checkList}`;

  return {
    time: signal.time,
    side: signal.type,
    source: signal.source ?? label,
    label,
    entry,
    sl,
    tp1, tp2, tp3,
    rr,
    confidence,
    confluences,
    reason,
    riskLevel,
    riskPercent,
  };
}

/**
 * Nâng cấp + lọc danh sách tín hiệu.
 * - Bỏ tín hiệu confidence < MIN_CONFIDENCE
 * - Bỏ tín hiệu R:R < 1
 * - Debounce: bỏ tín hiệu cùng hướng quá gần nhau
 * - Bỏ tín hiệu trong vùng DJDD (sideway nén)
 */
export function enhanceSignals(
  rawSignals: { signal: TradeSignal; label: string }[],
  ctx: EnhanceContext,
  options: { minConfidence?: number; minRR?: number } = {}
): EnhancedSignal[] {
  const minConf = options.minConfidence ?? MIN_CONFIDENCE;
  const minRR = options.minRR ?? 1.0;

  // Set thời điểm DJDD để loại
  const djddTimes = new Set(ctx.djdd.map((d) => d.time));

  const enhanced: EnhancedSignal[] = [];
  for (const { signal, label } of rawSignals) {
    // C) Bỏ tín hiệu ngay tại nến DJDD (thị trường nén, dễ nhiễu)
    if (djddTimes.has(signal.time)) continue;

    const e = enhanceOne(signal, label, ctx);
    if (!e) continue;
    if (e.confidence < minConf) continue;
    if (e.rr < minRR) continue;
    enhanced.push(e);
  }

  // Sắp theo thời gian
  enhanced.sort((a, b) => a.time - b.time);

  // C) Debounce: bỏ tín hiệu cùng hướng cách nhau < DEBOUNCE_BARS nến
  const filtered: EnhancedSignal[] = [];
  const lastIdxBySide: Record<string, number> = {};
  for (const e of enhanced) {
    const idx = indexByTime(ctx.candles, e.time);
    const lastIdx = lastIdxBySide[e.side];
    if (lastIdx !== undefined && idx - lastIdx < DEBOUNCE_BARS) {
      // Giữ tín hiệu confidence cao hơn
      const prev = filtered[filtered.length - 1];
      if (prev && prev.side === e.side && e.confidence > prev.confidence) {
        filtered[filtered.length - 1] = e;
        lastIdxBySide[e.side] = idx;
      }
      continue;
    }
    filtered.push(e);
    lastIdxBySide[e.side] = idx;
  }

  return filtered;
}
