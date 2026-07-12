import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../types.js';
import { HttpTushareClient, TusharePermissionError, type TushareApiName, type TushareClient, type TushareRow } from './client.js';
import { pickLatestFinancialRows, pickLatestPeriodRows, pickMarketSnapshot, pickRows } from './format.js';
import { resolveAShareStock, type AShareStock } from './resolve.js';

export const A_SHARE_ANALYSIS_DESCRIPTION = `
Tushare-backed structured analysis tool for China mainland A-shares.

## When to Use

- A-share company analysis or valuation questions.
- Chinese stock names such as "稳健医疗".
- A-share tickers such as 300888, 300888.SZ, SZ300888, 600519, 600519.SH.
- Questions about PE, PB, ROE, revenue, profit, cash flow, balance-sheet quality, business composition, audit, dividends, forecasts, express reports, market cap, and recent trading snapshots for A-shares.

## Structured Financial Evidence

The tool returns statement-specific fields for multiple comparison periods and prefers updated Tushare rows when duplicate report versions exist. Use its structured statements and supplemental evidence for ordinary financial analysis instead of requiring annual-report PDF parsing. Treat interim statement periods as cumulative reported-period values unless a returned field explicitly says otherwise, and compare like-for-like periods.

The cashflow result keeps Tushare free_cashflow unchanged and separately calculates operating_cashflow_less_capex as n_cashflow_act minus c_pay_acq_const_fiolta. Do not use one label or explanation for the other.

## Pair With web_search

For a full A-share analysis, call this tool for structured Tushare data and call web_search for current Chinese news, announcements, industry context, and recent risks. State data recency and sources in the final answer.

## When NOT to Use

- US/global equities, SEC filings, crypto, or pure news searches without structured A-share data needs.
`.trim();

export type AShareAnalysisResult =
  | {
      status: 'ok';
      stock: AShareStock;
      market_snapshot: TushareRow | null;
      financials: Record<'income' | 'balancesheet' | 'cashflow' | 'fina_indicator', TushareRow[]>;
      supplemental: {
        main_business: { product: TushareRow[]; region: TushareRow[] };
        audit: TushareRow[];
        dividends: TushareRow[];
        forecasts: TushareRow[];
        express: TushareRow[];
      };
      unavailable_data: Array<{ api: string; reason: 'permission_denied' | 'error'; message: string }>;
      source: { provider: 'Tushare'; apis: string[] };
      source_units: {
        market_snapshot: Record<string, string>;
        financial_statement_monetary_fields: 'cny';
        financial_ratio_fields: 'reported_period_percent_not_annualized';
        derived_cashflow_fields: {
          operating_cashflow_less_capex: 'cny: n_cashflow_act - c_pay_acq_const_fiolta';
        };
      };
    }
  | {
      status: 'ambiguous' | 'not_found';
      message: string;
      candidates?: AShareStock[];
      unavailable_data?: Array<{ api: string; reason: 'permission_denied' | 'error'; message: string }>;
      source: { provider: 'Tushare'; apis: string[] };
    };

const A_SHARE_TOOL_SCHEMA = z.object({
  query: z.string().describe('The full natural-language A-share stock question'),
});

const DAILY_BASIC_FIELDS = [
  'ts_code',
  'trade_date',
  'close',
  'turnover_rate',
  'turnover_rate_f',
  'volume_ratio',
  'pe',
  'pe_ttm',
  'pb',
  'ps',
  'ps_ttm',
  'dv_ratio',
  'total_mv',
  'circ_mv',
];

const REPORT_ID_FIELDS = [
  'ts_code',
  'ann_date',
  'f_ann_date',
  'end_date',
  'report_type',
  'comp_type',
  'update_flag',
];

const INCOME_FIELDS = [
  ...REPORT_ID_FIELDS,
  'basic_eps',
  'diluted_eps',
  'total_revenue',
  'revenue',
  'operate_profit',
  'n_income',
  'n_income_attr_p',
  'total_profit',
];

const BALANCESHEET_FIELDS = [
  ...REPORT_ID_FIELDS,
  'money_cap',
  'accounts_receiv',
  'inventories',
  'total_cur_assets',
  'fix_assets',
  'cip',
  'goodwill',
  'total_assets',
  'st_borr',
  'lt_borr',
  'bond_payable',
  'total_cur_liab',
  'total_liab',
  'total_hldr_eqy_exc_min_int',
];

