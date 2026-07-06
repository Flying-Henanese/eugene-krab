# China Market Sentiment Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a low-coupling `market_sentiment_analysis` tool that uses Tushare structured market data plus optional Tavily-backed `web_search` context to score and explain China A-share market sentiment.

**Architecture:** Keep the existing `a_share_analysis` tool focused on single-stock A-share analysis. Add a new Tushare market-sentiment module under `src/tools/finance/tushare/` and register it independently when `TUSHARE_TOKEN` is present. The new tool should gather deterministic market data, calculate rule-based scores, and return structured JSON for the main agent to explain.

**Tech Stack:** Bun, TypeScript, LangChain `DynamicStructuredTool`, Zod, existing `HttpTushareClient`, existing `web_search` provider chain, Bun test runner.

---

## Scope

This plan intentionally avoids a broad architecture rewrite.

In scope:

- Add a new prompt-visible tool named `market_sentiment_analysis`.
- Extend the existing Tushare client type union to support market-level APIs.
- Implement deterministic score calculation for market, breadth, limit-up/down, sector, and optional money-flow signals.
- Add a small, optional news-context helper that produces stable `web_search` query strings for Tavily/other search providers.
- Register the tool beside `a_share_analysis`, gated by `TUSHARE_TOKEN`.
- Store or surface output in a shape suitable for later cron jobs and memory persistence.

Out of scope for first implementation:

- MCP client support.
- Charts or visual dashboards.
- New database schema.
- Automatic cron job creation.
- Feishu-specific rendering changes.
- Full historical backtesting.

## Current Source Context

- Existing Tushare client: `src/tools/finance/tushare/client.ts`
- Existing single-stock A-share tool: `src/tools/finance/tushare/a-share-analysis.ts`
- Existing Tushare exports: `src/tools/finance/tushare/index.ts`
- Tool registry: `src/tools/registry.ts`
- Tushare registration tests: `src/tools/registry.tushare.test.ts`
- Existing A-share tests: `src/tools/finance/tushare/a-share-analysis.test.ts`
- Market-data context: `.harness/context/market-data-sources.md`
- Finance tool workflow: `.harness/workflows/add-finance-tool.md`
- Change checklist: `.harness/checklists/code-change.md`
- Verification checklist: `.harness/checklists/verification.md`

## File Structure

Create:

- `src/tools/finance/tushare/market-sentiment-types.ts`
  - Shared types for raw snapshots, score components, events, unavailable data, and final result shape.

- `src/tools/finance/tushare/market-sentiment-score.ts`
  - Pure deterministic scoring functions. No network calls.

- `src/tools/finance/tushare/market-sentiment-news.ts`
  - Builds stable Chinese web-search query strings and normalizes news-context snippets when provided by the caller/tool runtime.

- `src/tools/finance/tushare/market-sentiment.ts`
  - LangChain tool, Tushare collection orchestration, recoverable permission handling, and final JSON formatting.

- `src/tools/finance/tushare/market-sentiment-score.test.ts`
  - Unit tests for scoring formulas and missing-data behavior.

- `src/tools/finance/tushare/market-sentiment.test.ts`
  - Unit tests for collector behavior with mocked `TushareClient`.

Modify:

- `src/tools/finance/tushare/client.ts`
  - Add market-level API names to `TushareApiName`.

- `src/tools/finance/tushare/index.ts`
  - Export the new tool and description.

- `src/tools/registry.ts`
  - Register `market_sentiment_analysis` when `TUSHARE_TOKEN` exists.

- `src/tools/registry.tushare.test.ts`
  - Assert registration gating for the new tool.

- `.harness/context/market-data-sources.md`
  - Add the market sentiment split and clarify `a_share_analysis` remains single-stock.

- `env.example`
  - No new env var is required if the tool only uses `TUSHARE_TOKEN` and existing web-search keys. Add one comment only if helpful.

Do not modify:

- `src/agent/agent.ts`
- `src/agent/prompts.ts`
- `src/gateway/**`
- Existing `a_share_analysis` behavior, except shared Tushare type support.

## Data Model

Use one final result shape so the agent can explain it consistently.

