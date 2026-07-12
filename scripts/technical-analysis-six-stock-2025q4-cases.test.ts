import { describe, expect, test } from 'bun:test';
import { SIX_STOCK_2025Q4_CASES } from './technical-analysis-six-stock-2025q4-cases.js';

describe('six-stock 2025Q4 manifest', () => {
  test('freezes the previously discussed six stocks at one common cutoff', () => {
    expect(SIX_STOCK_2025Q4_CASES).toHaveLength(6);
    expect(new Set(SIX_STOCK_2025Q4_CASES.map((item) => item.tsCode)).size).toBe(6);
    expect(SIX_STOCK_2025Q4_CASES.every((item) => item.asOfDate === '20251231')).toBeTrue();
  });
});
