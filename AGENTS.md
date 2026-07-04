# Repository Guidelines

- Repo: https://github.com/virattt/dexter
- Dexter is a CLI-based AI agent for deep financial research, built with TypeScript, Ink (React for CLI), and LangChain.
- For nontrivial repo work, read `.harness/README.md` after this file and follow its task routing to the smallest relevant context/checklist files. Treat `AGENTS.md` as the root map and `.harness/` as the repo-local operating manual.
- Before implementing Feishu support, read `docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md`. It captures the agreed scope: Feishu WSClient long connection, one-on-one text chats only, credentials in `.env`, no project-local allowlist for the first version.
- Before implementing A-share analysis with Tushare and Tavily, read `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md`. It captures the agreed scope: Tushare for A-share structured data, Tavily/web_search for current Chinese market context, and Financial Datasets retained for US/global equities.

## Harness Context Routing

- Project orientation or architecture questions: read `.harness/context/project-overview.md` and `.harness/context/architecture-map.md`.
- Runtime, env, model, or gateway startup work: read `.harness/context/runtime-and-config.md`.
- Tool, skill, or subagent work: read `.harness/context/tools-skills-and-subagents.md`.
- Feishu, WhatsApp, or gateway channel work: read `.harness/context/gateway-and-channels.md`.
- Financial data source or A-share work: read `.harness/context/market-data-sources.md`.
- Security-sensitive changes: read `.harness/checklists/security.md`.
- Before editing code, use `.harness/checklists/code-change.md`; before claiming completion, use `.harness/checklists/verification.md`.

## Project Structure

- Source code: `src/`
  - Agent core: `src/agent/` (agent loop, prompts, scratchpad, token counting, types)
  - CLI interface: `src/cli.ts` (Ink/React), entry point: `src/index.tsx`
  - Components: `src/components/` (Ink UI components)
  - Controllers: `src/controllers/` (agent runner, model/search selection, input history)
  - Gateway: `src/gateway/` (headless chat gateway, channels, routing, sessions, heartbeat)
  - Gateway channels: `src/gateway/channels/` (WhatsApp and Feishu plugins)
  - Model/LLM: `src/model/llm.ts` (multi-provider LLM abstraction)
  - Provider metadata: `src/providers.ts` (provider IDs, model prefixes, fast models, context windows)
  - Tools: `src/tools/` (finance, search, browser, fetch, filesystem, subagent, memory, cron, heartbeat, skill)
  - Finance tools: `src/tools/finance/` (financials, market data, filings, screeners, Tushare A-share analysis)
  - Search tools: `src/tools/search/` (Exa, Perplexity, Tavily, LangSearch, X search)
  - Browser/fetch: `src/tools/browser/`, `src/tools/fetch/` (Playwright browser and URL fetch/summarization)
  - Skills: `src/skills/` (SKILL.md-based extensible workflows, e.g. DCF, X research, memo writing)
  - Persistent memory: `src/memory/` and `src/tools/memory/`
  - Cron: `src/cron/` and `src/tools/cron/`
  - Utils: `src/utils/` (env, config, paths, caching, token estimation, tool-result storage)
  - Evals: `src/evals/` (LangSmith evaluation runner with Ink UI)
- Config: `.dexter/settings.json` (persisted model/provider selection)
- Gateway config: `.dexter/gateway.json` by default, or `DEXTER_GATEWAY_CONFIG`
- Environment: `.env` (API keys; see `env.example`)
- Scripts: `scripts/release.sh`

## Build, Test, and Development Commands

- Runtime: Bun (primary). Use `bun` for all commands.
- Install deps: `bun install`
- Run: `bun run start` or `bun run src/index.tsx`
- Dev (watch mode): `bun run dev`
- Gateway: `bun run gateway`
- WhatsApp login/setup: `bun run gateway:login`
- Type-check: `bun run typecheck`
- Tests: `bun test`
- Evals: `bun run src/evals/run.ts` (full) or `bun run src/evals/run.ts --sample 10` (sampled)
- CI runs `bun run typecheck` and `bun test` on push/PR.

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode). JSX via React (Ink for CLI rendering).
- Prefer strict typing; avoid `any`.
- Keep files concise; extract helpers rather than duplicating code.
- Add brief comments for tricky or non-obvious logic.
- Do not add logging unless explicitly asked.
- Do not create README or documentation files unless explicitly asked.

## LLM Providers

