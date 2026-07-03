# Eugene Krab

[English](README.md) | [简体中文](README.zh-CN.md)

Eugene Krab is a fork of [Dexter](https://github.com/virattt/dexter): a CLI-based AI agent for deep financial research, built with TypeScript, Ink, LangChain, and Bun.

This fork keeps Dexter's autonomous financial research loop, then adds a gateway-first workflow for using the agent from chat apps, especially Feishu one-on-one conversations. It also separates main-agent and subagent model policy so expensive reasoning can stay where it matters while delegated work can use faster models.

<p align="center">
  <img width="520" alt="Eugene Krab sitting in a pile of coins" src="docs/assets/eugene-krab.png" />
</p>

## What Changed From Dexter

- Added Feishu gateway support through the Feishu/Lark `WSClient` long connection.
- Supports Feishu one-on-one text chats and sends agent answers back to the same chat.
- Added Feishu-specific message parsing, deduplication, outbound formatting, and channel profile handling.
- Added gateway/headless model selection via environment variables, useful when running outside the interactive CLI.
- Split main-agent and subagent model configuration with `SUBAGENT_MODEL` and optional analysis-specific overrides.
- Added reasoning-effort controls such as `DEEPSEEK_REASONING_EFFORT` and `DEEPSEEK_SUBAGENT_REASONING_EFFORT`.
- Kept Dexter's original finance research tools, scratchpad, browser/search tools, skills, and evaluation workflow.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Install](#install)
- [Environment](#environment)
- [Run The CLI](#run-the-cli)
- [Run The Gateway](#run-the-gateway)
- [Evaluate](#evaluate)
- [Debug](#debug)
- [Contributing](#contributing)
- [License](#license)

## Disclaimer

This project is for educational, entertainment, and informational purposes only. It is not intended for real trading or investment.

- Not financial, investment, tax, or legal advice.
- No guarantees of accuracy, completeness, or fitness for any purpose.
- Outputs may be incorrect, incomplete, or out of date.
- Creator and contributors assume no liability for financial losses or damages.
- Consult a licensed financial advisor before making investment decisions.
- Past performance does not indicate future results.

By using this software, you agree to use it solely for learning and informational purposes and accept all risks associated with its use.

## Overview

Eugene Krab takes complex financial questions and turns them into structured research plans. It can gather market data, read filings, browse web context, delegate focused subtasks to subagents, and synthesize a final answer from its scratchpad.

Key capabilities:

- Intelligent task planning for multi-step financial research.
- Autonomous tool use across financial data, filings, web search, browser scraping, and skills.
- Subagent delegation for focused parallel research tasks.
- Channel-aware answers for CLI, WhatsApp, and Feishu.
- Model-aware context compaction and fast-model summarization.
- Configurable main-agent, subagent, and reasoning-effort policies.

## Prerequisites

- [Bun](https://bun.com) runtime, v1.0 or higher.
- At least one LLM API key, such as OpenAI, Anthropic, Google, xAI, OpenRouter, DeepSeek, or Ollama.
- `FINANCIAL_DATASETS_API_KEY` for US/global financial data.
- `EXASEARCH_API_KEY` or `TAVILY_API_KEY` for web search.
- `FEISHU_APP_ID` and `FEISHU_APP_SECRET` if you want to run the Feishu gateway.

Install Bun:

```bash
# macOS/Linux
curl -fsSL https://bun.com/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1|iex"
```

## Install

```bash
git clone https://github.com/Flying-Henanese/eugene-krab.git
cd eugene-krab
bun install
```

## Environment

Copy the example file and fill in the keys you need:

```bash
cp env.example .env
```

Common variables:

```bash
# LLM providers
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
GOOGLE_API_KEY=your-google-api-key
XAI_API_KEY=your-xai-api-key
OPENROUTER_API_KEY=your-openrouter-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Finance and search
FINANCIAL_DATASETS_API_KEY=your-financial-datasets-api-key
EXASEARCH_API_KEY=your-exa-api-key
TAVILY_API_KEY=your-tavily-api-key

# Gateway/headless model policy
DEXTER_AGENT_MODEL=deepseek-v4-pro
DEXTER_AGENT_MODEL_PROVIDER=deepseek
SUBAGENT_MODEL=deepseek-v4-flash
SUBAGENT_ANALYSIS_MODEL=deepseek-v4-pro

# Reasoning effort
DEEPSEEK_REASONING_EFFORT=high
DEEPSEEK_SUBAGENT_REASONING_EFFORT=low

# Feishu gateway
FEISHU_APP_ID=your-feishu-app-id
FEISHU_APP_SECRET=your-feishu-app-secret
```

Never commit `.env` files or real API keys.

## Run The CLI

```bash
bun start
```

Development watch mode:

```bash
bun dev
```

Inside the CLI, use `/model` to switch providers and models interactively.

## Run The Gateway

The gateway lets Eugene Krab answer chat messages. WhatsApp support comes from Dexter; this fork adds Feishu support.

```bash
bun run gateway
```

For WhatsApp login:

```bash
bun run gateway:login
```

For Feishu, configure the app credentials in `.env`, enable the Feishu channel in the gateway config, then send a one-on-one text message to the bot. The first Feishu implementation is intentionally scoped to direct text chats: no group chats, webhooks, cards, images, or local allowlist.

## Evaluate

Run the full evaluation suite:

```bash
bun run src/evals/run.ts
```

Run a sampled evaluation:

```bash
bun run src/evals/run.ts --sample 10
```

## Debug

Each query writes a JSONL scratchpad under `.dexter/scratchpad/`. It records the original query, tool calls, tool results, model summaries, and thinking events so you can inspect how an answer was produced.

```text
.dexter/scratchpad/
|-- 2026-01-30-111400_9a8f10723f79.jsonl
|-- 2026-01-30-143022_a1b2c3d4e5f6.jsonl
`-- ...
```

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Keep changes focused.
4. Run `bun run typecheck` and `bun test` when touching logic.
5. Open a pull request.

Do not push, tag, publish, or create releases without explicit confirmation.

## License

This project is licensed under the MIT License.
