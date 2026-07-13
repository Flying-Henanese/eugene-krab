# Tools, Skills, And Subagents

Read this before adding or changing agent tools, tool descriptions, skill discovery, subagent behavior, or tool availability rules.

## Tool Registry

`src/tools/registry.ts` is the source of truth for prompt-visible tool registration. Each registered tool has:

- `name`
- LangChain tool instance
- rich prompt description
- compact description
- concurrency-safety flag

The registry always includes core finance, browser/fetch/filesystem, memory, cron, heartbeat, subagent, and ask-user-question tools, then conditionally adds provider-backed search and A-share/X search tools based on environment variables.

Main-agent tool choice is model-driven after the tool set is bound. Compact registry descriptions are included in the system prompt, and bound tool schemas/descriptions are also visible to the model. There is no gateway `if` branch that guarantees a technical-analysis call for a particular Chinese phrase, so trigger behavior depends on accurate prompt-visible descriptions and the user's intent being sufficiently explicit.

## Conditional Tools

- `web_search` appears only when at least one configured provider key exists: Exa, Perplexity, Tavily, or LangSearch.
- `a_share_analysis` appears only when `TUSHARE_TOKEN` is set.
- `market_sentiment_analysis` appears only when `TUSHARE_TOKEN` is set.
- `technical_analysis` appears only when `TUSHARE_TOKEN` is set.
- `financial_calculator` is always available for deterministic CNY/万元/亿元 conversion, numeric comparison, and percentage-change arithmetic; it does not fetch data or make valuation judgments.
- `x_search` appears only when `X_BEARER_TOKEN` is set.
- `ask_user_question` is CLI-only. `Agent.create()` removes it for non-CLI channels.

## Skills

Skills are SKILL.md directories under `src/skills/`. They are discovered at startup and exposed through the `skill` tool. Built-ins currently include DCF, help, X research, memo writing, the China A-share/index `technical-analysis` workflow, and the single-A-share `stock-analysis` workflow.

Use skills for reusable workflows. Do not hard-code skill-specific behavior into the general agent loop unless the behavior is truly global.

For technical analysis, keep the three surfaces distinct:

- A narrow request about one A-share/index trend alignment, MA, BOLL, KDJ, volatility, realized drawdown, technical state, or observed structural changes should use `technical_analysis` directly.
- The `technical-analysis` skill supplies a structured, Feishu-friendly reporting workflow and calls the same tool first.
- A broad company report may delegate one isolated technical lane to the `technical-analysis` subagent while other lanes cover fundamentals or news.

All three surfaces consume the same neutral public assessment. Raw V0/V1 research events stay behind the tool adapter and must not be reconstructed into transaction actions by the main agent, skill, or subagent. Feishu and CLI differ only in presentation density; neither has a separate strategy result contract.

Use `stock-analysis` for broad, single-A-share requests such as “分析一下某只股票”, “深入分析某公司”, or “这只股票最近怎么样” when the user has not limited the request to one lane. It orchestrates `a_share_analysis`, `technical_analysis`, current public information, and `financial_calculator` for material conversions or arithmetic, prioritizes primary sources, separates disclosed facts from calculations and third-party views, and uses a neutral aligned/divergent/insufficient evidence relationship. It must not replace narrow technical-only, fundamental-only, news-only, broad-market, DCF, memo, or multi-company workflows. The skill adds workflow and a pre-publication checklist; it is not a separate reviewer agent.

Explicit wording such as “调用 technical_analysis 分析 600519.SH 的日周线、均线、BOLL、KDJ、波动率和近期信号” is the most reliable manual trigger. Vague prompts such as “茅台最近怎么样” may reasonably route to other finance or search capabilities because the runtime does not use deterministic keyword routing.

## Subagents

`spawn_subagent` creates an isolated agent loop. Subagents cannot see the parent conversation and cannot delegate further, so the parent must pass all needed task and context text.

Model policy:

- `SUBAGENT_ANALYSIS_MODEL` overrides only analysis subagents.
- `SUBAGENT_MODEL` overrides all subagents.
- Otherwise the subagent uses the provider fast model for the parent model.
- `DEEPSEEK_SUBAGENT_REASONING_EFFORT` controls DeepSeek subagent reasoning effort.
- `DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT` overrides reasoning effort only for analysis subagents; it falls back to the general subagent setting and then the main DeepSeek setting.

The routing contract remains model-driven; no deterministic classifier or gateway keyword branch decides when to spawn. Its prompt-visible sources are src/agent/prompts.ts, the bound description in src/tools/subagent/spawn-subagent.ts, and the type metadata and worker prompts in src/tools/subagent/types.ts. The stock-analysis orchestration boundary is also encoded in src/skills/stock-analysis/SKILL.md.

- Main agent only: ordinary single-company structured fundamentals, loading and applying stock-analysis, material arithmetic review, evidence reconciliation, pre-publication review, and final synthesis. Simple or narrow single-tool requests also stay direct.
- research: an optional isolated multi-step current-information lane inside a broad report. The parent supplies object/ticker, period, topics, source priority, required URLs, exclusions, and output shape; the worker returns dated and attributed evidence, conflicts, and limitations rather than a company conclusion.
- technical-analysis: an optional isolated deterministic technical lane inside a broad report. The parent supplies ticker, adjustment, horizons, report role, and exclusions. Narrow technical-only requests call technical_analysis directly.
- analysis: one standardized company evidence lane in a multi-company comparison, or a tightly bounded dense multi-year evidence packet. It never owns the complete ordinary single-company report.
- general-purpose: only when no specialized type applies. It must not bypass research, analysis, or technical-analysis for company, stock, market, or technical work.

For comparison lanes, give every analysis worker identical periods, metrics, units, currency, scope, evidence rules, and output structure, then perform a like-for-like review in the main agent. The analysis worker calls a_share_analysis exactly once, groups material calculator work into one call, and uses at most one web search for explicitly requested current context. It returns an evidence packet, not a final company-level conclusion, and ordinary A-share work does not require annual-report PDF parsing.

The technical-analysis worker explains the same neutral public technical result used by the direct tool and skill. It uses the normal fast-model policy; only the analysis type receives SUBAGENT_ANALYSIS_MODEL.

Subagent tool access is controlled by subagent type definitions under `src/tools/subagent/`.

## Change Guidance

- When adding a tool, update the rich description and compact description together.
- Mark concurrency safety conservatively.
- For gateway-visible behavior, test that non-CLI channels do not depend on CLI-only prompts.
- For finance tools, update `context/market-data-sources.md` and relevant workflows.
