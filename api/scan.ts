/**
 * Vercel Serverless Function: /api/scan
 * Chạy TOÀN BỘ pipeline phía server: fetch data -> tính CRAZII ->
 * phát hiện tín hiệu mới (nến vừa đóng) -> gửi Telegram.
 *
 * Dùng cho chế độ 24/7: gắn external cron (vd cron-job.org) gọi endpoint này
 * mỗi 5 phút. KHÔNG cần mở web app.
 *
 * Dedup phía server: do serverless là stateless, ta chỉ gửi tín hiệu của
 * NẾN VỪA ĐÓNG GẦN NHẤT (nến áp chót), nên mỗi lần cron chạy đúng 1 nến.
 *
 * Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFY_SECRET (tùy chọn)
 * Query: ?symbol=XAUUSDT&tf=5m&secret=xxx
 */

import { fetchCandlesServer, calculateAll, calculatePivot, calculateADR, collectTradeSignals } from './_lib/engine.js';

export default async function handler(req: any, res: any) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const NOTIFY_SECRET = process.env.NOTIFY_SECRET;

  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ error: 'Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID' });
  }

  const symbol = (req.query?.symbol as string) || 'XAUUSDT';
  const tf = (req.query?.tf as string) || '5m';
  const secret = (req.query?.secret as string) || '';

  if (NOTIFY_SECRET && secret !== NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [candles, daily] = await Promise.all([
      fetchCandlesServer(symbol, tf, 500),
      fetchCandlesServer(symbol, '1d', 15),
    ]);

    if (candles.length < 10) {
      return res.status(200).json({ ok: true, sent: 0, note: 'not enough data' });
    }

    const pivot = calculatePivot(daily);
    const dailyRange = calculateADR(daily);
    const crazii = calculateAll(candles, { dailyRange, pivot });
    const allTrade = collectTradeSignals(crazii);

    // Chỉ lấy tín hiệu của nến VỪA ĐÓNG gần nhất (nến áp chót).
    // Nến cuối cùng (index length-1) có thể chưa đóng.
    const lastClosedTime = candles[candles.length - 2]?.time;
    const fresh = allTrade.filter((t) => t.signal.time === lastClosedTime);

    if (fresh.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, lastClosedTime });
    }

    const results = [];
    for (const { signal, label } of fresh) {
      const text = formatMessage({
        type: label,
        side: signal.type,
        symbol,
        timeframe: tf,
        price: signal.price,
        time: signal.time,
        reason: signal.reason,
      });
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true,
        }),
      });
      const data = await tgRes.json();
      results.push({ ok: data.ok, error: data.ok ? undefined : data.description });
    }

    return res.status(200).json({ ok: true, sent: results.length, results });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

interface MsgSig {
  type: string;
  side: 'buy' | 'sell';
  symbol: string;
  timeframe: string;
  price: number;
  time: number;
  reason?: string;
}

function formatMessage(sig: MsgSig): string {
  const emoji = sig.side === 'buy' ? '🟢' : '🔴';
  const arrow = sig.side === 'buy' ? '▲' : '▼';
  const timeStr = new Date(sig.time * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const reasonBlock = sig.reason ? `\n<blockquote>${escapeHtml(sig.reason)}</blockquote>` : '';
  return (
    `${emoji} <b>CRAZII SIGNAL ${arrow} ${sig.side.toUpperCase()}</b>\n\n` +
    `📊 <b>${escapeHtml(sig.symbol)}</b> · ${escapeHtml(sig.timeframe)}\n` +
    `🎯 Loại: ${escapeHtml(sig.type)}\n` +
    `💰 Giá: <b>${sig.price.toFixed(2)}</b>\n` +
    `🕐 ${timeStr} (GMT+7)` +
    reasonBlock +
    `\n\n<i>⚠️ Tín hiệu tham khảo, không phải lời khuyên đầu tư.</i>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
