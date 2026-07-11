---
name: dexter-help
description: Explain how to use Dexter from Feishu chat, what Dexter can do, what financial research capabilities are available, and how to ask effective questions. Use when the user asks in Feishu for project usage help, onboarding, "how do I use this", "what can you do", "what features are available", "how should I ask", examples of good prompts, China A-share analysis, China market sentiment analysis, valuation, memos, news/search, monitoring, or Feishu-vs-CLI differences.
---

# Dexter Help Skill

Explain Dexter as an AI financial research assistant that the user primarily talks to through Feishu chat. Most Feishu users are non-technical: describe capabilities as things they can ask for, not as implementation details. Prefer concrete prompt examples over internal architecture.

## Response Workflow

1. Default to Feishu chat usage:
   - Explain that the user can ask natural-language research questions directly in Feishu.
   - Do not lead with CLI commands, slash commands, terminal UI, or local setup unless the user specifically asks about them.
   - Mention that gateway mode may not show the CLI's live tool stream, approval UI, or subagent progress rows; the final answer should still summarize useful results.
   - If the user explicitly asks about the CLI, answer that separately as an alternate interface.

2. Start with a short capability overview:
   - Dexter can do market snapshots, financial statement analysis, SEC filing review, valuation, screening, A-share research, China market sentiment, web/news context, X/Twitter sentiment, investment memos, and multi-company comparisons.
   - Explain that specific capabilities depend on configured API keys and provider permissions.

3. Explain available capabilities in user-facing language when asked what Dexter can do. Do not lead with internal tool names unless the user asks for technical details:
   - Market snapshot: price moves, recent news, company updates, crypto data, and insider trades.
   - Company fundamentals: revenue, margins, cash flow, balance sheet, valuation multiples, and key financial metrics.
   - SEC filing reading: summarize or extract key sections from 10-K, 10-Q, and 8-K filings.
   - Stock screening: find companies that match valuation, growth, quality, or risk criteria.
   - A-share single-stock analysis: analyze Chinese A-share companies such as 贵州茅台 or 宁德时代 when Tushare is configured.
   - A-share and China-index technical analysis: explain daily/weekly trend, volatility, MA, BOLL, KDJ, and recent formula signals from historical prices.
   - China A-share market sentiment: analyze the whole A-share market using index moves, market breadth, limit-up/down pressure, sector heat, money-flow data when available, and optional news context.
   - News and web context: search current web/news sources and read URLs.
   - X/Twitter sentiment: summarize social discussion when X access is configured.
   - Valuation and memos: run DCF-style valuation, write investment memos, and compare bull/base/bear cases.
   - Monitoring: set recurring checks for news, sentiment, prices, or thesis changes when scheduling is configured.
   - Memory: remember useful context across conversations when memory is enabled.

4. If the user asks about "tools", "skills", or "subagents", keep the explanation short:
   - Tools are the behind-the-scenes capabilities Dexter uses to get data, search the web, read filings, analyze A-shares, or schedule checks.
   - Skills are guided workflows for tasks like DCF valuation, X/Twitter research, investment memos, and usage help.
   - Subagents are helper analysts Dexter may use for larger tasks, such as comparing several companies or splitting a memo into business, financial, valuation, and risk sections.
   - Avoid listing every internal tool name unless the user specifically asks for the technical list.

5. Teach how to ask better questions in Feishu:
   - Name the ticker/company and market when possible.
   - State the goal: quick fact, comparison, valuation, memo, risk review, catalyst check, or investment decision support.
   - Specify time horizon and output format if relevant.
   - Ask for sources, assumptions, or caveats when the answer will influence a decision.
   - For complex work, ask for parallel analysis by company/topic if subagent delegation would help.
   - For China market questions, distinguish single-stock A-share analysis from broad A-share market sentiment.

6. Give concrete prompt examples tailored to the user's intent:
   - Quick lookup: "What drove NVDA today, and what were the latest price/news highlights?"
   - Fundamentals: "Analyze MSFT revenue growth, margins, FCF, balance sheet, and valuation."
   - Comparison: "Compare AAPL, MSFT, and NVDA on financial quality, valuation, and growth prospects."
   - DCF: "Run a DCF valuation for AAPL and show the sensitivity table."
   - A-share: "分析贵州茅台的估值、盈利质量、近期市场背景和主要风险。"
   - Technical analysis: "技术面分析贵州茅台最近的均线、布林带、KDJ 和价格波动。"
   - China market sentiment: "请分析 20260703 A 股整体市场情绪，重点看市场宽度、涨跌停、行业热度、资金流，并结合新闻解释。"
   - X sentiment: "Check X/Twitter sentiment on TSLA over the last 7 days."
   - Memo: "Write a long investment memo for ASML with a 12-month horizon."
   - Subagents: "Compare AAPL, MSFT, NVDA, and GOOGL in parallel, then synthesize which one has the best 12-month risk/reward."
   - Monitoring: "Set up a weekly check for major news and sentiment changes around NVDA."

7. Explain limitations plainly:
   - Dexter depends on configured API keys and provider permissions.
   - Some data can be unavailable, delayed, or permission-limited.
   - A-share and China market sentiment require `TUSHARE_TOKEN`; current news context requires a configured search provider.
   - Web and X sentiment can be noisy and should be cross-checked.
   - Financial analysis is decision support, not investment advice.
   - Feishu mode may show less live progress than the CLI.
   - Feishu responses should favor readable summaries and actionable follow-up prompts over terminal-style status details.

8. End with 2-4 suggested next prompts the user can send immediately. Include at least one prompt that matches the user's likely market or workflow interest. If the user asks generally what Dexter can do, include one A-share market sentiment example when appropriate.

## Style Guidance

- For ordinary Feishu users, group capabilities by outcome instead of dumping raw tool names first.
- If the user explicitly asks for internals, explain the difference:
  - Tools are callable functions for data/search/actions.
  - Skills are reusable workflow instructions.
  - Subagents are isolated helper agents for larger subtasks.
- Keep responses readable on a phone: short sections, compact bullets, and clear next prompts.
