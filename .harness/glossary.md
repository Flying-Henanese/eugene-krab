# Glossary

- Agent loop: The iterative model/tool execution flow in `src/agent/agent.ts`.
- Gateway: The headless chat integration runtime under `src/gateway/`.
- Channel: A chat transport adapter such as WhatsApp or Feishu.
- WSClient: Feishu/Lark long-connection client used for receiving bot events.
- Tool registry: `src/tools/registry.ts`, the prompt-visible list of available tools.
- Skill: A SKILL.md workflow under `src/skills/`, invoked through the `skill` tool.
- Subagent: An isolated agent loop spawned by `spawn_subagent` for a focused task.
- A-share: Mainland China listed equities, handled through Tushare when `TUSHARE_TOKEN` is set.
- Public technical assessment: The neutral result produced by `toPublicTechnicalAnalysisResult()` for conversational surfaces; it excludes raw action, position, and strategy fields.
- Applicability V2.1: Offline, unvalidated cohort-ranking research under `src/tools/finance/technical-analysis/applicability.ts`; it is not part of ordinary tool output.
- Stock-analysis skill: The main-agent workflow that combines one A-share's structured fundamentals, current public information, neutral technical state, and deterministic arithmetic.
- Financial Datasets: The structured data source used for US/global equity data.
- Web search provider: Exa, Perplexity, Tavily, or LangSearch, selected by environment and preference.
