# Tushare + Tavily China Stock Analysis Design

Date: 2026-07-02

## Goal

Improve Dexter's China mainland stock analysis, especially A-share questions from Feishu such as "帮我分析一下稳健医疗这只股票".

The first implementation should combine:

- Tavily-backed `web_search` for current Chinese web information, news, announcements, and qualitative context.
- Tushare-backed structured data for A-share tickers, market snapshots, financial statements, and financial indicators.

Financial Datasets should remain available for US/global equities. Tushare should be used as the A-share-first structured source, not as a replacement for all finance tooling.

## Current Context

- `TAVILY_API_KEY` is already configured by the user.
- Existing `web_search` is conditionally registered in `src/tools/registry.ts` when `TAVILY_API_KEY` exists.
- Existing finance tools are built around Financial Datasets:
  - `src/tools/finance/api.ts`
  - `src/tools/finance/get-financials.ts`
  - `src/tools/finance/get-market-data.ts`
  - related sub-tools under `src/tools/finance/`
- Feishu gateway can receive p2p text messages and run the existing agent.
- The missing part for China stock analysis is reliable A-share structured data and A-share ticker/name resolution.

## Non-Goals

- Do not remove Financial Datasets support.
- Do not build a full Tushare wrapper for every API in the first version.
- Do not implement trading advice, order execution, portfolio management, alerts, or scheduled A-share reports.
- Do not depend on Python or AKShare in the first version; keep the project TypeScript/Bun-native.
- Do not scrape websites for structured financial statements if Tushare can provide them.

## Recommended Approach

Add a focused A-share analysis tool backed by Tushare, while keeping Tavily as a separate web context tool.

This is preferable to forcing Tushare into every existing Financial Datasets sub-tool immediately because:

- It keeps the first implementation small and testable.
- It avoids disrupting US-stock workflows.
- It lets the LLM choose `a_share_analysis` for China stocks and `web_search` for current context.
- It gives us a clear place to improve A-share ticker resolution without overloading the existing US-oriented finance routers.

Alternative approaches considered:

1. Add Tushare directly inside `get_financials` and `get_market_data`.
   - Pro: one familiar finance tool.
   - Con: larger router changes and higher risk of breaking existing Financial Datasets behavior.

2. Use Tavily only, no Tushare.
   - Pro: minimal code.
   - Con: weak for structured metrics such as revenue, net profit, ROE, PE, PB, cash flow, and reporting periods.

3. Add a dedicated Tushare/A-share tool first.
   - Pro: smallest reliable path for A-share structured data.
   - Con: the agent must learn when to use this new tool.

Recommended: option 3, with prompt/tool descriptions that tell the agent to combine it with `web_search` for A-share analysis.

## Configuration

Add one environment variable:

```bash
TUSHARE_TOKEN=your-tushare-token
```

Keep these existing variables:

```bash
TAVILY_API_KEY=your-tavily-key
DEEPSEEK_API_KEY=your-deepseek-key
```

`TUSHARE_TOKEN` should be documented in `env.example`.

If `TUSHARE_TOKEN` is missing, the Tushare tool should not be registered, and the existing Financial Datasets and Tavily behavior should continue unchanged.

## New Tool Surface

Add one new top-level tool:

```text
a_share_analysis
```

Suggested schema:

```ts
{
  query: string;
}
```

The tool receives the user's full natural-language A-share question, resolves the stock, fetches the structured Tushare data needed for a first-pass analysis, and returns compact JSON plus source metadata.

The tool should be used for:

- A-share company analysis.
- Chinese stock names such as "稳健医疗".
- A-share tickers such as `300888`, `300888.SZ`, `600519`, `600519.SH`.
- A-share valuation/financial questions involving PE, PB, ROE, revenue, profit, cash flow, market cap, and recent trading data.

The tool should not be used for:

- US equities.
- SEC filings.
- Crypto.
- Pure web/news questions where structured financial data is not needed.

## Tushare Data Scope

First version should support these Tushare APIs:

- `stock_basic`: stock code/name resolution and listing metadata.
- `daily_basic`: latest valuation/trading snapshot such as PE, PB, market cap, turnover, volume ratio.
- `income`: income statement data.
- `balancesheet`: balance sheet data.
- `cashflow`: cash flow data.
- `fina_indicator`: financial indicators such as ROE, gross margin, net profit margin, debt ratios, EPS.

Optional if easy:

- `daily`: latest OHLCV price data.
- `namechange`: helpful for companies with old names.

Do not add more APIs in the first version unless required by tests or the first manual use case.

## Ticker And Name Resolution

Create a resolver that accepts:

- `300888`
- `300888.SZ`
- `SZ300888`
- `600519`
- `600519.SH`
- Chinese company names such as `稳健医疗`

Resolution rules:

- Six-digit codes starting with `0` or `3` default to `.SZ`.
- Six-digit codes starting with `6` default to `.SH`.
- Six-digit codes starting with `8`, `4`, or `9` are not required in the first version.
- If the query contains a Chinese company name and no explicit ticker, use `stock_basic` name search.
- If multiple candidates match, return a structured ambiguity error asking the user to include the ticker.
- Cache `stock_basic` results locally to avoid repeated full-list calls.

For the motivating example:

```text
稳健医疗 -> 300888.SZ
```

## Data Flow

1. Feishu receives a p2p text message.
2. Gateway passes the text to the agent with `channel: "feishu"`.
3. The agent sees both:
   - `a_share_analysis` when `TUSHARE_TOKEN` is configured.
   - `web_search` when `TAVILY_API_KEY` is configured.
4. For an A-share analysis request, the agent should:
   - Call `a_share_analysis` for structured Tushare data.
   - Call `web_search` for current news, announcements, industry context, and recent risks.
   - Synthesize a short Feishu-friendly answer.

