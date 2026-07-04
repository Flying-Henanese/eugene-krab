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

## Conditional Tools

- `web_search` appears only when at least one configured provider key exists: Exa, Perplexity, Tavily, or LangSearch.
- `a_share_analysis` appears only when `TUSHARE_TOKEN` is set.
- `x_search` appears only when `X_BEARER_TOKEN` is set.
- `ask_user_question` is CLI-only. `Agent.create()` removes it for non-CLI channels.

## Skills

Skills are SKILL.md directories under `src/skills/`. They are discovered at startup and exposed through the `skill` tool. Built-ins currently include DCF, help, X research, and memo writing.

Use skills for reusable workflows. Do not hard-code skill-specific behavior into the general agent loop unless the behavior is truly global.

## Subagents

`spawn_subagent` creates an isolated agent loop. Subagents cannot see the parent conversation and cannot delegate further, so the parent must pass all needed task and context text.

Model policy:

- `SUBAGENT_ANALYSIS_MODEL` overrides only analysis subagents.
- `SUBAGENT_MODEL` overrides all subagents.
- Otherwise the subagent uses the provider fast model for the parent model.
- `DEEPSEEK_SUBAGENT_REASONING_EFFORT` controls DeepSeek subagent reasoning effort.

Subagent tool access is controlled by subagent type definitions under `src/tools/subagent/`.

## Change Guidance

- When adding a tool, update the rich description and compact description together.
- Mark concurrency safety conservatively.
- For gateway-visible behavior, test that non-CLI channels do not depend on CLI-only prompts.
- For finance tools, update `context/market-data-sources.md` and relevant workflows.
