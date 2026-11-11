import { describe, expect, test } from 'bun:test';
import { formatCashFlowStatements, formatIncomeStatements, formatInsiderTrades, MARKET_DATA_FORMATTERS } from './formatters.js';

describe('Financial Datasets formatting', () => {
  test('preserves the authoritative fiscal year for non-calendar reporting periods', () => {
    const formatted = formatIncomeStatements([{ fiscal_period: 'FY2026', report_period: '2026-01-25', revenue: 100 }]);
    expect(formatted).toContain('FY2026');
    expect(formatted).not.toContain('Q1 26');
  });

  test('prefers the reported free cash flow over a derived estimate', () => {
    const formatted = formatCashFlowStatements([{ operating_cash_flow: 100, capital_expenditure: -20, free_cash_flow: 75 }]);
    expect(formatted).toContain('| 100 | 20 | 75 |');
  });

  test('formats snapshot daily changes under the actual tool name', () => {
    expect(MARKET_DATA_FORMATTERS.get_stock_price({ ticker: 'AAPL', price: 123, day_change_percent: 2 })).toBe('AAPL: $123.00 (+2.00% today)');
  });

  test('includes undisplayed insider transactions in aggregate totals', () => {
    const trades = Array.from({ length: 16 }, () => ({ transaction_type: 'Sale', transaction_shares: 10, transaction_value: 100 }));
    const formatted = formatInsiderTrades(trades);
    expect(formatted).toContain('16 txns, 160 shares, $1.6K');
    expect(formatted).toContain('1 more rows');
  });
});
