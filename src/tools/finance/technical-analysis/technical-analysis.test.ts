import { describe, expect, test } from 'bun:test';
import { TusharePermissionError, type TushareApiName, type TushareClient, type TushareRow } from '../tushare/client.js';
import { createTechnicalAnalysis, runTechnicalAnalysis } from './technical-analysis.js';

function dateAt(index: number): string {
  const date = new Date(Date.UTC(2025, 0, 1 + index));
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function dailyRows(count = 150): TushareRow[] {
  return Array.from({ length: count }, (_, index) => ({
    ts_code: '000001.SZ', trade_date: dateAt(index), open: 10 + index / 10,
    high: 10.5 + index / 10, low: 9.5 + index / 10, close: 10.2 + index / 10,
    pre_close: 10.1 + index / 10, vol: 1000 + index, amount: 2000 + index,
  })).reverse();
}

class FakeClient implements TushareClient {
  constructor(private readonly denyFactors = false) {}

  async call(apiName: TushareApiName): Promise<TushareRow[]> {
    if (apiName === 'stock_basic') return [{ ts_code: '000001.SZ', symbol: '000001', name: '平安银行' }];
    if (apiName === 'adj_factor') {
      if (this.denyFactors) throw new TusharePermissionError('adj_factor', 'permission denied');
      return dailyRows().map((row) => ({ trade_date: row.trade_date, adj_factor: 1 }));
    }
    if (apiName === 'daily' || apiName === 'index_daily') return dailyRows();
    return [];
  }
}

const baseInput = {
  query: '分析平安银行技术面', asset_type: 'auto' as const, as_of_date: '20250630',
  adjustment: 'qfq' as const, lookback_days: 450, completed_weeks_only: false,
};

describe('technical_analysis tool core', () => {
  test('analyzes an A-share with qfq daily data and bounded output', async () => {
    const result = await runTechnicalAnalysis(baseInput, new FakeClient());
    expect(result.status).toBe('ok');
    expect(result.asset).toMatchObject({ type: 'stock', ts_code: '000001.SZ', name: '平安银行' });
    expect(result.methodology?.adjustment).toBe('qfq');
    expect(result.data_range?.daily_count).toBe(150);
    expect(result.signals?.recent.length).toBeLessThanOrEqual(30);
    expect(result.latest?.ma.ma60).not.toBeNull();
  });

  test('resolves a supported index and skips adjustment factors', async () => {
    const result = await runTechnicalAnalysis({ ...baseInput, query: '沪深300最近走势', asset_type: 'auto' }, new FakeClient());
    expect(result.status).toBe('ok');
    expect(result.asset).toMatchObject({ type: 'index', ts_code: '000300.SH' });
    expect(result.methodology?.apis).toEqual(['index_daily']);
    expect(result.methodology?.adjustment).toBe('not_applicable');
  });

  test('does not silently fall back when qfq factors are unavailable', async () => {
    const result = await runTechnicalAnalysis(baseInput, new FakeClient(true));
    expect(result.status).toBe('insufficient_data');
    expect(result.unavailable_data.some((item) => item.api === 'adj_factor')).toBe(true);
  });

  test('requires a token when invoking the public tool directly', async () => {
    const tool = createTechnicalAnalysis('');
    await expect(tool.invoke(baseInput)).rejects.toThrow('TUSHARE_TOKEN');
  });
});
