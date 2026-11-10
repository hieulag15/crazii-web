/**
 * Signal Tracker - Lưu trữ, theo dõi kết quả tín hiệu
 * Storage: MongoDB (primary) + localStorage (cache/offline fallback)
 * Mục tiêu: Thu thập data để cải thiện logic + train AI
 *
 * v2: Thêm leverage + PnL calculator (USDT)
 */

import type { KeyLevelSignal, EMAData, VolumeAnalysis } from './keyLevelEngine';
import type { Candle } from '../types/index';
import { calcFees, DEFAULT_EST_HOLDING_HOURS, type FeeConfig } from './fees';

// Re-export fee model để các import cũ (từ signalTracker) vẫn hoạt động
export {
  calcFees, calcNetRR, countFundingIntervals,
  DEFAULT_FEE_CONFIG, DEFAULT_EST_HOLDING_HOURS, FUNDING_INTERVAL_HOURS,
  type FeeConfig,
} from './fees';

// ============================================================
// TYPES
// ============================================================

export type SignalOutcome = 'pending' | 'tp' | 'sl' | 'partial' | 'breakeven' | 'manual_close';

export interface TrackedSignal {
  id: string;
  createdAt: number;
  inMyPositions?: boolean;   // user đánh dấu "Theo dõi"
  symbol: string;
  timeframe: string;
  side: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp: number;
  confidence: number;
  pattern: string;
  trend: string;
  volumeConfirm: boolean;
  nearLevelPrice: number;
  nearLevelType: string;
  reason: string;
  outcome: SignalOutcome;
  closedAt: number | null;
  closePrice: number | null;
  rAchieved: number | null;  // R-multiple: +X for win, -1 for SL
  maxFavorable: number;
  maxAdverse: number;
  notes: string;
  tags: string[];

  // ── Leverage & PnL (v2) ─────────────────────────────────
  leverage?: number;        // đòn bẩy (1 = spot, 2 = 2x, ...)
  riskUSD?: number;         // số USDT chấp nhận thua tối đa cho lệnh này
  positionSize?: number;    // kích thước vị thế (USDT, tính từ riskUSD / distance%)
  pnlTP?: number;           // PnL USDT nếu TP (GỘP, chưa trừ phí)
  pnlSL?: number;           // PnL USDT nếu SL (âm, = -riskUSD, chưa trừ phí)
  pnlCurrent?: number;      // PnL USDT thực tế (NET - đã trừ phí) khi lệnh đóng
  // ────────────────────────────────────────────────────────

  // ── Phí giao dịch (v3 - BingX perpetual) ────────────────
  feeOpen?: number;         // phí mở lệnh (USDT, = notional × feePct)
  feeClose?: number;        // phí đóng lệnh (USDT)
  fundingFee?: number;      // phí funding ước tính (USDT)
  totalFees?: number;       // tổng phí thực tế khi đóng (USDT)
  pnlTPNet?: number;        // PnL NET nếu TP (đã trừ phí mở+đóng+funding)
  pnlSLNet?: number;        // PnL NET nếu SL (đã trừ phí → lỗ nhiều hơn riskUSD)
  // ────────────────────────────────────────────────────────

  marketContext: {
    ema34: number;
    ema89: number;
    ema200: number;
    volumeRatio: number;
    prevCandles: number[][];   // last 10 candles as [O,H,L,C,V]
    bullishCount?: number;
    bearishCount?: number;
    avgBodySize?: number;
    entryDistToEma34?: number;
    entryDistToEma89?: number;
    entryDistToEma200?: number;
    riskReward?: number;
  };
}

export interface TrackingStats {
  totalSignals: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgR: number;
  totalR: number;
  bestR: number;
  worstR: number;
  totalPnL: number;          // tổng PnL USD từ các lệnh đã đóng
  byPattern: Record<string, { total: number; wins: number; winRate: number; avgR: number }>;
  byTimeframe: Record<string, { total: number; wins: number; winRate: number; avgR: number }>;
  byTrend: Record<string, { total: number; wins: number; winRate: number }>;
}

// ============================================================
// CONSTANTS
// ============================================================

