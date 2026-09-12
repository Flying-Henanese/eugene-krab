# Runtime And Config

Read this before changing commands, environment variables, provider selection, gateway startup, or runtime state.

## Package Runtime

- Runtime/package manager: Bun.
- Install: `bun install`
- CLI: `bun run start`
- Dev watch: `bun run dev`
- Gateway: `bun run gateway`
- WhatsApp login/setup: `bun run gateway:login`
- Type-check: `bun run typecheck`
- Tests: `bun test`

`package.json` also contains a `postinstall` hook that installs Playwright Chromium.

## Environment Variables

Common environment variables are documented in `env.example`. Key groups:

- LLM providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `MOONSHOT_API_KEY`, `DEEPSEEK_API_KEY`, `GLM_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_CLOUD_API_KEY`. The GLM provider accepts `OPENAI_API_KEY` as a backwards-compatible fallback when `GLM_API_KEY` is absent.
- Gateway/headless model policy: `DEXTER_AGENT_MODEL`, `DEXTER_AGENT_MODEL_PROVIDER`
- Subagent policy: `SUBAGENT_MODEL`, `SUBAGENT_ANALYSIS_MODEL`
- DeepSeek reasoning: `DEEPSEEK_REASONING_EFFORT`, `DEEPSEEK_SUBAGENT_REASONING_EFFORT`, `DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT`
- GLM 5.3 reasoning: `GLM_REASONING_EFFORT`, `GLM_SUBAGENT_REASONING_EFFORT`, `GLM_ANALYSIS_SUBAGENT_REASONING_EFFORT`; supported values are `max`, `high`, and `low`.
- Finance/search: `FINANCIAL_DATASETS_API_KEY`, `TUSHARE_TOKEN`, `EXASEARCH_API_KEY`, `PERPLEXITY_API_KEY`, `TAVILY_API_KEY`, `LANGSEARCH_API_KEY`, `X_BEARER_TOKEN`
- Feishu: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`
- LangSmith: `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_TRACING`

Never commit `.env`, real credentials, `.dexter/credentials`, or private runtime data.

## Model Selection

Interactive CLI model selection is stored in `.dexter/settings.json`. Gateway/headless runs can override with `DEXTER_AGENT_MODEL` and `DEXTER_AGENT_MODEL_PROVIDER`, and gateway config can provide `gateway.model` and `gateway.modelProvider`.

The settings file is optional local state. When it is absent or unreadable, the CLI falls back to the built-in `openai` provider and `gpt-5.5` model. Gateway model resolution prefers explicit arguments, gateway JSON, and `DEXTER_AGENT_MODEL` / `DEXTER_AGENT_MODEL_PROVIDER` before falling back to settings and then the same built-in defaults. The runtime does not need to generate a settings file merely to start.

DeepSeek V4 thinking mode is handled in `src/model/llm.ts` for `deepseek-v4-pro` and `deepseek-v4-flash`. GLM 5.3 Flash routes to the Zhipu AI OpenAI-compatible endpoint and retains `reasoning_content` across tool-call turns.

`SUBAGENT_ANALYSIS_MODEL` overrides only `analysis` workers. For DeepSeek, `DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT` overrides reasoning effort only for those workers, then falls back to `DEEPSEEK_SUBAGENT_REASONING_EFFORT` and the normal main-model setting. Other subagent types continue to use the general subagent reasoning policy.

## Gateway Config

Gateway config is loaded from `DEXTER_GATEWAY_CONFIG` or `.dexter/gateway.json`. On first startup with the default path, if `.dexter/gateway.json` is absent and root `gateway.example.json` exists, the validated example is copied to the local path before loading. The committed example mirrors this project's current local configuration by enabling Feishu and its processing card; omitted WhatsApp settings retain the schema default of enabled. If neither local config nor example exists, the in-code fallback enables WhatsApp and disables Feishu. Feishu account credentials come from `FEISHU_APP_ID` and `FEISHU_APP_SECRET`, not from the JSON config.

The gateway config file is gitignored local state. `loadGatewayConfig()` seeds it from the root example only when using the default path and never overwrites an existing file. Explicit override paths remain caller-managed. `gateway:login` may also write the local file when it needs to persist WhatsApp setup.

## Local State

The `.dexter/` directory stores settings, gateway config, memory, scratchpads, sessions, credentials, and tool results. It is gitignored local runtime state and must not be committed.
