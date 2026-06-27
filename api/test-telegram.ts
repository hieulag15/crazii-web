/**
 * Vercel Serverless Function: /api/test-telegram
 * Gửi 1 message test để kiểm tra cấu hình Telegram (token + chat id).
 * Đã bọc try/catch toàn bộ để không bao giờ crash trắng (trả lỗi rõ ràng).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Báo rõ nếu thiếu env var
    if (!token || !chatId) {
      return res.status(200).json({
        ok: false,
        step: 'env-check',
        hasToken: Boolean(token),
        hasChatId: Boolean(chatId),
        error: 'Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID. Hãy set trong Vercel → Settings → Environment Variables, sau đó Redeploy.',
      });
    }

    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const message = [
      '✅ <b>CRAZII Bot - Kết nối thành công!</b>',
      '━━━━━━━━━━━━━━━',
      'Bot đã sẵn sàng gửi tín hiệu giao dịch.',
      `🕐 ${now} (GMT+7)`,
    ].join('\n');

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await tgRes.json();

    if (!data.ok) {
      // Trả nguyên lỗi từ Telegram để dễ chẩn đoán (vd: chat not found, bot blocked...)
      return res.status(200).json({
        ok: false,
        step: 'telegram-api',
        telegramError: data.description || 'Unknown Telegram error',
        errorCode: data.error_code,
      });
    }

    return res.status(200).json({ ok: true, message: 'Test message sent successfully' });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      step: 'exception',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
