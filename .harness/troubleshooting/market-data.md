# Troubleshooting: Market Data

## A-Share Tool Missing

`a_share_analysis` is registered only when `TUSHARE_TOKEN` is set.

## Web Search Missing

`web_search` is registered only when at least one provider key is set:

- `EXASEARCH_API_KEY`
- `PERPLEXITY_API_KEY`
- `TAVILY_API_KEY`
- `LANGSEARCH_API_KEY`

## Partial Tushare Data

Tushare permission failures may affect only some endpoints. `a_share_analysis` should preserve its core statement result when supplemental APIs such as `fina_mainbz`, `fina_audit`, `dividend`, `forecast`, or `express` fail, and report those failures through `unavailable_data`.

## Financial Numbers Do Not Match

Check period, unit, currency, and scope before changing formulas. Tushare `daily_basic.total_mv` and `circ_mv` use ten-thousand CNY units, while financial-statement monetary fields use CNY. Use `financial_calculator` for material conversions and arithmetic. Keep upstream `free_cashflow` separate from the locally derived `operating_cashflow_less_capex`.

## Technical Output Exposes Buy/Sell Fields

The registered `technical_analysis` tool must return `toPublicTechnicalAnalysisResult(runTechnicalAnalysis(...))`. Raw formula sides, position actions, strategy parameters, and applicability decisions belong only to tests and offline research. If they appear in CLI, Feishu, a skill, or a subagent response, inspect the adapter boundary before changing prompt wording.

## Wrong Data Source

Use `context/market-data-sources.md` to decide:

- A-share structured snapshots: Tushare.
- US/global equities: Financial Datasets.
- Current narrative/news/policy/sentiment: web search.
