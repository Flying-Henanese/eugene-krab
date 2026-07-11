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
- `x_search` appears only when `X_BEARER_TOKEN` is set.
- `ask_user_question` is CLI-only. `Agent.create()` removes it for non-CLI channels.

## Skills

Skills are SKILL.md directories under `src/skills/`. They are discovered at startup and exposed through the `skill` tool. Built-ins currently include DCF, help, X research, memo writing, and the China A-share/index `technical-analysis` workflow.

Use skills for reusable workflows. Do not hard-code skill-specific behavior into the general agent loop unless the behavior is truly global.

For technical analysis, keep the three surfaces distinct:

- A narrow request about one A-share/index trend, MA, BOLL, KDJ, volatility, drawdown, or signals should use `technical_analysis` directly.
- The `technical-analysis` skill supplies a structured, Feishu-friendly reporting workflow and calls the same tool first.
- A broad company report may delegate one isolated technical lane to the `technical-analysis` subagent while other lanes cover fundamentals or news.

Explicit wording such as “调用 technical_analysis 分析 600519.SH 的日周线、均线、BOLL、KDJ、波动率和近期信号” is the most reliable manual trigger. Vague prompts such as “茅台最近怎么样” may reasonably route to other finance or search capabilities because the runtime does not use deterministic keyword routing.

## Subagents

`spawn_subagent` creates an isolated agent loop. Subagents cannot see the parent conversation and cannot delegate further, so the parent must pass all needed task and context text.

Model policy:

- `SUBAGENT_ANALYSIS_MODEL` overrides only analysis subagents.
- `SUBAGENT_MODEL` overrides all subagents.
- Otherwise the subagent uses the provider fast model for the parent model.
- `DEEPSEEK_SUBAGENT_REASONING_EFFORT` controls DeepSeek subagent reasoning effort.

The dedicated `technical-analysis` subagent is intended for an isolated technical lane inside a broader report. It calls the same deterministic `technical_analysis` tool available to the main agent and skill. It intentionally follows the normal fast-model policy; only the existing `analysis` type receives `SUBAGENT_ANALYSIS_MODEL`.

Subagent tool access is controlled by subagent type definitions under `src/tools/subagent/`.

## Change Guidance

- When adding a tool, update the rich description and compact description together.
- Mark concurrency safety conservatively.
- For gateway-visible behavior, test that non-CLI channels do not depend on CLI-only prompts.
- For finance tools, update `context/market-data-sources.md` and relevant workflows.
