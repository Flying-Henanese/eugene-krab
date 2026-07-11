# A-Share Technical Analysis Implementation Plan

> **Handoff purpose:** This document is intended to be sufficient context for a fresh implementation session. Execute the tasks in order, keep the deterministic calculation core independent from the LLM, and verify each layer before exposing it to agents.

**Goal:** Add a reusable A-share and China-index technical-analysis capability based on Tushare historical OHLC data and local TypeScript calculations, then expose the same capability through a prompt-visible tool, a Feishu-usable skill workflow, a dedicated subagent type, and direct main-agent tool selection.

**Architecture:** Implement the formulas once as provider-neutral pure TypeScript modules. Add a thin Tushare collection/normalization layer and one `technical_analysis` `DynamicStructuredTool`. The skill, subagent, and main agent must all reuse that tool; they must not independently recalculate indicators or duplicate Tushare access.

**Tech stack:** Bun, TypeScript ESM strict mode, LangChain `DynamicStructuredTool`, Zod, the existing `HttpTushareClient`, existing A-share resolver, and Bun's test runner. Do not add Python, AKShare, a technical-indicator dependency, a database, or a new LLM call in the first version.

---

## 1. Product Scope

### In scope

- Analyze one China A-share or one supported China stock index at a time.
- Fetch historical daily market data from Tushare.
- Apply forward adjustment to stock OHLC using Tushare adjustment factors.
- Derive weekly candles locally from adjusted daily candles.
- Calculate MA5/10/20/30/60, BOLL(20, 2), and KDJ(9, 3, 3) locally.
- Reproduce the supplied daily and weekly raw signal rules.
- Return a compact structured result describing recent trend, volatility, indicator state, and recent signals.
- Expose the capability through:
  1. a `technical-analysis` skill usable from Feishu and other channels;
  2. a dedicated `technical-analysis` subagent type for isolated single-stock analysis;
  3. direct main-agent access to the `technical_analysis` tool for explicit technical-analysis, recent-index-trend, and price-volatility requests.
- Treat Tushare permission failures as recoverable structured results where possible.
- Include data dates, adjustment mode, calculation parameters, and limitations in output.

### Out of scope for v1

- Intraday/minute bars, ticks, Level-2, order books, or real-time subscriptions.
- Trade execution, position management, portfolio accounting, stop orders, or broker integration.
- Scheduled stock scans or automatic alerts.
- Full-market screening across all A-shares.
- Persistent historical-price database or caching beyond a small optional in-process cache.
- Backtest performance statistics such as CAGR, Sharpe ratio, win rate, drawdown, or transaction costs.
- Replacing `a_share_analysis`, `market_sentiment_analysis`, or existing US/global finance tools.
- Treating technical signals as investment advice.

### Core design decision

The deterministic tool is the source of truth:

```text
Tushare daily data
        +
Tushare adjustment factors (stocks only)
        ↓
Normalized ascending daily Candle[]
        ↓
Pure TypeScript indicators and signals
        ↓
Locally aggregated weekly Candle[]
        ↓
Pure TypeScript weekly indicators/signals
        ↓
technical_analysis tool result
        ├── direct main-agent use
        ├── technical-analysis skill workflow
        └── technical-analysis subagent
```

Do not implement separate indicator logic inside `SKILL.md`, a subagent prompt, or the main-agent prompt.

---

## 2. Current Repository Context

Read these before implementation:

- `AGENTS.md`
- `.harness/README.md`
- `.harness/context/market-data-sources.md`
- `.harness/context/tools-skills-and-subagents.md`
- `.harness/checklists/code-change.md`
- `.harness/checklists/verification.md`
- `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md`

Relevant current source paths:

- Tushare HTTP client: `src/tools/finance/tushare/client.ts`
- A-share ticker/name resolution: `src/tools/finance/tushare/resolve.ts`
- Existing A-share structured tool: `src/tools/finance/tushare/a-share-analysis.ts`
- Existing broad-market tool: `src/tools/finance/tushare/market-sentiment.ts`
- Tushare public exports: `src/tools/finance/tushare/index.ts`
- Prompt-visible tool registry: `src/tools/registry.ts`
- Skill discovery: `src/skills/registry.ts`
- Skill invocation: `src/tools/skill.ts`
- Subagent types and tool allowlists: `src/tools/subagent/types.ts`
- Subagent runtime: `src/tools/subagent/spawn-subagent.ts`

Current architectural facts to preserve:

- Tushare tools are registered only when `TUSHARE_TOKEN` exists.
- `2002`, `40203`, and permission-style messages are recoverable Tushare permission errors.
- Skills are repository-local `src/skills/<name>/SKILL.md` workflows. This repository's loader currently reads only `SKILL.md`; do not add Codex-specific `agents/openai.yaml` unless the repository skill runtime is deliberately extended in a separate change.
- Subagents run in isolated `Agent` instances with a fixed tool allowlist and cannot spawn additional subagents.
- Main-agent tool choice is model-driven from prompt-visible descriptions; there is no gateway `if` statement that should route technical-analysis phrases directly.
- Feishu does not need a separate implementation path. It sends the message through the normal gateway agent, which can invoke skills, tools, and subagents.

---

## 3. Data Ownership: Tushare vs Local Calculation

