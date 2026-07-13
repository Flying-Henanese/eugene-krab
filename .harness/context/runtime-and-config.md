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

- LLM providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `MOONSHOT_API_KEY`, `DEEPSEEK_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_CLOUD_API_KEY`
- Gateway/headless model policy: `DEXTER_AGENT_MODEL`, `DEXTER_AGENT_MODEL_PROVIDER`
- Subagent policy: `SUBAGENT_MODEL`, `SUBAGENT_ANALYSIS_MODEL`
- DeepSeek reasoning: `DEEPSEEK_REASONING_EFFORT`, `DEEPSEEK_SUBAGENT_REASONING_EFFORT`, `DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT`
- Finance/search: `FINANCIAL_DATASETS_API_KEY`, `TUSHARE_TOKEN`, `EXASEARCH_API_KEY`, `PERPLEXITY_API_KEY`, `TAVILY_API_KEY`, `LANGSEARCH_API_KEY`, `X_BEARER_TOKEN`
- Feishu: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`
- LangSmith: `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_TRACING`

Never commit `.env`, real credentials, `.dexter/credentials`, or private runtime data.

## Model Selection

Interactive CLI model selection is stored in `.dexter/settings.json`. Gateway/headless runs can override with `DEXTER_AGENT_MODEL` and `DEXTER_AGENT_MODEL_PROVIDER`, and gateway config can provide `gateway.model` and `gateway.modelProvider`.

DeepSeek V4 thinking mode is handled in `src/model/llm.ts` for `deepseek-v4-pro` and `deepseek-v4-flash`.

`SUBAGENT_ANALYSIS_MODEL` overrides only `analysis` workers. For DeepSeek, `DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT` overrides reasoning effort only for those workers, then falls back to `DEEPSEEK_SUBAGENT_REASONING_EFFORT` and the normal main-model setting. Other subagent types continue to use the general subagent reasoning policy.

## Gateway Config

Gateway config is loaded from `DEXTER_GATEWAY_CONFIG` or `.dexter/gateway.json`. If no file exists, WhatsApp defaults enabled and Feishu defaults disabled. Feishu account credentials come from `FEISHU_APP_ID` and `FEISHU_APP_SECRET`, not from the JSON config.

## Local State

The `.dexter/` directory stores settings, memory, scratchpads, sessions, credentials, and tool results. Treat it as local runtime state unless a task explicitly asks to inspect it.
