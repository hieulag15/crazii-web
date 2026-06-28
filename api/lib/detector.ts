/**
 * Signal Detector - tái sử dụng craziiEngine để bắt tín hiệu nâng cao
 * (enhanced: confidence, TP/SL, R:R, hợp lưu FVG/OB) ở nến vừa đóng.
 */

import { calculateAll, calculatePivot, calculateADR } from './engine.js';
import { fetchCandlesServer } from './engine.js';
import type { EnhancedSignal } from './engine.js';

export interface DetectedSignal {
  symbol: string;
  timeframe: string;
  enhanced: EnhancedSignal;
}

/**
 * Quét tín hiệu cho 1 symbol/timeframe.
 * Chỉ trả về tín hiệu ở NẾN ĐÓNG GẦN NHẤT (index length-2,
 * vì nến cuối cùng thường chưa đóng).
 */
export async function detectSignalsForSymbol(
  symbol: string,
  timeframe: string,
  minConfidence = 60
): Promise<DetectedSignal[]> {
  const [candles, dailyCandles] = await Promise.all([
    fetchCandlesServer(symbol, timeframe, 500),
    fetchCandlesServer(symbol, '1d', 20),
  ]);

  if (candles.length < 10) return [];

  const pivot = calculatePivot(dailyCandles);
  const dailyRange = calculateADR(dailyCandles);
  const crazii = calculateAll(candles, { dailyRange, pivot, minConfidence });

  // Nến đóng gần nhất = nến áp chót
  const closedCandle = candles[candles.length - 2];
  if (!closedCandle) return [];
  const targetTime = closedCandle.time;

  // Chỉ lấy tín hiệu nâng cao ở đúng nến vừa đóng
  return crazii.enhancedSignals
    .filter((e) => e.time === targetTime)
    .map((enhanced) => ({ symbol, timeframe, enhanced }));
}

/**
 * Quét nhiều symbol cùng lúc
 */
export async function detectAllSignals(
  symbols: string[],
  timeframe: string,
  minConfidence = 60
): Promise<DetectedSignal[]> {
  const all = await Promise.all(
    symbols.map((s) => detectSignalsForSymbol(s, timeframe, minConfidence).catch(() => []))
  );
  return all.flat();
}
