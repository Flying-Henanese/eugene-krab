# Troubleshooting: Model Provider

## Missing API Key

Provider factories in `src/model/llm.ts` throw when the required API key is absent. Check `env.example` for the relevant variable name and confirm presence without printing the value.

## Gateway Uses Unexpected Model

Resolution order for gateway/headless model policy:

1. explicit runtime argument
2. gateway config `gateway.model` / `gateway.modelProvider`
3. `DEXTER_AGENT_MODEL` / `DEXTER_AGENT_MODEL_PROVIDER`
4. `.dexter/settings.json`
5. default OpenAI model/provider

## Subagent Uses Unexpected Model

Resolution order:

1. `SUBAGENT_ANALYSIS_MODEL` for analysis subagents
2. `SUBAGENT_MODEL`
3. provider fast model fallback

DeepSeek subagent reasoning effort comes from `DEEPSEEK_SUBAGENT_REASONING_EFFORT`.
