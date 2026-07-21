/**
 * Signal Tracker - Lưu trữ, theo dõi kết quả tín hiệu
 * Storage: MongoDB (primary) + localStorage (cache/offline fallback)
 * Mục tiêu: Thu thập data để cải thiện logic + train AI
 */

export type SignalOutcome = 'pending' | 'tp' | 'sl' | 'partial' | 'breakeven' | 'manual_close';

export interface TrackedSignal {
  id: string;
  createdAt: number;
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
  rAchieved: number | null;
  maxFavorable: number;
  maxAdverse: number;
  notes: string;
  tags: string[];
  marketContext: {
    ema34: number;
    ema89: number;
    ema200: number;
    volumeRatio: number;
    prevCandles: number[][];
  };
}

export interface TrackingStats {
  totalSignals: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgR: number;
  bestR: number;
  worstR: number;
  byPattern: Record<string, { total: number; wins: number; winRate: number; avgR: number }>;
  byTimeframe: Record<string, { total: number; wins: number; winRate: number; avgR: number }>;
  byTrend: Record<string, { total: number; wins: number; winRate: number }>;
}

const CACHE_KEY = 'crazii_kl_signals_cache';

// ============================================================
// LocalStorage cache helpers
// ============================================================

function readCache(): TrackedSignal[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}

function writeCache(signals: TrackedSignal[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(signals));
}

// ============================================================
// API helpers
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
// PUBLIC API - MongoDB-backed with cache fallback
// ============================================================

/** Load all signals (từ MongoDB, fallback về cache) */
export async function loadAllSignals(): Promise<TrackedSignal[]> {
  try {
    const data = await apiFetch('/api/kl-signals');
    // MongoDB trả về _id thay vì id, normalize
    const signals = data.map((s: TrackedSignal & { _id?: string }) => ({
      ...s,
      id: s.id || s._id || `${s.symbol}_${s.createdAt}_${s.side}`,
    })) as TrackedSignal[];
    writeCache(signals);
    return signals;
  } catch {
    return readCache();
  }
}

/** Sync-read from cache only (cho UI rendering, không cần await) */
export function getAllSignals(): TrackedSignal[] {
  return readCache();
}

/** Add new signal */
export async function addSignal(signal: TrackedSignal): Promise<void> {
  // Optimistic update cache
  const cache = readCache();
  const exists = cache.some(s => s.symbol === signal.symbol && s.createdAt === signal.createdAt && s.side === signal.side);
  if (!exists) {
    const updated = [signal, ...cache];
    writeCache(updated);
  }
  // Sync to MongoDB (best effort)
  try {
    await apiFetch('/api/kl-signals', { method: 'POST', body: JSON.stringify(signal) });
  } catch {
    // Silently fail - localStorage is the source of truth
  }
}

/** Update signal */
export async function updateSignal(id: string, updates: Partial<TrackedSignal>): Promise<void> {
  // Optimistic update cache
  const cache = readCache();
  const idx = cache.findIndex(s => s.id === id);
  if (idx >= 0) { cache[idx] = { ...cache[idx], ...updates }; writeCache(cache); }

  // Sync to MongoDB (skip if id is not a valid ObjectId format)
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
  if (!isMongoId) return; // Local-only signal, no need to sync
  try {
    await apiFetch('/api/kl-signals', { method: 'PUT', body: JSON.stringify({ id, ...updates }) });
  } catch {
    // Silently fail - localStorage is the source of truth when MongoDB unavailable
  }
}

/** Delete signal */
export async function deleteSignal(id: string): Promise<void> {
  // Optimistic update cache
  writeCache(readCache().filter(s => s.id !== id));
  // Sync to MongoDB (skip if not a valid ObjectId)
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
  if (!isMongoId) return;
  try {
    await apiFetch(`/api/kl-signals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // Silently fail
  }
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
    if (currentLow < signal.maxAdverse) updates.maxAdverse = currentLow;
    if (currentLow <= signal.sl) {
      updates.outcome = 'sl'; updates.closePrice = signal.sl;
      updates.closedAt = Date.now(); updates.rAchieved = -1;
    } else if (currentHigh >= signal.tp) {
      updates.outcome = 'tp'; updates.closePrice = signal.tp;
      updates.closedAt = Date.now();
      updates.rAchieved = Math.abs(signal.tp - signal.entry) / Math.abs(signal.entry - signal.sl);
    }
  } else {
    if (currentLow < signal.maxFavorable) updates.maxFavorable = currentLow;
    if (currentHigh > signal.maxAdverse) updates.maxAdverse = currentHigh;
    if (currentHigh >= signal.sl) {
      updates.outcome = 'sl'; updates.closePrice = signal.sl;
      updates.closedAt = Date.now(); updates.rAchieved = -1;
    } else if (currentLow <= signal.tp) {
      updates.outcome = 'tp'; updates.closePrice = signal.tp;
      updates.closedAt = Date.now();
      updates.rAchieved = Math.abs(signal.entry - signal.tp) / Math.abs(signal.sl - signal.entry);
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
  const wins = closed.filter(s => s.outcome === 'tp');
  const losses = closed.filter(s => s.outcome === 'sl');
  const rValues = closed.filter(s => s.rAchieved != null).map(s => s.rAchieved!);

  const byPattern: TrackingStats['byPattern'] = {};
  const byTimeframe: TrackingStats['byTimeframe'] = {};
  const byTrend: TrackingStats['byTrend'] = {};

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
    totalSignals: all.length, wins: wins.length, losses: losses.length,
    pending: all.filter(s => s.outcome === 'pending').length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    avgR: rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0,
    bestR: rValues.length > 0 ? Math.max(...rValues) : 0,
    worstR: rValues.length > 0 ? Math.min(...rValues) : 0,
    byPattern, byTimeframe, byTrend,
  };
}

// ============================================================
// EXPORT
// ============================================================

export function exportAsCSV(): string {
  const all = readCache();
  const headers = 'Date,Symbol,TF,Side,Pattern,Trend,Confidence,Entry,SL,TP,Outcome,R_Achieved,VolConfirm,Notes,Tags';
  const rows = all.map(s => [
    new Date(s.createdAt).toISOString(), s.symbol, s.timeframe, s.side, s.pattern, s.trend,
    s.confidence, s.entry, s.sl, s.tp, s.outcome, s.rAchieved ?? '', s.volumeConfirm,
    `"${(s.notes || '').replace(/"/g, '""')}"`, (s.tags || []).join(';'),
  ].join(','));
  return [headers, ...rows].join('\n');
}

