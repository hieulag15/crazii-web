/**
 * API: CRAZII Signal Generation + MongoDB Storage
 * - Fetch XAU/USD 5m + daily candles from Twelve Data
 * - Run CRAZII engine: calculateAll()
 * - Extract enhanced signals with confidence >= 55%
 * - Calculate 1 TP + 1 SL per signal
 * - Save to MongoDB collection `crazii_signals`
 * - Check pending signals for TP/SL hit
 * - Return latest 20 signals
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';
import { calculateAll, calculateADR, calculatePivot } from '../src/utils/craziiEngine.js';
import type { Candle, EnhancedSignal } from '../src/types/index.js';

const TD_BASE = 'https://api.twelvedata.com';
const VN_OFFSET_SECONDS = 7 * 60 * 60;

const SIGNAL_LOOKBACK_SECONDS = 48 * 60 * 60; // 48h
const MAX_SIGNALS_TO_INSERT_PER_RUN = 24;
const PENDING_SCAN_LIMIT = 60;
const HISTORY_SCAN_SIZE = 500;
const STRATEGY_VERSION = 'crazii-v2';
const SIGNAL_INTERVAL_SECONDS = 5 * 60;
// CRAZII signals hiếm (Tam Điểm, DML) nên cho phép signal đến 4h trước
const FRESH_SIGNAL_MAX_AGE_SECONDS = 4 * 60 * 60;
let indexesReady = false;

function getTDKey(): string {
  return process.env.TWELVEDATA_KEY || process.env.VITE_TWELVEDATA_KEY || '';
}

/** Fetch XAU/USD candles from Twelve Data */
async function fetchTDCandles(interval: string, outputsize: number): Promise<Candle[]> {
  const key = getTDKey();
  if (!key) throw new Error('Missing TWELVEDATA_KEY');

  const tdInterval: Record<string, string> = {
    '1m': '1min', '5m': '5min', '15m': '15min',
    '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1day',
  };
  const intv = tdInterval[interval] || interval;
  const url = `${TD_BASE}/time_series?symbol=XAU/USD&interval=${intv}&outputsize=${outputsize}&apikey=${key}`;

  const res = await fetch(url);
  const json = await res.json();
  if (json.code) throw new Error(`Twelve Data error: ${json.code} ${json.message}`);
  if (!json.values || json.values.length === 0) return [];

  return json.values.map((v: any) => ({
    time: Math.floor(new Date(v.datetime + ' GMT').getTime() / 1000),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume ? parseFloat(v.volume) : 0,
  })).reverse();
}

function isFutureSignalTime(signalTime: number, toleranceSeconds = 90): boolean {
  const now = Math.floor(Date.now() / 1000);
  return signalTime > (now + toleranceSeconds);
}

function toVietnamEpochSeconds(ts: number): number {
  return ts + VN_OFFSET_SECONDS;
}

function isRecentSignalTime(signalTime: number, lookbackSeconds = SIGNAL_LOOKBACK_SECONDS): boolean {
  const now = Math.floor(Date.now() / 1000);
  return signalTime >= (now - lookbackSeconds);
}

/** Local ATR calculation */
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

/** Find swing low in lookback period */
function findSwingLow(candles: Candle[], idx: number, lookback = 10): number {
  let low = candles[idx].low;
  for (let i = Math.max(0, idx - lookback); i <= idx; i++) {
    low = Math.min(low, candles[i].low);
  }
  return low;
}

/** Find swing high in lookback period */
function findSwingHigh(candles: Candle[], idx: number, lookback = 10): number {
  let high = candles[idx].high;
  for (let i = Math.max(0, idx - lookback); i <= idx; i++) {
    high = Math.max(high, candles[i].high);
  }
  return high;
}

