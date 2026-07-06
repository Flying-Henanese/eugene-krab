import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../types.js';
import {
  HttpTushareClient,
  TusharePermissionError,
  type TushareApiName,
  type TushareClient,
  type TushareRow,
} from './client.js';
import { buildMarketNewsQueries } from './market-sentiment-news.js';
import {
  BASE_WEIGHTS,
  calculateBreadthScore,
  calculateLimitScore,
  calculateMarketScore,
  calculateMoneyFlowScore,
  calculateSectorScore,
  combineSentimentScores,
  unavailableComponent,
} from './market-sentiment-score.js';
import type { MarketSentimentResult, SentimentScoreComponent, UnavailableData } from './market-sentiment-types.js';

export const MARKET_SENTIMENT_DESCRIPTION = `
Analyze China A-share broad market sentiment with Tushare structured market data.

## When to Use

- Broad A-share market mood questions.
- Market breadth, selected index moves, limit-up/down pressure, sector heat, and money-flow context.
- Daily market sentiment summaries that should separate structured market data from news narrative.

## Pair With web_search

Call web_search separately for current Chinese news, policy headlines, and narrative context. This tool returns stable search prompts in news_queries.

## When NOT to Use

- Single-stock A-share valuation or financial-statement questions; use a_share_analysis.
- US/global equities, SEC filings, crypto, or pure news searches without structured China market data needs.
`.trim();

const MARKET_SENTIMENT_SCHEMA = z.object({
  trade_date: z.string().optional().describe('Trade date in YYYYMMDD. Defaults to today in local runtime date format when omitted.'),
});

export interface MarketSentimentInput {
  trade_date?: string;
}

const INDEX_CODES = ['000001.SH', '000300.SH', '399006.SZ'];

export async function collectMarketSentiment(
  input: MarketSentimentInput,
  client: TushareClient,
): Promise<MarketSentimentResult> {
  const tradeDate = input.trade_date ?? new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const unavailableData: UnavailableData[] = [];
  const usedApis: string[] = [];

  const [indices, daily, dailyBasic, limitList, moneyflow, sectors] = await Promise.all([
    callOptional(
      client,
      'index_daily',
      { trade_date: tradeDate, ts_code: INDEX_CODES.join(',') },
      ['ts_code', 'trade_date', 'close', 'pct_chg', 'vol', 'amount'],
      unavailableData,
      usedApis,
    ),
    callOptional(
      client,
      'daily',
      { trade_date: tradeDate },
      ['ts_code', 'trade_date', 'close', 'pct_chg', 'vol', 'amount'],
      unavailableData,
      usedApis,
    ),
    callOptional(
      client,
      'daily_basic',
      { trade_date: tradeDate },
      ['ts_code', 'trade_date', 'turnover_rate', 'volume_ratio', 'total_mv', 'circ_mv'],
      unavailableData,
      usedApis,
    ),
    callOptional(
      client,
      'limit_list_d',
      { trade_date: tradeDate },
      ['ts_code', 'trade_date', 'name', 'close', 'pct_chg', 'limit', 'limit_type', 'amount'],
      unavailableData,
      usedApis,
    ),
    callOptional(
      client,
      'moneyflow',
      { trade_date: tradeDate },
      ['ts_code', 'trade_date', 'net_mf_amount', 'net_amount', 'net_mf_vol'],
      unavailableData,
      usedApis,
    ),
    callOptional(
      client,
      'ths_daily',
      { trade_date: tradeDate },
      ['ts_code', 'trade_date', 'name', 'pct_change', 'pct_chg', 'amount'],
      unavailableData,
      usedApis,
    ),
  ]);

  const components = buildComponents({ indices, daily, limitList, moneyflow, sectors });
  const combined = combineSentimentScores(components);

  return {
    status: unavailableData.length > 0 ? 'partial' : 'ok',
    trade_date: tradeDate,
    market: 'china_a_share',
    label: combined.label,
    overall_score: combined.overallScore,
    components: combined.components,
    highlights: buildHighlights(combined.components),
    pressures: buildPressures(combined.components),
    watch_next: [
      '成交额是否继续放大',
      '市场宽度是否扩散到更多行业',
      '涨停/跌停结构是否恶化',
      '政策和宏观新闻是否改变风险偏好',
    ],
    raw: {
      indices: trimRows(indices, 10),
      daily: trimRows(daily, 20),
      daily_basic: trimRows(dailyBasic, 20),
      limit_list: trimRows(limitList, 20),
      moneyflow: trimRows(moneyflow, 20),
      sectors: trimRows(sectors, 20),
    },
    news_queries: buildMarketNewsQueries(tradeDate),
    unavailable_data: unavailableData,
    source: { provider: 'Tushare', apis: usedApis },
  };
}

function buildComponents(params: {
  indices: TushareRow[];
  daily: TushareRow[];
  limitList: TushareRow[];
  moneyflow: TushareRow[];
  sectors: TushareRow[];
}): SentimentScoreComponent[] {
  return [
    calculateMarketScore(params.indices),
    calculateBreadthScore(params.daily),
    calculateLimitScore(params.limitList, params.daily),
    calculateSectorScore(params.sectors),
    calculateMoneyFlowScore(params.moneyflow),
    unavailableComponent('news', BASE_WEIGHTS.news, 'Call web_search with news_queries for current news sentiment.'),
  ];
}

async function callOptional(
  client: TushareClient,
  apiName: TushareApiName,
  params: Record<string, unknown>,
  fields: string[],
  unavailableData: UnavailableData[],
  usedApis: string[],
): Promise<TushareRow[]> {
  usedApis.push(apiName);
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

function trimRows(rows: TushareRow[], limit: number): TushareRow[] {
  return rows.slice(0, limit);
}

function buildHighlights(components: SentimentScoreComponent[]): string[] {
  return components
    .filter((component) => component.available && component.score > 20)
    .map((component) => component.rationale)
    .slice(0, 5);
}

function buildPressures(components: SentimentScoreComponent[]): string[] {
  return components
    .filter((component) => component.available && component.score < -20)
    .map((component) => component.rationale)
    .slice(0, 5);
}

export function createMarketSentimentAnalysis(token = process.env.TUSHARE_TOKEN): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'market_sentiment_analysis',
    description: MARKET_SENTIMENT_DESCRIPTION,
    schema: MARKET_SENTIMENT_SCHEMA,
    func: async (input) => {
      if (!token) {
        throw new Error('TUSHARE_TOKEN is required for market_sentiment_analysis');
      }
      const client = new HttpTushareClient(token);
      return formatToolResult(await collectMarketSentiment(input, client), []);
    },
  });
}