### 3.1 Data fetched from Tushare

#### Required for A-share stocks

1. `stock_basic` — reuse the existing resolver when the user supplies a Chinese stock name or an ambiguous code.

Required fields already covered by the resolver:

```text
ts_code, symbol, name, area, industry, market, list_date
```

2. `daily` — fetch unadjusted historical daily OHLCV.

Required fields:

```text
ts_code, trade_date, open, high, low, close, pre_close, vol, amount
```

3. `adj_factor` — fetch daily stock adjustment factors for the same date range.

Required fields:

```text
ts_code, trade_date, adj_factor
```

#### Required for stock indices

4. `index_daily` — fetch historical daily index OHLCV. Indices do not use stock adjustment factors.

Required fields:

```text
ts_code, trade_date, open, high, low, close, pre_close, vol, amount
```

Support a small local alias map in v1 for common indices:

```text
上证指数 / 上证综指 -> 000001.SH
深证成指            -> 399001.SZ
创业板指            -> 399006.SZ
沪深300             -> 000300.SH
中证500             -> 000905.SH
科创50              -> 000688.SH
```

Also accept explicit Tushare index codes. Do not add `index_basic` in v1 unless tests demonstrate that arbitrary index-name resolution is required.

#### Optional operational support

5. `trade_cal` — optional for resolving the latest completed trading day. The first version may instead use the latest returned `trade_date`, but `trade_cal` is useful when `as_of_date` falls on a weekend or holiday.

6. `weekly` — optional verification only. Do not make production calculation depend on it. Compare locally aggregated completed weeks against this endpoint in a manual smoke test when permission is available.

### 3.2 Calculated locally in TypeScript

All of the following must be local and deterministic:

- joining `daily` rows with `adj_factor` rows;
- forward-adjusted stock OHLC;
- ascending chronological ordering;
- daily-to-weekly candle aggregation;
- MA5, MA10, MA20, MA30, MA60;
- rolling mean and rolling standard deviation;
- BOLL middle, upper, and lower bands;
- RSV, K, D, and J;
- cross detection;
- `REF`, `EXIST`, and `FILTER` equivalents used by the supplied formula;
- raw daily and weekly signal evaluation;
- position-aware event interpretation, if enabled;
- recent return, price range, drawdown, and realized-volatility summaries;
- compact trend/volatility labels derived from explicit deterministic thresholds.

### 3.3 Interfaces intentionally not required

The implementation must not depend on:

- `stk_weekly_monthly` — derive weekly/monthly candles from daily candles;
- `stk_week_month_adj` — adjust daily candles first, then aggregate locally;
- `stk_factor` — calculate indicators locally to preserve formula semantics;
- `daily_basic` — PE/PB/turnover/market-cap fields are not required for this technical strategy;
- `rt_min_daily` — the supplied strategy uses daily and weekly periods, not intraday bars.

### 3.4 Verified permission baseline

At planning time, the configured Tushare account successfully returned data for:

- `daily`
- `adj_factor`
- `weekly`

It returned `40203` for:

- `stk_weekly_monthly`
- `stk_week_month_adj`
- `stk_factor`

The design deliberately avoids depending on the unavailable interfaces.

---

## 4. Data Range, Ordering, and Adjustment Rules

### History window

Default to requesting approximately 450 calendar days ending at `as_of_date`. After normalization, require:

- at least 120 daily trading candles;
- at least 20 completed or partial weekly candles.

Why:

- MA60 needs 60 daily points;
- weekly BOLL(20) needs roughly 20 weeks, or about 100 trading days;
- extra history reduces initialization artifacts in recursive KDJ values;
- recent-signal lookback and validation need additional headroom.

Permit an optional `lookback_days` input, but clamp it to a safe range such as 120–1,000 calendar days. The tool should return `insufficient_data` rather than calculating misleading indicators from too little history.

### Ordering

Tushare commonly returns newest rows first. Normalize once at the provider boundary:

```ts
candles.sort((a, b) => a.date.localeCompare(b.date));
```

Every indicator and signal function must require ascending input. Add a guard that rejects duplicate or non-monotonic dates after normalization.

### Forward adjustment

For stocks, make `qfq` the default. Use the adjustment factor from the latest available candle in the requested window as the anchor:

```ts
adjustmentRatio = row.adjFactor / latestAdjFactor;

openQfq  = row.open  * adjustmentRatio;
highQfq  = row.high  * adjustmentRatio;
lowQfq   = row.low   * adjustmentRatio;
closeQfq = row.close * adjustmentRatio;
```

Keep `volume` and `amount` unchanged unless a separately documented volume-adjustment requirement is introduced. The supplied formula does not use volume.

Do not silently mix adjusted and unadjusted candles. If `adjustment: "qfq"` is requested and factors are absent for material rows, return `partial` or `insufficient_data` with a clear warning. Allow `adjustment: "none"` explicitly for diagnostics.

### Joining adjustment factors

- Join by `trade_date`.
- Exact-date matching is expected for normal daily rows.
- If an individual factor row is missing, carry forward the most recent earlier factor only when that behavior is covered by a unit test and surfaced in metadata.
- Never substitute `1` silently.

### Weekly aggregation

Group adjusted daily candles by China-market trading week (Monday through Friday):

