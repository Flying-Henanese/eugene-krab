import { describe, expect, test } from 'bun:test';
import { normalizeTushareResponse, TusharePermissionError } from './client.js';

describe('normalizeTushareResponse', () => {
  test('converts fields and items into row objects', () => {
    const rows = normalizeTushareResponse('daily_basic', {
      code: 0,
      msg: '',
      data: {
        fields: ['ts_code', 'trade_date', 'pe', 'pb'],
        items: [['300888.SZ', '20260701', 22.5, 2.1]],
      },
    });

    expect(rows).toEqual([
      {
        ts_code: '300888.SZ',
        trade_date: '20260701',
        pe: 22.5,
        pb: 2.1,
      },
    ]);
  });

  test('raises a permission error for Tushare code 2002', () => {
    expect(() =>
      normalizeTushareResponse('income', {
        code: 2002,
        msg: '抱歉，您没有访问该接口的权限',
        data: { fields: [], items: [] },
      }),
    ).toThrow(TusharePermissionError);
  });

  test('raises a permission error for Tushare permission messages with other codes', () => {
    expect(() =>
      normalizeTushareResponse('stock_basic', {
        code: 40203,
        msg: '抱歉，您没有接口(stock_basic)访问权限',
        data: { fields: [], items: [] },
      }),
    ).toThrow(TusharePermissionError);
  });
});
