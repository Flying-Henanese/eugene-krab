# Market Data Sources

Read this before changing financial research tools, A-share support, search-provider behavior, or finance prompt/tool descriptions.

## Source Split

- US/global structured data: Financial Datasets tools under `src/tools/finance/`.
- SEC filings: `read_filings` tool.
- China A-share single-stock structured data: Tushare-backed `a_share_analysis`, enabled only when `TUSHARE_TOKEN` is set.
- China A-share broad market sentiment: Tushare-backed `market_sentiment_analysis`, enabled only when `TUSHARE_TOKEN` is set.
- China A-share and supported China-index technical analysis: `technical_analysis`, enabled only when `TUSHARE_TOKEN` is set.
- Current market context and news: `web_search`, using Exa, Perplexity, Tavily, or LangSearch based on configured API keys and preference.
- X/Twitter sentiment: `x_search`, enabled only when `X_BEARER_TOKEN` is set.

## A-Share Guidance

This file is the current working context for A-share analysis. Consult `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md` only when you need the original design rationale or to revisit the initial scope.

Use Tushare for structured A-share snapshots such as ticker resolution, PE/PB, ROE, revenue, profit, and cash-flow data. Pair it with `web_search` for current Chinese market context when the question asks for recent narrative, policy, sentiment, or news.

Do not route US/global equity data through Tushare. Keep Financial Datasets as the default for non-A-share structured finance data.

## Technical Analysis Guidance

Use `technical_analysis` for one A-share or supported China index when the request asks about daily/weekly trend, price volatility, moving averages, BOLL, KDJ, drawdown, or recent formula signals.

- Stock name/code resolution uses Tushare `stock_basic`. The current resolver caches the listing per `TushareClient`, but `createTechnicalAnalysis()` creates a new HTTP client for each tool invocation, so this cache does not currently persist across separate user requests. An explicit ticker still attempts the lookup for name enrichment but falls back to the normalized code if the lookup is unavailable.
- Stocks use Tushare `daily + adj_factor` by default; qfq OHLC is calculated locally with the latest factor in the requested window as the anchor. With `adjustment=none`, the tool skips `adj_factor` and uses unadjusted `daily` prices.
- Indices use Tushare `index_daily` and do not use adjustment factors. Built-in aliases cover 上证指数/上证综指、深证成指、创业板指、沪深300、中证500、科创50; an explicit index code is also accepted when `asset_type=index`.
- Weekly candles, MA5/10/20/30/60, BOLL(20,2), KDJ(9,3,3), returns, realized volatility, drawdown, and raw signals are calculated locally in pure TypeScript.
- A successful analysis requires at least 120 usable daily candles and 20 locally aggregated weekly candles. The default request uses a 450-calendar-day lookback and supports 120-1000 days.
- The latest active weekly candle may be included but must be marked partial.
- `technical_analysis` is the single deterministic core used by direct main-agent calls, the `technical-analysis` skill, and the `technical-analysis` subagent.
- Raw TongdaXin-style formula signals remain available as Baseline V0 evidence. Experimental `trend_recovery_v1` position events are calculated separately: enter when close crosses above MA20 while MA20 > MA60 and K > D; exit after at least five bars and two consecutive closes below MA20, or earlier at an 8% close-based stop loss or 15% close-based trailing drawdown. Keep V0 and V1 clearly separated in user-facing explanations.

Use the dedicated subagent mainly as one isolated lane of a broader fundamental/news/technical report. Narrow technical requests should call the tool directly. The subagent uses the normal fast-model policy; it explains deterministic tool output rather than recalculating indicators.

Do not use this capability for intraday data, real-time execution, US/global equities, fundamental valuation, or news causality. Exact chart-platform parity must not be claimed until a golden fixture settles standard-deviation, KDJ initialization, `FILTER`, and `EXIST` boundary semantics.

Tushare endpoint access and rate limits belong to the configured token, not to the local calculations. The runtime handles permission/error details through `unavailable_data`; do not infer an exact per-minute quota from one or two successful calls. The external Tushare MCP used during development is not part of Eugene Krab's runtime path.

## China Market Sentiment Guidance

Use `market_sentiment_analysis` for broad A-share market mood, market breadth, index moves, limit-up/down pressure, sector heat, and optional money-flow context. Pair it with `web_search` for current Chinese news and policy narrative.

Do not route single-stock valuation or financial-statement questions through `market_sentiment_analysis`; keep those on `a_share_analysis`.

The sentiment tool returns deterministic component scores plus missing-data notes. If Tushare permissions block money-flow or sector APIs, report the partial-data limitation instead of failing the whole answer.

## Failure Handling

Some upstream data permissions are recoverable. If a Tushare endpoint returns a permission failure but enough partial data exists, prefer returning a partial-data answer that explains the missing field rather than failing the entire analysis.

## Change Guidance

- Keep finance tool descriptions aligned with registry behavior.
- Update `env.example` when adding a required key.
- Add tests around ticker resolution, provider fallback, permission failures, and prompt-visible descriptions.
