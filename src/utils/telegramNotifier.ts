/**
 * Telegram Notifier (client-side)
 * Theo dõi tín hiệu CRAZII, lọc tín hiệu MỚI (chưa gửi),
 * và đẩy sang serverless function /api/notify để bot gửi vào channel.
 *
 * Dedup: dùng localStorage lưu key tín hiệu đã gửi (symbol+tf+time+type),
 * tránh gửi trùng khi component re-render hoặc reload.
 */

import type { TradeSignal, EnhancedSignal } from '../types/index.js';

const STORAGE_KEY = 'crazii_sent_signals';
const MAX_STORED = 200; // giới hạn số key lưu để không phình localStorage

export interface NotifySignal {
  type: string;
  side: 'buy' | 'sell';
  symbol: string;
  timeframe: string;
  price: number;
  time: number;
  reason?: string;
  // Enhanced fields (A+B+C+D)
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rr?: number;
  confidence?: number;
}

/** Tạo key duy nhất cho 1 tín hiệu */
function signalKey(symbol: string, tf: string, s: { time: number; type: string; source?: string }): string {
  return `${symbol}|${tf}|${s.time}|${s.source ?? ''}|${s.type}`;
}

function loadSent(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSent(set: Set<string>): void {
  try {
    let arr = Array.from(set);
    // Giữ lại MAX_STORED key gần nhất
    if (arr.length > MAX_STORED) arr = arr.slice(arr.length - MAX_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore quota errors
  }
}

/**
 * Lọc các tín hiệu mới và gửi sang /api/notify.
 * @returns số tín hiệu đã gửi
 */
export async function notifyNewSignals(
  symbol: string,
  timeframe: string,
  signals: { signal: TradeSignal; label: string }[],
  secret?: string
): Promise<number> {
  if (signals.length === 0) return 0;

  const sent = loadSent();
  const toSend: NotifySignal[] = [];

  for (const { signal, label } of signals) {
    const key = signalKey(symbol, timeframe, { time: signal.time, type: label, source: signal.source });
    if (sent.has(key)) continue;

    toSend.push({
      type: label,
      side: signal.type,
      symbol,
      timeframe,
      price: signal.price,
      time: signal.time,
      reason: signal.reason,
    });
    sent.add(key);
  }

  if (toSend.length === 0) return 0;

  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, signals: toSend }),
    });
    if (!res.ok) {
      console.error('[Telegram] notify failed:', await res.text());
      return 0;
    }
    // Chỉ lưu dedup sau khi gửi thành công
    saveSent(sent);
    return toSend.length;
  } catch (e) {
    console.error('[Telegram] notify error:', e);
    return 0;
  }
}

/**
 * Đánh dấu tín hiệu cũ (lịch sử) là "đã gửi" để KHÔNG spam toàn bộ
 * lịch sử khi mở app lần đầu. Chỉ gọi 1 lần lúc load data ban đầu.
 */
export function seedSentSignals(
  symbol: string,
  timeframe: string,
  signals: { signal: TradeSignal; label: string }[]
): void {
  const sent = loadSent();
  for (const { signal, label } of signals) {
    const key = signalKey(symbol, timeframe, { time: signal.time, type: label, source: signal.source });
    sent.add(key);
  }
  saveSent(sent);
}

/**
 * Gửi tín hiệu ENHANCED (đã lọc, kèm TP/SL/confidence) sang /api/notify.
 * Dùng key dedup theo source+time để không trùng.
 */
export async function notifyEnhancedSignals(
  symbol: string,
  timeframe: string,
  enhanced: EnhancedSignal[],
  secret?: string
): Promise<number> {
  if (enhanced.length === 0) return 0;

  const sent = loadSent();
  const toSend: NotifySignal[] = [];

  for (const e of enhanced) {
    const key = signalKey(symbol, timeframe, { time: e.time, type: e.label, source: e.source });
    if (sent.has(key)) continue;

    toSend.push({
      type: `${e.label} · ${e.confidence}%`,
      side: e.side,
      symbol,
      timeframe,
      price: e.entry,
      time: e.time,
      reason: e.reason,
      entry: e.entry,
      sl: e.sl,
      tp1: e.tp1,
      tp2: e.tp2,
      tp3: e.tp3,
      rr: e.rr,
      confidence: e.confidence,
    });
    sent.add(key);
  }

  if (toSend.length === 0) return 0;

  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, signals: toSend }),
    });
    if (!res.ok) {
      console.error('[Telegram] notify failed:', await res.text());
      return 0;
    }
    saveSent(sent);
    return toSend.length;
  } catch (e) {
    console.error('[Telegram] notify error:', e);
    return 0;
  }
}

/** Seed enhanced signals lịch sử là đã gửi */
export function seedEnhancedSent(
  symbol: string,
  timeframe: string,
  enhanced: EnhancedSignal[]
): void {
  const sent = loadSent();
  for (const e of enhanced) {
    const key = signalKey(symbol, timeframe, { time: e.time, type: e.label, source: e.source });
    sent.add(key);
  }
  saveSent(sent);
}