```text
open   = first trading day's open
high   = maximum high
low    = minimum low
close  = last trading day's close
volume = sum(volume)
amount = sum(amount)
```

Mark the latest weekly candle as `partial: true` when the week has not completed. Include partial weeks in current-state analysis because the supplied chart formula can be viewed during the week, but make the status explicit. For strict backtests, support `completed_weeks_only: true`.

---

## 5. Indicator Semantics

### Shared types

```ts
export interface Candle {
  symbol: string;
  date: string; // YYYYMMDD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  adjustment: 'none' | 'qfq';
  partial?: boolean;
}

export interface BollingerPoint {
  middle: number | null;
  upper: number | null;
  lower: number | null;
  stddev: number | null;
}

export interface KdjPoint {
  rsv: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
}
```

Represent unavailable warm-up values as `null`, not `0` or `NaN`.

### Moving averages

Calculate simple moving averages over close:

```text
MA5, MA10, MA20, MA30, MA60
```

Emit `null` until a full window is available.

### Bollinger Bands

Parameters:

```text
N = 20
M = 2
middle = MA(close, 20)
upper  = middle + 2 * STD(close, 20)
lower  = middle - 2 * STD(close, 20)
```

Compatibility decision to verify before freezing fixtures:

- The original formula uses TongdaXin-style `STD`, which is commonly treated as sample/estimated standard deviation, while some libraries use population standard deviation.
- Implement the standard-deviation denominator as an explicit option (`sample` vs `population`) rather than hiding the choice.
- Default to the TongdaXin-compatible interpretation established by a golden fixture.
- Add a fixture from the original charting platform or a manually verified short series before claiming exact formula parity.

Do not import a generic technical-analysis library merely to calculate these operations; explicit local code makes the semantics testable.

### KDJ

```text
RSV = (close - LLV(low, 9)) / (HHV(high, 9) - LLV(low, 9)) * 100
K   = SMA(RSV, 3, 1)
D   = SMA(K, 3, 1)
J   = 3*K - 2*D
```

TongdaXin `SMA(X, N, M)` is recursive, not a normal simple moving average:

```ts
next = (M * current + (N - M) * previous) / N;
```

For `(N=3, M=1)`:

```ts
next = (current + 2 * previous) / 3;
```

Initialization must be explicit. Start with the conventional K/D seed of 50 unless a golden fixture proves the original platform initializes differently. When `HHV === LLV`, reuse the prior RSV/KDJ state instead of dividing by zero; cover this with a flat-price unit test.

### Numeric handling

- Calculate internally at full JavaScript number precision.
- Use a small epsilon only for comparisons affected by floating-point noise.
- Round only in the final serialized display fields, not during indicator recursion.
- Reject non-finite OHLC values.

---

## 6. Signal Semantics

Preserve two separate concepts:

1. **Raw formula signals** — reproduce what the supplied chart formula marks.
2. **Position-aware events** — optional state-machine interpretation for one buy followed by one sell.

This separation avoids silently changing the friend's formula while fixing the fact that `EXIST(BUYNEW, 10)` is not a true holding-state test.

### Daily raw signals

```text
BUY_NEW:
  CROSS(J, K) AND K > D AND J < 20

SELL_J_TURN_ABOVE_80 (COND2):
  previous J > 80
  current J < previous J
  previous J > J two bars ago

SELL_TOUCH_UPPER (COND3):
  current high >= current BOLL upper

SELL_J_CROSS_100:
  CROSS(J, 100)

SELL_POST_BUY_TURN:
  current J < previous J
  previous J > J two bars ago
  previous J < 80
  a BUY_NEW exists in the current/previous 10 daily bars
```

Define `CROSS(A, B)` as:

```text
previous A <= previous B AND current A > current B
```

For `CROSS(J, 100)`, treat `B` as the constant series `100`.

Implement `FILTER(signal, 1)` as an explicit cooldown helper and verify its exact TongdaXin behavior with a fixture. Do not assume that it is equivalent to array deduplication without a test.

### Weekly raw signals

```text
WEEKLY_BUY_LOWER:
  weekly low <= weekly BOLL lower

WEEKLY_SELL_UPPER:
  weekly high >= weekly BOLL upper
  apply FILTER(..., 20) semantics
```

Return whether the latest weekly signal is based on a partial or completed week.

### Position-aware events

Add a pure optional state-machine interpreter:

```text
FLAT --BUY_NEW--> HOLDING
HOLDING --first enabled sell signal--> FLAT
```

Rules:

- A sell signal does nothing while `FLAT`.
- Only the first enabled sell after a buy closes the synthetic position.
- A new buy while already `HOLDING` does not create a second position.
- State-machine output is analytical context only; it is not a real user portfolio.
- Preserve raw signals even when the state machine suppresses an event.

The tool should default to returning raw signals plus a position-aware interpretation, clearly labelled. Do not claim that the user actually holds the stock.

---

## 7. Technical Summary Metrics

In addition to the supplied formula, calculate a small set of deterministic summary metrics from the same candles:

