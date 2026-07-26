# Eugene Krab

[English](README.md) | [简体中文](README.zh-CN.md)

Eugene Krab 是从 [Dexter](https://github.com/virattt/dexter) fork 而来的金融研究智能体。它基于 TypeScript、Ink、LangChain 和 Bun 构建，保留了 Dexter 面向深度金融研究的自主规划、工具调用和结果综合能力，并在此基础上加入了更适合个人部署和聊天入口使用的能力。

这个 fork 重点增强了网关侧体验：你可以通过飞书一对一消息与智能体对话，也可以继续使用原有的 CLI 和 WhatsApp 网关。同时，项目支持区分主智能体和子智能体的模型配置，让复杂推理使用更强模型，让被委派的子任务使用更快、更便宜的模型。

<p align="center">
  <img width="520" alt="Eugene Krab sitting in a pile of coins" src="docs/assets/eugene-krab.png" />
</p>

## 相比 Dexter 的变化

- 增加飞书网关支持，基于 Feishu/Lark `WSClient` 长连接接收消息。
- 支持飞书一对一文本聊天，并将智能体回答发送回同一个会话。
- 增加飞书消息解析、消息去重、富文本发送格式化、可选的可更新处理状态卡片和 channel profile。
- 增加网关/headless 场景下的模型环境变量配置，适合不经过 CLI `/model` 命令的服务化运行。
- 支持主智能体和子智能体使用不同模型，例如主智能体使用强推理模型，子智能体使用 fast model。
- 增加 reasoning effort 配置，例如 `DEEPSEEK_REASONING_EFFORT` 和 `DEEPSEEK_SUBAGENT_REASONING_EFFORT`。
- 增加基于 Tushare 的 A 股基本面、市场情绪和中性确定性技术状态分析。
- 增加来源约束明确的单只 A 股综合分析流程，以及有执行预算的 research 子智能体。
- 保留 Dexter 原有的金融数据、SEC filing、网页搜索、浏览器抓取、scratchpad、skills 和 eval 工作流。

## 目录

- [项目概览](#项目概览)
- [前置要求](#前置要求)
- [安装](#安装)
- [环境变量](#环境变量)
- [运行 CLI](#运行-cli)
- [运行网关](#运行网关)
- [评测](#评测)
- [调试](#调试)
- [贡献](#贡献)
- [许可证](#许可证)

## 免责声明

本项目仅用于教育、娱乐和信息参考，不构成真实交易或投资建议。

- 不构成金融、投资、税务或法律建议。
- 不保证输出的准确性、完整性或适用性。
- 模型输出可能错误、不完整或过时。
- 作者和贡献者不承担任何投资损失或相关损害责任。
- 做出投资决策前，请咨询持牌金融顾问。
- 过去表现不代表未来结果。

使用本软件即表示你同意仅将其用于学习和信息参考，并自行承担使用风险。

## 项目概览

Eugene Krab 可以把复杂的金融问题拆解成结构化研究计划。它能够查询市场和财务数据、阅读 SEC 文件、搜索网页、抓取网页内容、把子任务委派给子智能体，并基于 scratchpad 中的证据生成最终回答。

核心能力：

- 面向多步骤金融研究的任务规划。
- 自动选择和调用金融数据、filings、网页搜索、浏览器抓取和 skills 等工具。
- 通过子智能体并行处理独立研究任务。
- 根据不同入口生成更适合 CLI、WhatsApp 或飞书的回答。
- 通过 Tushare 提供结构化 A 股基本面、市场情绪和中性技术状态分析。
- 通过单只 A 股综合分析流程区分基本面、近期公开信息、技术证据和确定性计算。
- 基于模型上下文窗口进行自动压缩和 fast-model 摘要。
- 可配置主智能体、子智能体和 reasoning effort 策略。

## 前置要求

- [Bun](https://bun.com) v1.0 或更高版本。
- 至少一个 LLM API Key，例如 OpenAI、Anthropic、Google、xAI、OpenRouter、DeepSeek 或 Ollama。
- `FINANCIAL_DATASETS_API_KEY`，用于美股/全球金融数据。
- `TUSHARE_TOKEN`，用于 A 股结构化数据和技术分析。
- `EXASEARCH_API_KEY` 或 `TAVILY_API_KEY`，用于网页搜索。
- 如需使用飞书网关，需要 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。

安装 Bun：

```bash
# macOS/Linux
curl -fsSL https://bun.com/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1|iex"
```

## 安装

```bash
git clone https://github.com/Flying-Henanese/eugene-krab.git
cd eugene-krab
bun install
```

## 环境变量

复制示例配置文件，然后填写需要的 API Key：

```bash
cp env.example .env
```

常用配置：

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
TUSHARE_TOKEN=your-tushare-token
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

不要提交 `.env` 文件或任何真实 API Key。

## 运行 CLI

```bash
bun start
```

开发 watch 模式：

```bash
bun dev
```

在 CLI 中可以使用 `/model` 切换 provider 和模型。

## 运行网关

网关模式可以让 Eugene Krab 回复聊天消息。Dexter 原本支持 WhatsApp，这个 fork 额外增加了飞书支持。

```bash
bun run gateway
```

WhatsApp 登录：

```bash
bun run gateway:login
```

飞书使用方式：在 `.env` 中配置飞书应用凭证，在 gateway 配置中启用 Feishu channel，然后向飞书机器人发送一对一文本消息。当前版本支持一对一文本聊天、富文本回答、表格和长回答卡片，以及可选的可更新处理状态卡片；仍不支持群聊、webhook、图片、逐工具进度更新或项目本地 allowlist。

## 评测

运行完整评测：

```bash
bun run src/evals/run.ts
```

抽样评测：

```bash
bun run src/evals/run.ts --sample 10
```

## 调试

每次查询都会在 `.dexter/scratchpad/` 下写入 JSONL 文件，记录原始问题、工具调用、工具结果、模型摘要和 thinking 事件，方便回看一次回答是如何生成的。

```text
.dexter/scratchpad/
|-- 2026-01-30-111400_9a8f10723f79.jsonl
|-- 2026-01-30-143022_a1b2c3d4e5f6.jsonl
`-- ...
```

## 贡献

1. Fork 本仓库。
2. 创建 feature branch。
3. 保持改动聚焦。
4. 修改逻辑后运行 `bun run typecheck` 和 `bun test`。
5. 提交 Pull Request。

未经明确确认，请不要 push、打 tag、发布 npm 包或创建 release。

## 许可证

本项目基于 MIT License 开源。
