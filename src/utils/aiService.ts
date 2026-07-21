/**
 * AI Service - Gọi Gemini API qua backend
 * Dùng để phân tích signal, post-mortem, hỏi market context
 */

interface SignalForAI {
  symbol: string;
  side: string;
  entry: number;
  sl: number;
  tp: number;
  pattern: string;
  trend: string;
  confidence: number;
  volumeConfirm: boolean;
  reason: string;
  outcome?: string;
  rAchieved?: number | null;
}

interface AIResponse {
  analysis: string;
  model: string;
}

async function callAI(body: unknown): Promise<AIResponse | null> {
  try {
    const res = await fetch('/api/ai-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Phân tích signal mới — Gemini đánh giá nên vào hay không
 */
export async function analyzeNewSignal(
  signal: SignalForAI,
  candles: number[][], // 10 nến [O,H,L,C,V]
  history?: { pattern: string; trend: string; outcome: string; side: string }[]
): Promise<string | null> {
  const result = await callAI({
    type: 'new_signal',
    signal,
    candles,
    history,
  });
  return result?.analysis ?? null;
}

/**
 * Phân tích sau lệnh — Tại sao TP/SL, rút kinh nghiệm
 */
export async function analyzePostMortem(signal: SignalForAI): Promise<string | null> {
  const result = await callAI({
    type: 'post_mortem',
    signal,
  });
  return result?.analysis ?? null;
}

/**
 * Hỏi AI câu hỏi tự do về market
 */
export async function askMarketQuestion(question: string): Promise<string | null> {
  const result = await callAI({
    type: 'market_question',
    question,
  });
  return result?.analysis ?? null;
}


/**
 * Phân tích tổng hợp sau auto-scan — AI xếp hạng top signals
 */
export async function analyzeScanResults(
  signals: { symbol: string; side: string; entry: number; sl: number; tp: number; pattern: string; trend: string; confidence: number; volumeConfirm: boolean }[],
  history?: { pattern: string; trend: string; outcome: string; side: string }[]
): Promise<string | null> {
  if (signals.length === 0) return null;
  const result = await callAI({
    type: 'scan_summary',
    signals,
    history,
  });
  return result?.analysis ?? null;
}