- 5-, 20-, and 60-trading-day return;
- distance from MA20 and MA60 as a percentage;
- BOLL bandwidth: `(upper - lower) / middle`;
- 20-day realized volatility based on daily log returns, annualized with `sqrt(252)`;
- 20-day maximum drawdown;
- location inside BOLL: below lower / lower-to-middle / middle-to-upper / above upper;
- MA alignment, for example `MA5 > MA10 > MA20`;
- latest K/D/J values and whether J is below 20, above 80, or above 100;
- latest daily and weekly raw signals;
- recent signals within a configurable default window such as 20 trading days.

Use explicit label rules, for example:

```text
trend:
  bullish  when close > MA20 > MA60 and MA5 > MA10
  bearish  when close < MA20 < MA60 and MA5 < MA10
  mixed    otherwise

volatility:
  expanding when current BOLL bandwidth > its 20-point median by a defined ratio
  contracting when below the median by a defined ratio
  normal otherwise
```

Keep thresholds in a named configuration object and cover label boundaries with tests. Return the underlying numbers so the LLM can explain the label without inventing reasons.

---

## 8. Public Tool Contract

Add one prompt-visible tool:

```text
technical_analysis
```

### Input schema

```ts
const TECHNICAL_ANALYSIS_SCHEMA = z.object({
  query: z.string().describe(
    'A-share or supported China index name/code, optionally embedded in a natural-language technical-analysis request',
  ),
  asset_type: z.enum(['auto', 'stock', 'index']).default('auto'),
  as_of_date: z.string().regex(/^\d{8}$/).optional(),
  adjustment: z.enum(['qfq', 'none']).default('qfq'),
  lookback_days: z.number().int().min(120).max(1000).default(450),
  completed_weeks_only: z.boolean().default(false),
});
```

For an index, ignore `adjustment` and report `adjustment: "not_applicable"`.

### Output shape

```ts
export interface TechnicalAnalysisResult {
  status: 'ok' | 'partial' | 'not_found' | 'ambiguous' | 'insufficient_data';
  asset: {
    type: 'stock' | 'index';
    ts_code: string;
    name: string;
  };
  as_of_date: string;
  data_range: {
    start: string;
    end: string;
    daily_count: number;
    weekly_count: number;
    latest_week_partial: boolean;
  };
  methodology: {
    provider: 'Tushare';
    apis: string[];
    adjustment: 'qfq' | 'none' | 'not_applicable';
    boll: { period: 20; multiplier: 2; stddev: 'sample' | 'population' };
    kdj: { period: 9; smooth_k: 3; smooth_d: 3; initial: number };
  };
  latest: {
    candle: Candle;
    ma: Record<'ma5' | 'ma10' | 'ma20' | 'ma30' | 'ma60', number | null>;
    boll: BollingerPoint;
    kdj: KdjPoint;
  };
  performance: {
    return_5d: number | null;
    return_20d: number | null;
    return_60d: number | null;
    realized_volatility_20d: number | null;
    max_drawdown_20d: number | null;
    boll_bandwidth: number | null;
  };
  interpretation: {
    trend: 'bullish' | 'bearish' | 'mixed' | 'insufficient_data';
    volatility: 'expanding' | 'contracting' | 'normal' | 'insufficient_data';
    momentum: string;
    evidence: string[];
  };
  signals: {
    latest_daily: TechnicalSignal[];
    latest_weekly: TechnicalSignal[];
    recent: TechnicalSignal[];
    position_events: PositionEvent[];
  };
  warnings: string[];
  unavailable_data: Array<{
    api: string;
    reason: 'permission_denied' | 'error' | 'missing_rows';
    message: string;
  }>;
}
```

Keep the output compact. Do not return all 450 raw candles to the LLM. Return only the latest indicator snapshot, bounded recent signals, summary metrics, and source metadata. Pure calculation functions remain independently callable from tests.

### Tool description and direct main-agent triggers

The rich and compact descriptions in `src/tools/registry.ts` must tell the main model to call the tool for:

- “技术面分析”;
- “最近走势/趋势” for an A-share or supported China index;
- “价格波动/波动率”;
- MA/BOLL/KDJ questions;
- recent buy/sell formula signals;
- A-share or China-index chart-condition questions.

It must tell the model not to use the tool for:

- valuation, revenue, profit, cash flow, or balance-sheet questions alone;
- US/global equities in v1;
- current news or policy narrative;
- real-time/minute-level requests;
- actual trade execution.

Recommended direct routing behavior:

```text
Explicit, narrow technical request
  -> main agent calls technical_analysis directly

Broad single-stock investment analysis
  -> main agent may spawn technical-analysis subagent in parallel with
     fundamental/news analysis, then synthesize

User explicitly asks for a reusable technical workflow or detailed multi-step report
  -> invoke technical-analysis skill, then follow its instructions
```

No hardcoded phrase router is needed in `src/gateway/**` or `src/agent/agent.ts` for v1. Tool/skill/subagent descriptions are the intended routing mechanism.

---

## 9. Skill Surface for Feishu

Create:

```text
src/skills/technical-analysis/SKILL.md
```

Suggested frontmatter:

```yaml
---
name: technical-analysis
description: Performs deterministic technical analysis for China A-shares and supported China stock indices using Tushare daily prices plus locally calculated MA, BOLL, KDJ, trend, volatility, and recent signal rules. Use for Chinese requests about 技术面分析、近期走势、均线、布林带、KDJ、价格波动、超买超卖、买卖信号, including requests received through Feishu.
---
```

