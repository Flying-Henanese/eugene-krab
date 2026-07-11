import { describe, expect, test } from 'bun:test';
import { calculateIndicators } from './indicators.js';
import { buildTechnicalSummary } from './summary.js';
import type { Candle } from './types.js';

function risingCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    symbol: 'TEST', date: String(20250101 + index), open: 10 + index, high: 11 + index,
    low: 9 + index, close: 10 + index, volume: null, amount: null, adjustment: 'none',
  }));
}

describe('technical summary', () => {
  test('returns numeric evidence and bullish trend for an aligned rising series', () => {
    const candles = risingCandles(80);
    const result = buildTechnicalSummary(candles, calculateIndicators(candles));
    expect(result.interpretation.trend).toBe('bullish');
    expect(result.performance.return_20d).toBeGreaterThan(0);
    expect(result.performance.realized_volatility_20d).not.toBeNull();
    expect(result.interpretation.evidence).toHaveLength(4);
  });

  test('reports insufficient labels before indicator warm-up', () => {
    const candles = risingCandles(10);
    const result = buildTechnicalSummary(candles, calculateIndicators(candles));
    expect(result.interpretation.trend).toBe('insufficient_data');
    expect(result.performance.return_20d).toBeNull();
  });
});