const CASHFLOW_FIELDS = [
  ...REPORT_ID_FIELDS,
  'c_inf_fr_operate_a',
  'st_cash_out_act',
  'n_cashflow_act',
  'c_pay_acq_const_fiolta',
  'n_cashflow_inv_act',
  'n_cash_flows_fnc_act',
  'free_cashflow',
  'operating_cashflow_less_capex',
  'c_cash_equ_end_period',
];

const FINA_INDICATOR_FIELDS = [
  ...REPORT_ID_FIELDS,
  'eps',
  'roe',
  'roe_dt',
  'grossprofit_margin',
  'netprofit_margin',
  'debt_to_assets',
  'current_ratio',
  'quick_ratio',
  'ar_turn',
  'inv_turn',
  'assets_turn',
  'ocfps',
];

const MAIN_BUSINESS_FIELDS = [
  'ts_code',
  'end_date',
  'bz_item',
  'bz_code',
  'bz_sales',
  'bz_profit',
  'bz_cost',
  'curr_type',
  'update_flag',
];

const AUDIT_FIELDS = [
  'ts_code',
  'ann_date',
  'end_date',
  'audit_result',
  'audit_fees',
  'audit_agency',
  'audit_sign',
];

const DIVIDEND_FIELDS = [
  'ts_code',
  'end_date',
  'ann_date',
  'div_proc',
  'cash_div',
  'cash_div_tax',
  'record_date',
  'ex_date',
  'pay_date',
  'imp_ann_date',
];

const FORECAST_FIELDS = [
  'ts_code',
  'ann_date',
  'end_date',
  'type',
  'p_change_min',
  'p_change_max',
  'net_profit_min',
  'net_profit_max',
  'last_parent_net',
  'summary',
  'change_reason',
  'update_flag',
];

const EXPRESS_FIELDS = [
  'ts_code',
  'ann_date',
  'end_date',
  'revenue',
  'operate_profit',
  'total_profit',
  'n_income',
  'total_assets',
  'total_hldr_eqy_exc_min_int',
  'diluted_eps',
  'diluted_roe',
  'yoy_net_profit',
  'perf_summary',
  'update_flag',
];

