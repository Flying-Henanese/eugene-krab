import { describe, expect, test } from 'bun:test';
import { collectMarketSentiment } from './market-sentiment.js';
import { TusharePermissionError, type TushareClient } from './client.js';

describe('collectMarketSentiment', () => {
  test('returns ok result with required market data', async () => {
    const client = {
      call: async (apiName: string) => {
        if (apiName === 'index_daily') {
          return [
            { ts_code: '000001.SH', trade_date: '20260705', pct_chg: 1.2 },
            { ts_code: '000300.SH', trade_date: '20260705', pct_chg: 0.8 },
            { ts_code: '399006.SZ', trade_date: '20260705', pct_chg: 2.0 },
          ];
        }
        if (apiName === 'daily') {
          return [
            { ts_code: '000001.SZ', trade_date: '20260705', pct_chg: 1 },
            { ts_code: '000002.SZ', trade_date: '20260705', pct_chg: 2 },
            { ts_code: '000003.SZ', trade_date: '20260705', pct_chg: -1 },
            { ts_code: '000004.SZ', trade_date: '20260705', pct_chg: 10.01 },
          ];
        }
        if (apiName === 'daily_basic') {
          return [{ ts_code: '000001.SZ', trade_date: '20260705', turnover_rate: 3.2 }];
        }
        if (apiName === 'limit_list_d') {
          return [{ ts_code: '000004.SZ', trade_date: '20260705', limit: 'U' }];
        }
        if (apiName === 'moneyflow') {
          return [{ ts_code: '000004.SZ', trade_date: '20260705', net_mf_amount: 200 }];
        }
        if (apiName === 'ths_daily') {
          return [{ ts_code: '885001.TI', trade_date: '20260705', name: '人工智能', pct_change: 2.4 }];
        }
        return [];
      },
    } as unknown as TushareClient;

    const result = await collectMarketSentiment({ trade_date: '20260705' }, client);

    expect(result.status).toBe('ok');
    expect(result.market).toBe('china_a_share');
    expect(result.overall_score).toBeGreaterThan(0);
    expect(result.components.some((component) => component.name === 'market')).toBe(true);
    expect(result.news_queries).toContain('A股 20260705 市场情绪 大盘 上涨 下跌 原因');
  });

  test('returns partial result when optional APIs are permission denied', async () => {
    const client = {
      call: async (apiName: string) => {
        if (apiName === 'index_daily') {
          return [{ ts_code: '000001.SH', trade_date: '20260705', pct_chg: 0.5 }];
        }
        if (apiName === 'daily') {
          return [
            { ts_code: '000001.SZ', trade_date: '20260705', pct_chg: 1 },
            { ts_code: '000002.SZ', trade_date: '20260705', pct_chg: -1 },
          ];
        }
        if (apiName === 'daily_basic') {
          return [];
        }
        if (apiName === 'moneyflow') {
          throw new TusharePermissionError('moneyflow', '抱歉，您没有接口(moneyflow)访问权限');
        }
        return [];
      },
    } as unknown as TushareClient;

    const result = await collectMarketSentiment({ trade_date: '20260705' }, client);

    expect(result.status).toBe('partial');
    expect(result.unavailable_data).toContainEqual({
      api: 'moneyflow',
      reason: 'permission_denied',
      message: '抱歉，您没有接口(moneyflow)访问权限',
    });
  });
});