const CACHE_KEY = 'crazii_kl_signals_cache';

// ============================================================
// CACHE HELPERS
// ============================================================

function readCache(): TrackedSignal[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}

function writeCache(signals: TrackedSignal[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(signals));
}

// ============================================================
// API HELPERS
// ============================================================

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ============================================================
// PUBLIC API — MongoDB-backed với cache fallback
// ============================================================

/** Load tất cả signals (từ MongoDB, fallback về cache) */
export async function loadAllSignals(): Promise<TrackedSignal[]> {
  try {
    const data = await apiFetch('/api/kl-signals');
    const signals = data.map((s: TrackedSignal & { _id?: string }) => ({
      ...s,
      id: s._id || s.id || `${s.symbol}_${s.createdAt}_${s.side}`,
    })) as TrackedSignal[];
    writeCache(signals);
    return signals;
  } catch {
    return readCache();
  }
}

/** Sync-read từ cache (không cần await) */
export function getAllSignals(): TrackedSignal[] {
  return readCache();
}

/** Thêm signal mới */
export async function addSignal(signal: TrackedSignal): Promise<void> {
  const cache = readCache();
  const exists = cache.some(s => s.symbol === signal.symbol && s.createdAt === signal.createdAt && s.side === signal.side);
  if (!exists) writeCache([signal, ...cache]);

  try {
    const result = await apiFetch('/api/kl-signals', { method: 'POST', body: JSON.stringify(signal) });
    if (result?.id && result.id !== signal.id) {
      const cache2 = readCache();
      const idx = cache2.findIndex(s => s.id === signal.id);
      if (idx >= 0) { cache2[idx].id = result.id; writeCache(cache2); }
    }
  } catch { /* silent */ }
}

/** Update signal */
export async function updateSignal(id: string, updates: Partial<TrackedSignal>): Promise<void> {
  const cache = readCache();
  const idx = cache.findIndex(s => s.id === id);
  if (idx >= 0) { cache[idx] = { ...cache[idx], ...updates }; writeCache(cache); }

  const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
  if (!isMongoId) return;
  try {
    await apiFetch('/api/kl-signals', { method: 'PUT', body: JSON.stringify({ id, ...updates }) });
  } catch { /* silent */ }
}

