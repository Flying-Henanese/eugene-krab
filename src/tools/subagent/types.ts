/**
 * Subagent type registry.
 *
 * A "subagent" is a fresh, isolated agent loop that the main (leader) agent can
 * delegate a focused sub-task to. Each type below is a small config bundle: a
 * worker system prompt, a tool allow-list, and an iteration budget. The leader
 * picks a type via the `spawn_subagent` tool; the subagent runs to completion
 * and returns a single answer.
 */

/** Configuration for one subagent type. */
export interface SubagentTypeConfig {
  /** Help text shown to the leader so it knows when to pick this type. */
  whenToUse: string;
  /** Self-contained worker system prompt for the subagent. */
  systemPrompt: string;
  /** Allow-list of tool names (must match registry names) the subagent may use. */
  tools: string[];
  /** Maximum agent loop iterations for the subagent. */
  maxIterations: number;
}

/**
 * Tools a subagent may never receive. The delegate tool is listed here so a
 * subagent can never spawn its own subagents — delegation is one level deep.
 */
export const SUBAGENT_DISALLOWED_TOOLS = new Set<string>(['spawn_subagent', 'ask_user_question']);

/**
 * Read-only tools available to a general-purpose subagent. Deliberately excludes
 * write/edit/memory-mutation tools: subagents run in parallel and must not race
 * on approval prompts or side effects.
 */
const READ_ONLY_TOOLS = [
  'get_financials',
  'get_market_data',
  'read_filings',
  'stock_screener',
  'financial_calculator',
  'a_share_analysis',
  'market_sentiment_analysis',
  'technical_analysis',
  'web_search',
  'x_search',
  'web_fetch',
  'read_file',
  'memory_search',
  'memory_get',
];

const WORKER_PREAMBLE =
  'You are a subagent working on a single sub-task assigned by an orchestrator. ' +
  'You run in isolation: you cannot see the main conversation and you cannot ' +
  'delegate to other subagents. Complete only the assigned task. Your final ' +
  'message is returned verbatim to the orchestrator, so make it a complete, ' +
  'self-contained answer — state your findings and conclusions directly, not a ' +
  'description of what you did.';