The answer should state data recency explicitly, for example:

```text
结构化财务数据来自 Tushare，最新可用报告期为 2025Q3；近期消息来自 Tavily web_search。
```

## Proposed File Structure

Create:

- `src/tools/finance/tushare/client.ts`
  - Low-level Tushare HTTP client.
  - Handles token, POST payloads, response validation, error messages, and optional cache.

- `src/tools/finance/tushare/types.ts`
  - Tushare response types and normalized internal result types.

- `src/tools/finance/tushare/resolve.ts`
  - A-share ticker/name normalization and `stock_basic` lookup.

- `src/tools/finance/tushare/format.ts`
  - Compact formatting and field selection for LLM output.

- `src/tools/finance/tushare/a-share-analysis.ts`
  - LangChain `DynamicStructuredTool` for the top-level `a_share_analysis` tool.

- `src/tools/finance/tushare/index.ts`
  - Public exports.

Modify:

- `src/tools/registry.ts`
  - Register `a_share_analysis` only when `process.env.TUSHARE_TOKEN` is set.
  - Add compact and rich descriptions telling the LLM this is for A-shares/China stocks.

- `env.example`
  - Add `TUSHARE_TOKEN=your-tushare-token`.

Optional prompt tuning:

- `src/agent/channels.ts`
  - No required change, but Feishu profile can remain concise.

- `src/tools/finance/get-financials.ts` and `src/tools/finance/get-market-data.ts`
  - No first-version routing changes required if `a_share_analysis` is registered as a separate tool.

## Tushare Client Design

Use Tushare HTTP API directly from TypeScript:

```http
POST http://api.tushare.pro
Content-Type: application/json
```

Payload shape:

```json
{
  "api_name": "daily_basic",
  "token": "TUSHARE_TOKEN_FROM_ENV",
  "params": { "ts_code": "300888.SZ" },
  "fields": "ts_code,trade_date,pe,pb,total_mv,circ_mv,turnover_rate,volume_ratio"
}
```

Normalize Tushare's `fields` + `items` array response into arrays of objects before returning data to the agent.

Error handling:

- Missing token: tool should not be registered.
- Tushare non-zero code: return a concise tool error with API name and message.
- Empty result: return a clear no-data object with the API name and params.
- Network failure: throw a concise error so the agent can fall back to `web_search`.

## A-Share Analysis Tool Output

Return compact structured data, not a full essay. The final narrative should be produced by the agent.

Suggested output:

```json
{
  "stock": {
    "ts_code": "300888.SZ",
    "name": "稳健医疗",
    "industry": "医疗保健",
    "market": "创业板",
    "list_date": "20200917"
  },
  "market_snapshot": {
    "trade_date": "20260701",
    "pe": 0,
    "pb": 0,
    "total_mv": 0,
    "circ_mv": 0
  },
  "financials": {
    "income": [],
    "balancesheet": [],
    "cashflow": [],
    "fina_indicator": []
  },
  "source": {
    "provider": "Tushare",
    "apis": ["stock_basic", "daily_basic", "income", "balancesheet", "cashflow", "fina_indicator"]
  }
}
```

Keep the number of periods small:

- Latest 4 quarters for quarterly data.
- Latest 3 annual reports for annual trend if quarterly data is sparse.

## Tavily Usage

No new Tavily adapter is required. Existing `web_search` should already use Tavily when `TAVILY_API_KEY` is present.

The implementation should improve tool descriptions or prompts so the agent knows:

- For A-share structured financial metrics, use `a_share_analysis`.
- For current news/announcements/qualitative context, use `web_search`.
- For a full stock analysis, use both.

Recommended search queries generated by the agent:

- `稳健医疗 300888 最新公告 业绩`
- `稳健医疗 300888 财报 2025`
- `稳健医疗 300888 行业 医疗耗材 风险`

## Testing Plan

Unit tests should cover:

- Tushare response normalization from `fields` + `items`.
- A-share ticker normalization:
  - `300888` -> `300888.SZ`
  - `600519` -> `600519.SH`
  - `300888.SZ` stays `300888.SZ`
- Chinese name resolution with a mocked `stock_basic` response.
- Ambiguous name resolution returns a clear ambiguity result.
- `a_share_analysis` is registered only when `TUSHARE_TOKEN` exists.
- Existing `web_search` registration with `TAVILY_API_KEY` remains unchanged.
- Existing Financial Datasets finance tools remain registered and unaffected.

Manual integration test:

1. Add `TUSHARE_TOKEN` and `TAVILY_API_KEY` to `.env`.
2. Run `bun run gateway`.
3. Send Feishu p2p text:

```text
帮我分析一下稳健医疗这只股票
```

4. Confirm terminal shows the agent uses A-share/Tushare tool data and web search.
5. Confirm Feishu receives one concise answer with:
   - Business summary.
   - Recent financial trend.
   - Valuation/market snapshot.
   - Recent news/risks.
   - Data recency and source caveat.

## Rollout Order

1. Add Tushare client and response normalization.
2. Add ticker/name resolver.
3. Add `a_share_analysis` tool with mocked tests.
4. Register the tool conditionally on `TUSHARE_TOKEN`.
5. Update `env.example`.
6. Run typecheck and tests.
7. Do one manual Feishu test with `稳健医疗`.

## Open Questions For Implementation

- Which Tushare plan/permission level does the user's token have?
- Does the token have access to all first-version APIs listed above?
- Should unavailable Tushare APIs degrade gracefully to Tavily-only analysis, or should the tool return a hard error?

Recommended first-version answer: degrade gracefully. Return partial structured data and let the agent fill qualitative context with Tavily.
