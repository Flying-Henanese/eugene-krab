import { describe, expect, test } from 'bun:test';
import { normalizeAShareCode, resolveAShareStock } from './resolve.js';
import type { TushareClient } from './client.js';

describe('normalizeAShareCode', () => {
  test('defaults Shenzhen codes to .SZ', () => {
    expect(normalizeAShareCode('300888')).toBe('300888.SZ');
  });

  test('defaults Shanghai codes to .SH', () => {
    expect(normalizeAShareCode('600519')).toBe('600519.SH');
  });

  test('keeps normalized exchange suffixes', () => {
    expect(normalizeAShareCode('300888.SZ')).toBe('300888.SZ');
  });

  test('normalizes exchange prefixes', () => {
    expect(normalizeAShareCode('SZ300888')).toBe('300888.SZ');
  });
});

describe('resolveAShareStock', () => {
  test('resolves explicit A-share codes without stock_basic lookup', async () => {
    const client = {
      call: async () => {
        throw new Error('stock_basic should not be called');
      },
    } as unknown as TushareClient;

    const result = await resolveAShareStock('分析 300888.SZ', client);

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.stock.ts_code).toBe('300888.SZ');
      expect(result.stock.name).toBe('300888.SZ');
    }
  });

  test('resolves a Chinese stock name through stock_basic', async () => {
    const client = {
      call: async () => [
        {
          ts_code: '300888.SZ',
          symbol: '300888',
          name: '稳健医疗',
          area: '深圳',
          industry: '医疗保健',
          market: '创业板',
          list_date: '20200917',
        },
      ],
    } as unknown as TushareClient;

    const result = await resolveAShareStock('帮我分析一下稳健医疗这只股票', client);

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.stock.ts_code).toBe('300888.SZ');
      expect(result.stock.name).toBe('稳健医疗');
    }
  });

  test('returns ambiguity when a name matches multiple stocks', async () => {
    const client = {
      call: async () => [
        { ts_code: '000001.SZ', symbol: '000001', name: '平安银行' },
        { ts_code: '601318.SH', symbol: '601318', name: '中国平安' },
      ],
    } as unknown as TushareClient;

    const result = await resolveAShareStock('平安怎么样', client);

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.message).toContain('请提供股票代码');
      expect(result.candidates).toHaveLength(2);
    }
  });
});