/** Xóa signal */
export async function deleteSignal(id: string): Promise<void> {
  writeCache(readCache().filter(s => s.id !== id));
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
  if (!isMongoId) return;
  try {
    await apiFetch(`/api/kl-signals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch { /* silent */ }
}

// ============================================================
// AUTO-TRACK: Check TP/SL
// ============================================================

export function checkSignalOutcome(
  signal: TrackedSignal,
  currentPrice: number,
  currentHigh: number,
  currentLow: number
): Partial<TrackedSignal> | null {
  if (signal.outcome !== 'pending') return null;

  const updates: Partial<TrackedSignal> = {};

  const applyClose = (outcome: 'tp' | 'sl', closePrice: number, rAchieved: number) => {
    const closedAt = Date.now();
    updates.outcome = outcome;
    updates.closePrice = closePrice;
    updates.closedAt = closedAt;
    updates.rAchieved = rAchieved;

    // PnL NET đã trừ phí (mở + đóng + funding theo thời gian giữ lệnh thực)
    const net = computeClosedNetPnL(signal, outcome, closedAt);
    if (net) {
      updates.pnlCurrent = net.pnlNet;
      updates.feeOpen = net.feeOpen;
      updates.feeClose = net.feeClose;
      updates.fundingFee = net.fundingFee;
      updates.totalFees = net.totalFees;
    } else if (outcome === 'sl' && signal.riskUSD) {
      updates.pnlCurrent = -signal.riskUSD;
    } else if (outcome === 'tp' && signal.pnlTP) {
      updates.pnlCurrent = signal.pnlTP;
    }
  };

  if (signal.side === 'buy') {
    if (currentHigh > signal.maxFavorable) updates.maxFavorable = currentHigh;
    if (currentLow < signal.maxAdverse)    updates.maxAdverse = currentLow;
    if (currentLow <= signal.sl) {
      applyClose('sl', signal.sl, -1);
    } else if (currentHigh >= signal.tp) {
      applyClose('tp', signal.tp, Math.abs(signal.tp - signal.entry) / Math.abs(signal.entry - signal.sl));
    }
  } else {
    if (currentLow < signal.maxFavorable)  updates.maxFavorable = currentLow;
    if (currentHigh > signal.maxAdverse)   updates.maxAdverse = currentHigh;
    if (currentHigh >= signal.sl) {
      applyClose('sl', signal.sl, -1);
    } else if (currentLow <= signal.tp) {
      applyClose('tp', signal.tp, Math.abs(signal.entry - signal.tp) / Math.abs(signal.sl - signal.entry));
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

// ============================================================
// STATISTICS
// ============================================================

export function calculateStats(signals?: TrackedSignal[]): TrackingStats {
  const all = signals ?? readCache();
  const closed = all.filter(s => s.outcome !== 'pending');
  const wins    = closed.filter(s => s.outcome === 'tp' || (s.outcome === 'partial' && (s.rAchieved ?? 0) > 0));
  const losses  = closed.filter(s => s.outcome === 'sl' || (s.outcome === 'manual_close' && (s.rAchieved ?? 0) < 0));
  const rValues = closed.filter(s => s.rAchieved != null).map(s => s.rAchieved!);

  const totalPnL = closed
    .filter(s => s.pnlCurrent != null)
    .reduce((sum, s) => sum + (s.pnlCurrent ?? 0), 0);

  const byPattern:   TrackingStats['byPattern']   = {};
  const byTimeframe: TrackingStats['byTimeframe'] = {};
  const byTrend:     TrackingStats['byTrend']     = {};

  for (const s of closed) {
    for (const [map, key] of [[byPattern, s.pattern], [byTimeframe, s.timeframe]] as [typeof byPattern, string][]) {
      if (!map[key]) map[key] = { total: 0, wins: 0, winRate: 0, avgR: 0 };
      map[key].total++;
      if (s.outcome === 'tp') map[key].wins++;
    }
    if (!byTrend[s.trend]) byTrend[s.trend] = { total: 0, wins: 0, winRate: 0 };
    byTrend[s.trend].total++;
    if (s.outcome === 'tp') byTrend[s.trend].wins++;
  }

  for (const [map] of [[byPattern], [byTimeframe]] as [typeof byPattern][]) {
    for (const k of Object.keys(map)) {
      map[k].winRate = map[k].total > 0 ? (map[k].wins / map[k].total) * 100 : 0;
      const rs = closed.filter(s => (s.pattern === k || s.timeframe === k) && s.rAchieved != null).map(s => s.rAchieved!);
      map[k].avgR = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
    }
  }
  for (const k of Object.keys(byTrend)) {
    byTrend[k].winRate = byTrend[k].total > 0 ? (byTrend[k].wins / byTrend[k].total) * 100 : 0;
  }

  return {
    totalSignals: all.length,
    wins: wins.length, losses: losses.length,
    pending: all.filter(s => s.outcome === 'pending').length,
    winRate:  closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    avgR:     rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0,
    totalR:   rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) : 0,
    bestR:    rValues.length > 0 ? Math.max(...rValues) : 0,
    worstR:   rValues.length > 0 ? Math.min(...rValues) : 0,
    totalPnL,
    byPattern, byTimeframe, byTrend,
  };
}

// ============================================================
// EXPORT
// ============================================================

export function exportAsCSV(): string {
  const all = readCache();
  const headers = 'Date,Symbol,TF,Side,Pattern,Trend,Confidence,Entry,SL,TP,Outcome,R_Achieved,VolConfirm,Leverage,RiskUSD,PositionSize,Fees_USD,PnL_Net_USD,Notes,Tags';
  const rows = all.map(s => [
    new Date(s.createdAt).toISOString(), s.symbol, s.timeframe, s.side, s.pattern, s.trend,
    s.confidence, s.entry, s.sl, s.tp, s.outcome, s.rAchieved ?? '',
    s.volumeConfirm, s.leverage ?? 1, s.riskUSD ?? '', s.positionSize ?? '',
    s.totalFees ?? '', s.pnlCurrent ?? '',
    `"${(s.notes || '').replace(/"/g, '""')}"`, (s.tags || []).join(';'),
  ].join(','));
  return [headers, ...rows].join('\n');
}

