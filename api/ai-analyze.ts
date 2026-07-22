/**
 * API: AI Signal Analysis (Groq - Llama 3.1 70B)
 * POST /api/ai-analyze
 * Body: { signal, candles, history }
 * Returns: { analysis, model }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-70b-versatile';

const SYSTEM_PROMPT = `Bạn là một AI trading assistant chuyên phân tích tín hiệu crypto futures trên khung H4.

═══ PHƯƠNG PHÁP GIAO DỊCH (BẮT BUỘC TUÂN THỦ) ═══

COMBO: Key Level + Nến đảo chiều + EMA 34/89/200
Công cụ: Indicator Key Levels [K-Means] + Candlestick Pattern Indicator

═══ 4 BƯỚC SETUP ═══

BƯỚC 1 — XÁC ĐỊNH XU HƯỚNG CHÍNH (nhìn D1/H4):
- EMA 34 > 89 > 200 + giá trên cả 3 = UPTREND → chỉ tìm BUY
- EMA 34 < 89 < 200 + giá dưới cả 3 = DOWNTREND → chỉ tìm SELL
- 3 EMA đan xen = SIDEWAY → cẩn trọng, ưu tiên đứng ngoài

BƯỚC 2 — KHOANH VÙNG HỖ TRỢ/KHÁNG CỰ (H4/H1):
- Vùng tĩnh: Key Level cứng (xanh = support, đỏ = resistance) — giá phản ứng nhiều lần
- Vùng động: EMA 34 (cam), EMA 89 (xanh), EMA 200 (tím/trắng)
- Chỉ chọn 2-3 vùng quan trọng nhất phía trước giá
- Vùng hợp lưu (Key Level trùng EMA) = cực mạnh

BƯỚC 3 — CHỜ GIÁ VỀ VÙNG + NẾN ĐẢO CHIỀU:
- Giá về support trong uptrend → tìm nến đảo chiều TĂNG (Hammer, Engulfing, Morning Star...)
- Giá về resistance trong downtrend → tìm nến đảo chiều GIẢM (Shooting Star, Engulfing, Evening Star...)
- Nến đảo chiều CHỈ có giá trị khi wick chạm vào đúng vùng Key Level
- Nến giữa chừng (không tại vùng) = KHÔNG CÓ Ý NGHĨA

BƯỚC 4 — XÁC NHẬN + VÀO LỆNH:
- Entry: ngay giá đóng cửa nến đảo chiều (khi H4 close)
- SL: dưới/trên chân râu nến đảo chiều + buffer nhỏ
- Nếu vùng sideway nhiều râu → SL sau chân râu cây nến DÀI NHẤT trong vùng
- TP: Key Level tiếp theo cùng chiều lệnh
- R:R tối thiểu 1.5:1, lý tưởng 2:1+

═══ QUY TRÌNH MULTI-TIMEFRAME ═══
1. W1 (nến tuần): Xem cấu trúc tổng (2 đỉnh, 2 đáy, HH+HL, LH+LL?)
2. D1 (nến ngày): Xu hướng hiện tại + volume mua/bán ai đang dominance + vol đã giảm dần chưa (dấu hiệu đảo chiều)
3. H4 (entry): Chờ nến đảo chiều tại Key Level → vào lệnh

═══ NGUYÊN TẮC BẤT BIẾN ═══
🚫 KHÔNG SELL khi giá đang gần HỖ TRỢ
🚫 KHÔNG BUY khi giá đang gần KHÁNG CỰ
🚫 KHÔNG trade ngược xu hướng D1/W1
🚫 KHÔNG vào khi R:R < 1.5
🚫 KHÔNG vào khi nến đảo chiều không tại vùng Key Level

═══ QUẢN LÝ VỐN ═══
- Risk 1-2% mỗi lệnh
- Chạm TP1 → kéo SL về entry (breakeven)
- Volume cao xác nhận = tín hiệu mạnh hơn

═══ CÁCH TRẢ LỜI ═══
- Tiếng Việt, ngắn gọn, thẳng vấn đề
- Đánh giá rõ: ✅ NÊN VÀO / ⚠️ CẨN TRỌNG / ❌ KHÔNG NÊN
- Giải thích 2-3 câu tại sao
- Nếu có lịch sử signals, tham khảo pattern nào thắng/thua nhiều
- Chỉ ra rủi ro cụ thể nếu có (VD: trade ngược trend, volume thấp, gần level ngược...)`;


interface AnalyzeRequest {
  type: 'new_signal' | 'post_mortem' | 'market_question' | 'scan_summary';
  signal?: {
    symbol: string; side: string; entry: number; sl: number; tp: number;
    pattern: string; trend: string; confidence: number;
    volumeConfirm: boolean; reason: string;
  };
  signals?: {
    symbol: string; side: string; entry: number; sl: number; tp: number;
    pattern: string; trend: string; confidence: number;
    volumeConfirm: boolean;
  }[];
  candles?: number[][]; // 10 nến OHLCV
  history?: { pattern: string; trend: string; outcome: string; side: string }[];
  question?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
  }

  try {
    const body = req.body as AnalyzeRequest;
    let userPrompt = '';

    if (body.type === 'new_signal' && body.signal) {
      const s = body.signal;
      const candleStr = body.candles
        ? body.candles.map((c, i) => `Nến ${i+1}: O=${c[0]} H=${c[1]} L=${c[2]} C=${c[3]} Vol=${c[4]}`).join('\n')
        : 'Không có data nến';

      const historyStr = body.history && body.history.length > 0
        ? `\nLịch sử gần đây (${body.history.length} signals):\n` +
          body.history.slice(0, 10).map(h => `- ${h.side} ${h.pattern} (${h.trend}) → ${h.outcome}`).join('\n')
        : '';

      userPrompt = `TÍN HIỆU MỚI cần đánh giá:
Symbol: ${s.symbol}
Side: ${s.side.toUpperCase()}
Pattern: ${s.pattern}
Entry: $${s.entry}
SL: $${s.sl} | TP: $${s.tp}
R:R: ${((Math.abs(s.tp - s.entry) / Math.abs(s.entry - s.sl))).toFixed(1)}
Trend hiện tại: ${s.trend}
Volume xác nhận: ${s.volumeConfirm ? 'Có' : 'Không'}
Confidence engine: ${s.confidence}%
Lý do engine: ${s.reason}

10 NẾN GẦN NHẤT (H4):
${candleStr}
${historyStr}

Hãy đánh giá: Tín hiệu này NÊN VÀO hay KHÔNG? Giải thích ngắn gọn.`;

    } else if (body.type === 'post_mortem' && body.signal) {
      const s = body.signal;
      userPrompt = `PHÂN TÍCH SAU LỆNH:
Symbol: ${s.symbol} | ${s.side.toUpperCase()} | Pattern: ${s.pattern}
Trend lúc vào: ${s.trend}
Kết quả: ${(s as any).outcome}
R đạt được: ${(s as any).rAchieved ?? 'N/A'}

Tại sao lệnh này ${(s as any).outcome === 'tp' ? 'thắng' : 'thua'}? Rút kinh nghiệm gì cho lần sau?`;

    } else if (body.type === 'market_question' && body.question) {
      userPrompt = body.question;
    } else if (body.type === 'scan_summary' && body.signals && body.signals.length > 0) {
      const sigList = body.signals.map((s, i) =>
        `${i+1}. ${s.symbol} ${s.side.toUpperCase()} | Pattern: ${s.pattern} | Trend: ${s.trend} | Conf: ${s.confidence}% | Vol: ${s.volumeConfirm ? '✅' : '❌'} | Entry: $${s.entry} | SL: $${s.sl} | TP: $${s.tp} | R:R: ${(Math.abs(s.tp - s.entry) / Math.abs(s.entry - s.sl)).toFixed(1)}`
      ).join('\n');

      const historyStr = body.history && body.history.length > 0
        ? `\nLịch sử gần đây (có AI phân tích):\n` +
          body.history.slice(0, 10).map((h: any) => `- ${h.side} ${h.pattern} (${h.trend}) → ${h.outcome}${h.notes ? ' | AI: ' + h.notes.substring(0, 100) : ''}`).join('\n')
        : '';

      userPrompt = `AUTO-SCAN VỪA HOÀN THÀNH. Đây là tất cả tín hiệu H4 vừa phát hiện:

${sigList}
${historyStr}

Hãy:
1. Xếp hạng TOP 3 signal đáng vào nhất (theo phương pháp Key Level + Nến đảo chiều)
2. Với mỗi signal top, giải thích ngắn tại sao nên vào
3. Nếu có signal nào KHÔNG NÊN vào dù confidence cao, cảnh báo và giải thích
4. Gợi ý: có signal nào TP/SL nên điều chỉnh không? (VD: TP quá xa, SL quá sát)`;
    } else {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    // Call Groq API (OpenAI-compatible)
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return res.status(500).json({ error: 'Groq API error', detail: err });
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || 'Không có phản hồi';

    return res.json({ analysis: text, model: MODEL });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: String(err) });
  }
}
