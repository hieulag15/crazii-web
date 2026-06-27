/**
 * Vercel Serverless Function: /api/check-signals
 * Cron gọi endpoint này → quét tín hiệu CRAZII → gửi Telegram.
 *
 * ENV cần thiết (cấu hình trên Vercel Dashboard):
 *  - TELEGRAM_BOT_TOKEN : token bot (từ @BotFather)
 *  - TELEGRAM_CHAT_ID   : id channel/chat (vd: @ten_channel hoặc -100xxxx)
 *  - CRON_SECRET        : (tùy chọn) bảo vệ endpoint khỏi gọi trái phép
 *  - CRAZII_SYMBOLS     : (tùy chọn) danh sách symbol, cách nhau dấu phẩy
 *  - CRAZII_TIMEFRAME   : (tùy chọn) khung thời gian, mặc định 5m
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { detectAllSignals } from './lib/detector';
import { formatEnhancedMessage } from './lib/formatter';
import { sendTelegramMessage } from './lib/telegram';

// Cache chống gửi trùng trong cùng instance (warm). Key = symbol|time|side|label
const sentCache = new Set<string>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Bảo vệ endpoint (tùy chọn): yêu cầu header authorization khớp CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  const symbols = (process.env.CRAZII_SYMBOLS || 'XAUUSDT,BTCUSDT')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const timeframe = process.env.CRAZII_TIMEFRAME || '5m';
  const minConfidence = Number(process.env.CRAZII_MIN_CONFIDENCE || '60');

  try {
    const detected = await detectAllSignals(symbols, timeframe, minConfidence);

    if (detected.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: 'No new signals' });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const d of detected) {
      const e = d.enhanced;
      const dedupKey = `${d.symbol}|${e.time}|${e.side}|${e.label}`;
      if (sentCache.has(dedupKey)) continue;

      const message = formatEnhancedMessage(e, d.symbol, d.timeframe);

      const result = await sendTelegramMessage(message);
      if (result.ok) {
        sentCache.add(dedupKey);
        sent++;
      } else {
        errors.push(result.error || 'unknown');
      }
    }

    return res.status(200).json({
      ok: true,
      detected: detected.length,
      sent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