- Supported: OpenAI (default), Anthropic, Google, xAI (Grok), Moonshot, DeepSeek, OpenRouter, Ollama (local), and Ollama Cloud.
- Default model: `gpt-5.5`. Provider detection is prefix-based (`claude-` -> Anthropic, `gemini-` -> Google, etc.).
- Fast models and provider metadata live in `src/providers.ts`.
- Anthropic uses explicit `cache_control` on system prompt for prompt caching cost savings.
- Users switch providers/models via `/model` command in the CLI.
- Gateway/headless runs can use `DEXTER_AGENT_MODEL` and `DEXTER_AGENT_MODEL_PROVIDER`.
- Subagents can use `SUBAGENT_MODEL`, `SUBAGENT_ANALYSIS_MODEL`, and DeepSeek reasoning-effort env vars.

## Tools

- `get_financials`: financial statements and metrics.
- `get_market_data`: prices, company news, crypto data, and insider trades.
- `read_filings`: SEC filing reader for 10-K, 10-Q, 8-K documents.
- `stock_screener`: screen stocks by financial criteria.
- `spawn_subagent`: delegate focused isolated subtasks to subagents.
- `ask_user_question`: CLI-only multiple-choice user questions.
- `web_fetch`: fetch and summarize URL content.
- `web_search`: general web search over configured providers (Exa, Perplexity, Tavily, LangSearch).
- `browser`: Playwright-based web scraping for reading pages the agent discovers.
- `read_file`, `write_file`, `edit_file`: sandbox-aware local file tools; write/edit require approval.
- `heartbeat`, `cron`: periodic checklist and scheduled job tools.
- `memory_search`, `memory_get`, `memory_update`: persistent memory tools.
- `a_share_analysis`: Tushare-backed China A-share structured analysis, enabled by `TUSHARE_TOKEN`.
- `x_search`: X/Twitter search, enabled by `X_BEARER_TOKEN`.
- `skill`: invokes SKILL.md-defined workflows (e.g. DCF valuation). Each skill runs at most once per query.
- Tool registry: `src/tools/registry.ts`. Tools are conditionally included based on env vars.

## Skills

- Skills live as `SKILL.md` files with YAML frontmatter (`name`, `description`) and markdown body (instructions).
- Built-in skills: `src/skills/dcf/SKILL.md`.
- Discovery: `src/skills/registry.ts` scans for SKILL.md files at startup.
- Skills are exposed to the LLM as metadata in the system prompt; the LLM invokes them via the `skill` tool.

## Agent Architecture

- Agent loop: `src/agent/agent.ts`. Iterative tool-calling loop with configurable max iterations (default 10).
- Scratchpad: `src/agent/scratchpad.ts`. Single source of truth for all tool results within a query.
- Context management: Anthropic-style. Full tool results kept in context; oldest results cleared when token threshold exceeded.
- Final answer: generated in a separate LLM call with full scratchpad context (no tools bound).
- Events: agent yields typed events (`tool_start`, `tool_end`, `thinking`, `answer_start`, `done`, etc.) for real-time UI updates.

## Environment Variables

- LLM keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`
- Additional providers: `MOONSHOT_API_KEY`, `DEEPSEEK_API_KEY`, `OLLAMA_CLOUD_API_KEY`
- Ollama: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- Gateway/headless models: `DEXTER_AGENT_MODEL`, `DEXTER_AGENT_MODEL_PROVIDER`
- Subagents: `SUBAGENT_MODEL`, `SUBAGENT_ANALYSIS_MODEL`, `DEEPSEEK_REASONING_EFFORT`, `DEEPSEEK_SUBAGENT_REASONING_EFFORT`
- Finance: `FINANCIAL_DATASETS_API_KEY`, `TUSHARE_TOKEN`
- Search: `EXASEARCH_API_KEY`, `PERPLEXITY_API_KEY`, `TAVILY_API_KEY`, `LANGSEARCH_API_KEY`, `X_BEARER_TOKEN`
- Feishu: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`
- Tracing: `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_TRACING`
- Never commit `.env` files or real API keys.

## Version & Release

- Version format: SemVer `MAJOR.MINOR.PATCH`. Tag prefix: `v`.
- Release script: `bash scripts/release.sh [version]` (defaults to today's date).
- Release flow: bump version in `package.json`, create git tag, push tag, create GitHub release via `gh`.
- Do not push or publish without user confirmation.

## Testing

- Framework: Bun's built-in test runner (primary), Jest config exists for legacy compatibility.
- Tests colocated as `*.test.ts`.
- Run `bun test` before pushing when you touch logic.

## Security

- API keys stored in `.env` (gitignored). Users can also enter keys interactively via the CLI.
- Config stored in `.dexter/settings.json` (gitignored).
- Never commit or expose real API keys, tokens, or credentials.
