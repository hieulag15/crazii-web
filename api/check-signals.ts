/**
 * Vercel Serverless Function: /api/check-signals
 * Cron/External trigger → quét tín hiệu CRAZII → gửi Telegram cho tất cả users đã bật.
 *
 * Logic:
 * 1. Query tất cả users có telegramEnabled = true
 * 2. Gom danh sách symbol/timeframe unique
 * 3. Quét tín hiệu nâng cao (enhanced) cho từng cặp
 * 4. Với mỗi user: lọc tín hiệu theo telegramMinConfidence → gửi TG
 *
 * ENV:
 *  - MONGODB_URI, TELEGRAM_BOT_TOKEN
 *  - CRON_SECRET (tùy chọn, bảo vệ endpoint)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';
import type { UserDoc } from './_lib/db.js';
import { detectSignalsForSymbol } from './_lib/detector.js';
import { formatEnhancedMessage } from './_lib/formatter.js';

const TELEGRAM_API = 'https://api.telegram.org';

// Cache chống gửi trùng trong cùng invocation
const sentCache = new Set<string>();

async function sendToChat(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Bảo vệ endpoint
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const db = await getDB();
    const users = db.collection<UserDoc>('users');

    // 1. Lấy tất cả users bật Telegram
    const tgUsers = await users.find({
      'settings.telegramEnabled': true,
      'settings.telegramChatId': { $exists: true, $ne: '' },
    }).toArray();

    if (tgUsers.length === 0) {
      // Fallback: gửi vào channel mặc định (env var) nếu không có user nào
      const defaultChatId = process.env.TELEGRAM_CHAT_ID;
      const defaultSymbols = (process.env.CRAZII_SYMBOLS || 'XAUUSDT,BTCUSDT').split(',').map(s => s.trim());
      const timeframe = process.env.CRAZII_TIMEFRAME || '5m';
      const minConf = Number(process.env.CRAZII_MIN_CONFIDENCE || '90');

      let sent = 0;
      for (const symbol of defaultSymbols) {
        const detected = await detectSignalsForSymbol(symbol, timeframe, minConf);
        for (const d of detected) {
          const key = `default|${d.enhanced.time}|${d.enhanced.side}|${d.enhanced.label}`;
          if (sentCache.has(key)) continue;
          if (defaultChatId) {
            const msg = formatEnhancedMessage(d.enhanced, symbol, timeframe);
            const ok = await sendToChat(defaultChatId, msg);
            if (ok) { sentCache.add(key); sent++; }
          }
        }
      }
      return res.status(200).json({ ok: true, mode: 'default', sent });
    }

    // 2. Gom symbol/timeframe unique
    const pairs = new Set<string>();
    tgUsers.forEach((u) => {
      const s = u.settings?.symbol || 'XAUUSDT';
      const tf = u.settings?.timeframe || '5m';
      pairs.add(`${s}|${tf}`);
    });

    // 3. Quét tín hiệu cho mỗi cặp (cache kết quả)
    const signalsByPair = new Map<string, Awaited<ReturnType<typeof detectSignalsForSymbol>>>();
    for (const pair of pairs) {
      const [symbol, tf] = pair.split('|');
      const signals = await detectSignalsForSymbol(symbol, tf, 0); // lấy tất cả, lọc sau
      signalsByPair.set(pair, signals);
    }

    // 4. Gửi cho từng user
    let totalSent = 0;
    for (const user of tgUsers) {
      const s = user.settings?.symbol || 'XAUUSDT';
      const tf = user.settings?.timeframe || '5m';
      const minConf = user.settings?.telegramMinConfidence ?? 90;
      const chatId = user.settings?.telegramChatId;
      if (!chatId) continue;

      const signals = signalsByPair.get(`${s}|${tf}`) || [];
      const qualified = signals.filter((d) => d.enhanced.confidence >= minConf);

      for (const d of qualified) {
        const key = `${chatId}|${d.enhanced.time}|${d.enhanced.side}|${d.enhanced.label}`;
        if (sentCache.has(key)) continue;
        const msg = formatEnhancedMessage(d.enhanced, s, tf);
        const ok = await sendToChat(chatId, msg);
        if (ok) { sentCache.add(key); totalSent++; }
      }
    }

    return res.status(200).json({ ok: true, mode: 'users', userCount: tgUsers.length, sent: totalSent });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Unknown' });
  }
}
