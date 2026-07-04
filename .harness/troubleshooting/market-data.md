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

Tushare permission failures may affect only some endpoints. Preserve usable partial data where the tool supports it, and clearly explain missing fields.

## Wrong Data Source

Use `context/market-data-sources.md` to decide:

- A-share structured snapshots: Tushare.
- US/global equities: Financial Datasets.
- Current narrative/news/policy/sentiment: web search.
