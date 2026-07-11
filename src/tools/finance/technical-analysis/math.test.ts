import { describe, expect, test } from 'bun:test';
import { finiteNumber, logReturn, mean, percentageReturn, standardDeviation } from './math.js';

describe('technical analysis math', () => {
  test('handles empty, constant, and invalid inputs without non-finite output', () => {
    expect(mean([])).toBeNull();
    expect(standardDeviation([3, 3, 3], 'sample')).toBe(0);
    expect(standardDeviation([3], 'sample')).toBeNull();
    expect(standardDeviation([3], 'population')).toBe(0);
    expect(finiteNumber('NaN')).toBeNull();
    expect(percentageReturn(2, 0)).toBeNull();
    expect(logReturn(-1, 2)).toBeNull();
  });

  test('keeps sample and population standard deviation explicit', () => {
    expect(standardDeviation([1, 2, 3], 'sample')).toBe(1);
    expect(standardDeviation([1, 2, 3], 'population')).toBeCloseTo(Math.sqrt(2 / 3));
  });
});
