import { describe, expect, test } from 'bun:test';
import { createFinancialCalculator, runFinancialCalculations } from './financial-calculator.js';

describe('financial_calculator', () => {
  test('converts Tushare market cap from ten-thousand CNY to hundred-million CNY', () => {
    const [result] = runFinancialCalculations([{
      id: 'total-market-cap',
      operation: 'convert',
      value: 5_757_783.2754,
      from_unit: 'cny_10k',
      to_unit: 'cny_100m',
      precision: 2,
    }]);

    expect(result).toEqual({
      id: 'total-market-cap',
      operation: 'convert',
      input: { value: 5_757_783.2754, unit: 'cny_10k' },
      output: { value: 575.78, unit: 'cny_100m' },
    });
  });

  test('compares values without reversing the relationship', () => {
    const [result] = runFinancialCalculations([{
      id: 'price-versus-cost',
      operation: 'compare',
      left: 11.36,
      right: 11.6,
      unit: 'CNY/kg',
      precision: 2,
    }]);

    expect(result).toMatchObject({ relation: 'below', difference: -0.24 });
  });

  test('returns unavailable instead of dividing by zero', () => {
    const [result] = runFinancialCalculations([{
      id: 'growth',
      operation: 'percentage_change',
      previous: 0,
      current: 10,
      precision: 2,
    }]);

    expect(result).toMatchObject({ status: 'unavailable' });
  });

  test('exposes a bounded read-only structured tool', () => {
    const tool = createFinancialCalculator();
    expect(tool.name).toBe('financial_calculator');
    expect(tool.description).toContain('cny_10k');
    expect(tool.description).toContain('does not fetch data');
  });
});
