import { describe, expect, test } from 'bun:test';
import { bollingerBands, kdj, movingAverage } from './indicators.js';
import type { Candle } from './types.js';

function candles(values: number[]): Candle[] {
  return values.map((value, index) => ({
    symbol: 'TEST', date: String(20250101 + index), open: value, high: value, low: value,
    close: value, volume: null, amount: null, adjustment: 'none',
  }));
}

describe('technical indicators', () => {
  test('emits null until the full moving-average window exists', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  test('calculates BOLL with explicit sample standard deviation', () => {
    const result = bollingerBands([1, 2, 3], 3, 2, 'sample').at(-1)!;
    expect(result.middle).toBe(2);
    expect(result.stddev).toBe(1);
    expect(result.upper).toBe(4);
    expect(result.lower).toBe(0);
  });

  test('keeps KDJ stable for a flat price window', () => {
    const result = kdj(candles(Array(12).fill(10))).at(-1)!;
    expect(result).toEqual({ rsv: 50, k: 50, d: 50, j: 50 });
  });
});
