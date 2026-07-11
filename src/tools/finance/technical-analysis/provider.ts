import { TusharePermissionError, type TushareClient, type TushareRow } from '../tushare/client.js';
import { resolveAShareStock, type AShareStock } from '../tushare/resolve.js';
import { aggregateWeeklyCandles } from './aggregate.js';
import { normalizeDailyRows } from './adjustment.js';
import type { AdjustmentMode, Candle, UnavailableData } from './types.js';

const DAILY_FIELDS = ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'pre_close', 'vol', 'amount'];
const FACTOR_FIELDS = ['ts_code', 'trade_date', 'adj_factor'];

const INDEX_ALIASES: Record<string, { ts_code: string; name: string }> = {
  '上证指数': { ts_code: '000001.SH', name: '上证指数' },
  '上证综指': { ts_code: '000001.SH', name: '上证指数' },
  '深证成指': { ts_code: '399001.SZ', name: '深证成指' },
  '创业板指': { ts_code: '399006.SZ', name: '创业板指' },
  '沪深300': { ts_code: '000300.SH', name: '沪深300' },
  '中证500': { ts_code: '000905.SH', name: '中证500' },
  '科创50': { ts_code: '000688.SH', name: '科创50' },
};

export type ProviderResult =
  | {
      status: 'ok' | 'partial';
      asset: { type: 'stock' | 'index'; ts_code: string; name: string };
      daily: Candle[];
      weekly: Candle[];
      apis: string[];
      adjustment: 'qfq' | 'none' | 'not_applicable';
      warnings: string[];
      unavailable_data: UnavailableData[];
    }
  | {
      status: 'not_found' | 'ambiguous' | 'insufficient_data';
      message: string;
      candidates?: AShareStock[];
      apis: string[];
      warnings: string[];
      unavailable_data: UnavailableData[];
    };

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function startDate(asOfDate: string, lookbackDays: number): string {
  const date = new Date(Date.UTC(Number(asOfDate.slice(0, 4)), Number(asOfDate.slice(4, 6)) - 1, Number(asOfDate.slice(6, 8))));
  date.setUTCDate(date.getUTCDate() - lookbackDays);
  return formatDate(date);
}

function resolveIndex(query: string, assetType: 'auto' | 'stock' | 'index') {
  for (const [alias, asset] of Object.entries(INDEX_ALIASES)) {
    if (query.includes(alias)) return asset;
  }
  const explicit = query.toUpperCase().match(/\b(\d{6}\.(?:SH|SZ))\b/)?.[1];
  if (!explicit) return null;
  const known = Object.values(INDEX_ALIASES).find((asset) => asset.ts_code === explicit);
  if (known) return known;
  return assetType === 'index' ? { ts_code: explicit, name: explicit } : null;
}

function unavailable(api: string, error: unknown): UnavailableData {
  return {
    api,
    reason: error instanceof TusharePermissionError ? 'permission_denied' : 'error',
    message: error instanceof Error ? error.message : String(error),
  };
}

async function safeCall(
  client: TushareClient,
  api: 'daily' | 'adj_factor' | 'index_daily',
  params: Record<string, unknown>,
  fields: string[],
  failures: UnavailableData[],
): Promise<TushareRow[]> {
  try {
    return await client.call(api, params, fields);
  } catch (error) {
    failures.push(unavailable(api, error));
    return [];
  }
}

