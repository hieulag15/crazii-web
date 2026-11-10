/**
 * Fee Model — BingX Perpetual Futures (PURE, no browser deps)
 *
 * Tách riêng để cả client (signalTracker) lẫn engine chạy phía server
 * (auto-scan) đều import được mà không kéo theo localStorage/fetch.
 *
 * Thực tế mỗi lệnh futures trên BingX bị trừ:
 *   1. Phí giao dịch (trading fee): tính trên NOTIONAL, thu 2 lần (mở + đóng)
 *        - Maker (lệnh limit): ~0.02%
 *        - Taker (lệnh market): ~0.05%
 *      Khi giá tăng/giảm đột ngột, không kịp đặt limit → phải market = taker.
 *   2. Phí funding: thu mỗi 8h, tính trên notional (~0.01%/lần với coin top).
 *   3. Slippage: trượt giá khi khớp market lúc biến động mạnh.
 *
 * ⚠️ Vì notional = riskUSD / slDist%, nên SL càng CHẶT thì notional càng LỚN
 *    → phí càng ăn mạnh vào lợi nhuận.
 */

export interface FeeConfig {
  takerFeePct: number;    // % mỗi chiều khi khớp market
  makerFeePct: number;    // % mỗi chiều khi khớp limit
  fundingRatePct: number; // % mỗi lần funding (8h), lấy trị tuyệt đối trung bình
  slippagePct: number;    // % trượt giá ước tính mỗi chiều
  useTaker: boolean;      // true = khớp market cả 2 chiều (mặc định, an toàn hơn)
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  takerFeePct: 0.05,
  makerFeePct: 0.02,
  fundingRatePct: 0.01,
  slippagePct: 0.02,
  useTaker: true,
};

export const FUNDING_INTERVAL_HOURS = 8;
/** Thời gian giữ lệnh mặc định (giờ) dùng để ước tính funding khi chưa đóng lệnh. */
export const DEFAULT_EST_HOLDING_HOURS = 24;

/** Số lần bị tính funding dựa trên thời gian giữ lệnh (giờ). */
export function countFundingIntervals(holdingHours: number): number {
  if (!isFinite(holdingHours) || holdingHours <= 0) return 0;
  return Math.max(0, Math.round(holdingHours / FUNDING_INTERVAL_HOURS));
}

/**
 * Tính tổng phí cho một lệnh perpetual futures.
 *   - Phí mở   = notional vào × feePct
 *   - Phí đóng = notional ra  × feePct  (notional ra = notional vào × exit/entry)
 *   - Funding  = notional vào × fundingRate × số lần funding
 *   - Slippage = (notional vào + notional ra) × slippagePct
 */
export function calcFees(params: {
  positionSize: number;   // notional vào lệnh (USDT)
  entry: number;
  exit: number;           // giá đóng (TP hoặc SL)
  holdingHours?: number;
  cfg?: Partial<FeeConfig>;
}): { feeOpen: number; feeClose: number; fundingFee: number; slippage: number; total: number } {
  const cfg: FeeConfig = { ...DEFAULT_FEE_CONFIG, ...(params.cfg ?? {}) };
  const feePct = (cfg.useTaker ? cfg.takerFeePct : cfg.makerFeePct) / 100;
  const slipPct = cfg.slippagePct / 100;

  const notionalIn = params.positionSize;
  const notionalOut = params.entry > 0
    ? params.positionSize * (params.exit / params.entry)
    : params.positionSize;

  const feeOpen = notionalIn * feePct;
  const feeClose = notionalOut * feePct;
  const intervals = countFundingIntervals(params.holdingHours ?? 0);
  const fundingFee = notionalIn * (cfg.fundingRatePct / 100) * intervals;
  const slippage = (notionalIn + notionalOut) * slipPct;
  const total = feeOpen + feeClose + fundingFee + slippage;

  return { feeOpen, feeClose, fundingFee, slippage, total };
}

/**
 * Tính R:R NET (sau phí) của một setup — độc lập với đòn bẩy & số dư ví.
 *
 * Vì lãi, lỗ và phí đều tỷ lệ theo notional = riskUSD / slDist%, nên riskUSD
 * triệt tiêu. Ta chuẩn hoá riskUSD = 1 → notional = 1 / slDist%.
 *   grossTP = notional × tpDist%  (= rr gộp)
 *   grossSL = -1
 *   netRR   = |(grossTP − feesTP) / (grossSL − feesSL)|
 */
export function calcNetRR(params: {
  entry: number;
  sl: number;
  tp: number;
  side: 'buy' | 'sell';
  holdingHours?: number;
  cfg?: Partial<FeeConfig>;
}): number {
  const slDistPct = Math.abs(params.entry - params.sl) / params.entry;
  const tpDistPct = Math.abs(params.tp - params.entry) / params.entry;
  if (slDistPct <= 0) return 0;

  const notional = 1 / slDistPct; // riskUSD chuẩn hoá = 1
  const holding = params.holdingHours ?? DEFAULT_EST_HOLDING_HOURS;

  const grossTP = notional * tpDistPct;
  const grossSL = -1;

  const feesTP = calcFees({ positionSize: notional, entry: params.entry, exit: params.tp, holdingHours: holding, cfg: params.cfg }).total;
  const feesSL = calcFees({ positionSize: notional, entry: params.entry, exit: params.sl, holdingHours: holding, cfg: params.cfg }).total;

  const netTP = grossTP - feesTP;
  const netSL = grossSL - feesSL; // âm

  return netSL !== 0 ? Math.abs(netTP / netSL) : 0;
}
