import { mean, standardDeviation } from './math.js';
import type { BollingerPoint, Candle, IndicatorSeries, KdjPoint } from './types.js';

export function movingAverage(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    return mean(values.slice(index + 1 - period, index + 1));
  });
}

export function bollingerBands(
  values: number[],
  period = 20,
  multiplier = 2,
  mode: 'sample' | 'population' = 'sample',
): BollingerPoint[] {
  return values.map((_, index) => {
    if (index + 1 < period) return { middle: null, upper: null, lower: null, stddev: null };
    const window = values.slice(index + 1 - period, index + 1);
    const middle = mean(window);
    const stddev = standardDeviation(window, mode);
    return middle === null || stddev === null
      ? { middle: null, upper: null, lower: null, stddev: null }
      : { middle, upper: middle + multiplier * stddev, lower: middle - multiplier * stddev, stddev };
  });
}

export function kdj(candles: Candle[], period = 9, initial = 50): KdjPoint[] {
  let previousRsv = initial;
  let previousK = initial;
  let previousD = initial;
  return candles.map((candle, index) => {
    if (index + 1 < period) return { rsv: null, k: null, d: null, j: null };
    const window = candles.slice(index + 1 - period, index + 1);
    const highest = Math.max(...window.map((item) => item.high));
    const lowest = Math.min(...window.map((item) => item.low));
    const rsv = highest === lowest ? previousRsv : ((candle.close - lowest) / (highest - lowest)) * 100;
    const k = (rsv + 2 * previousK) / 3;
    const d = (k + 2 * previousD) / 3;
    const j = 3 * k - 2 * d;
    previousRsv = rsv;
    previousK = k;
    previousD = d;
    return { rsv, k, d, j };
  });
}

export function calculateIndicators(candles: Candle[], stddev: 'sample' | 'population' = 'sample'): IndicatorSeries {
  const closes = candles.map((candle) => candle.close);
  return {
    ma5: movingAverage(closes, 5),
    ma10: movingAverage(closes, 10),
    ma20: movingAverage(closes, 20),
    ma30: movingAverage(closes, 30),
    ma60: movingAverage(closes, 60),
    boll: bollingerBands(closes, 20, 2, stddev),
    kdj: kdj(candles),
  };
}