Keep the skill concise. It should instruct the main agent to:

1. Extract or resolve the stock/index from the request.
2. Call `technical_analysis` first for deterministic data.
3. If the user asks for a broad company analysis, optionally call `a_share_analysis` for fundamentals.
4. If recent events or policy explanations are requested, separately call `web_search`; never infer news causes from price alone.
5. If broad A-share market mood is requested, optionally call `market_sentiment_analysis` in addition to index technical analysis.
6. State the data end date, adjustment mode, and whether the latest weekly candle is partial.
7. Explain indicators using returned numeric evidence.
8. Separate observed signals from interpretation.
9. Include a concise “not investment advice / signals can fail” caveat without overwhelming the answer.
10. Format the result for Feishu-friendly reading: short sections, compact tables only when helpful, and no giant raw JSON dump.

The skill must not contain indicator implementations or copied historical data. It is an orchestration workflow, not the calculation engine.

Skill tests should verify metadata discovery and that its instructions name `technical_analysis` and the source/recency requirements.

---

## 10. Dedicated Subagent Surface

Add a new subagent type in `src/tools/subagent/types.ts`:

```text
technical-analysis
```

Suggested configuration:

```ts
'technical-analysis': {
  whenToUse:
    'Isolated technical analysis of one China A-share or supported China index, especially when a broader company report needs a separate technical-analysis lane.',
  systemPrompt: `${WORKER_PREAMBLE}\n\nYou are a technical-analysis worker...`,
  tools: [
    'technical_analysis',
    'a_share_analysis',
    'market_sentiment_analysis',
    'web_search',
    'web_fetch',
  ],
  maxIterations: 6,
}
```

Worker prompt requirements:

- Start with `technical_analysis` for price/indicator evidence.
- Do not calculate indicators mentally from prose or raw snippets.
- Use `a_share_analysis` only when the parent task asks for fundamental context.
- Use `market_sentiment_analysis` for broad market context, not as a substitute for the target asset's technical analysis.
- Use `web_search` only for explicitly requested recent-event context.
- State data recency and partial-week status.
- Return a self-contained result because the subagent cannot see the parent conversation.
- Avoid personalized buy/sell instructions and distinguish raw signals from actual positions.

Also add `technical_analysis` to the read-only tool lists for `general-purpose` and existing `analysis` subagents so they can reuse it when appropriate. The dedicated type improves tool choice and output focus; it does not own a second implementation.

Update subagent tests to cover:

- type name discovery;
- tool allowlist resolution;
- `technical_analysis` availability in the dedicated and general financial-analysis configurations;
- continued removal of `spawn_subagent` and `ask_user_question` from child allowlists.

---

## 11. Proposed File Structure

### Create

```text
src/tools/finance/technical-analysis/types.ts
src/tools/finance/technical-analysis/math.ts
src/tools/finance/technical-analysis/adjustment.ts
src/tools/finance/technical-analysis/aggregate.ts
src/tools/finance/technical-analysis/indicators.ts
src/tools/finance/technical-analysis/signals.ts
src/tools/finance/technical-analysis/position-state.ts
src/tools/finance/technical-analysis/summary.ts
src/tools/finance/technical-analysis/provider.ts
src/tools/finance/technical-analysis/technical-analysis.ts
src/tools/finance/technical-analysis/index.ts

src/tools/finance/technical-analysis/math.test.ts
src/tools/finance/technical-analysis/adjustment.test.ts
src/tools/finance/technical-analysis/aggregate.test.ts
src/tools/finance/technical-analysis/indicators.test.ts
src/tools/finance/technical-analysis/signals.test.ts
src/tools/finance/technical-analysis/position-state.test.ts
src/tools/finance/technical-analysis/summary.test.ts
src/tools/finance/technical-analysis/technical-analysis.test.ts

src/skills/technical-analysis/SKILL.md
```

If this feels too fragmented during implementation, combine small pure modules while preserving boundaries. Do not create one oversized file containing network calls, indicator math, signal state, tool schema, and formatting.

### Modify

```text
src/tools/finance/tushare/client.ts
src/tools/finance/tushare/index.ts              # only if shared exports are useful
src/tools/registry.ts
src/tools/registry.tushare.test.ts
src/tools/subagent/types.ts
src/tools/subagent/*.test.ts                    # whichever current tests cover types/model policy
src/skills/registry.test.ts                     # or existing skill discovery tests
.harness/context/market-data-sources.md
.harness/context/tools-skills-and-subagents.md
```

Potentially modify `src/skills/dexter-help/SKILL.md` so Feishu users can discover the new capability with one or two Chinese examples. Do this only after the core tool and skill are working.

### Do not modify in v1

```text
src/agent/agent.ts
src/model/llm.ts
src/gateway/**
src/tools/finance/get-financials.ts
src/tools/finance/get-market-data.ts
```

No new environment variable is required; reuse `TUSHARE_TOKEN`.

---

## 12. Implementation Tasks

## Task 1: Add technical-analysis domain types and numeric helpers

**Files:**

- Create `src/tools/finance/technical-analysis/types.ts`
- Create `src/tools/finance/technical-analysis/math.ts`
- Create `src/tools/finance/technical-analysis/math.test.ts`