export function exportForTraining(): string {
  return readCache().filter(s => s.outcome !== 'pending').map(s => JSON.stringify({
    symbol: s.symbol, timeframe: s.timeframe, side: s.side, pattern: s.pattern,
    trend: s.trend, confidence: s.confidence, volumeConfirm: s.volumeConfirm,
    nearLevelType: s.nearLevelType, nearLevelPrice: s.nearLevelPrice,
    entry: s.entry, sl: s.sl, tp: s.tp,
    riskReward: s.marketContext?.riskReward ?? null,
    outcome: s.outcome, rAchieved: s.rAchieved,
    maxFavorable: s.maxFavorable, maxAdverse: s.maxAdverse,
    leverage: s.leverage ?? 1,
    riskUSD: s.riskUSD ?? null,
    pnlUSD: s.pnlCurrent ?? null,
    marketContext: {
      ema34: s.marketContext?.ema34, ema89: s.marketContext?.ema89, ema200: s.marketContext?.ema200,
      volumeRatio: s.marketContext?.volumeRatio,
      bullishCount: s.marketContext?.bullishCount,
      bearishCount: s.marketContext?.bearishCount,
      entryDistToEma34: s.marketContext?.entryDistToEma34,
      entryDistToEma89: s.marketContext?.entryDistToEma89,
      entryDistToEma200: s.marketContext?.entryDistToEma200,
      prevCandles: s.marketContext?.prevCandles,
    },
    notes: s.notes, tags: s.tags, reason: s.reason,
  })).join('\n');
}

// ============================================================
// NET PnL — áp dụng phí (fee model ở ./fees)
// ============================================================

/**
 * Tính PnL NET thực tế (đã trừ phí) khi lệnh đã đóng.
 * Dùng thời gian giữ lệnh thực (closedAt - createdAt) để tính funding chính xác.
 * Trả về { pnlNet, fees } hoặc null nếu thiếu dữ liệu positionSize.
 */
export function computeClosedNetPnL(
  sig: Pick<TrackedSignal, 'positionSize' | 'entry' | 'tp' | 'sl' | 'riskUSD' | 'pnlTP' | 'createdAt'>,
  outcome: 'tp' | 'sl',
  closedAtMs: number,
  feeConfig?: Partial<FeeConfig>
): { pnlNet: number; feeOpen: number; feeClose: number; fundingFee: number; totalFees: number } | null {
  if (!sig.positionSize || sig.positionSize <= 0) return null;

  const holdingHours = closedAtMs && sig.createdAt ? (closedAtMs - sig.createdAt) / 3_600_000 : 0;
  const exit = outcome === 'tp' ? sig.tp : sig.sl;
  const fees = calcFees({ positionSize: sig.positionSize, entry: sig.entry, exit, holdingHours, cfg: feeConfig });

  const gross = outcome === 'tp' ? (sig.pnlTP ?? 0) : -(sig.riskUSD ?? 0);
  const pnlNet = gross - fees.total;

  return {
    pnlNet: parseFloat(pnlNet.toFixed(2)),
    feeOpen: parseFloat(fees.feeOpen.toFixed(4)),
    feeClose: parseFloat(fees.feeClose.toFixed(4)),
    fundingFee: parseFloat(fees.fundingFee.toFixed(4)),
    totalFees: parseFloat(fees.total.toFixed(4)),
  };
}

// ============================================================
// PNL CALCULATOR
// ============================================================

/**
 * Đề xuất leverage tối ưu dựa trên khoảng cách SL (slDist%).
 *
 * Nguyên tắc: SL càng xa → leverage càng thấp để giữ risk cố định.
 * Giới hạn max leverage theo volatility thực tế của coin:
 *   - BTC/ETH (slDist < 1.5%): đến 20x
 *   - Mid-cap (1.5–3%):        đến 10x
 *   - Altcoin (3–5%):          đến 5x
 *   - Volatile (5–8%):         đến 3x
 *   - Cực volatile (>8%):      2x
 * Luôn làm tròn xuống bội số đẹp để dễ đặt lệnh thực tế.
 */
