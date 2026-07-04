# Market Data Sources

Read this before changing financial research tools, A-share support, search-provider behavior, or finance prompt/tool descriptions.

## Source Split

- US/global structured data: Financial Datasets tools under `src/tools/finance/`.
- SEC filings: `read_filings` tool.
- China A-share structured data: Tushare-backed `a_share_analysis`, enabled only when `TUSHARE_TOKEN` is set.
- Current market context and news: `web_search`, using Exa, Perplexity, Tavily, or LangSearch based on configured API keys and preference.
- X/Twitter sentiment: `x_search`, enabled only when `X_BEARER_TOKEN` is set.

## A-Share Guidance

This file is the current working context for A-share analysis. Consult `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md` only when you need the original design rationale or to revisit the initial scope.

Use Tushare for structured A-share snapshots such as ticker resolution, PE/PB, ROE, revenue, profit, and cash-flow data. Pair it with `web_search` for current Chinese market context when the question asks for recent narrative, policy, sentiment, or news.

Do not route US/global equity data through Tushare. Keep Financial Datasets as the default for non-A-share structured finance data.

## Failure Handling

Some upstream data permissions are recoverable. If a Tushare endpoint returns a permission failure but enough partial data exists, prefer returning a partial-data answer that explains the missing field rather than failing the entire analysis.

## Change Guidance

- Keep finance tool descriptions aligned with registry behavior.
- Update `env.example` when adding a required key.
- Add tests around ticker resolution, provider fallback, permission failures, and prompt-visible descriptions.