- [ ] Define `Candle`, indicator point, signal, position-event, summary, and tool-result types.
- [ ] Add finite-number parsing helpers for `TushareRow` values.
- [ ] Add `mean`, rolling-window, sample/population standard deviation, min/max, percentage-return, log-return, and clamp helpers.
- [ ] Return `null` for warm-up results; never leak `NaN` or `Infinity`.
- [ ] Test empty arrays, one-point windows, constant prices, negative/zero edge cases, and both standard-deviation modes.

## Task 2: Extend the Tushare client API union

**Files:**

- Modify `src/tools/finance/tushare/client.ts`
- Modify relevant Tushare client tests

- [ ] Add `adj_factor` and any missing required API names to `TushareApiName`.
- [ ] Keep `daily` and `index_daily` support.
- [ ] Add `weekly` only for optional verification if used by code/tests.
- [ ] Do not add the unavailable `stk_*` APIs as production dependencies.
- [ ] Preserve existing permission-error normalization for `2002`, `40203`, and permission-style messages.

## Task 3: Normalize and adjust daily market data

**Files:**

- Create `src/tools/finance/technical-analysis/adjustment.ts`
- Create `src/tools/finance/technical-analysis/adjustment.test.ts`

- [ ] Convert raw `daily`/`index_daily` rows into typed candles.
- [ ] Sort ascending and reject duplicate dates.
- [ ] Join stock rows with `adj_factor` by date.
- [ ] Generate qfq OHLC using the latest factor anchor.
- [ ] Keep index candles unadjusted and mark adjustment not applicable.
- [ ] Test a corporate-action factor change and confirm adjusted historical price continuity.
- [ ] Test missing factors and ensure the result is explicit rather than silently unadjusted.

## Task 4: Aggregate daily candles into weekly candles

**Files:**

- Create `src/tools/finance/technical-analysis/aggregate.ts`
- Create `src/tools/finance/technical-analysis/aggregate.test.ts`

- [ ] Group by Monday–Friday China-market week.
- [ ] Calculate weekly open/high/low/close/volume/amount.
- [ ] Handle holiday-shortened weeks.
- [ ] Mark the latest incomplete week as partial.
- [ ] Support excluding partial weeks.
- [ ] Test year boundaries, month boundaries, holidays, and a week with only one trading day.

## Task 5: Implement MA, BOLL, and KDJ

**Files:**

- Create `src/tools/finance/technical-analysis/indicators.ts`
- Create `src/tools/finance/technical-analysis/indicators.test.ts`

- [ ] Implement SMA/MA for 5, 10, 20, 30, and 60 periods.
- [ ] Implement BOLL(20, 2) with explicit standard-deviation mode.
- [ ] Implement rolling HHV/LLV for RSV.
- [ ] Implement TongdaXin-style recursive `SMA(X, 3, 1)`.
- [ ] Implement K/D/J with explicit initialization and flat-window handling.
- [ ] Add hand-calculated fixtures for short sequences.
- [ ] Add at least one golden compatibility fixture derived from the original chart platform before declaring exact formula parity.

## Task 6: Implement raw signals and position-state interpretation

**Files:**

- Create `src/tools/finance/technical-analysis/signals.ts`
- Create `src/tools/finance/technical-analysis/position-state.ts`
- Create corresponding tests

- [ ] Implement `cross`, `ref`, `existsWithin`, and `filterCooldown` helpers.
- [ ] Implement all supplied daily raw signals.
- [ ] Implement both supplied weekly raw signals.
- [ ] Preserve the originating candle date and indicator evidence on every signal.
- [ ] Implement a separate flat/holding state interpreter.
- [ ] Test overlapping sell signals, consecutive upper-band touches, buys inside the 10-day window, buys outside the window, and sells while flat.
- [ ] Verify whether the original `EXIST(BUYNEW, 10)` window includes the current bar and pin that behavior in tests.

## Task 7: Build deterministic trend and volatility summaries

**Files:**

- Create `src/tools/finance/technical-analysis/summary.ts`
- Create `src/tools/finance/technical-analysis/summary.test.ts`

- [ ] Calculate 5/20/60-day returns.
- [ ] Calculate BOLL bandwidth, distance from moving averages, annualized 20-day realized volatility, and 20-day maximum drawdown.
- [ ] Implement named/configurable trend, momentum, and volatility labels.
- [ ] Return numeric evidence for each label.
- [ ] Test threshold boundaries and insufficient-history cases.

## Task 8: Build the Tushare provider/collector

**Files:**

- Create `src/tools/finance/technical-analysis/provider.ts`
- Create provider/collector tests using a fake `TushareClient`

- [ ] Reuse `resolveAShareStock` for stock names/codes.
- [ ] Add local common-index alias resolution plus explicit index-code support.
- [ ] Fetch `daily` and `adj_factor` concurrently after stock resolution.
- [ ] Fetch `index_daily` for indices.
- [ ] Request the bounded calendar date range.
- [ ] Preserve API names, date range, and unavailable-data metadata.
- [ ] Return structured `not_found`, `ambiguous`, `permission_denied`, and `insufficient_data` outcomes.
- [ ] Do not expose or log the Tushare token.

## Task 9: Create the `technical_analysis` tool

**Files:**

