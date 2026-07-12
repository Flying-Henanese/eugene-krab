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
      expect(result.source_units.market_snapshot.total_mv).toBe('cny_10k');
      expect(result.source_units.financial_ratio_fields).toBe('reported_period_percent_not_annualized');
    }
  });

  test('preserves group and attributable net profit as distinct income fields', async () => {
    let requestedIncomeFields: string[] = [];
    const client = {
      call: async (apiName: string, _params: Record<string, unknown>, fields: string[]) => {
        if (apiName === 'stock_basic') {
          return [{ ts_code: '601919.SH', symbol: '601919', name: '中远海控' }];
        }
        if (apiName === 'income') {
          requestedIncomeFields = fields;
          return [{
            ts_code: '601919.SH',
            end_date: '20260331',
            n_income: 6_881_889_372.06,
            n_income_attr_p: 5_877_000_000,
          }];
        }
        return [];
      },
    } as unknown as TushareClient;

    const result = await collectAShareAnalysis('中远海控', client);

    expect(result.status).toBe('ok');
    expect(requestedIncomeFields).toContain('n_income');
    expect(requestedIncomeFields).toContain('n_income_attr_p');
    if (result.status === 'ok') {
      expect(result.financials.income[0]?.n_income).toBe(6_881_889_372.06);
      expect(result.financials.income[0]?.n_income_attr_p).toBe(5_877_000_000);
      expect(result.source_units.financial_statement_monetary_fields).toBe('cny');
    }
  });

  test('uses statement-specific fields, keeps comparison periods, and prefers updated rows', async () => {
    const requestedFields = new Map<string, string[]>();
    const requestedParams = new Map<string, Record<string, unknown>>();
    const client = {
      call: async (apiName: string, params: Record<string, unknown>, fields: string[]) => {
        requestedFields.set(apiName, fields);
        requestedParams.set(apiName, params);
        if (apiName === 'stock_basic') {
          return [{ ts_code: '600584.SH', symbol: '600584', name: '长电科技' }];
        }
        if (apiName === 'income') {
          return [
            { ts_code: '600584.SH', end_date: '20260331', report_type: '1', comp_type: '1', n_income_attr_p: 290, update_flag: '0' },
            { ts_code: '600584.SH', end_date: '20260331', report_type: '1', comp_type: '1', n_income_attr_p: 291, update_flag: '1' },
            { ts_code: '600584.SH', end_date: '20250331', report_type: '1', comp_type: '1', n_income_attr_p: 203, update_flag: '1' },
          ];
        }
        if (apiName === 'cashflow') {
          return [{
            ts_code: '600584.SH',
            end_date: '20251231',
            report_type: '1',
            comp_type: '1',
            n_cashflow_act: 4_652_212_168.2,
            c_pay_acq_const_fiolta: 6_298_299_227.33,
            free_cashflow: -497_284_933.2179,
            update_flag: '1',
          }];
        }
        return [];
      },
    } as unknown as TushareClient;

    const result = await collectAShareAnalysis('长电科技', client);

    expect(requestedParams.get('income')?.limit).toBe(12);
    expect(requestedFields.get('income')).toContain('n_income_attr_p');
    expect(requestedFields.get('income')).not.toContain('n_cashflow_act');
    expect(requestedFields.get('cashflow')).toContain('n_cashflow_act');
    expect(requestedFields.get('cashflow')).toContain('free_cashflow');
    expect(requestedFields.get('cashflow')).not.toContain('n_income_attr_p');
    if (result.status === 'ok') {
      expect(result.financials.income).toHaveLength(2);
      expect(result.financials.income[0]?.n_income_attr_p).toBe(291);
      expect(result.financials.income[1]?.end_date).toBe('20250331');
      expect(result.financials.cashflow[0]?.n_cashflow_act).toBe(4_652_212_168.2);
      expect(result.financials.cashflow[0]?.free_cashflow).toBe(-497_284_933.2179);
      expect(result.financials.cashflow[0]?.operating_cashflow_less_capex).toBe(-1_646_087_059.13);
      expect(result.source_units.derived_cashflow_fields.operating_cashflow_less_capex).toContain('n_cashflow_act');
    }
  });

  test('returns structured business, audit, dividend, forecast, and express evidence', async () => {
    const client = {
      call: async (apiName: string, params: Record<string, unknown>) => {
        if (apiName === 'stock_basic') {
          return [{ ts_code: '600584.SH', symbol: '600584', name: '长电科技' }];
        }
        if (apiName === 'fina_mainbz' && params.type === 'P') {
          return [{ ts_code: '600584.SH', end_date: '20251231', bz_item: '芯片封测', bz_sales: 38_714_188_000.05 }];
        }
        if (apiName === 'fina_mainbz' && params.type === 'D') {
          return [{ ts_code: '600584.SH', end_date: '20251231', bz_item: '国外', bz_sales: 30_438_500_306.11 }];
        }
        if (apiName === 'fina_audit') {
          return [{ ts_code: '600584.SH', end_date: '20251231', audit_result: '标准无保留意见' }];
        }
        if (apiName === 'dividend') {
          return [{ ts_code: '600584.SH', end_date: '20251231', div_proc: '实施', cash_div_tax: 0.1 }];
        }
        if (apiName === 'forecast') {
          return [{ ts_code: '600584.SH', end_date: '20250331', type: '预增', p_change_min: 50 }];
        }
        if (apiName === 'express') {
          return [{ ts_code: '600584.SH', end_date: '20241231', revenue: 35_960_000_000 }];
        }
        return [];
      },
    } as unknown as TushareClient;

    const result = await collectAShareAnalysis('长电科技', client);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.supplemental.main_business.product[0]?.bz_item).toBe('芯片封测');
      expect(result.supplemental.main_business.region[0]?.bz_item).toBe('国外');
      expect(result.supplemental.audit[0]?.audit_result).toBe('标准无保留意见');
      expect(result.supplemental.dividends[0]?.div_proc).toBe('实施');
      expect(result.supplemental.forecasts[0]?.type).toBe('预增');
      expect(result.supplemental.express[0]?.revenue).toBe(35_960_000_000);
      expect(result.source.apis).toContain('fina_mainbz');
      expect(result.source.apis).toContain('fina_audit');
      expect(result.source.apis).toContain('dividend');
    }
  });
});
