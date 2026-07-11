# 飞书“正在分析”状态卡片实施计划

## 1. 背景与目标

当前飞书网关收到用户消息后，会等待 Agent 完整执行结束，再向飞书发送最终回答。对于耗时较长的分析，用户在等待期间看不到任何状态反馈，容易误以为机器人没有工作。

本次改动要在飞书一对一聊天中加入可配置的状态卡片：

1. 用户发送问题后，机器人立即发送“正在分析中”卡片。
2. Agent 在后台继续执行。
3. Agent 完成后，机器人将同一张卡片原地更新为最终回答。
4. Agent 失败或返回空答案时，卡片进入明确的终止状态，不得永久停留在“正在分析中”。

目标交互流程：

```text
用户发送问题
  → 立即发送状态卡片：“⏳ 正在分析中，请稍候…”
  → Agent 执行
  → 原地更新同一张卡片为最终回答
```

本计划只覆盖现有飞书一对一文本聊天，不扩展群聊、Webhook、流式卡片更新或逐工具进度推送。

## 2. 已确认的飞书能力与权限

状态卡片通过飞书 `interactive` 消息发送。发送成功后保存响应中的 `message_id`，Agent 完成时调用更新消息接口：

```text
PATCH /open-apis/im/v1/messages/:message_id
```

飞书后台需要确认以下能力已经开通、审批并随应用版本发布：

- `Get direct messages sent to bot`：接收用户发给机器人的单聊消息。
- `Send messages as an app`：以机器人身份发送状态卡片。
- `Update message`：更新机器人已经发送的卡片。
- 已在事件配置中订阅 `im.message.receive_v1`。
- 事件接收方式为长连接。

初始卡片和更新后的卡片都必须显式包含：

```json
{
  "config": {
    "wide_screen_mode": true,
    "update_multi": true
  }
}
```

飞书只允许更新未撤回的共享卡片，要求更新身份与发送身份一致；卡片内容上限为 30 KB，只能更新 14 天内发送的消息，单条消息更新频率上限为 5 QPS。

## 3. 配置设计

在 `.dexter/gateway.json` 的飞书配置中增加：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "processingCard": {
        "enabled": true,
        "text": "正在分析中，请稍候…"
      }
    }
  }
}
```

建议默认值：

```ts
{
  enabled: false,
  text: '正在分析中，请稍候…',
}
```

默认关闭可以避免已有部署尚未申请 `Update message` 权限时持续产生失败请求。用户确认权限后，再显式打开该功能。

第一版只提供 channel 级配置，不增加 account 级覆盖，避免扩大配置和解析复杂度。

## 4. 实施步骤

### 4.1 扩展网关配置

修改 `src/gateway/config.ts`：

- 在飞书配置 Schema 中增加 `processingCard`。
- 在 `GatewayConfig` 类型中增加对应字段。
- 在配置加载逻辑中补齐默认值。
- 对空白 `text` 做规范化处理，建议回退到默认文案。

修改 `src/gateway/config.test.ts`，覆盖：

- 未配置时默认关闭状态卡片。
- 只配置 `enabled` 时使用默认文案。
- 自定义 `text` 能正确解析。
- 非字符串文案被 Zod 拒绝。
- 空白文案回退为默认值。

### 4.2 新增飞书状态卡片模块

新增：

```text
src/gateway/channels/feishu/processing-card.ts
```

该模块集中处理状态卡片的格式和 API 生命周期，避免把飞书 SDK 细节堆积在 `src/gateway/gateway.ts`。

建议提供以下职责明确的函数：

```ts
formatFeishuProcessingCard(text: string): FeishuInteractiveCard
formatFeishuFinalCard(body: string): FeishuInteractiveCard
formatFeishuErrorCard(text: string): FeishuInteractiveCard
createFeishuProcessingCard(...): Promise<string>
updateFeishuProcessingCard(...): Promise<void>
```

创建状态卡片：

```ts
const response = await client.im.v1.message.create({
  params: {
    receive_id_type: 'chat_id',
  },
  data: {
    receive_id: chatId,
    msg_type: 'interactive',
    content: JSON.stringify(card),
  },
});
```

必须从响应中读取并验证：

```ts
response.data?.message_id
```

更新状态卡片：

```ts
await client.im.v1.message.patch({
  path: {
    message_id: processingMessageId,
  },
  data: {
    content: JSON.stringify(finalCard),
  },
});
```

创建和更新都要检查两类错误：

1. SDK 调用是否抛出异常。
2. 返回体中的 `code` 是否为 `0`。

不能假设飞书所有 API 错误都会通过 Promise rejection 返回。创建接口即使没有抛出异常，只要缺少 `message_id`，也应视为创建失败。

### 4.3 扩展卡片格式化

修改 `src/gateway/channels/feishu/card-format.ts`：

- 在 `FeishuInteractiveCard.config` 中增加 `update_multi: true`。
- 确保现有表格卡片也满足可更新要求。
- 新增通用最终回答卡片格式化能力，不能只支持包含 Markdown 表格的回答。

建议增加：

```ts
formatFeishuAnswerCard(body: string): FeishuInteractiveCard
```

格式化规则：

- 包含表格时复用现有表格卡片逻辑。
- 不包含表格时使用 `lark_md` 元素渲染普通回答。
- 尽量保留标题、列表、链接和加粗格式。
- 限制元素数量和序列化后的卡片体积。
- 第一版遇到超长回答时安全截断，并在卡片底部明确提示内容已省略。

状态卡片开启后，最终回答会以交互式卡片交付；状态卡片关闭或创建失败时，继续使用当前 `sendMessageFeishu()` 的富文本/表格发送逻辑。

### 4.4 接入网关生命周期

修改 `src/gateway/gateway.ts` 中的 `handleFeishuInbound()`。

推荐执行顺序：

```text
解析路由和 sessionKey
  → 如果同一 session 正在运行，则按现有逻辑入队并返回
  → 解析飞书账号凭证
  → 如果启用了 processingCard，尝试创建状态卡片
  → 执行 runAgentForMessage
  → 有状态卡片：更新为最终回答
  → 无状态卡片：沿用 sendMessageFeishu 发送最终回答
