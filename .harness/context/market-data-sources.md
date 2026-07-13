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

`a_share_analysis` uses statement-specific field sets and returns up to eight deduplicated comparison periods, preferring `update_flag=1` when Tushare exposes multiple versions for the same company/period/report type. Its core structured surfaces are `income`, `balancesheet`, `cashflow`, and `fina_indicator`; supplemental evidence comes from `fina_mainbz` by product and region, `fina_audit`, `dividend`, `forecast`, and `express`. Ordinary financial analysis should use these structured endpoints instead of requiring annual-report PDF parsing. Treat Q1/H1/Q3 statement values as reported-period cumulative values unless the upstream field explicitly represents a standalone quarter, and compare like-for-like periods.

The Tushare operating-cash-flow field is `n_cashflow_act`; `free_cashflow` is a separate upstream field and may be null for some report versions. Do not explain the upstream `free_cashflow` field as operating cash flow minus capex. `a_share_analysis` separately adds `operating_cashflow_less_capex = n_cashflow_act - c_pay_acq_const_fiolta` as a deterministic CNY field. Keep unavailable supplemental APIs recoverable through `unavailable_data` rather than failing the core statement result.

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
- `runTechnicalAnalysis()` keeps raw V0/V1 research events for tests and audit, while the registered `technical_analysis` tool passes them through `toPublicTechnicalAnalysisResult()` before any CLI or gateway agent sees them. The public result contains objective indicators, neutral observations, observed structural changes, evidence quality, and limitations; it omits raw action/side fields, internal event identifiers, strategy parameters, future-risk claims, and transaction language.
- Raw TongdaXin-style formula signals remain available as Baseline V0 evidence. Experimental `trend_recovery_v1` position events are calculated separately: enter when close crosses above MA20 while MA20 > MA60 and K > D; exit after at least five bars and two consecutive closes below MA20, or earlier at an 8% close-based stop loss or 15% close-based trailing drawdown. Keep V0 and V1 clearly separated in user-facing explanations.
- Strategy applicability research is isolated in `technical-analysis/applicability.ts` and is not part of the public tool response. V2.1 retains trend, stability, and BOLL features as diagnostics but scores only benchmark-relative strength and volume confirmation with equal weight because the 44-stock component ablation found that re-scoring V1's existing trend gates reduced performance. It executes only when both scored components are at or above the same-date 70th percentile and the CSI 300 is above MA60 with a positive 10-day MA20 slope; a consensus signal in an unfavorable market is watch-only. Missing core features, missing market regime, or a cohort under 10 produces no decision. A third, untouched 44-stock validation did not reproduce development performance: win rate was 36.67%, average trade 0.45%, median trade -2.89%, and results were concentrated in one stock. Keep V2.1 offline and unvalidated; do not retune it against that validation universe.
- A later conditional test on 30 previously unseen companies selected as of 2026-07-10 from industry market-cap leaders produced stronger historical results, but the selection date came after most of the backtest window. Treat that run only as evidence that current leadership state may correlate with trend-strategy suitability; it contains survivorship and look-ahead bias and does not rehabilitate V2.1 as a validated predictor. A valid leadership test must reconstruct membership from point-in-time market-cap data.
- A point-in-time follow-up ranked market capitalization on 2022-12-30 before evaluating 2023 onward. The literal Top 30 was contaminated by 18 development-stock overlaps. After excluding the original 44 development stocks, frozen V2.1 produced 24 trades with 37.50% win rate, 1.98% average trade, and -1.01% median trade. This removed the principal future-leader bias but did not validate a high-confidence strategy; it only suggested a possible payoff-distribution benefit from historical large-cap selection.

Use the dedicated subagent mainly as one isolated lane of a broader fundamental/news/technical report. Narrow technical requests should call the tool directly. The subagent uses the normal fast-model policy; it explains deterministic tool output rather than recalculating indicators.

For a broad request about one A-share that does not specify a single research lane, use the `stock-analysis` skill in the main agent to combine Tushare fundamentals, recent public information, and the neutral `technical_analysis` result. The skill must preserve source type, date/period, unit, currency, and scope; use `n_income_attr_p` rather than group `n_income` when labeling attributable net profit; use `financial_calculator` for material conversions or arithmetic; prioritize exchange/company disclosures; keep brokerage or media views separate; and describe evidence as aligned, conflicting, incomplete, or insufficient rather than generating a transaction thesis. Explicitly narrow requests continue to use their corresponding tool or skill and must not be widened automatically. Use `analysis` subagents for one-company lanes inside multi-company comparisons or unusually dense multi-year statement work, not as a required step for an ordinary single-company report.

## Single-Company Subagent Routing

For a broad single-company report, the main agent retains the stock-analysis skill, a_share_analysis structured fundamentals, material financial_calculator checks, cross-lane evidence reconciliation, pre-publication review, and the final company-level synthesis.

- A direct web_search remains valid for a simple current-information lane. An isolated multi-step lane may instead use research when the parent task fixes the ticker/object, period, topics, source priority, required URLs, exclusions, and evidence-packet shape.
- A direct technical_analysis call remains valid and is required for a narrow technical-only request. An isolated technical lane inside a broad report may instead use technical-analysis when the parent fixes the ticker, adjustment, horizons, report role, exclusions, and required technical metadata.
- analysis is limited to identical one-company evidence lanes in a multi-company comparison or a tightly bounded dense multi-year evidence packet. It does not perform a complete ordinary single-company analysis.
- general-purpose must not act as a financial fallback when research, analysis, or technical-analysis applies.

Auxiliary results must preserve dates or periods, units, scope, attribution, URLs where available, conflicting evidence, technical metadata, and limitations. The main agent rejects or repairs incomplete packets before synthesis. These boundaries are implemented in src/agent/prompts.ts, src/tools/subagent/spawn-subagent.ts, src/tools/subagent/types.ts, and src/skills/stock-analysis/SKILL.md.

Treat a five-trading-session window only as a review cadence for short-term daily momentum, Bollinger-band contacts, and recent structural changes. Historical testing has not established T+5 predictive validity. MA20/MA60 alignment and 20/60-day returns describe a medium-term background with no fixed T+N expiry; update the interpretation when the observed state changes.

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