```ts
export type SentimentLabel = 'optimistic' | 'neutral' | 'pessimistic';

export type SentimentComponentName =
  | 'market'
  | 'breadth'
  | 'limit'
  | 'sector'
  | 'money_flow'
  | 'news';

export interface SentimentScoreComponent {
  name: SentimentComponentName;
  score: number;
  weight: number;
  available: boolean;
  rationale: string;
}

export interface MarketSentimentResult {
  status: 'ok' | 'partial';
  trade_date: string;
  market: 'china_a_share';
  label: SentimentLabel;
  overall_score: number;
  components: SentimentScoreComponent[];
  highlights: string[];
  pressures: string[];
  watch_next: string[];
  raw: {
    indices: TushareRow[];
    daily: TushareRow[];
    daily_basic: TushareRow[];
    limit_list: TushareRow[];
    moneyflow: TushareRow[];
    sectors: TushareRow[];
  };
  news_queries: string[];
  unavailable_data: Array<{
    api: string;
    reason: 'permission_denied' | 'error' | 'not_configured';
    message: string;
  }>;
  source: {
    provider: 'Tushare';
    apis: string[];
  };
}
```

The `raw` section should be compact. Keep only rows and fields used for scoring.

## Tushare APIs

Extend `TushareApiName` with these names:

```ts
export type TushareApiName =
  | 'stock_basic'
  | 'daily_basic'
  | 'daily'
  | 'income'
  | 'balancesheet'
  | 'cashflow'
  | 'fina_indicator'
  | 'namechange'
  | 'trade_cal'
  | 'index_daily'
  | 'limit_list_d'
  | 'moneyflow'
  | 'index_classify'
  | 'index_member'
  | 'ths_index'
  | 'ths_daily';
```

Use recoverable collection for every optional API. Required first-version minimum:

- `index_daily`
- `daily`
- `daily_basic`

Optional, degrade gracefully:

- `limit_list_d`
- `moneyflow`
- `ths_index`
- `ths_daily`

If industry/sector APIs are unavailable, compute a weaker first version without `sector` score and redistribute available weights.

## Score Design

Normalize each component to `-100..100`.

Recommended first-version weights:

```ts
const BASE_WEIGHTS = {
  market: 0.25,
  breadth: 0.25,
  limit: 0.15,
  sector: 0.15,
  money_flow: 0.10,
  news: 0.10,
} as const;
```

If a component is unavailable, redistribute its weight across available deterministic components. Do not redistribute missing money-flow weight into news unless news exists.

Label mapping:

```ts
function labelFromScore(score: number): SentimentLabel {
  if (score >= 30) return 'optimistic';
  if (score <= -30) return 'pessimistic';
  return 'neutral';
}
```

Component formulas:

- Market:
  - Average selected index percentage change.
  - Score: clamp(`avgPctChange * 20`, `-100`, `100`).
  - Example: +2.5% average index gain -> +50.

- Breadth:
  - Up/down ratio from `daily.pct_chg`.
  - Score: `((upCount - downCount) / tradedCount) * 100`.

- Limit:
  - If `limit_list_d` exists, use up-limit and down-limit counts.
  - Score: clamp(`((upLimit - downLimit) / max(upLimit + downLimit, 1)) * 100`, `-100`, `100`).
  - If unavailable, derive weaker proxy from daily rows with `pct_chg >= 9.8` and `pct_chg <= -9.8`.

- Sector:
  - From `ths_daily` or selected sector-index rows.
  - Score: average of top sector gains and breadth of positive sectors.
  - If no sector rows, unavailable.

- Money Flow:
  - From `moneyflow.net_mf_amount` or closest available net-flow field.
  - Score: compare positive vs negative net-flow names.
  - If unavailable or permission-denied, unavailable.

- News:
  - First implementation should expose stable `news_queries` and accept optional future event inputs, but it does not need to call `web_search` internally.
  - The main agent can call `web_search` separately using those queries, then explain the result.
  - Keep `news` unavailable in the pure Tushare tool unless explicit news events are passed later.

This design keeps the tool deterministic and avoids making a finance tool depend directly on the agent's web-search registry.

## Task 1: Add Market Sentiment Types

**Files:**

- Create: `src/tools/finance/tushare/market-sentiment-types.ts`
- Test: no standalone test for types.

- [ ] **Step 1: Create the type module**

Add:

```ts
import type { TushareRow } from './client.js';

export type SentimentLabel = 'optimistic' | 'neutral' | 'pessimistic';

export type SentimentComponentName =
  | 'market'
  | 'breadth'
  | 'limit'
  | 'sector'
  | 'money_flow'
  | 'news';

export interface UnavailableData {
  api: string;
  reason: 'permission_denied' | 'error' | 'not_configured';
  message: string;
}

export interface SentimentScoreComponent {
  name: SentimentComponentName;
  score: number;
  weight: number;
  available: boolean;
  rationale: string;
}

export interface MarketSentimentRawData {
  indices: TushareRow[];
  daily: TushareRow[];
  daily_basic: TushareRow[];
  limit_list: TushareRow[];
  moneyflow: TushareRow[];
  sectors: TushareRow[];
}

export interface MarketSentimentResult {
  status: 'ok' | 'partial';
  trade_date: string;
  market: 'china_a_share';
  label: SentimentLabel;
  overall_score: number;
  components: SentimentScoreComponent[];
  highlights: string[];
  pressures: string[];
  watch_next: string[];
  raw: MarketSentimentRawData;
  news_queries: string[];
  unavailable_data: UnavailableData[];
  source: {
    provider: 'Tushare';
    apis: string[];
  };
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

## Task 2: Extend Tushare API Names

**Files:**

- Modify: `src/tools/finance/tushare/client.ts`
- Test: existing Tushare client tests.

- [ ] **Step 1: Extend `TushareApiName`**

Modify the union at the top of `client.ts` so it includes:

```ts
  | 'trade_cal'
  | 'index_daily'
  | 'limit_list_d'
  | 'moneyflow'
  | 'index_classify'
  | 'index_member'
  | 'ths_index'
  | 'ths_daily'
```

- [ ] **Step 2: Run existing Tushare client tests**

Run:

```bash
bun test src/tools/finance/tushare/client.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/finance/tushare/client.ts
git commit -m "feat: extend tushare market api names"
```

## Task 3: Add Pure Scoring Functions

**Files:**

- Create: `src/tools/finance/tushare/market-sentiment-score.ts`
- Create: `src/tools/finance/tushare/market-sentiment-score.test.ts`

- [ ] **Step 1: Write failing scoring tests**

Create `market-sentiment-score.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  calculateBreadthScore,
  calculateLimitScore,
  calculateMarketScore,
  combineSentimentScores,
  labelFromScore,
} from './market-sentiment-score.js';

