/**
 * Math helpers cho CRAZII Engine
 */

/** Exponential Moving Average */
export function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/** Simple Moving Average */
export function sma(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j];
    }
    result.push(sum / period);
  }
  return result;
}

/** Average True Range */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number
): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < highs.length; i++) {
    if (i < period) {
      result.push(null);
      continue;
    }
    let trSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tr = Math.max(
        highs[j] - lows[j],
        Math.abs(highs[j] - (closes[j - 1] ?? highs[j])),
        Math.abs(lows[j] - (closes[j - 1] ?? lows[j]))
      );
      trSum += tr;
    }
    result.push(trSum / period);
  }
  return result;
}
