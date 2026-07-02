import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../types.js';
import { HttpTushareClient, TusharePermissionError, type TushareApiName, type TushareClient, type TushareRow } from './client.js';
import { pickFinancialRows, pickMarketSnapshot } from './format.js';
import { resolveAShareStock, type AShareStock } from './resolve.js';

export const A_SHARE_ANALYSIS_DESCRIPTION = `
Tushare-backed structured analysis tool for China mainland A-shares.

## When to Use

- A-share company analysis or valuation questions.
- Chinese stock names such as "稳健医疗".
- A-share tickers such as 300888, 300888.SZ, SZ300888, 600519, 600519.SH.
- Questions about PE, PB, ROE, revenue, profit, cash flow, market cap, and recent trading snapshots for A-shares.

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
      unavailable_data: Array<{ api: string; reason: 'permission_denied' | 'error'; message: string }>;
      source: { provider: 'Tushare'; apis: string[] };
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

const FINANCIAL_FIELDS = [
  'ts_code',
  'ann_date',
  'f_ann_date',
  'end_date',
  'report_type',
  'comp_type',
  'basic_eps',
  'diluted_eps',
  'total_revenue',
  'revenue',
  'n_income',
  'total_profit',
  'total_assets',
  'total_liab',
  'total_hldr_eqy_exc_min_int',
  'net_cash_flows_oper_act',
  'roe',
  'roe_dt',
  'grossprofit_margin',
  'netprofit_margin',
  'debt_to_assets',
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

  const [income, balancesheet, cashflow, finaIndicator] = await Promise.all([
    callOptional(client, 'income', { ts_code: stock.ts_code, limit: 4 }, FINANCIAL_FIELDS, unavailableData),
    callOptional(client, 'balancesheet', { ts_code: stock.ts_code, limit: 4 }, FINANCIAL_FIELDS, unavailableData),
    callOptional(client, 'cashflow', { ts_code: stock.ts_code, limit: 4 }, FINANCIAL_FIELDS, unavailableData),
    callOptional(client, 'fina_indicator', { ts_code: stock.ts_code, limit: 4 }, FINANCIAL_FIELDS, unavailableData),
  ]);
  usedApis.push('income', 'balancesheet', 'cashflow', 'fina_indicator');

  return {
    status: 'ok',
    stock,
    market_snapshot: pickMarketSnapshot(dailyBasic),
    financials: {
      income: pickFinancialRows(income),
      balancesheet: pickFinancialRows(balancesheet),
      cashflow: pickFinancialRows(cashflow),
      fina_indicator: pickFinancialRows(finaIndicator),
    },
    unavailable_data: unavailableData,
    source: { provider: 'Tushare', apis: usedApis },
  };
}

export function createAShareAnalysis(token = process.env.TUSHARE_TOKEN): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'a_share_analysis',
    description: 'Analyze China mainland A-share stocks with Tushare structured data. Use with web_search for recent Chinese news and announcements.',
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