export async function collectTechnicalData(input: {
  query: string;
  asset_type: 'auto' | 'stock' | 'index';
  as_of_date: string;
  adjustment: AdjustmentMode;
  lookback_days: number;
  completed_weeks_only: boolean;
}, client: TushareClient): Promise<ProviderResult> {
  const params = { start_date: startDate(input.as_of_date, input.lookback_days), end_date: input.as_of_date };
  const failures: UnavailableData[] = [];
  const warnings: string[] = [];
  const index = input.asset_type === 'stock' ? null : resolveIndex(input.query, input.asset_type);

  if (index) {
    const rows = await safeCall(client, 'index_daily', { ...params, ts_code: index.ts_code }, DAILY_FIELDS, failures);
    const normalized = normalizeDailyRows(index.ts_code, rows, 'none');
    if (normalized.rejectedRows > 0) warnings.push(`${normalized.rejectedRows} invalid index rows were rejected.`);
    if (normalized.candles.length < 120) {
      return {
        status: 'insufficient_data',
        message: `Need at least 120 daily candles; received ${normalized.candles.length}.`,
        apis: ['index_daily'], warnings, unavailable_data: failures,
      };
    }
    const weekly = aggregateWeeklyCandles(normalized.candles, input.as_of_date, input.completed_weeks_only);
    if (weekly.length < 20) {
      return {
        status: 'insufficient_data', message: `Need at least 20 weekly candles; received ${weekly.length}.`,
        apis: ['index_daily'], warnings, unavailable_data: failures,
      };
    }
    return {
      status: failures.length > 0 ? 'partial' : 'ok',
      asset: { type: 'index', ...index }, daily: normalized.candles, weekly,
      apis: ['index_daily'], adjustment: 'not_applicable', warnings, unavailable_data: failures,
    };
  }

  let resolved: Awaited<ReturnType<typeof resolveAShareStock>>;
  try {
    resolved = await resolveAShareStock(input.query, client);
  } catch (error) {
    const failure = unavailable('stock_basic', error);
    return {
      status: 'not_found',
      message: failure.reason === 'permission_denied'
        ? 'Tushare stock_basic permission denied; provide an explicit A-share ticker.'
        : 'Unable to resolve the A-share name or code.',
      apis: ['stock_basic'], warnings, unavailable_data: [failure],
    };
  }
  if (resolved.status !== 'resolved') {
    return {
      status: resolved.status, message: resolved.message,
      candidates: resolved.status === 'ambiguous' ? resolved.candidates : undefined,
      apis: ['stock_basic'], warnings, unavailable_data: failures,
    };
  }

  const stock = resolved.stock;
  const apis = input.adjustment === 'qfq' ? ['stock_basic', 'daily', 'adj_factor'] : ['stock_basic', 'daily'];
  const [dailyRows, factorRows] = await Promise.all([
    safeCall(client, 'daily', { ...params, ts_code: stock.ts_code }, DAILY_FIELDS, failures),
    input.adjustment === 'qfq'
      ? safeCall(client, 'adj_factor', { ...params, ts_code: stock.ts_code }, FACTOR_FIELDS, failures)
      : Promise.resolve([]),
  ]);
  const normalized = normalizeDailyRows(stock.ts_code, dailyRows, input.adjustment, factorRows);
  if (normalized.rejectedRows > 0) warnings.push(`${normalized.rejectedRows} invalid daily rows were rejected.`);
  if (normalized.missingFactorDates.length > 0) {
    failures.push({
      api: 'adj_factor', reason: 'missing_rows',
      message: `Missing adjustment factors for ${normalized.missingFactorDates.length} daily rows.`,
    });
  }
  if (normalized.candles.length < 120) {
    return {
      status: 'insufficient_data',
      message: `Need at least 120 usable daily candles; received ${normalized.candles.length}.`,
      apis, warnings, unavailable_data: failures,
    };
  }
  const weekly = aggregateWeeklyCandles(normalized.candles, input.as_of_date, input.completed_weeks_only);
  if (weekly.length < 20) {
    return {
      status: 'insufficient_data', message: `Need at least 20 weekly candles; received ${weekly.length}.`,
      apis, warnings, unavailable_data: failures,
    };
  }
  return {
    status: failures.length > 0 ? 'partial' : 'ok',
    asset: { type: 'stock', ts_code: stock.ts_code, name: stock.name },
    daily: normalized.candles, weekly, apis, adjustment: input.adjustment, warnings, unavailable_data: failures,
  };
}
