---
name: technical-analysis
description: Performs deterministic technical analysis for China A-shares and supported China stock indices using Tushare daily prices plus locally calculated MA, BOLL, KDJ, trend, volatility, and recent signal rules. Use for Chinese requests about 技术面分析、近期走势、均线、布林带、KDJ、价格波动、超买超卖、买卖信号, including requests received through Feishu.
---

# China Technical Analysis

1. Extract one A-share or supported China index from the request, then call `technical_analysis` first. Treat its structured output as the source of truth; do not recalculate indicators in prose.
2. For a broader company request, optionally call `a_share_analysis` for fundamentals. For broad A-share mood, optionally call `market_sentiment_analysis`.
3. Call `web_search` only when the user asks for recent events, policy, or news explanations. Never infer a news cause from price movement alone.
4. State the latest data date, stock adjustment mode, and whether the latest weekly candle is partial.
5. Explain trend, volatility, MA/BOLL/KDJ, and signals with the numeric evidence returned by the tool. Keep raw formula signals, Baseline V0 position events, and experimental Trend Recovery V1 position events separate; do not present any of them as validated trade instructions.
6. Format for Feishu with short sections and compact tables only when useful. Do not dump raw JSON.
7. End with a concise caveat that historical technical signals can fail and are not investment advice.

Example requests:

- “技术面分析一下平安银行最近的走势。”
- “沪深300最近20个交易日的趋势和价格波动怎么样？”
- “看看贵州茅台的均线、布林带和KDJ，最近有没有信号。”
