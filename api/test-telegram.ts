/**
 * Vercel Serverless Function: /api/test-telegram
 * Gửi 1 message test để kiểm tra cấu hình Telegram (token + chat id).
 * Truy cập: https://<your-app>.vercel.app/api/test-telegram
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendTelegramMessage } from './lib/telegram';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const message = [
    '✅ <b>CRAZII Bot - Kết nối thành công!</b>',
    '━━━━━━━━━━━━━━━',
    'Bot đã sẵn sàng gửi tín hiệu giao dịch.',
    `🕐 ${now} (GMT+7)`,
  ].join('\n');

  const result = await sendTelegramMessage(message);

  if (result.ok) {
    return res.status(200).json({ ok: true, message: 'Test message sent successfully' });
  }
  return res.status(500).json({ ok: false, error: result.error });
}
