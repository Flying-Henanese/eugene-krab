# Architecture Map

Read this when changing module boundaries, tracing request flow, or deciding where a new feature belongs.

## Top-Level Runtime Boundaries

- CLI UI: Ink/React components under `src/components/`, command handling under `src/commands/`, and controllers under `src/controllers/`.
- Agent runtime: `src/agent/` owns system prompt assembly, iterative model/tool loop, scratchpad, compaction, microcompaction, and event emission.
- Model layer: `src/model/llm.ts` creates LangChain chat models for OpenAI-compatible, Anthropic, Google, Ollama, xAI, OpenRouter, Moonshot, and DeepSeek providers.
- Tools: `src/tools/registry.ts` is the central registration point. Tool implementations live in subdirectories by capability.
- A-share structured evidence: `src/tools/finance/tushare/a-share-analysis.ts` resolves one company, fetches the market snapshot and up to eight deduplicated statement periods, prefers updated report versions, and collects recoverable supplemental evidence for business composition, audit, dividends, forecasts, and express reports.
- Deterministic finance arithmetic: `src/tools/finance/financial-calculator.ts` batches CNY unit conversions, numeric comparisons, and percentage changes. It is always registered and contains no provider fetch or valuation logic.
- China technical analysis: `src/tools/finance/technical-analysis/` owns Tushare collection/normalization plus pure TypeScript adjustment, weekly aggregation, indicators, raw formula/strategy events, neutral assessment, and offline applicability research. `runTechnicalAnalysis()` returns the internal research contract; the registered tool must pass it through `toPublicTechnicalAnalysisResult()` before CLI, gateway, skill, or subagent use.
- Skills: `src/skills/` stores SKILL.md workflows exposed through the `skill` tool.
- Gateway: `src/gateway/` adapts chat-channel messages into agent runs and sends responses back through channel plugins.
- Memory: `src/memory/` manages persistent memory, indexing, retrieval, and session context.
- Cron/heartbeat: `src/cron/` and `src/gateway/heartbeat/` support scheduled or periodic research workflows.

## Agent Loop

`Agent.create()` builds a model-specific tool set, filters CLI-only tools for non-CLI channels, loads prompt context, and returns an `Agent`. `Agent.run()` then:

1. Builds the message array from system prompt, recent chat history, and user query.
2. Calls the model with streaming where possible.
3. Executes tool calls, including concurrent execution for safe tools.
4. Persists or trims oversized tool results.
5. Compacts context when thresholds require it.
6. Emits typed events for the CLI/gateway UI and final answer handling.

## Gateway Flow

`src/gateway/index.ts` loads `.env`, parses the gateway command, optionally performs WhatsApp login, and starts `startGateway()`. Gateway config is loaded from `.dexter/gateway.json` by default unless `DEXTER_GATEWAY_CONFIG` overrides it.

Channel plugins should implement the shared channel interface and be registered through the gateway channel manager. Feishu and WhatsApp should stay channel-specific at the edge; common routing/session behavior belongs in `src/gateway/`.

## A-Share Research Flow

For an unspecified broad request about one A-share, the main model selects `stock-analysis`. The skill coordinates four evidence lanes without introducing another runtime service: structured Tushare fundamentals, current public information, the neutral technical result, and deterministic arithmetic checks. It then synthesizes aligned, conflicting, incomplete, or insufficient evidence in the main agent.

Narrow fundamental, technical, news, broad-market, or valuation requests stay on their corresponding tool or skill. `analysis` subagents are a scale-out mechanism for independent companies in comparisons or dense multi-year statement work, not the default single-company orchestrator. The parent supplies identical periods, metrics, units, and evidence rules and owns the final like-for-like comparison.

Technical analysis has a deliberate internal/public boundary:

1. `runTechnicalAnalysis()` collects candles and calculates indicators, Baseline V0 formula evidence, and Trend Recovery V1 research events.
2. `toPublicTechnicalAnalysisResult()` maps those internals to neutral technical state, observations, structural changes, decision context, data warnings, and limitations.
3. `createTechnicalAnalysis()` exposes only that public result through the tool registry.

`technical-analysis/applicability.ts` and the scripts under `scripts/technical-analysis-*` are offline research surfaces. Applicability V2.1 is unvalidated and must not be inserted into ordinary single-symbol output or treated as a production decision engine.

## Boundary Rules

- Add new tools through `src/tools/registry.ts` and keep descriptions accurate because they are prompt-visible.
- Keep financial unit conversion and material arithmetic in `financial_calculator`; skills and subagents should batch checks instead of silently performing material derived calculations.
- Keep technical-analysis calculations and internal-to-public adaptation in the deterministic finance module. Skills and subagents may orchestrate or explain the public result, but must not independently recalculate indicators, reconstruct raw action fields, or implement a second Tushare path.
- Keep ordinary one-company stock synthesis in the main agent so loaded skill rules and source context remain available. Use subagents only at the documented isolation boundaries.
- Keep channel-specific parsing, dedupe, and outbound formatting inside that channel directory.
- Keep provider-specific LLM behavior in `src/model/llm.ts` or `src/providers.ts`.
- Do not leak CLI-only assumptions into gateway/headless runs.
- Prefer source-backed harness updates when adding new architectural concepts.