- Create `src/tools/finance/technical-analysis/technical-analysis.ts`
- Create `src/tools/finance/technical-analysis/index.ts`
- Create `src/tools/finance/technical-analysis/technical-analysis.test.ts`

- [ ] Define the Zod input schema.
- [ ] Compose provider, adjustment, indicators, signals, position interpretation, and summary.
- [ ] Bound output size and recent-signal count.
- [ ] Add a rich tool description with positive and negative trigger guidance.
- [ ] Add source recency, adjustment mode, partial-week state, and method parameters.
- [ ] Ensure the tool produces structured results and does not generate an essay.
- [ ] Test stock, index, ambiguous name, missing token, permission denial, missing adjustment factors, and insufficient history.

## Task 10: Register the tool for direct main-agent use

**Files:**

- Modify `src/tools/registry.ts`
- Modify `src/tools/registry.tushare.test.ts`

- [ ] Register `technical_analysis` only when `TUSHARE_TOKEN` exists.
- [ ] Mark it `concurrencySafe: true` because it is read-only and isolated per call.
- [ ] Add aligned rich and compact descriptions.
- [ ] Verify it appears beside `a_share_analysis` and `market_sentiment_analysis`.
- [ ] Verify it is absent without `TUSHARE_TOKEN`.
- [ ] Avoid changing gateway routing or the agent loop.

## Task 11: Add the Feishu-usable skill

**Files:**

- Create `src/skills/technical-analysis/SKILL.md`
- Modify/add skill discovery tests
- Optionally modify `src/skills/dexter-help/SKILL.md`

- [ ] Use only `name` and `description` in YAML frontmatter, matching the repository loader.
- [ ] Keep the body concise and workflow-oriented.
- [ ] Require `technical_analysis` as the deterministic first step.
- [ ] Document optional `a_share_analysis`, `market_sentiment_analysis`, and `web_search` combinations.
- [ ] Require source date, adjustment, partial-week disclosure, and risk caveat.
- [ ] Add Feishu-friendly Chinese example triggers.
- [ ] Verify the skill is discovered and its full instructions load through the `skill` tool.

## Task 12: Add the dedicated subagent type

**Files:**

- Modify `src/tools/subagent/types.ts`
- Modify relevant subagent tests

- [ ] Add the `technical-analysis` subagent configuration.
- [ ] Add `technical_analysis` to the appropriate existing read-only subagent allowlists.
- [ ] Keep delegation one level deep.
- [ ] Ensure the worker prompt is self-contained and evidence-first.
- [ ] Verify the new type appears in `SUBAGENT_TYPE_NAMES` and therefore in the `spawn_subagent` schema/description.
- [ ] Test a mocked subagent creation path with the resolved tool allowlist.

## Task 13: Update repo-local operating documentation

**Files:**

- Modify `.harness/context/market-data-sources.md`
- Modify `.harness/context/tools-skills-and-subagents.md`
- Optionally add a concise `.harness/workflows/` note only if a distinct repeatable workflow is needed

- [ ] Document that stock technical analysis uses Tushare `daily + adj_factor` and local calculations.
- [ ] Document that index technical analysis uses `index_daily` without adjustment.
- [ ] Document the `technical_analysis` tool, `technical-analysis` skill, and dedicated subagent as three surfaces over one core.
- [ ] Keep original specs as historical rationale; do not rewrite them as current-state documentation.

## Task 14: Verification and manual acceptance

- [ ] Run focused tests under `src/tools/finance/technical-analysis/`.
- [ ] Run Tushare client tests.
- [ ] Run registry/Tushare registration tests.
- [ ] Run skill discovery/loader tests.
- [ ] Run subagent type/model-policy tests.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun test` if focused tests and typecheck pass.
- [ ] Run `git diff --check`.
- [ ] Re-check `git status --short` and preserve unrelated user changes.

Manual smoke tests with a configured `TUSHARE_TOKEN`:

```text
1. “技术面分析一下平安银行最近的走势”
   Expected: resolves 000001.SZ, calls technical_analysis, reports qfq/date/indicators/signals.

2. “沪深300最近20个交易日的趋势和价格波动怎么样？”
   Expected: resolves 000300.SH as index, uses index_daily, no adjustment factor.

3. “从基本面、近期新闻和技术面综合分析稳健医疗，请把技术面交给子代理。”
   Expected: main agent can run a technical-analysis subagent and other independent lanes, then synthesize.

4. Feishu: “用技术分析流程看看贵州茅台的均线、布林带和KDJ。”
   Expected: technical-analysis skill is selected or can be explicitly invoked, then calls the same tool.

5. “查看平安银行1分钟KDJ”
   Expected: clearly states v1 is daily/weekly only; does not pretend real-time minute data was analyzed.