```

伪代码：

```ts
if (isSessionRunning(route.sessionKey)) {
  enqueueForSession(route.sessionKey, model, inbound.body);
  return;
}

let processingMessageId: string | null = null;

if (cfg.channels.feishu.processingCard.enabled) {
  try {
    processingMessageId = await createFeishuProcessingCard({
      chatId: inbound.chatId,
      text: cfg.channels.feishu.processingCard.text,
      appId: account.appId,
      appSecret: account.appSecret,
    });
  } catch {
    // 状态反馈属于增强能力，失败后继续执行 Agent。
  }
}

try {
  const answer = await runAgentForMessage(...);

  if (!answer.trim()) {
    if (processingMessageId) {
      await updateFeishuProcessingCardToEmpty(...);
    }
    return;
  }

  if (processingMessageId) {
    try {
      await updateFeishuProcessingCard({
        messageId: processingMessageId,
        body: answer,
      });
      return;
    } catch {
      // 降级为现有的独立消息发送路径。
    }
  }

  await sendMessageFeishu(...);
} catch (error) {
  if (processingMessageId) {
    try {
      await updateFeishuProcessingCardToError(...);
    } catch {
      // 状态卡片更新失败不能覆盖原始异常。
    }
  }
}
```

状态卡片 API 失败可以写入现有 Gateway 调试日志，但不得新增包含 App ID、App Secret、token 或完整敏感响应的日志。

### 4.5 更新模块导出

修改：

```text
src/gateway/channels/feishu/index.ts
```

导出新增的状态卡片函数和必要类型。

如状态卡片模块需要复用 `outbound.ts` 中的 Feishu Client 创建逻辑，可以做小范围提取或导出；不要为此重构整个飞书 outbound 层。

## 5. Session 与排队消息边界

当前飞书单聊使用 `chatId` 参与构造 `sessionKey`。不同用户通常拥有不同的单聊 `chatId`，因此会分别维护状态卡片 `message_id` 和 Agent 生命周期。

同一个 session 已经在运行时，后续消息会进入现有消息队列。第一版采用以下规则：

- 只有真正启动 Agent run 的第一条消息创建状态卡片。
- 同一 session 后续入队的消息不创建第二张状态卡片。
- 原状态卡片继续显示“正在分析中”。
- Agent 消费队列并结束后，将原卡片更新为最终回答。

不要在第一版中给每条排队消息都创建状态卡片。当前 `agent-runner` 没有暴露“某条排队消息何时消费完成”的生命周期信号，额外卡片可能无法正确结束。

## 6. 失败与降级策略

### 6.1 状态卡片创建失败

- 继续运行 Agent。
- Agent 完成后调用现有 `sendMessageFeishu()`。
- 不向用户暴露内部 API 错误。

### 6.2 最终卡片更新失败

- 使用现有 `sendMessageFeishu()` 独立发送最终回答，确保不丢答案。
- 最佳努力清理旧状态卡片，避免它永久停留在“正在分析中”。
- 可评估调用 `client.im.v1.message.delete()` 撤回机器人自己发送的状态卡片，但必须在真实飞书环境确认现有权限和企业撤回策略允许该操作。
- 清理失败不得影响最终回答发送。

### 6.3 Agent 执行失败

如果状态卡片已经创建，更新为：

```text
⚠️ 分析失败，请稍后重试。
```

不得将异常堆栈、内部文件路径、上游响应或凭证显示给用户。

### 6.4 Agent 返回空答案

如果状态卡片已经创建，更新为：

```text
暂时没有生成有效回复，请重新发送问题。
```

不得让卡片永久停留在“正在分析中”。

## 7. 测试计划

新增：

```text
src/gateway/channels/feishu/processing-card.test.ts
```

至少覆盖：

- 初始卡片包含默认文案。
- 初始卡片支持自定义文案。
- 初始卡片包含 `update_multi: true`。
- 创建请求使用 `msg_type: 'interactive'`。
- 创建成功时返回 `message_id`。
- 缺少 `message_id` 时视为失败。
- API 返回非零 `code` 时视为失败。
- 更新请求使用正确的 `message_id`。
- 最终卡片仍包含 `update_multi: true`。
- 普通 Markdown 回答能生成最终卡片。
- Markdown 表格继续按现有表格样式渲染。
- 错误和空答案卡片能正确生成。
- 序列化请求内容不包含 App ID 或 App Secret。
- 状态卡片创建失败时，最终回答走现有降级发送路径。
- 状态卡片更新失败时，最终回答仍能发送。
- 同一 session 忙碌时，不重复创建状态卡片。

## 8. 验证命令

先运行聚焦测试：

```bash
bun test src/gateway/config.test.ts
bun test src/gateway/channels/feishu/*.test.ts
```

再运行：

```bash
bun run typecheck
git diff --check
git status --short
```

如果改动影响现有 outbound 或通用 Gateway 行为，再运行完整测试：

```bash
bun test
```

## 9. 飞书真实环境验收

静态检查和单元测试通过后，在真实飞书单聊中逐项验证：

1. 发送一个预计执行超过 10 秒的问题。
2. 状态卡片应在 Agent 完成前立即出现。
3. 卡片显示配置的“正在分析中，请稍候…”。
4. Agent 完成后，原卡片被更新，而不是新增第二条最终消息。
5. 普通 Markdown 回答显示正常。
6. 包含 Markdown 表格的回答显示正常。
7. 连续快速发送两条消息，不产生永久停留的额外状态卡片。
8. 两个不同用户同时发送消息，各自看到并更新自己的状态卡片。
9. 模拟 Agent 异常后，卡片显示失败状态。
10. 模拟空答案后，卡片显示明确提示。
11. 模拟状态卡片创建失败后，最终回答仍以普通消息送达。
12. 模拟卡片更新失败后，最终回答仍以独立消息送达。

## 10. 完成标准

以下条件全部满足后才能声明完成：

- 状态文案可通过 Gateway 配置修改。
- 状态卡片创建后能原地更新为最终回答。
- 初始和最终卡片都包含 `update_multi: true`。
- 卡片创建或更新失败不会丢失最终回答。
- Agent 异常和空回答不会留下永久“正在分析”卡片。
- 同一 session 的排队消息不会重复创建无法结束的状态卡片。
- 不同飞书用户的状态卡片和 session 生命周期互不干扰。
- 聚焦测试通过。
- `bun run typecheck` 通过。
- `git diff --check` 通过。
- 真实飞书单聊验收通过；如受凭证、权限或发布状态限制，需明确记录未完成的验证项。
