# Project Overview

Read this when orienting on the repo, answering "what is this project?", or choosing the first files to inspect for a broad change.

## Identity

Eugene Krab is a fork of Dexter, a Bun/TypeScript CLI agent for financial research. This fork keeps the original autonomous research loop and adds chat-gateway workflows, Feishu support, model policy controls, persistent memory tools, cron/heartbeat tools, and China A-share analysis support.

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

## Historical Design References

- Feishu WSClient design: `docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md`
- Tushare/Tavily A-share design: `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md`

Treat these as original rationale and scope references. For current working context, use `context/gateway-and-channels.md` for gateway/Feishu changes and `context/market-data-sources.md` for finance/A-share changes, then verify against source.
