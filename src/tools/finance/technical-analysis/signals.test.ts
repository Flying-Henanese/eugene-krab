import { describe, expect, test } from 'bun:test';
import { cross, existsWithin, filterCooldown, evaluateWeeklySignals } from './signals.js';
import type { BollingerPoint, Candle } from './types.js';

describe('formula helpers and signals', () => {
  test('implements CROSS and current-bar-inclusive EXIST', () => {
    expect(cross(1, 3, 2, 2)).toBe(true);
    expect(cross(3, 1, 2, 2)).toBe(false);
    expect(existsWithin([false, false, true], 2, 1)).toBe(true);
    expect(existsWithin([true, false, false], 2, 2)).toBe(false);
  });

  test('FILTER retains a signal then suppresses the following N bars', () => {
    expect(filterCooldown([true, true, true, false, true], 1)).toEqual([true, false, true, false, true]);
    expect(filterCooldown([true, false, true], 2)).toEqual([true, false, false]);
  });

  test('marks weekly signals from a partial candle', () => {
    const candle: Candle = {
      symbol: 'TEST', date: '20250103', open: 10, high: 12, low: 8, close: 10,
      volume: null, amount: null, adjustment: 'none', partial: true,
    };
    const boll: BollingerPoint = { middle: 10, upper: 11, lower: 9, stddev: 0.5 };
    const signals = evaluateWeeklySignals([candle], [boll]);
    expect(signals.map((signal) => signal.name)).toEqual(['WEEKLY_BUY_LOWER', 'WEEKLY_SELL_UPPER']);
    expect(signals.every((signal) => signal.partial)).toBe(true);
  });
});
