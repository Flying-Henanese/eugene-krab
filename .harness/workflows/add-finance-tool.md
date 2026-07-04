# Workflow: Add Or Change A Finance Tool

1. Read `context/market-data-sources.md`.
2. Inspect the existing finance tool family under `src/tools/finance/`.
3. Decide whether the data belongs to Financial Datasets, Tushare, web search, X search, or a new provider.
4. Implement provider-specific parsing and errors inside the provider submodule.
5. Register or update the tool in `src/tools/registry.ts`.
6. Update rich and compact tool descriptions.
7. Add tests for normal data, empty data, malformed inputs, and permission failures.
8. Run focused tests, `bun run typecheck`, and `git diff --check`.

For A-share changes, use `context/market-data-sources.md` as the current working context. Consult `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md` only when original rationale or scope is relevant.