describe('market sentiment scoring', () => {
  test('labels scores by threshold', () => {
    expect(labelFromScore(30)).toBe('optimistic');
    expect(labelFromScore(0)).toBe('neutral');
    expect(labelFromScore(-30)).toBe('pessimistic');
  });

  test('calculates market score from average index moves', () => {
    const component = calculateMarketScore([
      { ts_code: '000001.SH', pct_chg: 1.5 },
      { ts_code: '000300.SH', pct_chg: 0.5 },
      { ts_code: '399006.SZ', pct_chg: -0.5 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBeCloseTo(10, 5);
  });

  test('calculates breadth score from up and down counts', () => {
    const component = calculateBreadthScore([
      { ts_code: '000001.SZ', pct_chg: 1 },
      { ts_code: '000002.SZ', pct_chg: 2 },
      { ts_code: '000003.SZ', pct_chg: -1 },
      { ts_code: '000004.SZ', pct_chg: 0 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBe(25);
  });

  test('calculates limit score from explicit limit rows', () => {
    const component = calculateLimitScore([
      { ts_code: '000001.SZ', limit: 'U' },
      { ts_code: '000002.SZ', limit: 'U' },
      { ts_code: '000003.SZ', limit: 'D' },
    ], []);

    expect(component.available).toBe(true);
    expect(component.score).toBeCloseTo(33.333333, 5);
  });

  test('falls back to daily pct_chg for limit proxy', () => {
    const component = calculateLimitScore([], [
      { ts_code: '000001.SZ', pct_chg: 10.01 },
      { ts_code: '000002.SZ', pct_chg: -10.02 },
      { ts_code: '000003.SZ', pct_chg: 9.9 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBeCloseTo(33.333333, 5);
    expect(component.rationale).toContain('proxy');
  });

  test('redistributes unavailable component weights', () => {
    const result = combineSentimentScores([
      { name: 'market', score: 50, weight: 0.25, available: true, rationale: 'market' },
      { name: 'breadth', score: 50, weight: 0.25, available: true, rationale: 'breadth' },
      { name: 'money_flow', score: 0, weight: 0.50, available: false, rationale: 'missing' },
    ]);

    expect(result.overallScore).toBe(50);
    expect(result.label).toBe('optimistic');
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test src/tools/finance/tushare/market-sentiment-score.test.ts
```

Expected: fail because `market-sentiment-score.ts` does not exist.

- [ ] **Step 3: Implement scoring functions**

Create `market-sentiment-score.ts`:

```ts
import type { TushareRow } from './client.js';
import type { SentimentLabel, SentimentScoreComponent } from './market-sentiment-types.js';

export const BASE_WEIGHTS = {
  market: 0.25,
  breadth: 0.25,
  limit: 0.15,
  sector: 0.15,
  money_flow: 0.10,
  news: 0.10,
} as const;

export function labelFromScore(score: number): SentimentLabel {
  if (score >= 30) return 'optimistic';
  if (score <= -30) return 'pessimistic';
  return 'neutral';
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100, Math.min(100, value));
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function calculateMarketScore(rows: TushareRow[]): SentimentScoreComponent {
  const changes = rows
    .map((row) => asNumber(row.pct_chg))
    .filter((value): value is number => value !== null);

  if (changes.length === 0) {
    return { name: 'market', score: 0, weight: BASE_WEIGHTS.market, available: false, rationale: 'No index percentage changes available.' };
  }

  const avgPctChange = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  return {
    name: 'market',
    score: clampScore(avgPctChange * 20),
    weight: BASE_WEIGHTS.market,
    available: true,
    rationale: `Average selected index change was ${avgPctChange.toFixed(2)}%.`,
  };
}

export function calculateBreadthScore(rows: TushareRow[]): SentimentScoreComponent {
  let up = 0;
  let down = 0;
  let traded = 0;

  for (const row of rows) {
    const pct = asNumber(row.pct_chg);
    if (pct === null) continue;
    traded += 1;
    if (pct > 0) up += 1;
    if (pct < 0) down += 1;
  }

  if (traded === 0) {
    return { name: 'breadth', score: 0, weight: BASE_WEIGHTS.breadth, available: false, rationale: 'No stock advance/decline data available.' };
  }

  return {
    name: 'breadth',
    score: clampScore(((up - down) / traded) * 100),
    weight: BASE_WEIGHTS.breadth,
    available: true,
    rationale: `${up} stocks rose and ${down} stocks fell among ${traded} traded rows.`,
  };
}

export function calculateLimitScore(limitRows: TushareRow[], dailyRows: TushareRow[]): SentimentScoreComponent {
  const explicit = countLimitRows(limitRows);
  if (explicit.up + explicit.down > 0) {
    return buildLimitComponent(explicit.up, explicit.down, 'Explicit limit-up/limit-down rows.');
  }

  let up = 0;
  let down = 0;
  for (const row of dailyRows) {
    const pct = asNumber(row.pct_chg);
    if (pct === null) continue;
    if (pct >= 9.8) up += 1;
    if (pct <= -9.8) down += 1;
  }

  if (up + down === 0) {
    return { name: 'limit', score: 0, weight: BASE_WEIGHTS.limit, available: false, rationale: 'No limit-up/limit-down data or proxy rows available.' };
  }

  return buildLimitComponent(up, down, 'Daily pct_chg proxy for limit-up/limit-down pressure.');
}

function countLimitRows(rows: TushareRow[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const row of rows) {
    const limit = String(row.limit ?? row.limit_type ?? row.status ?? '').toUpperCase();
    if (limit === 'U' || limit.includes('涨停')) up += 1;
    if (limit === 'D' || limit.includes('跌停')) down += 1;
  }
  return { up, down };
}

function buildLimitComponent(up: number, down: number, prefix: string): SentimentScoreComponent {
  return {
    name: 'limit',
    score: clampScore(((up - down) / Math.max(up + down, 1)) * 100),
    weight: BASE_WEIGHTS.limit,
    available: true,
    rationale: `${prefix} ${up} up-limit signals and ${down} down-limit signals.`,
  };
}

export function combineSentimentScores(components: SentimentScoreComponent[]): {
  overallScore: number;
  label: SentimentLabel;
  components: SentimentScoreComponent[];
} {
  const available = components.filter((component) => component.available);
  if (available.length === 0) {
    return { overallScore: 0, label: 'neutral', components };
  }

  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const weighted = available.reduce((sum, component) => sum + component.score * (component.weight / totalWeight), 0);
  const overallScore = Math.round(clampScore(weighted));

  return {
    overallScore,
    label: labelFromScore(overallScore),
    components,
  };
}
```

- [ ] **Step 4: Run score tests**

Run:

```bash
bun test src/tools/finance/tushare/market-sentiment-score.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/finance/tushare/market-sentiment-score.ts src/tools/finance/tushare/market-sentiment-score.test.ts
git commit -m "feat: add market sentiment scoring"
```

## Task 4: Add News Query Helper

**Files:**

- Create: `src/tools/finance/tushare/market-sentiment-news.ts`
- Optional test: include this helper in `market-sentiment.test.ts` later.

- [ ] **Step 1: Create stable query builder**

Add:

```ts
export function buildMarketNewsQueries(date: string): string[] {
  return [
    `A股 ${date} 市场情绪 大盘 上涨 下跌 原因`,
    `A股 ${date} 政策 证监会 央行 财政部 发改委 市场影响`,
    `A股 ${date} 热门板块 题材 行业 涨幅`,
    `上证指数 沪深300 创业板指 ${date} 成交额 情绪`,
  ];
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/finance/tushare/market-sentiment-news.ts
git commit -m "feat: add market sentiment news queries"
```

## Task 5: Add Market Sentiment Collector and Tool

**Files:**

- Create: `src/tools/finance/tushare/market-sentiment.ts`
- Create: `src/tools/finance/tushare/market-sentiment.test.ts`

- [ ] **Step 1: Write failing collector tests**

Create `market-sentiment.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test src/tools/finance/tushare/market-sentiment.test.ts
```

Expected: fail because `market-sentiment.ts` does not exist.

- [ ] **Step 3: Implement collector and tool**

Create `market-sentiment.ts`:

```ts
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
  combineSentimentScores,
} from './market-sentiment-score.js';
import type { MarketSentimentResult, SentimentScoreComponent, UnavailableData } from './market-sentiment-types.js';

export const MARKET_SENTIMENT_DESCRIPTION = `
Analyze China A-share market sentiment with Tushare structured market data.

Use for broad market sentiment questions about A-shares, market breadth, index moves,
limit-up/down pressure, sector heat, and money-flow context. This is a market-level
tool, not a single-stock valuation tool.

Pair with web_search for current Chinese news, policy headlines, and market narrative.
The tool returns stable news query suggestions in news_queries.
`.trim();

const schema = z.object({
  trade_date: z.string().optional().describe('Trade date in YYYYMMDD. Defaults to latest available rows when omitted.'),
});

export interface MarketSentimentInput {
  trade_date?: string;
}

export async function collectMarketSentiment(
  input: MarketSentimentInput,
  client: TushareClient,
): Promise<MarketSentimentResult> {
  const tradeDate = input.trade_date ?? new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const unavailable: UnavailableData[] = [];
  const usedApis: string[] = [];

  const indices = await callOptional(client, 'index_daily', {
    trade_date: tradeDate,
    ts_code: '000001.SH,000300.SH,399006.SZ',
  }, ['ts_code', 'trade_date', 'close', 'pct_chg', 'vol', 'amount'], unavailable);
  usedApis.push('index_daily');

  const daily = await callOptional(client, 'daily', {
    trade_date: tradeDate,
  }, ['ts_code', 'trade_date', 'close', 'pct_chg', 'vol', 'amount'], unavailable);
  usedApis.push('daily');

  const dailyBasic = await callOptional(client, 'daily_basic', {
    trade_date: tradeDate,
  }, ['ts_code', 'trade_date', 'turnover_rate', 'volume_ratio', 'total_mv', 'circ_mv'], unavailable);
  usedApis.push('daily_basic');

  const limitList = await callOptional(client, 'limit_list_d', {
    trade_date: tradeDate,
  }, ['ts_code', 'trade_date', 'name', 'close', 'pct_chg', 'limit', 'amount'], unavailable);
  usedApis.push('limit_list_d');

  const moneyflow = await callOptional(client, 'moneyflow', {
    trade_date: tradeDate,
  }, ['ts_code', 'trade_date', 'net_mf_amount'], unavailable);
  usedApis.push('moneyflow');

  const sectors = await callOptional(client, 'ths_daily', {
    trade_date: tradeDate,
  }, ['ts_code', 'trade_date', 'name', 'pct_change', 'pct_chg', 'amount'], unavailable);
  usedApis.push('ths_daily');

  const components = buildComponents({ indices, daily, limitList, moneyflow, sectors });
  const combined = combineSentimentScores(components);

  const raw = {
    indices: trimRows(indices, 10),
    daily: trimRows(daily, 20),
    daily_basic: trimRows(dailyBasic, 20),
    limit_list: trimRows(limitList, 20),
    moneyflow: trimRows(moneyflow, 20),
    sectors: trimRows(sectors, 20),
  };

  return {
    status: unavailable.length > 0 ? 'partial' : 'ok',
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
    raw,
    news_queries: buildMarketNewsQueries(tradeDate),
    unavailable_data: unavailable,
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
    calculateSimpleAvailabilityScore('sector', BASE_WEIGHTS.sector, params.sectors, 'Sector rows are available for narrative context.'),
    calculateSimpleAvailabilityScore('money_flow', BASE_WEIGHTS.money_flow, params.moneyflow, 'Money-flow rows are available for narrative context.'),
    { name: 'news', score: 0, weight: BASE_WEIGHTS.news, available: false, rationale: 'Call web_search with news_queries for current news sentiment.' },
  ];
}

function calculateSimpleAvailabilityScore(
  name: 'sector' | 'money_flow',
  weight: number,
  rows: TushareRow[],
  rationale: string,
): SentimentScoreComponent {
  if (rows.length === 0) {
    return { name, score: 0, weight, available: false, rationale: `${name} data unavailable.` };
  }
  return { name, score: 0, weight, available: true, rationale };
}

async function callOptional(
  client: TushareClient,
  apiName: TushareApiName,
  params: Record<string, unknown>,
  fields: string[],
  unavailable: UnavailableData[],
): Promise<TushareRow[]> {
  try {
    return await client.call(apiName, params, fields);
  } catch (error) {
    if (error instanceof TusharePermissionError) {
      unavailable.push({ api: apiName, reason: 'permission_denied', message: error.message });
      return [];
    }
    unavailable.push({
      api: apiName,
      reason: 'error',
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
    schema,
    func: async (input) => {
      if (!token) {
        throw new Error('TUSHARE_TOKEN is required for market_sentiment_analysis');
      }
      const client = new HttpTushareClient(token);
      return formatToolResult(await collectMarketSentiment(input, client), []);
    },
  });
}
```

- [ ] **Step 4: Run collector tests**

Run:

```bash
bun test src/tools/finance/tushare/market-sentiment.test.ts
```

Expected: pass.

- [ ] **Step 5: Run score and collector tests together**

Run:

```bash
bun test src/tools/finance/tushare/market-sentiment-score.test.ts src/tools/finance/tushare/market-sentiment.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/finance/tushare/market-sentiment.ts src/tools/finance/tushare/market-sentiment.test.ts src/tools/finance/tushare/market-sentiment-news.ts src/tools/finance/tushare/market-sentiment-types.ts
git commit -m "feat: add china market sentiment tool"
```

## Task 6: Export and Register the Tool

**Files:**

- Modify: `src/tools/finance/tushare/index.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/tools/registry.tushare.test.ts`

- [ ] **Step 1: Export the tool**

Update `src/tools/finance/tushare/index.ts`:

```ts
export { createAShareAnalysis, A_SHARE_ANALYSIS_DESCRIPTION } from './a-share-analysis.js';
export { createMarketSentimentAnalysis, MARKET_SENTIMENT_DESCRIPTION } from './market-sentiment.js';
```

- [ ] **Step 2: Import the tool in registry**

In `src/tools/registry.ts`, change the Tushare import to:

```ts
import {
  A_SHARE_ANALYSIS_DESCRIPTION,
  createAShareAnalysis,
  createMarketSentimentAnalysis,
  MARKET_SENTIMENT_DESCRIPTION,
} from './finance/tushare/index.js';
```

- [ ] **Step 3: Register beside `a_share_analysis`**

Inside the existing `if (process.env.TUSHARE_TOKEN)` block, after `a_share_analysis`, add:

```ts
    tools.push({
      name: 'market_sentiment_analysis',
      tool: createMarketSentimentAnalysis(),
      description: MARKET_SENTIMENT_DESCRIPTION,
      compactDescription: 'China A-share broad market sentiment via Tushare market data. Scores index moves, breadth, limit pressure, sectors, and optional money flow; pair with web_search for current Chinese news.',
      concurrencySafe: true,
    });
```

- [ ] **Step 4: Add registry tests**

In `src/tools/registry.tushare.test.ts`, add:

```ts
  test('registers market_sentiment_analysis only when TUSHARE_TOKEN exists', () => {
    delete process.env.TUSHARE_TOKEN;
    expect(getToolRegistry('gpt-5.5').some((tool) => tool.name === 'market_sentiment_analysis')).toBe(false);

    process.env.TUSHARE_TOKEN = 'test-token';
    expect(getToolRegistry('gpt-5.5').some((tool) => tool.name === 'market_sentiment_analysis')).toBe(true);
  });
```

- [ ] **Step 5: Run registry tests**

Run:

```bash
bun test src/tools/registry.tushare.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/finance/tushare/index.ts src/tools/registry.ts src/tools/registry.tushare.test.ts
git commit -m "feat: register china market sentiment tool"
```

## Task 7: Update Harness Context

**Files:**

- Modify: `.harness/context/market-data-sources.md`
- Optional modify: `env.example`

- [ ] **Step 1: Update source split**

In `.harness/context/market-data-sources.md`, update the source split to include:

```md
- China A-share single-stock structured data: Tushare-backed `a_share_analysis`, enabled only when `TUSHARE_TOKEN` is set.
- China A-share broad market sentiment: Tushare-backed `market_sentiment_analysis`, enabled only when `TUSHARE_TOKEN` is set.
```

- [ ] **Step 2: Add market sentiment guidance**

Add:

```md
## China Market Sentiment Guidance

Use `market_sentiment_analysis` for broad A-share market mood, market breadth, index moves, limit-up/down pressure, sector heat, and optional money-flow context. Pair it with `web_search` for current Chinese news and policy narrative.

Do not route single-stock valuation or financial-statement questions through `market_sentiment_analysis`; keep those on `a_share_analysis`.

The sentiment tool returns deterministic component scores plus missing-data notes. If Tushare permissions block money-flow or sector APIs, report the partial-data limitation instead of failing the whole answer.
```

- [ ] **Step 3: Check env docs**

If `env.example` already lists `TUSHARE_TOKEN`, no env change is required. If adding a comment, use:

```env
# Enables A-share single-stock analysis and broad China market sentiment analysis.
TUSHARE_TOKEN=your-tushare-token
```

- [ ] **Step 4: Run docs sanity readback**

Run:

```bash
rg -n "market_sentiment_analysis|China Market Sentiment|TUSHARE_TOKEN" .harness/context/market-data-sources.md env.example
```

Expected: shows the new guidance and existing token entry.

- [ ] **Step 5: Commit**

```bash
git add .harness/context/market-data-sources.md env.example
git commit -m "docs: document china market sentiment tool"
```

If `env.example` was unchanged, omit it from `git add`.

## Task 8: Add Tool Usage Example and Manual Smoke Prompt

**Files:**

- Optional create: `.harness/runs/2026-07-05-market-sentiment-smoke.md`

Only create the run note if actual smoke verification is performed with real credentials. Do not create a fake run note.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test src/tools/finance/tushare/market-sentiment-score.test.ts src/tools/finance/tushare/market-sentiment.test.ts src/tools/registry.tushare.test.ts
```

Expected: pass.

- [ ] **Step 2: Run broader finance-adjacent tests**

Run:

```bash
bun test src/tools/finance/tushare/a-share-analysis.test.ts src/tools/finance/tushare/client.test.ts src/tools/registry.tushare.test.ts
```

Expected: pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Optional live smoke**

Only run if `.env` has a valid `TUSHARE_TOKEN`.

Prompt in CLI:

```text
请用 market_sentiment_analysis 分析今天 A 股市场情绪，并结合 web_search 给出政策和新闻叙事。
```

Expected behavior:

- Agent calls `market_sentiment_analysis`.
- If web-search key exists, agent also calls `web_search` using the provided `news_queries`.
- Final answer states data recency, score components, missing Tushare permissions if any, and next-day watch items.

- [ ] **Step 6: Optional run note**

If live smoke ran and produced useful diagnostics, create `.harness/runs/2026-07-05-market-sentiment-smoke.md` with:

```md
# Market Sentiment Smoke Run

- Date:
- Command or prompt:
- Environment keys present: TUSHARE_TOKEN yes/no, web_search key yes/no
- Result:
- Missing APIs:
- Follow-up:
```

Do not include real tokens or private data.

## Task 9: Final Verification and Integration Commit

**Files:**

- All touched files.

- [ ] **Step 1: Check worktree**

Run:

```bash
git status --short
```

Expected: only intended files are modified or staged.

- [ ] **Step 2: Run required verification**

Run:

```bash
bun test src/tools/finance/tushare/market-sentiment-score.test.ts src/tools/finance/tushare/market-sentiment.test.ts src/tools/finance/tushare/a-share-analysis.test.ts src/tools/finance/tushare/client.test.ts src/tools/registry.tushare.test.ts
bun run typecheck
git diff --check
```

Expected:

- All Bun tests pass.
- Typecheck passes.
- `git diff --check` emits no output.

- [ ] **Step 3: Final commit**

If previous task commits were not made individually, make one final commit:

```bash
git add src/tools/finance/tushare/client.ts src/tools/finance/tushare/index.ts src/tools/finance/tushare/market-sentiment-types.ts src/tools/finance/tushare/market-sentiment-score.ts src/tools/finance/tushare/market-sentiment-news.ts src/tools/finance/tushare/market-sentiment.ts src/tools/finance/tushare/market-sentiment-score.test.ts src/tools/finance/tushare/market-sentiment.test.ts src/tools/registry.ts src/tools/registry.tushare.test.ts .harness/context/market-data-sources.md
git commit -m "feat: add china market sentiment analysis"
```

If commits were made per task, skip this step and report the commit list.

## Expected User-Facing Behavior

When the user asks:

```text
分析一下今天中国 A 股市场情绪
```

The agent should:

1. Call `market_sentiment_analysis` if `TUSHARE_TOKEN` is configured.
2. Use the returned score components and missing-data notes.
3. Optionally call `web_search` using `news_queries` when a search provider key exists.
4. Produce a concise report:

```text
今日 A 股市场情绪：乐观 / 中性 / 悲观

总分：NN / 100

主要支撑：
- ...

主要压制：
- ...

热门行业/主题：
- ...

数据限制：
- moneyflow 权限不可用，资金流分数未纳入。

明日关注：
- ...
```

If `TUSHARE_TOKEN` is missing, the tool should not be registered. The agent should fall back to `web_search` and clearly state that it is using news/media narrative rather than structured market breadth data.

## Risk Notes

- Tushare API names and permissions may differ by account. Preserve partial-data behavior for permission failures.
- `index_daily` with comma-separated `ts_code` may not be accepted by Tushare. If live verification fails, call `index_daily` separately for `000001.SH`, `000300.SH`, and `399006.SZ`.
- `ths_daily` may require specific index codes. If unavailable, mark sector score unavailable in the first version rather than blocking delivery.
- News scoring is intentionally not included inside the Tushare tool in the first version. This avoids coupling finance tools to search-provider registration.
- Do not store daily sentiment records in long-term memory automatically in the first version. Use cron prompts or explicit user requests for persistence.

## Self-Review

- Spec coverage: The plan covers Tushare collection, deterministic scoring, optional Tavily/web-search pairing, registry integration, tests, docs, and verification.
- Placeholder scan: No unresolved implementation placeholders are required for first delivery. Optional live smoke and optional run notes are explicitly conditional.
- Type consistency: Tool name is consistently `market_sentiment_analysis`; collector is `collectMarketSentiment`; factory is `createMarketSentimentAnalysis`; description export is `MARKET_SENTIMENT_DESCRIPTION`.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-07-05-china-market-sentiment-analysis.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in one session using executing-plans, batch execution with checkpoints.

For the next session, start by reading `AGENTS.md`, `.harness/README.md`, `.harness/context/market-data-sources.md`, `.harness/context/tools-skills-and-subagents.md`, and this plan.
