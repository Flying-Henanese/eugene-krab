---
name: technical-analysis
description: Performs descriptive technical-state analysis for China A-shares and supported China stock indices using Tushare daily prices plus locally calculated MA, BOLL, KDJ, trend alignment, momentum, volatility, drawdown, and observed structural changes. Use for Chinese requests about 技术面分析、近期走势、均线、布林带、KDJ、价格波动、超买超卖、技术状态、技术结构变化、已发生回撤 through Feishu or the CLI.
---

# China Technical Analysis

1. Extract one A-share or supported China index from the request, then call `technical_analysis` first. Treat its structured output as the source of truth; do not recalculate indicators in prose.
2. For a broader company request, optionally call `a_share_analysis` for fundamentals. For broad A-share mood, optionally call `market_sentiment_analysis`.
3. Call `web_search` only when the user asks for recent events, policy, or news explanations. Never infer a news cause from price movement alone.
4. State the latest data date, stock adjustment mode, and whether the latest weekly candle is partial.
5. Explain only the current technical state, neutral location or momentum observations, observed structural changes, realized drawdowns, and conditions to track, using the numeric MA/BOLL/KDJ, volatility, and drawdown evidence returned by the tool.
6. Treat `decision_context` as the source of plain-language structure meaning, cross-horizon relationship, confirmation/invalidation conditions, and review cadence. Translate it concisely; do not replace it with invented thresholds or causal claims.
7. Translate indicators into decision-relevant context without selecting an action:
   - explain the current structure in plain language;
   - distinguish short-term daily momentum from the MA20/MA60 and 20/60-day medium-term background;
   - identify agreement or tension across horizons;
   - state what observable price/indicator conditions would confirm or invalidate the current state.
   - copy `latest.price_position` relations for price versus MA20, MA60, and the BOLL middle line instead of comparing rounded display values;
   - derive confirmation/invalidation conditions only from returned follow-up conditions, repeated closes relative to MA20, or changes in the reported MA relationship; do not invent intraday thresholds, uncalculated MA slopes, or claim that volatility compression predicts expansion.
8. Add a **复查节奏** from `decision_context`: re-check short-term daily momentum, Bollinger-band contact, recent structural changes, and repeated closes relative to MA20 within the next five trading sessions. Explicitly say this is a monitoring cadence, not evidence that the analysis predicts T+5. Medium-term MA20/MA60 context has no fixed T+N validity and should be updated when the state changes.
9. Treat raw formula, Baseline V0, and experimental Trend Recovery V1 historical events only as descriptive evidence. Translate them into neutral state or structural-change language; do not expose action framing or claim a validated strategy, future-risk increase, return probability, personalized recommendation, or position guidance.
10. Describe `trend_recovery_observation` and `low_zone_momentum_recovery_observation` only as state transitions, not as favorable opportunities. Treat upper/lower Bollinger-band contact as location evidence, not an opportunity, future risk, or reversal signal.
11. Applicability V2.1 remains offline and unvalidated. Do not cite it or include it in an ordinary single-symbol response.
12. If the user asks whether to buy or sell, state that the technical output does not validate an action. Explain the observed state and which future state changes can be checked, without selecting an action.
13. Format for Feishu or the CLI with short sections and compact tables only when useful. Do not dump raw JSON.
14. End with a concise caveat that the output is descriptive technical-state analysis, does not predict subsequent direction, and does not constitute investment advice.

Example requests:

- “技术面分析一下平安银行最近的走势。”
- “沪深300最近20个交易日的趋势和价格波动怎么样？”
- “看看贵州茅台的均线、布林带和KDJ，最近有哪些技术状态和结构变化。”