```

For a manual API smoke test, compare:

- locally adjusted daily values against a known qfq source around a corporate-action date;
- locally aggregated completed weekly candles against Tushare `weekly` for open/high/low/close;
- local MA/BOLL/KDJ values against the original formula platform using the same adjustment and date range.

If network credentials or upstream permissions prevent live verification, report that explicitly and do not substitute a mocked test as proof of live correctness.

---

## 13. Testing Matrix

### Unit tests

- Numeric helpers and standard-deviation modes.
- Qfq calculation and factor joins.
- Ascending sorting and duplicate dates.
- Weekly OHLC aggregation and partial-week markers.
- MA warm-up behavior.
- BOLL values on known series.
- KDJ recursion, initialization, and flat prices.
- Every daily/weekly signal independently.
- `FILTER` and `EXIST` boundary semantics.
- Position-aware event suppression.
- Return/volatility/drawdown calculations.
- Trend and volatility label thresholds.

### Collector/tool tests with fake clients

- Explicit stock ticker bypasses `stock_basic` dependency where possible.
- Chinese stock name resolution.
- Common index alias resolution.
- `daily + adj_factor` success.
- `index_daily` success.
- `2002` and `40203` become structured unavailable data.
- Missing factors do not silently produce qfq output.
- Insufficient candles return `insufficient_data`.
- Tool output is bounded and contains no raw token or giant candle arrays.

### Registry/agent-surface tests

- Tool is registered only with `TUSHARE_TOKEN`.
- Rich and compact descriptions mention technical analysis and China asset scope.
- Skill metadata triggers on Chinese technical-analysis phrases.
- Dedicated subagent type resolves the correct allowlist.
- Existing subagent safety exclusions remain effective.

### Golden compatibility tests

Before claiming exact equivalence with the supplied formula, capture a small anonymized fixture containing:

- input adjusted OHLC dates and values;
- expected MA/BOLL/K/D/J values from the original platform;
- expected icon/signal dates.

Store only derived market data needed for testing and document its source/date. Use the fixture to settle:

- `STD` sample vs population semantics;
- K/D initialization;
- zero-range RSV behavior;
- `FILTER(X, N)` suppression boundaries;
- `EXIST(X, 10)` current-bar inclusion.

Until this fixture passes, describe the implementation as “formula-compatible based on documented semantics,” not “bit-for-bit identical to TongdaXin.”

---

## 14. Failure and Degradation Rules

- Missing `TUSHARE_TOKEN`: tool is not registered.
- `stock_basic` permission denied but explicit stock code supplied: continue using normalized explicit code.
- `stock_basic` denied for a Chinese name: return `not_found`/permission guidance; do not guess.
- `daily` denied or empty: return structured unavailable/insufficient result; no web-derived substitute for OHLC.
- `adj_factor` denied while qfq requested: do not silently claim adjusted analysis. Return partial/insufficient result or require explicit `adjustment: none`.
- `index_daily` denied: return structured unavailable result.
- Latest requested date is a non-trading day: use the latest returned candle and report its date.
- Fewer than required daily/weekly candles: return `insufficient_data` with counts.
- Partial current week: calculate it only when allowed and mark every weekly conclusion as partial.
- Web search unavailable: technical analysis still works; omit event explanations.
- Fundamental tools unavailable: technical analysis still works independently.

---

## 15. Security, Compliance, and Communication

- Read `TUSHARE_TOKEN` from the environment only.
- Never log, serialize, or include the token in tool errors.
- Keep all calls read-only.
- Do not imply that formula signals guarantee future returns.
- Do not describe raw formula history as the user's real position or transaction record.
- State that technical analysis is based on historical price data and can produce false signals.
- State the data end date because Tushare `daily` is end-of-day data, not live intraday data.
- Keep web/news causality separate: price movement alone does not prove why a stock moved.

---

## 16. Recommended Commit Sequence

Keep commits reviewable if the implementation session is asked to commit:

1. Pure types, math, adjustment, aggregation, and tests.
2. Indicators, signals, state interpretation, summaries, and tests.
3. Tushare collector plus `technical_analysis` tool and tests.
4. Tool registry and direct main-agent discovery.
5. Skill and dedicated subagent surface.
6. Harness/help updates and final verification.

Do not push or publish without explicit user confirmation.

---

## 17. Definition of Done

The feature is complete only when:

- one stock technical-analysis request succeeds from Tushare `daily + adj_factor` through local indicators to a structured result;
- one supported index request succeeds through `index_daily`;
- weekly signals come from locally aggregated daily data and expose partial-week state;
- the calculation core has no LLM or LangChain dependency;
- `technical_analysis` is registered conditionally and can be selected directly by the main agent;
- `technical-analysis` skill is discoverable and instructs Feishu/main-agent workflow correctly;
- the dedicated technical-analysis subagent can access the tool through its allowlist;
- exact formula-compatibility uncertainties are either settled by golden tests or disclosed;
- focused tests, typecheck, and diff checks pass;
- repo-local harness context reflects the final implemented behavior;
- no existing A-share, market-sentiment, US/global finance, CLI, or gateway behavior regresses.

---

## 18. Fresh-Session Start Prompt

Use this prompt in a new implementation session:

```text
请按照 docs/superpowers/plans/2026-07-11-a-share-technical-analysis.md 实施 A 股和中国股指技术面分析功能。

开始前先阅读 AGENTS.md、.harness/README.md，并按计划中的 Current Repository Context 读取相关文件。先检查 git status，保持改动低耦合。核心指标和信号必须是纯 TypeScript 确定性实现，Skill、Subagent 和主 Agent 必须复用同一个 technical_analysis 工具。按任务顺序实施并运行聚焦测试、bun run typecheck、bun test 和 git diff --check。不要提交或推送，除非我明确要求。
```
