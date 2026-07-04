# Architecture Map

Read this when changing module boundaries, tracing request flow, or deciding where a new feature belongs.

## Top-Level Runtime Boundaries

- CLI UI: Ink/React components under `src/components/`, command handling under `src/commands/`, and controllers under `src/controllers/`.
- Agent runtime: `src/agent/` owns system prompt assembly, iterative model/tool loop, scratchpad, compaction, microcompaction, and event emission.
- Model layer: `src/model/llm.ts` creates LangChain chat models for OpenAI-compatible, Anthropic, Google, Ollama, xAI, OpenRouter, Moonshot, and DeepSeek providers.
- Tools: `src/tools/registry.ts` is the central registration point. Tool implementations live in subdirectories by capability.
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

## Boundary Rules

- Add new tools through `src/tools/registry.ts` and keep descriptions accurate because they are prompt-visible.
- Keep channel-specific parsing, dedupe, and outbound formatting inside that channel directory.
- Keep provider-specific LLM behavior in `src/model/llm.ts` or `src/providers.ts`.
- Do not leak CLI-only assumptions into gateway/headless runs.
- Prefer source-backed harness updates when adding new architectural concepts.
