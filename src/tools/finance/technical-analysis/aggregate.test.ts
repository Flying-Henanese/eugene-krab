import { describe, expect, test } from 'bun:test';
import { aggregateWeeklyCandles } from './aggregate.js';
import type { Candle } from './types.js';

function candle(date: string, open: number, high: number, low: number, close: number): Candle {
  return { symbol: 'TEST', date, open, high, low, close, volume: 1, amount: 2, adjustment: 'none' };
}

describe('weekly aggregation', () => {
  test('aggregates a holiday-shortened week and marks an active week partial', () => {
    const weekly = aggregateWeeklyCandles([
      candle('20250127', 10, 12, 9, 11),
      candle('20250128', 11, 13, 10, 12),
      candle('20250203', 12, 14, 11, 13),
      candle('20250205', 13, 15, 12, 14),
    ], '20250205');
    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toMatchObject({ open: 10, high: 13, low: 9, close: 12, volume: 2, partial: false });
    expect(weekly[1]).toMatchObject({ open: 12, high: 15, low: 11, close: 14, partial: true });
  });

  test('can exclude the current partial week', () => {
    const weekly = aggregateWeeklyCandles([candle('20250205', 1, 1, 1, 1)], '20250205', true);
    expect(weekly).toEqual([]);
  });

  test('keeps Friday partial when the latest returned candle is still Thursday', () => {
    const weekly = aggregateWeeklyCandles([candle('20250206', 1, 1, 1, 1)], '20250207');
    expect(weekly[0].partial).toBe(true);
  });
});