export async function collectAShareAnalysis(query: string, client: TushareClient): Promise<AShareAnalysisResult> {
  const usedApis = ['stock_basic'];
  let resolved: Awaited<ReturnType<typeof resolveAShareStock>>;
  try {
    resolved = await resolveAShareStock(query, client);
  } catch (error) {
    if (error instanceof TusharePermissionError) {
      return {
        status: 'not_found',
        message: `Tushare ${error.apiName} 权限不足，无法按中文名称解析股票；请提供 A 股代码，或配合 web_search 获取公开上下文。`,
        unavailable_data: [{ api: error.apiName, reason: 'permission_denied', message: error.message }],
        source: { provider: 'Tushare', apis: usedApis },
      };
    }
    throw error;
  }

  if (resolved.status !== 'resolved') {
    return {
      status: resolved.status,
      message: resolved.message,
      candidates: resolved.status === 'ambiguous' ? resolved.candidates : undefined,
      source: { provider: 'Tushare', apis: usedApis },
    };
  }

  const stock = resolved.stock;
  const unavailableData: Array<{ api: string; reason: 'permission_denied' | 'error'; message: string }> = [];

  const dailyBasic = await callOptional(client, 'daily_basic', { ts_code: stock.ts_code }, DAILY_BASIC_FIELDS, unavailableData);
  usedApis.push('daily_basic');

  const [
    income,
    balancesheet,
    cashflow,
    finaIndicator,
    mainBusinessProduct,
    mainBusinessRegion,
    audit,
    dividends,
    forecasts,
    express,
  ] = await Promise.all([
    callOptional(client, 'income', { ts_code: stock.ts_code, limit: 12 }, INCOME_FIELDS, unavailableData),
    callOptional(client, 'balancesheet', { ts_code: stock.ts_code, limit: 12 }, BALANCESHEET_FIELDS, unavailableData),
    callOptional(client, 'cashflow', { ts_code: stock.ts_code, limit: 12 }, CASHFLOW_FIELDS, unavailableData),
    callOptional(client, 'fina_indicator', { ts_code: stock.ts_code, limit: 12 }, FINA_INDICATOR_FIELDS, unavailableData),
    callOptional(client, 'fina_mainbz', { ts_code: stock.ts_code, type: 'P', limit: 20 }, MAIN_BUSINESS_FIELDS, unavailableData),
    callOptional(client, 'fina_mainbz', { ts_code: stock.ts_code, type: 'D', limit: 20 }, MAIN_BUSINESS_FIELDS, unavailableData),
    callOptional(client, 'fina_audit', { ts_code: stock.ts_code, limit: 3 }, AUDIT_FIELDS, unavailableData),
    callOptional(client, 'dividend', { ts_code: stock.ts_code, limit: 8 }, DIVIDEND_FIELDS, unavailableData),
    callOptional(client, 'forecast', { ts_code: stock.ts_code, limit: 4 }, FORECAST_FIELDS, unavailableData),
    callOptional(client, 'express', { ts_code: stock.ts_code, limit: 4 }, EXPRESS_FIELDS, unavailableData),
  ]);
  usedApis.push(
    'income',
    'balancesheet',
    'cashflow',
    'fina_indicator',
    'fina_mainbz',
    'fina_audit',
    'dividend',
    'forecast',
    'express',
  );

  return {
    status: 'ok',
    stock,
    market_snapshot: pickMarketSnapshot(dailyBasic),
    financials: {
      income: pickLatestFinancialRows(income, INCOME_FIELDS),
      balancesheet: pickLatestFinancialRows(balancesheet, BALANCESHEET_FIELDS),
      cashflow: addDerivedCashflowFields(pickLatestFinancialRows(cashflow, CASHFLOW_FIELDS)),
      fina_indicator: pickLatestFinancialRows(finaIndicator, FINA_INDICATOR_FIELDS),
    },
    supplemental: {
      main_business: {
        product: pickLatestPeriodRows(mainBusinessProduct, MAIN_BUSINESS_FIELDS, 2, 20),
        region: pickLatestPeriodRows(mainBusinessRegion, MAIN_BUSINESS_FIELDS, 2, 20),
      },
      audit: pickRows(audit, AUDIT_FIELDS, 3),
      dividends: pickRows(dividends, DIVIDEND_FIELDS, 8),
      forecasts: pickRows(forecasts, FORECAST_FIELDS, 4),
      express: pickRows(express, EXPRESS_FIELDS, 4),
    },
    unavailable_data: unavailableData,
    source: { provider: 'Tushare', apis: usedApis },
    source_units: {
      market_snapshot: {
        close: 'cny_per_share',
        total_mv: 'cny_10k',
        circ_mv: 'cny_10k',
        pe: 'multiple',
        pe_ttm: 'multiple',
        pb: 'multiple',
        ps: 'multiple',
        ps_ttm: 'multiple',
        dv_ratio: 'percent',
      },
      financial_statement_monetary_fields: 'cny',
      financial_ratio_fields: 'reported_period_percent_not_annualized',
      derived_cashflow_fields: {
        operating_cashflow_less_capex: 'cny: n_cashflow_act - c_pay_acq_const_fiolta',
      },
    },
  };
}

function addDerivedCashflowFields(rows: TushareRow[]): TushareRow[] {
  return rows.map((row) => {
    const operatingCashflow = row.n_cashflow_act;
    const capex = row.c_pay_acq_const_fiolta;
    if (typeof operatingCashflow !== 'number' || typeof capex !== 'number') return row;
    return {
      ...row,
      operating_cashflow_less_capex: Math.round((operatingCashflow - capex) * 100) / 100,
    };
  });
}

export function createAShareAnalysis(token = process.env.TUSHARE_TOKEN): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'a_share_analysis',
    description: A_SHARE_ANALYSIS_DESCRIPTION,
    schema: A_SHARE_TOOL_SCHEMA,
    func: async (input) => {
      if (!token) {
        throw new Error('TUSHARE_TOKEN is required for a_share_analysis');
      }
      const client = new HttpTushareClient(token);
      return formatToolResult(await collectAShareAnalysis(input.query, client), []);
    },
  });
}

async function callOptional(
  client: TushareClient,
  apiName: TushareApiName,
  params: Record<string, unknown>,
  fields: string[],
  unavailableData: Array<{ api: string; reason: 'permission_denied' | 'error'; message: string }>,
): Promise<TushareRow[]> {
  try {
    return await client.call(apiName, params, fields);
  } catch (error) {
    unavailableData.push({
      api: apiName,
      reason: error instanceof TusharePermissionError ? 'permission_denied' : 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
