---
name: dexter-help
description: Explain how to use Dexter from Feishu chat, what Dexter can do, how to ask effective questions in Feishu, and how Dexter's tools, skills, gateway, subagents, and financial research workflows help users. Use when the user asks in Feishu for project usage help, onboarding, "how do I use this", "what can you do", "what features are available", "how should I ask", examples of good prompts, which tools or skills exist, what happens behind the scenes, or how Feishu/gateway usage differs from the CLI.
---

# Dexter Help Skill

Explain Dexter as an AI financial research assistant that the user primarily talks to through Feishu chat.

## Response Workflow

1. Default to Feishu chat usage:
   - Explain that the user can ask natural-language research questions directly in Feishu.
   - Do not lead with CLI commands, slash commands, terminal UI, or local setup unless the user specifically asks about them.
   - Mention that gateway mode may not show the CLI's live tool stream, approval UI, or subagent progress rows; the final answer should still summarize useful results.
   - If the user asks about model usage or subagents, explain that the main gateway agent can use the configured main model, while delegated subagents may use the configured cheaper worker model.
   - If the user explicitly asks about the CLI, answer that separately as an alternate interface.

2. Summarize what Dexter can help with:
   - Market data and price/news snapshots.
   - Financial statements, metrics, fundamentals, and company facts.
   - SEC filing reading and filing-section extraction.
   - A-share analysis through Tushare when configured.
   - China A-share broad market sentiment analysis through `market_sentiment_analysis` when `TUSHARE_TOKEN` is configured.
   - Current web/search context through configured search providers.
   - X/Twitter sentiment research when `X_BEARER_TOKEN` is configured.
   - DCF valuation, X research, and investment memo workflows through skills.
   - Multi-company or multi-topic decomposition through subagents when the task is substantial.

3. Teach how to ask better questions in Feishu:
   - Name the ticker/company and market when possible.
   - State the goal: quick fact, comparison, valuation, memo, risk review, catalyst check, or investment decision support.
   - Specify time horizon and output format if relevant.
   - Ask for sources, assumptions, or caveats when the answer will influence a decision.
   - For complex work, ask for parallel analysis by company/topic if subagent delegation would help.

4. Give concrete prompt examples tailored to the user's intent:
   - Quick lookup: "What drove NVDA today, and what were the latest price/news highlights?"
   - Fundamentals: "Analyze MSFT revenue growth, margins, FCF, balance sheet, and valuation."
   - Comparison: "Compare AAPL, MSFT, and NVDA on financial quality, valuation, and growth prospects."
   - DCF: "Run a DCF valuation for AAPL and show the sensitivity table."
   - A-share: "分析贵州茅台的估值、盈利质量、近期市场背景和主要风险。"
   - China market sentiment: "请分析 20260703 A 股整体市场情绪，重点看市场宽度、涨跌停、行业热度、资金流，并结合新闻解释。"
   - Sentiment: "Check X/Twitter sentiment on TSLA over the last 7 days."
   - Memo: "Write a long investment memo for ASML with a 12-month horizon."

5. Explain limitations plainly:
   - Dexter depends on configured API keys and provider permissions.
   - Some data can be unavailable, delayed, or permission-limited.
   - Web and X sentiment can be noisy and should be cross-checked.
   - Financial analysis is decision support, not investment advice.
   - Feishu gateway mode may show less live tool/subagent progress than the CLI.
   - Feishu responses should favor readable summaries and actionable follow-up prompts over terminal-style status details.

6. End with 2-4 suggested next prompts the user can send immediately.

Keep the answer practical and concise. Prefer examples and next actions over internal architecture details unless the user asks how the system works.
