/**
 * Signal Tracker - Lưu trữ, theo dõi kết quả tín hiệu
 * Storage: MongoDB (primary) + localStorage (cache/offline fallback)
 * Mục tiêu: Thu thập data để cải thiện logic + train AI
 *
 * v2: Thêm leverage + PnL calculator (USDT)
 */

import type { KeyLevelSignal, EMAData, VolumeAnalysis } from './keyLevelEngine';
import type { Candle } from '../types/index';

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
  pnlTP?: number;           // PnL USDT nếu TP (dương)
  pnlSL?: number;           // PnL USDT nếu SL (âm, = -riskUSD)
  pnlCurrent?: number;      // PnL USDT hiện tại (realtime, cập nhật bởi UI)
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

  if (signal.side === 'buy') {
    if (currentHigh > signal.maxFavorable) updates.maxFavorable = currentHigh;
    if (currentLow < signal.maxAdverse)    updates.maxAdverse = currentLow;
    if (currentLow <= signal.sl) {
      updates.outcome = 'sl'; updates.closePrice = signal.sl;
      updates.closedAt = Date.now(); updates.rAchieved = -1;
      if (signal.riskUSD) updates.pnlCurrent = -signal.riskUSD;
    } else if (currentHigh >= signal.tp) {
      updates.outcome = 'tp'; updates.closePrice = signal.tp;
      updates.closedAt = Date.now();
      updates.rAchieved = Math.abs(signal.tp - signal.entry) / Math.abs(signal.entry - signal.sl);
      if (signal.pnlTP) updates.pnlCurrent = signal.pnlTP;
    }
  } else {
    if (currentLow < signal.maxFavorable)  updates.maxFavorable = currentLow;
    if (currentHigh > signal.maxAdverse)   updates.maxAdverse = currentHigh;
    if (currentHigh >= signal.sl) {
      updates.outcome = 'sl'; updates.closePrice = signal.sl;
      updates.closedAt = Date.now(); updates.rAchieved = -1;
      if (signal.riskUSD) updates.pnlCurrent = -signal.riskUSD;
    } else if (currentLow <= signal.tp) {
      updates.outcome = 'tp'; updates.closePrice = signal.tp;
      updates.closedAt = Date.now();
      updates.rAchieved = Math.abs(signal.entry - signal.tp) / Math.abs(signal.sl - signal.entry);
      if (signal.pnlTP) updates.pnlCurrent = signal.pnlTP;
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
  const headers = 'Date,Symbol,TF,Side,Pattern,Trend,Confidence,Entry,SL,TP,Outcome,R_Achieved,VolConfirm,Leverage,RiskUSD,PnL_USD,Notes,Tags';
  const rows = all.map(s => [
    new Date(s.createdAt).toISOString(), s.symbol, s.timeframe, s.side, s.pattern, s.trend,
    s.confidence, s.entry, s.sl, s.tp, s.outcome, s.rAchieved ?? '',
    s.volumeConfirm, s.leverage ?? 1, s.riskUSD ?? '', s.pnlCurrent ?? '',
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
// PNL CALCULATOR
// ============================================================

/**
 * Tính PnL cho lệnh dựa trên wallet settings và đòn bẩy
 *
 * Công thức futures:
 *   riskUSD    = min(walletBalance × riskPct / 100, maxLoss)
 *   posSize    = riskUSD / (|entry - sl| / entry)  [= số USDT position]
 *   posSize    × leverage = không cần (risk đã cố định)
 *   pnlTP      = posSize × |(tp - entry)| / entry
 *   pnlSL      = -riskUSD
 */
export function calcPnL(params: {
  entry: number;
  sl: number;
  tp: number;
  side: 'buy' | 'sell';
  walletBalance: number;   // USDT
  riskPct: number;         // % ví (e.g. 2 = 2%)
  maxLoss: number;         // USDT tối đa
  leverage?: number;       // đòn bẩy (default 1)
}): {
  riskUSD: number;
  positionSize: number;
  pnlTP: number;
  pnlSL: number;
  rr: number;
} {
  const lev = Math.max(1, params.leverage ?? 1);
  const riskUSD = Math.min(
    params.walletBalance * params.riskPct / 100,
    params.maxLoss
  );
  // khoảng cách SL tính theo %
  const slDistPct = Math.abs(params.entry - params.sl) / params.entry;
  // positionSize = riskUSD / slDistPct (không nhân leverage vì risk đã cố định)
  const positionSize = slDistPct > 0 ? riskUSD / slDistPct : 0;

  const tpDistPct = Math.abs(params.tp - params.entry) / params.entry;
  const pnlTP = positionSize * tpDistPct * lev;
  const pnlSL = -riskUSD; // lỗ tối đa = riskUSD (leverage không thay đổi risk amount)
  const rr = slDistPct > 0 ? tpDistPct / slDistPct : 0;

  return { riskUSD, positionSize, pnlTP, pnlSL, rr };
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
    leverage, riskUSD, positionSize, pnlTP, pnlSL, pnlCurrent: undefined,
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
