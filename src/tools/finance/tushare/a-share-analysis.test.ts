import { describe, expect, test } from 'bun:test';
import { collectAShareAnalysis } from './a-share-analysis.js';
import { TusharePermissionError, type TushareClient } from './client.js';

describe('collectAShareAnalysis', () => {
  test('returns a recoverable not_found result when stock_basic permission blocks name resolution', async () => {
    const client = {
      call: async () => {
        throw new TusharePermissionError('stock_basic', '抱歉，您没有接口(stock_basic)访问权限');
      },
    } as unknown as TushareClient;

    const result = await collectAShareAnalysis('稳健医疗', client);

    expect(result.status).toBe('not_found');
    if (result.status === 'not_found') {
      expect(result.message).toContain('stock_basic');
    }
  });

  test('continues when an optional Tushare API returns permission code 2002', async () => {
    const client = {
      call: async (apiName: string) => {
        if (apiName === 'stock_basic') {
          return [
            {
              ts_code: '300888.SZ',
              symbol: '300888',
              name: '稳健医疗',
              industry: '医疗保健',
              market: '创业板',
              list_date: '20200917',
            },
          ];
        }
        if (apiName === 'daily_basic') {
          return [
            {
              ts_code: '300888.SZ',
              trade_date: '20260701',
              pe: 22.5,
              pb: 2.1,
              total_mv: 123456,
              circ_mv: 100000,
            },
          ];
        }
        if (apiName === 'income') {
          throw new TusharePermissionError('income', '抱歉，您没有访问该接口的权限');
        }
        return [];
      },
    } as unknown as TushareClient;

    const result = await collectAShareAnalysis('稳健医疗', client);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.stock.ts_code).toBe('300888.SZ');
      expect(result.market_snapshot?.pe).toBe(22.5);
      expect(result.financials.income).toEqual([]);
      expect(result.unavailable_data).toContainEqual({
        api: 'income',
        reason: 'permission_denied',
        message: '抱歉，您没有访问该接口的权限',
      });
    }
  });
});