/** Calculate single TP and SL for a signal */
function calculateTPSL(
  signal: EnhancedSignal,
  candles: Candle[],
  ktrLevels: { plus1: number; minus1: number } | null
): { sl: number; tp: number; rr: number } {
  const idx = candles.findIndex(c => c.time === signal.time);
  if (idx < 1) return { sl: signal.sl, tp: signal.tp1, rr: signal.rr };

  const atrVal = localATR(candles, idx, 14);
  const isBuy = signal.side === 'buy';

  let sl: number;
  let tp: number;

  if (isBuy) {
    // SL = swing low - ATR*0.3
    const swingLow = findSwingLow(candles, idx, 10);
    sl = swingLow - atrVal * 0.3;

    // TP = KTR+1 (or entry + 1.5*risk if no KTR)
    if (ktrLevels && ktrLevels.plus1 > signal.entry) {
      tp = ktrLevels.plus1;
    } else {
      const risk = signal.entry - sl;
      tp = signal.entry + risk * 1.5;
    }
  } else {
    // SL = swing high + ATR*0.3
    const swingHigh = findSwingHigh(candles, idx, 10);
    sl = swingHigh + atrVal * 0.3;

    // TP = KTR-1 (or entry - 1.5*risk if no KTR)
    if (ktrLevels && ktrLevels.minus1 < signal.entry) {
      tp = ktrLevels.minus1;
    } else {
      const risk = sl - signal.entry;
      tp = signal.entry - risk * 1.5;
    }
  }

  const risk = Math.abs(signal.entry - sl);
  const reward = Math.abs(tp - signal.entry);
  const rr = risk > 0 ? reward / risk : 0;

  return { sl, tp, rr };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const db = await getDB();
    const col = db.collection('crazii_signals');
    if (!indexesReady) {
      await col.createIndex({ time: 1, side: 1 });
      await col.createIndex({ outcome: 1, time: 1 });
      await col.createIndex({ time: -1 });
      await col.createIndex({ strategyVersion: 1, time: -1 });
      indexesReady = true;
    }

    // Manual reset: clear old signals before a new backtest cycle.
    const isResetPost = req.method === 'POST' && String((req.query.action || req.body?.action || '')).toLowerCase() === 'clear';
    if (req.method === 'DELETE' || isResetPost) {
      const scope = String(req.query.scope || 'strategy');
      const filter = scope === 'all' ? {} : { strategyVersion: STRATEGY_VERSION };
      const result = await col.deleteMany(filter);
      return res.json({
        ok: true,
        cleared: result.deletedCount || 0,
        scope,
        strategyVersion: STRATEGY_VERSION,
      });
    }

    const trackResults: string[] = [];
    const newSignals: string[] = [];

    // Sanitize legacy future-dated rows so they never pollute the table.
    await col.updateMany(
      { time: { $gt: nowEpoch + 90 }, outcome: 'pending' },
      { $set: { outcome: 'expired', closedAt: Date.now(), closePrice: null, note: 'future_timestamp_filtered' } }
    );

    // ====== PHASE 1: Check pending signals for TP/SL hit ======
    const pending = await col.find({ outcome: 'pending', strategyVersion: STRATEGY_VERSION })
      .sort({ time: -1 })
      .limit(PENDING_SCAN_LIMIT)
      .toArray();

    if (pending.length > 0) {
      // Load enough history to verify whether TP/SL has been touched after signal time.
      let recentCandles: Candle[] = [];
      try {
        recentCandles = await fetchTDCandles('5m', HISTORY_SCAN_SIZE);
      } catch (e) {
        console.warn('[CRAZII-SIGNALS] Pending tracker skipped:', e);
      }
      if (recentCandles.length > 0) {
        const latestCandleTime = recentCandles[recentCandles.length - 1].time;

        for (const sig of pending) {
          if (!sig.time || typeof sig.time !== 'number') continue;
          // Ignore malformed or future timestamps in DB
          if (isFutureSignalTime(sig.time)) continue;

          // If signal is too old for available history, skip this cycle.
          if (sig.time < recentCandles[0].time) continue;

          let hit = false;
          for (const c of recentCandles) {
            if (c.time <= (sig.time || 0)) continue;

            if (sig.side === 'buy') {
              if (c.low <= sig.sl) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'sl', closedAt: Date.now(), closePrice: sig.sl } });
                trackResults.push(`SL hit @ ${sig.sl.toFixed(2)}`);
                hit = true; break;
              }
              if (c.high >= sig.tp) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'tp', closedAt: Date.now(), closePrice: sig.tp } });
                trackResults.push(`TP hit @ ${sig.tp.toFixed(2)}`);
                hit = true; break;
              }
            } else {
              if (c.high >= sig.sl) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'sl', closedAt: Date.now(), closePrice: sig.sl } });
                trackResults.push(`SL hit @ ${sig.sl.toFixed(2)}`);
                hit = true; break;
              }
              if (c.low <= sig.tp) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'tp', closedAt: Date.now(), closePrice: sig.tp } });
                trackResults.push(`TP hit @ ${sig.tp.toFixed(2)}`);
                hit = true; break;
              }
            }
          }

          // Auto-expire stale pending signals so WR doesn't stay locked at 0 forever.
          if (!hit && latestCandleTime - sig.time > 36 * 60 * 60) {
            await col.updateOne(
              { _id: sig._id, outcome: 'pending' },
              { $set: { outcome: 'expired', closedAt: Date.now(), closePrice: null } }
            );
            trackResults.push(`Expired signal @ ${sig.entry?.toFixed?.(2) ?? 'n/a'}`);
          }
        }
      }
    }

    // ====== PHASE 2: Generate new signals ======
    try {
      const [candles5m, dailyCandles] = await Promise.all([
        fetchTDCandles('5m', HISTORY_SCAN_SIZE),
        fetchTDCandles('1d', 10),
      ]);

      if (candles5m.length >= 50) {
        // Run CRAZII engine
        const pivot = calculatePivot(dailyCandles);
        const adr = calculateADR(dailyCandles, 5);
        const craziiResult = calculateAll(candles5m, {
          opHour: 5,
          ktrMultiplier: 1.0,
          haSmooth: 6,
          dailyRange: adr,
          pivot,
          minConfidence: 55,
        });

        // Extract signals with confidence >= 55%
        // Cho phép signal trong 4h gần nhất (CRAZII Tam Điểm/DML hiếm, cần window rộng)
        const latestCandleTime = candles5m[candles5m.length - 1].time;
        const freshFloor = nowEpoch - FRESH_SIGNAL_MAX_AGE_SECONDS;

        const enhancedSignals = craziiResult.enhancedSignals
          .filter(s => s.confidence >= 55)
          .filter(s => s.time >= freshFloor && s.time <= latestCandleTime)
          .filter(s => !isFutureSignalTime(s.time));

        // Get KTR levels for TP calculation
        const lastKTR = craziiResult.ktrs[craziiResult.ktrs.length - 1]?.levels || null;
        const ktrForTP = lastKTR ? { plus1: lastKTR.plus1, minus1: lastKTR.minus1 } : null;

        // Save new signals (avoid duplicates by checking time + side)
        const candidates = enhancedSignals
          .sort((a, b) => b.time - a.time)
          .slice(0, MAX_SIGNALS_TO_INSERT_PER_RUN);

        for (const sig of candidates) {
          const exists = await col.findOne({
            time: sig.time,
            side: sig.side,
            strategyVersion: STRATEGY_VERSION,
          });
          if (exists) continue;

          const { sl, tp, rr } = calculateTPSL(sig, candles5m, ktrForTP);

          // Build confluences array for storage
          const confluences = sig.confluences.map(c => ({
            name: c.name,
            passed: c.passed,
            detail: c.detail,
          }));

          const doc = {
            time: sig.time,
            timeVN: toVietnamEpochSeconds(sig.time),
            strategyVersion: STRATEGY_VERSION,
            side: sig.side,
            source: sig.source,
            entry: sig.entry,
            sl,
            tp,
            rr: Math.round(rr * 100) / 100,
            confidence: sig.confidence,
            reason: sig.reason,
            confluences,
            outcome: 'pending',
            createdAt: new Date(sig.time * 1000),
          };

          await col.insertOne(doc);
          newSignals.push(`${sig.side.toUpperCase()} @ ${sig.entry.toFixed(2)} (${sig.confidence}%)`);
        }
      }
    } catch (e) {
      console.warn('[CRAZII-SIGNALS] Signal generation skipped:', e);
    }

    // ====== PHASE 3: Return latest 20 signals ======
    let latest = await col.find({
      time: { $lte: nowEpoch + 90 },
      strategyVersion: STRATEGY_VERSION,
    })
      .sort({ time: -1 })
      .limit(20)
      .toArray();

    // Fallback cho hệ thống mới deploy nhưng chưa có đủ mẫu dữ liệu v2.
    if (latest.length === 0) {
      latest = await col.find({ time: { $lte: nowEpoch + 90 } })
        .sort({ time: -1 })
        .limit(20)
        .toArray();
    }

    // Format for response
    const signals = latest.map(s => ({
      _id: s._id?.toString(),
      time: s.time,
      side: s.side,
      source: s.source,
      entry: s.entry,
      sl: s.sl,
      tp: s.tp,
      rr: s.rr,
      confidence: s.confidence,
      reason: s.reason,
      confluences: s.confluences,
      outcome: s.outcome,
      createdAt: s.createdAt,
    }));

    return res.json({
      ok: true,
      signals,
      newCount: newSignals.length,
      newSignals,
      tracked: trackResults.length,
      trackDetails: trackResults,
    });
  } catch (err: any) {
    console.error('[CRAZII-SIGNALS]', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