export function recommendLeverage(slDistPct: number): number {
  if (slDistPct <= 0) return 1;

  // Max leverage theo volatility bracket
  let maxLev: number;
  if (slDistPct < 1.5)      maxLev = 20;
  else if (slDistPct < 2.5) maxLev = 15;
  else if (slDistPct < 3.5) maxLev = 10;
  else if (slDistPct < 5.0) maxLev = 5;
  else if (slDistPct < 8.0) maxLev = 3;
  else                       maxLev = 2;

  // Làm tròn xuống bội số đẹp: 20,15,10,5,3,2,1
  const STEPS = [20, 15, 10, 5, 3, 2, 1];
  return STEPS.find(s => s <= maxLev) ?? 1;
}


export function calcPnL(params: {
  entry: number;
  sl: number;
  tp: number;
  side: 'buy' | 'sell';
  walletBalance: number;   // USDT
  riskPct: number;         // % ví (e.g. 2 = 2%)
  maxLoss: number;         // USDT tối đa
  leverage?: number;       // đòn bẩy (default 1)
  feeConfig?: Partial<FeeConfig>;   // override phí (default = BingX taker)
  estHoldingHours?: number;         // thời gian giữ lệnh ước tính (cho funding projection)
}): {
  riskUSD: number;
  positionSize: number;
  pnlTP: number;           // GỘP (chưa trừ phí)
  pnlSL: number;           // GỘP (= -riskUSD)
  rr: number;
  // ── Phí & PnL net (v3) ──
  feesTP: number;          // tổng phí khi TP
  feesSL: number;          // tổng phí khi SL
  pnlTPNet: number;        // PnL thực tế nếu TP (đã trừ phí)
  pnlSLNet: number;        // PnL thực tế nếu SL (đã trừ phí, âm hơn riskUSD)
  rrNet: number;           // R:R thực sau phí
} {
  const riskUSD = Math.min(
    params.walletBalance * params.riskPct / 100,
    params.maxLoss
  );
  // khoảng cách SL tính theo %
  const slDistPct = Math.abs(params.entry - params.sl) / params.entry;
  // positionSize = riskUSD / slDistPct (không nhân leverage vì risk đã cố định)
  const positionSize = slDistPct > 0 ? riskUSD / slDistPct : 0;

  const tpDistPct = Math.abs(params.tp - params.entry) / params.entry;
  // positionSize = riskUSD / slDistPct đã là notional đầy đủ (leverage baked-in)
  // Không nhân lev thêm lần nữa, nếu không pnlTP sẽ bị nhân leverage hai lần
  const pnlTP = positionSize * tpDistPct;
  const pnlSL = -riskUSD; // lỗ tối đa = riskUSD (leverage không thay đổi risk amount)
  const rr = slDistPct > 0 ? tpDistPct / slDistPct : 0;

  // ── Phí giao dịch (BingX perpetual) ──
  const holding = params.estHoldingHours ?? DEFAULT_EST_HOLDING_HOURS;
  const feesTP = calcFees({ positionSize, entry: params.entry, exit: params.tp, holdingHours: holding, cfg: params.feeConfig }).total;
  const feesSL = calcFees({ positionSize, entry: params.entry, exit: params.sl, holdingHours: holding, cfg: params.feeConfig }).total;
  const pnlTPNet = pnlTP - feesTP;
  const pnlSLNet = pnlSL - feesSL;
  // R:R net = lợi nhuận thực / số lỗ thực
  const rrNet = pnlSLNet !== 0 ? Math.abs(pnlTPNet / pnlSLNet) : 0;

  return {
    riskUSD, positionSize, pnlTP, pnlSL, rr,
    feesTP: parseFloat(feesTP.toFixed(4)),
    feesSL: parseFloat(feesSL.toFixed(4)),
    pnlTPNet: parseFloat(pnlTPNet.toFixed(2)),
    pnlSLNet: parseFloat(pnlSLNet.toFixed(2)),
    rrNet: parseFloat(rrNet.toFixed(2)),
  };
}

