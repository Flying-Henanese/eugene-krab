# Project Overview

Read this when orienting on the repo, answering "what is this project?", or choosing the first files to inspect for a broad change.

## Identity

Eugene Krab is a fork of Dexter, a Bun/TypeScript CLI agent for financial research. This fork keeps the original autonomous research loop and adds chat-gateway workflows, Feishu support, model policy controls, persistent memory tools, cron/heartbeat tools, and a source-disciplined China A-share research stack covering structured fundamentals, market sentiment, neutral technical-state analysis, and deterministic financial arithmetic.

## Main Entrypoints

- CLI: `src/index.tsx`, launched by `bun run start`.
- Gateway CLI: `src/gateway/index.ts`, launched by `bun run gateway` or `bun run gateway:login`.
- Core agent loop: `src/agent/agent.ts`.
- LLM/provider abstraction: `src/model/llm.ts` and `src/providers.ts`.
- Tool registry: `src/tools/registry.ts`.
- Built-in skills: `src/skills/**/SKILL.md`, discovered via `src/skills/registry.ts`.
- Gateway channels: `src/gateway/channels/`.
- Persistent local state: `.dexter/` at runtime. Do not commit secrets or generated private state.

## Current Product Shape

The project supports two main usage modes:

- Interactive financial research through the Ink CLI.
- Headless chat operation through the gateway, currently with WhatsApp and Feishu channel plugins.

The agent can call finance tools, web/search/browser tools, filesystem tools, memory tools, cron/heartbeat tools, built-in skills, and isolated subagents. Gateway channels should not assume CLI-only tools such as interactive question prompts are available.

Broad single-A-share analysis is orchestrated by the `stock-analysis` skill in the main agent. It combines `a_share_analysis`, recent public information, the public `technical_analysis` result, and `financial_calculator` checks while preserving source type, date/period, unit, currency, and scope. Narrow requests continue to use their corresponding tool or skill and are not widened automatically.

China technical analysis is exposed through three prompt-level surfaces over one deterministic core: direct `technical_analysis` tool calls, the `technical-analysis` skill workflow, and a dedicated `technical-analysis` subagent for one lane of a broader report. The core can retain raw Baseline V0 and Trend Recovery V1 events for tests and offline research, but the registered tool adapts them into a neutral public contract without action, position, return-probability, or strategy-parameter fields. Applicability V2.1 is an offline research module, not a conversational capability.

Tool, skill, and subagent selection is performed by the main model from prompt-visible descriptions; the gateway does not contain a keyword router for finance phrases. Ordinary one-company synthesis stays in the main agent. `analysis` subagents are reserved for independent company lanes in comparisons or unusually dense multi-year statement work, after which the main agent performs the like-for-like synthesis.

## Historical Design References

- Feishu WSClient design: `docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md`
- Tushare/Tavily A-share design: `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md`

Treat these as original rationale and scope references. For current working context, use `context/gateway-and-channels.md` for gateway/Feishu changes and `context/market-data-sources.md` for finance/A-share changes, then verify against source.
