/**
 * Vercel Serverless Function: /api/notify
 * Nhận tín hiệu từ client (web app) và gửi vào Telegram channel.
 *
 * Body: { secret?: string, signals: NotifySignal[] }
 *
 * ENV:
 *  - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (bắt buộc)
 *  - NOTIFY_SECRET (tùy chọn) - nếu set, client phải gửi đúng secret
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendTelegramMessage } from './_lib/telegram.js';

interface NotifySignal {
  type: string;
  side: 'buy' | 'sell';
  symbol: string;
  timeframe: string;
  price: number;
  time: number;
  reason?: string;
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rr?: number;
  confidence?: number;
}

function timeGMT7(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function buildMessage(s: NotifySignal): string {
  const isBuy = s.side === 'buy';
  const emoji = isBuy ? '🟢🔼' : '🔴🔽';
  const action = isBuy ? 'BUY' : 'SELL';

  const lines: string[] = [];
  lines.push(`${emoji} <b>CRAZII SIGNAL — ${action}</b>`);
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`📊 <b>${s.symbol}</b> · ${s.timeframe}`);
  lines.push(`🎯 Loại: <b>${s.type}</b>`);

  if (s.confidence !== undefined) {
    lines.push(`📈 Confidence: <b>${s.confidence}%</b>${s.rr !== undefined ? ` · R:R 1:${s.rr.toFixed(1)}` : ''}`);
  }

  // Trade plan (nếu có enhanced data)
  if (s.entry !== undefined && s.sl !== undefined) {
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(`💰 Entry: <b>${s.entry.toFixed(2)}</b>`);
    lines.push(`🛑 SL: <b>${s.sl.toFixed(2)}</b>`);
    if (s.tp1 !== undefined) lines.push(`🎯 TP1: ${s.tp1.toFixed(2)}`);
    if (s.tp2 !== undefined) lines.push(`🎯 TP2: ${s.tp2.toFixed(2)}`);
    if (s.tp3 !== undefined) lines.push(`🎯 TP3: ${s.tp3.toFixed(2)}`);
  } else {
    lines.push(`💰 Giá: <b>${s.price.toFixed(2)}</b>`);
  }

  if (s.reason) {
    lines.push(`━━━━━━━━━━━━━━━`);
    s.reason.split('\n').forEach((l) => {
      if (l.trim()) lines.push(l);
    });
  }

  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`🕐 ${timeGMT7(s.time)} (GMT+7)`);
  lines.push(`⚠️ <i>Tín hiệu tự động - không phải lời khuyên đầu tư</i>`);
  return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Kiểm tra secret nếu được cấu hình
  const notifySecret = process.env.NOTIFY_SECRET;
  const body = req.body as { secret?: string; signals?: NotifySignal[] };

  if (notifySecret && body.secret !== notifySecret) {
    return res.status(401).json({ ok: false, error: 'Invalid secret' });
  }

  const signals = body.signals;
  if (!Array.isArray(signals) || signals.length === 0) {
    return res.status(400).json({ ok: false, error: 'No signals provided' });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const s of signals) {
    const result = await sendTelegramMessage(buildMessage(s));
    if (result.ok) sent++;
    else errors.push(result.error || 'unknown');
  }

  return res.status(200).json({
    ok: true,
    sent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
