import type { TushareClient, TushareRow } from './client.js';

export interface AShareStock {
  ts_code: string;
  symbol?: string;
  name: string;
  area?: string;
  industry?: string;
  market?: string;
  list_date?: string;
}

export type ResolveAShareResult =
  | { status: 'resolved'; stock: AShareStock }
  | { status: 'ambiguous'; message: string; candidates: AShareStock[] }
  | { status: 'not_found'; message: string };

const STOCK_BASIC_FIELDS = ['ts_code', 'symbol', 'name', 'area', 'industry', 'market', 'list_date'];

const stockBasicCache = new WeakMap<TushareClient, AShareStock[]>();

export function normalizeAShareCode(input: string): string | null {
  const value = input.trim().toUpperCase();
  const suffixMatch = value.match(/\b([036]\d{5})\.(SZ|SH)\b/);
  if (suffixMatch) {
    return `${suffixMatch[1]}.${suffixMatch[2]}`;
  }

  const prefixMatch = value.match(/\b(SZ|SH)([036]\d{5})\b/);
  if (prefixMatch) {
    return `${prefixMatch[2]}.${prefixMatch[1]}`;
  }

  const codeMatch = value.match(/\b([036]\d{5})\b/);
  if (!codeMatch) {
    return null;
  }

  const code = codeMatch[1];
  if (code.startsWith('6')) {
    return `${code}.SH`;
  }
  if (code.startsWith('0') || code.startsWith('3')) {
    return `${code}.SZ`;
  }
  return null;
}

export async function resolveAShareStock(query: string, client: TushareClient): Promise<ResolveAShareResult> {
  const normalizedCode = normalizeAShareCode(query);
  if (normalizedCode) {
    const stocks = await getStockBasicIfAvailable(client);
    const stock = stocks.find((candidate) => candidate.ts_code === normalizedCode);
    return stock
      ? { status: 'resolved', stock }
      : { status: 'resolved', stock: { ts_code: normalizedCode, name: normalizedCode } };
  }

  const stocks = await getStockBasic(client);
  const terms = extractChineseTerms(query);
  const candidates = stocks.filter((stock) =>
    terms.some((term) => stock.name.includes(term) || term.includes(stock.name)),
  );

  if (candidates.length === 1) {
    return { status: 'resolved', stock: candidates[0] };
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      message: '匹配到多只 A 股，请提供股票代码以消除歧义。',
      candidates,
    };
  }
  return { status: 'not_found', message: '未能从问题中识别 A 股股票名称或代码。' };
}

async function getStockBasicIfAvailable(client: TushareClient): Promise<AShareStock[]> {
  try {
    return await getStockBasic(client);
  } catch {
    return [];
  }
}

async function getStockBasic(client: TushareClient): Promise<AShareStock[]> {
  const cached = stockBasicCache.get(client);
  if (cached) {
    return cached;
  }

  const rows = await client.call('stock_basic', { list_status: 'L' }, STOCK_BASIC_FIELDS);
  const stocks = rows.map(rowToStock).filter((stock): stock is AShareStock => Boolean(stock));
  stockBasicCache.set(client, stocks);
  return stocks;
}

function rowToStock(row: TushareRow): AShareStock | null {
  const tsCode = asString(row.ts_code);
  const name = asString(row.name);
  if (!tsCode || !name) {
    return null;
  }
  return {
    ts_code: tsCode,
    symbol: asString(row.symbol),
    name,
    area: asString(row.area),
    industry: asString(row.industry),
    market: asString(row.market),
    list_date: asString(row.list_date),
  };
}

function extractChineseTerms(query: string): string[] {
  const terms = query.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  return terms
    .map((term) =>
      term
        .replace(/帮我|分析|一下|这只|股票|怎么样|如何|公司|股份|有限/g, '')
        .trim(),
    )
    .filter((term) => term.length >= 2);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
