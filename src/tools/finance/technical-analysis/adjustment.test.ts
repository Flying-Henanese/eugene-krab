import { describe, expect, test } from 'bun:test';
import { normalizeDailyRows } from './adjustment.js';

describe('daily normalization and qfq adjustment', () => {
  test('sorts ascending and anchors qfq to the latest factor', () => {
    const result = normalizeDailyRows('000001.SZ', [
      { trade_date: '20250102', open: 50, high: 51, low: 49, close: 50, vol: 2, amount: 3 },
      { trade_date: '20250101', open: 100, high: 102, low: 98, close: 100, vol: 1, amount: 2 },
    ], 'qfq', [
      { trade_date: '20250101', adj_factor: 1 },
      { trade_date: '20250102', adj_factor: 2 },
    ]);

    expect(result.candles.map((candle) => candle.date)).toEqual(['20250101', '20250102']);
    expect(result.candles[0].close).toBe(50);
    expect(result.candles[1].close).toBe(50);
    expect(result.candles[0].volume).toBe(1);
  });

  test('does not silently substitute missing factors', () => {
    const result = normalizeDailyRows('000001.SZ', [
      { trade_date: '20250101', open: 10, high: 11, low: 9, close: 10 },
    ], 'qfq', []);
    expect(result.candles).toHaveLength(0);
    expect(result.missingFactorDates).toEqual(['20250101']);
  });

  test('rejects duplicate dates', () => {
    const rows = Array.from({ length: 2 }, () => ({ trade_date: '20250101', open: 10, high: 11, low: 9, close: 10 }));
    expect(() => normalizeDailyRows('000001.SZ', rows, 'none')).toThrow('duplicate');
  });
});
