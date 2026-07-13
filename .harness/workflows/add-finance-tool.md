# Workflow: Add Or Change A Finance Tool

1. Read `context/market-data-sources.md`.
2. Inspect the existing finance tool family under `src/tools/finance/`.
3. Decide whether the data belongs to Financial Datasets, Tushare, web search, X search, or a new provider.
4. Implement provider-specific parsing and errors inside the provider submodule.
5. Register or update the tool in `src/tools/registry.ts`.
6. Update rich and compact tool descriptions.
7. If the tool has research-only or action-oriented internals, define and test an explicit neutral public adapter before exposing it to agents, skills, CLI, or gateway channels.
8. If the workflow makes material unit conversions, comparisons, or percentage-change claims, route them through `financial_calculator` and preserve source period, unit, currency, and scope.
9. Add tests for normal data, empty data, malformed inputs, permission failures, and internal/public contract separation where applicable.
10. Run focused tests, `bun run typecheck`, and `git diff --check`.

For A-share changes, use `context/market-data-sources.md` as the current working context. Consult `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md` only when original rationale or scope is relevant.