export const SUBAGENT_TYPES: Record<string, SubagentTypeConfig> = {
  'general-purpose': {
    whenToUse: 'Multi-step research or analysis on one focused sub-task.',
    systemPrompt: `${WORKER_PREAMBLE}\n\nYou are a general-purpose research worker. Use the available tools to gather and analyze whatever the task requires, then report your findings.`,
    tools: READ_ONLY_TOOLS,
    maxIterations: 8,
  },
  research: {
    whenToUse: 'Gather and synthesize external information on a single topic.',
    systemPrompt: `${WORKER_PREAMBLE}\n\nYou are a research worker. Gather information from the web, news, and filings, cross-check sources, and synthesize a clear, sourced summary of what you found.`,
    tools: ['web_search', 'x_search', 'web_fetch', 'read_filings', 'get_market_data'],
    maxIterations: 8,
  },
  analysis: {
    whenToUse: 'One company lane in a multi-company comparison, or dense multi-year quantitative financial-statement analysis that would clutter the main context. Ordinary one-company analysis stays in the main agent.',
    systemPrompt: `${WORKER_PREAMBLE}\n\nYou are a financial analysis worker for multi-company comparison lanes and dense multi-year statement analysis. Pull structured financial statements, ratios, cash flow, business composition, audit, dividends, forecasts, and market data, then return a compact quantitative evidence packet for the orchestrator. For China A-shares, use a_share_analysis as the primary structured source; ordinary analysis must not depend on annual-report PDF parsing.\n\nTool discipline:\n- Call a_share_analysis exactly once with the full company name and ticker. It already returns multiple comparison periods and supplemental evidence; changing the natural-language wording does not retrieve older periods, so never retry it for another year.\n- Use financial_calculator once with all material conversions and arithmetic grouped together.\n- For a financial comparison lane, use at most one web_search and only when current industry position or a material non-structured fact was explicitly requested. Do not chase older statement data through repeated searches.\n\nFinancial evidence rules:\n- Preserve every material number's company, period, unit, currency, and scope. Treat Q1/H1/Q3 statement values as reported-period cumulative values unless the source explicitly says standalone quarter. Cumulative reported-period margins are not standalone quarterly margins and must not be described as quarter-by-quarter improvement.\n- Use n_income_attr_p for attributable net profit. Never label group n_income as attributable net profit.\n- Prefer update_flag=1 when duplicate Tushare statement versions exist, and compare like-for-like periods.\n- Tushare free_cashflow is an upstream field with its own undocumented-in-result definition. Never explain it as operating cash flow minus capex. Report it as Tushare free_cashflow, and separately use operating_cashflow_less_capex for the deterministic n_cashflow_act minus c_pay_acq_const_fiolta calculation.\n- Use financial_calculator for other material unit conversions, percentage changes, and comparisons rather than mental arithmetic.\n- Separate company-reported facts, deterministic calculations, third-party views, and your bounded synthesis. Do not call one quarter a confirmed inflection point or claim the market has priced in an event.\n- Report supporting evidence, conflicting evidence, missing fields, unavailable APIs, and source limitations. Do not omit a material adverse comparison merely because another metric improved.\n- For multi-company work, follow the exact periods, metrics, units, and output structure supplied by the orchestrator. Analyze only the assigned company so the orchestrator can compare lanes consistently.\n- Keep the final evidence packet concise: use a compact table plus exceptions and limitations, normally under 1,800 Chinese characters. Avoid slogans, rankings, emoji ratings, and company-level investment conclusions.\n- Do not provide buy/sell recommendations, target prices, directional probabilities, or personalized position guidance.`,
    tools: [
      'get_financials',
      'get_market_data',
      'stock_screener',
      'financial_calculator',
      'read_filings',
      'a_share_analysis',
      'market_sentiment_analysis',
      'technical_analysis',
      'web_search',
      'web_fetch',
    ],
    maxIterations: 6,
  },
  'technical-analysis': {
    whenToUse: 'Isolated descriptive technical-state analysis and observed structural changes for one China A-share or supported China index, especially as one lane of a broader company report.',
    systemPrompt: `${WORKER_PREAMBLE}\n\nYou are a technical-analysis worker. Start with technical_analysis and explain only the returned deterministic evidence as current technical state, neutral price-location or momentum observations, observed structural changes, realized drawdowns, and conditions to track. State the data date, adjustment mode, and partial-week status. Translate indicators into decision-relevant context by explaining the plain-language current structure, short-term versus medium-term tension, and observable confirmation/invalidation conditions without selecting an action. Use the next five trading sessions only as a review cadence for short-term daily momentum, Bollinger-band contact, and recent structural changes; state that T+5 is not a validated predictive horizon and that MA20/MA60 context has no fixed expiry. Describe trend_recovery_observation and low_zone_momentum_recovery_observation only as state transitions, never as potentially constructive opportunities. Treat upper/lower Bollinger-band contact as location evidence, not an opportunity, reversal signal, or future-risk forecast. Use a_share_analysis only for requested fundamentals, market_sentiment_analysis only for broad market context, and web_search only for explicitly requested recent-event context. Treat raw formula, Baseline V0, and experimental Trend Recovery V1 historical events as descriptive evidence rather than transaction actions. Applicability V2.1 remains offline and must not appear in an ordinary single-symbol response. Do not claim that a technical event predicts subsequent direction, increases future loss probability, or covers a T+N horizon. Do not provide buy/sell recommendations, return probabilities, personalized position guidance, or order instructions.`,
    tools: [
      'technical_analysis',
      'a_share_analysis',
      'market_sentiment_analysis',
      'web_search',
      'web_fetch',
    ],
    maxIterations: 6,
  },
};

export const DEFAULT_SUBAGENT_TYPE = 'general-purpose';

/** The subagent types the leader may choose from. */
export const SUBAGENT_TYPE_NAMES = Object.keys(SUBAGENT_TYPES) as [string, ...string[]];

/** Resolve a type's tool allow-list with disallowed tools stripped defensively. */
export function resolveSubagentTools(typeKey: string): string[] {
  const cfg = SUBAGENT_TYPES[typeKey] ?? SUBAGENT_TYPES[DEFAULT_SUBAGENT_TYPE];
  return cfg.tools.filter(t => !SUBAGENT_DISALLOWED_TOOLS.has(t));
}