export function exportForTraining(): string {
  return readCache().filter(s => s.outcome !== 'pending').map(s => JSON.stringify({
    // Signal info
    symbol: s.symbol, timeframe: s.timeframe, side: s.side, pattern: s.pattern,
    trend: s.trend, confidence: s.confidence, volumeConfirm: s.volumeConfirm,
    nearLevelType: s.nearLevelType, nearLevelPrice: s.nearLevelPrice,
    // Entry/SL/TP
    entry: s.entry, sl: s.sl, tp: s.tp,
    riskReward: s.marketContext?.riskReward ?? null,
    // Outcome
    outcome: s.outcome, rAchieved: s.rAchieved,
    maxFavorable: s.maxFavorable, maxAdverse: s.maxAdverse,
    // Context — xu hướng 10 nến trước
    marketContext: {
      ema34: s.marketContext?.ema34, ema89: s.marketContext?.ema89, ema200: s.marketContext?.ema200,
      volumeRatio: s.marketContext?.volumeRatio,
      bullishCount: s.marketContext?.bullishCount,
      bearishCount: s.marketContext?.bearishCount,
      entryDistToEma34: s.marketContext?.entryDistToEma34,
      entryDistToEma89: s.marketContext?.entryDistToEma89,
      entryDistToEma200: s.marketContext?.entryDistToEma200,
      prevCandles: s.marketContext?.prevCandles, // 10 nến OHLCV
    },
    // User notes
    notes: s.notes, tags: s.tags,
    reason: s.reason,
  })).join('\n');
}

// ============================================================
// CREATE HELPER
// ============================================================

export function createTrackedSignal(
  signal: {
    time: number; side: 'buy' | 'sell'; entry: number; sl: number; tp: number;
    confidence: number; pattern: { name: string }; nearLevel: { price: number; type: string };
    trend: string; volumeConfirm: boolean; reason: string; rr: number;
  },
  symbol: string, timeframe: string,
  candles: { open: number; high: number; low: number; close: number; volume: number }[],
  emaData: { ema34: number[]; ema89: number[]; ema200: number[] },
  volumeRatio: number
): TrackedSignal {
  const lastIdx = candles.length - 1;
  // Ghi 10 nến gần nhất để LLM có context xu hướng
  const prevCandles = candles.slice(Math.max(0, lastIdx - 9), lastIdx + 1)
    .map(c => [c.open, c.high, c.low, c.close, c.volume]);

  // Tính thêm context cho LLM analysis sau này
  const last5 = candles.slice(Math.max(0, lastIdx - 4), lastIdx + 1);
  const bullishCount = last5.filter(c => c.close > c.open).length;
  const bearishCount = last5.filter(c => c.close < c.open).length;
  const avgBodySize = last5.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / last5.length;
  const entryDistToEma34 = emaData.ema34[lastIdx] ? ((signal.entry - emaData.ema34[lastIdx]) / emaData.ema34[lastIdx] * 100) : 0;
  const entryDistToEma89 = emaData.ema89[lastIdx] ? ((signal.entry - emaData.ema89[lastIdx]) / emaData.ema89[lastIdx] * 100) : 0;
  const entryDistToEma200 = emaData.ema200[lastIdx] ? ((signal.entry - emaData.ema200[lastIdx]) / emaData.ema200[lastIdx] * 100) : 0;

  return {
    id: `${symbol}_${signal.time}_${signal.side}_${Date.now()}`,
    createdAt: Date.now(),
    symbol, timeframe,
    side: signal.side, entry: signal.entry, sl: signal.sl, tp: signal.tp,
    confidence: signal.confidence, pattern: signal.pattern.name, trend: signal.trend,
    volumeConfirm: signal.volumeConfirm, nearLevelPrice: signal.nearLevel.price,
    nearLevelType: signal.nearLevel.type, reason: signal.reason,
    outcome: 'pending', closedAt: null, closePrice: null, rAchieved: null,
    maxFavorable: signal.entry, maxAdverse: signal.entry,
    notes: '', tags: [],
    marketContext: {
      ema34: emaData.ema34[lastIdx] ?? 0, ema89: emaData.ema89[lastIdx] ?? 0,
      ema200: emaData.ema200[lastIdx] ?? 0, volumeRatio, prevCandles,
      // Extra context cho LLM
      bullishCount, bearishCount, avgBodySize,
      entryDistToEma34, entryDistToEma89, entryDistToEma200,
      riskReward: signal.rr,
    },
  };
}
