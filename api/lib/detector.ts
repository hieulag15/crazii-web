/**
 * Signal Detector - tái sử dụng craziiEngine để bắt tín hiệu
 * ở nến vừa đóng gần nhất (last closed candle)
 */

import { calculateAll, calculatePivot, calculateADR } from '../../src/utils/craziiEngine';
import { fetchCandlesServer } from '../../src/utils/serverData';
import type { TradeSignal, KTRLevels } from '../../src/types';

export interface DetectedSignal {
  signal: TradeSignal;
  signalName: string;
  symbol: string;
  timeframe: string;
  price: number;
  op: number | null;
  mlp: number | null;
  ktr: KTRLevels | null;
}

/**
 * Quét tín hiệu cho 1 symbol/timeframe.
 * Chỉ trả về tín hiệu xảy ra ở NẾN ĐÓNG GẦN NHẤT (index = length-2,
 * vì nến cuối cùng length-1 thường chưa đóng).
 */
export async function detectSignalsForSymbol(
  symbol: string,
  timeframe: string
): Promise<DetectedSignal[]> {
  const [candles, dailyCandles] = await Promise.all([
    fetchCandlesServer(symbol, timeframe, 500),
    fetchCandlesServer(symbol, '1d', 20),
  ]);

  if (candles.length < 10) return [];

  const pivot = calculatePivot(dailyCandles);
  const dailyRange = calculateADR(dailyCandles);
  const crazii = calculateAll(candles, { dailyRange, pivot });

  // Nến đóng gần nhất = nến áp chót (nến cuối thường đang chạy)
  const closedCandle = candles[candles.length - 2];
  if (!closedCandle) return [];
  const targetTime = closedCandle.time;

  const lastOp = crazii.ops[crazii.ops.length - 2]?.op ?? null;
  const lastMlp = crazii.mlps[crazii.mlps.length - 2]?.mlp ?? null;
  const lastKtr = crazii.ktrs[crazii.ktrs.length - 2]?.levels ?? null;

  const results: DetectedSignal[] = [];

  const collect = (signals: TradeSignal[], name: string) => {
    signals
      .filter((s) => s.time === targetTime)
      .forEach((signal) => {
        results.push({
          signal,
          signalName: name,
          symbol,
          timeframe,
          price: closedCandle.close,
          op: lastOp,
          mlp: lastMlp,
          ktr: lastKtr,
        });
      });
  };

  // Ưu tiên tín hiệu mạnh trước
  collect(crazii.tamDiem, 'BIG BUY/SELL (Tam Điểm Hội Tụ)');
  collect(crazii.diamondBreak, 'Kim Cương Nhấn Chìm (DML)');
  collect(crazii.engulfing, 'Đổi màu nến (CCRY/CCYR)');

  return results;
}

/**
 * Quét nhiều symbol cùng lúc
 */
export async function detectAllSignals(
  symbols: string[],
  timeframe: string
): Promise<DetectedSignal[]> {
  const all = await Promise.all(
    symbols.map((s) => detectSignalsForSymbol(s, timeframe).catch(() => []))
  );
  return all.flat();
}