// ============================================================
// CREATE HELPER
// ============================================================

/**
 * Tạo TrackedSignal từ KeyLevelSignal của engine.
 * walletSettings tùy chọn — nếu có, tính PnL ngay khi tạo.
 */
export function createTrackedSignal(
  sig: KeyLevelSignal,
  symbol: string,
  timeframe: string,
  candles: Candle[],
  emaData: EMAData,
  volumeRatio: number,
  walletSettings?: {
    walletBalance: number;
    riskPerTrade: number;
    maxLossPerTrade: number;
    leverage?: number;
  }
): TrackedSignal {
  const lastIdx = candles.length - 1;
  const last10 = candles.slice(Math.max(0, lastIdx - 9), lastIdx + 1);

  // Context
  const bullishCount = last10.filter(c => c.close > c.open).length;
  const bearishCount = last10.filter(c => c.close < c.open).length;
  const avgBodySize = last10.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / (last10.length || 1);
  const entryDistToEma34  = Math.abs(sig.entry - emaData.ema34[lastIdx])  / sig.entry * 100;
  const entryDistToEma89  = Math.abs(sig.entry - emaData.ema89[lastIdx])  / sig.entry * 100;
  const entryDistToEma200 = Math.abs(sig.entry - emaData.ema200[lastIdx]) / sig.entry * 100;
  const prevCandles = last10.map(c => [c.open, c.high, c.low, c.close, c.volume]);

  // PnL calculation
  let leverage: number | undefined;
  let riskUSD: number | undefined;
  let positionSize: number | undefined;
  let pnlTP: number | undefined;
  let pnlSL: number | undefined;
  let pnlTPNet: number | undefined;
  let pnlSLNet: number | undefined;

  if (walletSettings && walletSettings.walletBalance > 0) {
    leverage = Math.max(1, walletSettings.leverage ?? 1);
    const calc = calcPnL({
      entry: sig.entry, sl: sig.sl, tp: sig.tp, side: sig.side,
      walletBalance: walletSettings.walletBalance,
      riskPct: walletSettings.riskPerTrade,
      maxLoss: walletSettings.maxLossPerTrade,
      leverage,
    });
    riskUSD      = parseFloat(calc.riskUSD.toFixed(2));
    positionSize = parseFloat(calc.positionSize.toFixed(2));
    pnlTP        = parseFloat(calc.pnlTP.toFixed(2));
    pnlSL        = parseFloat(calc.pnlSL.toFixed(2));
    pnlTPNet     = calc.pnlTPNet;
    pnlSLNet     = calc.pnlSLNet;
  }

  return {
    id: `${symbol}_${sig.time}_${sig.side}_${Date.now()}`,
    createdAt: Date.now(),
    symbol, timeframe,
    side: sig.side, entry: sig.entry, sl: sig.sl, tp: sig.tp,
    confidence: sig.confidence, pattern: sig.pattern.name,
    trend: sig.trend, volumeConfirm: sig.volumeConfirm,
    nearLevelPrice: sig.nearLevel.price, nearLevelType: sig.nearLevel.type,
    reason: sig.reason,
    outcome: 'pending', closedAt: null, closePrice: null, rAchieved: null,
    maxFavorable: sig.entry, maxAdverse: sig.entry,
    notes: '', tags: [],
    leverage, riskUSD, positionSize, pnlTP, pnlSL, pnlTPNet, pnlSLNet, pnlCurrent: undefined,
    marketContext: {
      ema34:  emaData.ema34[lastIdx]  ?? 0,
      ema89:  emaData.ema89[lastIdx]  ?? 0,
      ema200: emaData.ema200[lastIdx] ?? 0,
      volumeRatio,
      prevCandles,
      bullishCount, bearishCount, avgBodySize,
      entryDistToEma34, entryDistToEma89, entryDistToEma200,
      riskReward: sig.rr,
    },
  };
}
