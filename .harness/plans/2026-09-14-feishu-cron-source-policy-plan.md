# Feishu P2P 定时任务与 A 股数据源策略实施计划

## Status

- State: implemented
- Created: 2026-09-14
- Implementation started: 2026-09-14
- Owner: current branch

## Goal

让用户能够在 Feishu 一对一聊天中创建、查看、修改、暂停、立即执行和删除定时任务。任务到期时必须把结果投递回创建该任务的**同一个 Feishu `chatId`**。

每次任务执行必须是隔离的 Agent 运行：它不读取或写入原 Feishu 对话的历史上下文。任务的持久化提示词是执行时唯一的业务上下文。

为控制有限的 Tavily 额度，为新建的 A 股监控任务提供两种可强制执行的数据源策略：

- `tushare_only`：只允许 Tushare A 股工具和本地确定性计算；绝不绑定 `web_search`，因此不会消耗 Tavily。
- `tushare_plus_news`：允许上述 Tushare 工具，并至多进行一次 `web_search` 以补充新闻、政策或公告语境。当前仅配置 Tavily 时，这一次搜索会消耗 Tavily；未来配置其他搜索提供商时仍遵循现有的首选/回退顺序。

## Confirmed Decisions

- Feishu 范围保持现有的一对一文本聊天；不增加群聊、Webhook 或交互式卡片回调。
- 新建 Feishu 任务在创建时固定 `accountId` 和 `chatId`，不能在执行时从“最近活动会话”推断投递目标。
- Feishu 任务按创建聊天隔离。来自其他 Feishu 聊天的 `list`、`update`、`run` 或 `remove` 不得读取或操作该任务。
- 执行使用 `sessionKey: cron:<jobId>` 和 `isolatedSession: true`；结果显示在原聊天窗口，但不会污染该窗口的 Agent 历史。
- 数据源策略是任务的持久化属性，而不是仅依赖自然语言提示中的“不要用 Tavily”。
- `tushare_plus_news` 的新闻搜索预算为每次任务运行最多一次 `web_search`。一条搜索结果中的 URL 可允许最多一次 `web_fetch` 用于核实材料；这不使用 Tavily，但会产生额外模型/网络成本。

## Source-Backed Starting Point

- Feishu 入站已经以 `chatId` 构建 P2P 路由，并可通过 `sendMessageFeishu()` 向该聊天发送富文本或卡片：`src/gateway/gateway.ts`、`src/gateway/channels/feishu/outbound.ts`。
- `cron` 已经可由 Agent 调用，任务持久化在 `.dexter/cron/jobs.json`，调度器由 gateway 启动：`src/tools/cron/cron-tool.ts`、`src/cron/store.ts`、`src/cron/runner.ts`。
- 当前执行器从默认 Agent 的最近会话中猜测接收人，并强制走 WhatsApp；任务没有归属和投递目标，不能满足 Feishu 同聊天回发：`src/cron/executor.ts`。
- A 股结构化数据、技术状态和广义市场情绪来自 Tushare；近期新闻与政策语境来自 `web_search`。当前项目 `.env` 中的 web-search key 只有 Tavily。`market_sentiment_analysis` 只返回新闻检索建议，不自行获取新闻：`.harness/context/market-data-sources.md`、`src/tools/finance/tushare/market-sentiment.ts`、`src/tools/registry.ts`。
- 现有 Feishu 原始设计将 cron/heartbeat 投递列为当时非目标；这次实现应更新该说明，避免文档与运行时漂移：`docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md`。

## Intended User Experience

```text
Feishu P2P: “每个交易日收盘后检查 A 股市场宽度和涨跌停，只用 Tushare；异常才提醒我”
       │
       ▼
Agent invokes cron.add with sourcePolicy=tushare_only
       │
       ▼
jobs.json stores owner + Feishu delivery target + isolated execution policy
       │
       ▼
Gateway cron runner reaches the due time
       │
       ▼
Isolated Agent receives the persisted task prompt and a Tushare-only tool set
       │
       ├── condition not met → HEARTBEAT_OK → no Feishu message
       └── report/condition met → Feishu adapter sends to the original chatId
```

Management remains conversational in the first release:

- “我的定时任务”
- “暂停任务 `a1b2c3d4`” / “恢复任务 `a1b2c3d4`”
- “把 `a1b2c3d4` 改成每天 15:10”
- “立即执行 `a1b2c3d4`”
- “删除任务 `a1b2c3d4`”

`list` returns only the caller's tasks, ordered by next run time, with a short job ID, name, schedule, source policy, notification mode, next run, and last status. An exact ID authorizes a direct delete; an ambiguous natural-language name must be resolved to an ID before deletion.

## Design

### 1. Persist task ownership and delivery separately

Extend `CronJob` with explicit ownership, delivery, and execution fields. The persisted `message` remains the full task instruction; no chat transcript is copied into it.

```ts
type FeishuP2POwner = {
  channel: 'feishu';
  accountId: string;
  chatId: string;
};

type CronDeliveryTarget =
  | { channel: 'feishu'; accountId: string; chatId: string }
  | { channel: 'whatsapp'; accountId: string; to: string };

type AShareSourcePolicy = 'tushare_only' | 'tushare_plus_news';
type CronNotificationMode = 'always' | 'on_actionable_result';

type CronExecutionPolicy = {
  sessionMode: 'isolated';
  sourcePolicy?: AShareSourcePolicy;
  notificationMode: CronNotificationMode;
};
```

For a Feishu P2P task, `owner.chatId` and `deliveryTarget.chatId` initially have the same value, but they remain separate concepts: ownership controls management authorization; the delivery target controls where output goes.

Do not store a Feishu app secret, model API key, or raw chat history in a job. The job store remains under gitignored `.dexter/` state.

### 2. Put task lifecycle behind one deep module

Add a `CronTaskService` module under `src/cron/` with a small caller-facing interface such as `create`, `listForOwner`, `updateForOwner`, `removeForOwner`, and `runForOwner`.

Its implementation owns all of the following so the tool and gateway handlers do not duplicate rules:

- creation-context validation and mapping to `owner` / `deliveryTarget`;
- owner filtering and not-found behavior for another user's job;
- active-job quota and schedule frequency validation;
- source-policy validation (`TUSHARE_TOKEN` required for both policies; at least one configured web provider required for `tushare_plus_news`);
- creation/update timestamps, next-run calculation, and atomic store writes;
- user-facing short-ID lookup and ambiguity handling.

`cron` mutates a shared JSON file, so it must not remain merely "concurrency safe" because its individual file writes are atomic. The module must serialize read-modify-write operations inside the process, and the registry must mark cron mutations as serial for Agent tool execution. This prevents two simultaneous `add` calls from both reading the same file and one overwriting the other's new job.

`src/tools/cron/cron-tool.ts` should become a thin adapter from the LLM schema to this module. It must no longer load the store and make unscoped mutations directly.

### 3. Carry creation context explicitly into the cron tool

The current cron tool is a singleton and receives no information about the inbound Feishu conversation. Introduce an explicit, immutable tool runtime context rather than global mutable state or `AsyncLocalStorage`.

```text
handleFeishuInbound
  → runAgentForMessage({ toolContext: { scheduledTaskCaller } })
  → Agent.create({ toolContext })
  → getTools(model, toolContext)
  → createCronTool({ caller, taskService })
```

The caller context for Feishu includes only `channel`, routed `accountId`, `chatId`, and `agentId`. `senderOpenId` may be retained for diagnostics if present but is not required for authorization in this P2P-only release: the stable `chatId` scopes both ownership and delivery.

The same context mechanism can later bind WhatsApp tasks to a specific WhatsApp recipient. This change must not alter the CLI's ordinary tool behavior.

### 4. Replace the WhatsApp-only delivery path with a real delivery seam

Add a `CronResultDelivery` module under `src/cron/`. Its interface accepts an explicit `CronDeliveryTarget` and message body. Its implementation selects a channel adapter:

- Feishu adapter: resolve the configured Feishu account, then call `sendMessageFeishu({ appId, appSecret, chatId, body })`.
- WhatsApp adapter: retain existing allowlist validation and `sendMessageWhatsApp` behavior for a job that has an explicit WhatsApp target.

`executeCronJob()` must stop reading `sessions.json` and must never select an output chat based on recency. It receives the target from the job and passes the target channel to `runAgentForMessage()` so Feishu uses its own response-format profile.

Delivery is part of success semantics. A Feishu send failure must call the existing error/backoff path rather than leave `lastRunStatus: 'ok'` with a past `nextRunAtMs`. Only update duplicate-suppression state and auto-disable a `once` task after a successful send.

### 5. Enforce data source strategies structurally

Add `toolAllowlist` and `toolExecutionBudget` plumbing to `AgentRunRequest` / `runAgentForMessage()`, forwarding them to `Agent.create()`.

For jobs with a source policy, the executor constructs both a concise policy prompt and a structural tool restriction:

| Policy | Bound tools | Budget |
|---|---|---|
| `tushare_only` | `a_share_analysis`, `market_sentiment_analysis`, `technical_analysis`, `financial_calculator` | At most four total tool executions; no `web_search`, `web_fetch`, browser, or generic market-data tool. |
| `tushare_plus_news` | The Tushare-only set plus `web_search` and `web_fetch` | At most six total executions; `web_search: 1`, `web_fetch: 1`. |

Neither policy binds `cron`, `heartbeat`, file-write/edit, `spawn_subagent`, or interactive-question tools during scheduled execution. This prevents a scheduled task from recursively creating tasks or mutating local files.

For `tushare_only`, the execution prompt explicitly says that news, policy explanations, and company-event claims must be omitted rather than inferred. For `tushare_plus_news`, it says to use the single search for the most material, current Chinese news/policy/announcement query and to name source limitations when that search cannot establish a claim.

The project currently uses a provider-agnostic `web_search` fallback chain. `tushare_plus_news` limits how often that tool runs; it does not hard-code Tavily. With the current configuration it means one Tavily request per execution at most.

### 6. Separate report delivery from alert suppression

Retain lifecycle fulfillment (`keep`, `once`, `ask`) but introduce or map to an explicit `notificationMode`:

- `always`: scheduled report/reminder. Send the nonempty execution result on every successful run.
- `on_actionable_result`: monitoring alert. Append the `HEARTBEAT_OK` instruction and apply the existing empty/OK/no-action/duplicate suppression logic.

Do not apply the current unconditional “do not send a status update” prompt to an `always` report; it would contradict daily/weekly reporting tasks.

### 7. Preserve compatibility deliberately

Move the persisted store to version 2 and make loading tolerant of version-1 jobs.

- New Feishu jobs always require `owner`, `deliveryTarget`, and `execution` fields.
- Existing targetless jobs remain readable and listable. The implementation must not attempt to infer a Feishu target from the newest session.
- Preserve current WhatsApp behavior only through an explicit, documented legacy path while existing targetless records remain. New gateway-created WhatsApp tasks should use the same creation-context mechanism and receive an explicit WhatsApp target.
- A legacy job must never be implicitly converted into a Feishu job. A later migration/management command may rebind a legacy task after an explicit user request.
- The global heartbeat job is out of scope for Feishu delivery in this release. Do not silently bind it to the most recent Feishu chat. Its current behavior must be isolated from the new Feishu task contract, and its future per-user design should be a separate decision.

### 8. Model selection and scheduling behavior

Cron execution should use the headless gateway model policy rather than CLI-only settings:

```text
job.payload model/provider override
→ gateway.json model/provider
→ DEXTER_AGENT_MODEL / DEXTER_AGENT_MODEL_PROVIDER
→ local settings/default
```

Use `resolveGatewayAgentModel(loadGatewayConfig(configPath), explicitOverride)` so Feishu messages and tasks created from them follow the same operational model policy.

The runner remains process-local and executes due jobs serially. The first implementation does not add distributed locking or a persistent execution queue.

## Testability Contract

Tests must cross the same module interfaces used by production. Do not mock private implementation details or use real time, `.dexter/` state, network calls, LLM credentials, or a Feishu app.

- `CronTaskService` accepts a store adapter, clock, ID generator, and in-process mutation serializer. Tests use an in-memory adapter and deterministic IDs to exercise owner checks, quotas, and concurrent calls.
- `CronResultDelivery` accepts Feishu/WhatsApp sender adapters and configuration resolution. Tests capture target and payload without a real outbound message.
- The executor accepts injected `runAgent`, delivery, clock, store, and model-resolution dependencies. Tests can deterministically produce Agent answers, provider failures, or delivery failures.
- The runner accepts a fake clock, timer adapter, store adapter, and executor. Tests advance virtual time rather than sleeping and can prove serial order, re-arming, stop behavior, and restart/misfire policy.

These are internal seams; the external cron-tool interface stays small.

## Implementation Steps

### 1. Establish a safe baseline

- Read `AGENTS.md`, `.harness/README.md`, gateway/channel, tool/subagent, market-data, security, code-change, and verification context.
- Run `git status --short` and preserve the existing unrelated working-tree changes.
- Read the current cron, gateway, Feishu outbound, agent-runner, tool registry, and related tests before editing.
- Add no secrets to fixtures or documentation.

### 2. Define version-2 cron domain types and storage compatibility

Edit `src/cron/types.ts` and `src/cron/store.ts`.

- Add the Feishu ownership, delivery target, source-policy, notification-mode, and isolated-execution types.
- Add state needed to explain target/configuration errors without exposing credentials.
- Implement version-1 read compatibility and version-2 write behavior.
- Add store/type tests covering valid Feishu jobs, old targetless jobs, and malformed stored data.
- Cover missing files, invalid JSON, missing `jobs`, an unknown store version, a v1 record with no target, and a v2 record with incomplete owner/delivery fields. The result must be explicit rather than silently treating malformed data as a usable job.

### 3. Add the task lifecycle module and contextual cron tool factory

Add `src/cron/task-service.ts` and tests; refactor `src/tools/cron/cron-tool.ts` into `createCronTool(context)`.

- Enforce owner scoping for every management action, including immediate execution.
- Require a Feishu caller context when creating a Feishu-bound task.
- Add `sourcePolicy` and `notificationMode` to the tool schema and descriptions; default A-share monitoring to `tushare_only` unless the request explicitly needs current news/policy/announcements.
- Validate the Tushare/search prerequisites before persisting a job.
- Make task list output compact and Feishu-readable; include a stable short job ID.
- Reject fast cron expressions as well as `everyMs` values below the agreed minimum.
- Keep exact-ID deletion direct; do not implement broad name-based deletion in the tool.
- Serialize create/update/delete operations and add a `Promise.all` regression test proving that concurrent adds do not lose a job.
- Test the quota boundary, disable/remove freeing capacity, same-chat/different-account isolation, absent caller context, and short-ID prefix collision handling.

### 4. Thread tool context and execution limits through the Agent

Edit `src/agent/types.ts`, `src/agent/agent.ts`, `src/gateway/agent-runner.ts`, and `src/tools/registry.ts`; add a small shared tool-context type if needed.

- Let the agent registry construct a context-bound cron tool per agent run.
- Pass Feishu caller context from `handleFeishuInbound()` after route resolution.
- Add an `AgentRunRequest` path for a restricted tool allow-list and a per-run tool-execution budget.
- Preserve CLI behavior and all tools for ordinary non-cron Agent runs.

### 5. Implement target-bound multi-channel result delivery

Add `src/cron/delivery.ts` and tests; refactor `src/cron/executor.ts`.

- Remove `findTargetSession()` and the `sessions.json` dependency from cron delivery.
- Use the job's target to choose Feishu or WhatsApp, preserving WhatsApp's access checks.
- Resolve Feishu credentials only at send time from the configured account; never persist them.
- Set `channel` to the delivery target's channel for the scheduled Agent run.
- Treat send failures as retryable job failures; preserve once-only disable semantics after confirmed delivery.
- Resolve model/provider through gateway policy and honour per-job overrides.
- Inject the runner/executor's clock, store, Agent, delivery, and model-resolution dependencies so tests do not depend on a real timer, the local job file, credentials, or network state.

### 6. Implement source-policy enforcement and notification modes

In the executor, map each policy to the documented allow-list, budget, and prompt fragment.

- Ensure `tushare_only` cannot call `web_search` even if the model asks for it.
- Ensure `tushare_plus_news` rejects a second `web_search` call through `ToolExecutionBudget`.
- Keep `always` reports separate from `on_actionable_result` suppression.
- Return source and data-availability limitations in the Feishu response rather than inventing a news explanation in Tushare-only mode.

### 7. Align gateway/docs and retain legacy behavior safely

- Update Feishu gateway tests and the Feishu design specification to make P2P cron delivery an explicit supported scope.
- Update `.harness/context/gateway-and-channels.md`, `.harness/context/tools-skills-and-subagents.md`, and `.harness/context/market-data-sources.md` after behavior is implemented.
- Keep heartbeat explicitly out of Feishu target binding; add a regression test proving it is not redirected to a recently active Feishu chat.

### 8. Verify end to end with injected adapters

Run focused unit tests first, then type checking and the broader relevant suite. Use fake Feishu and WhatsApp senders; do not send a real message or require production credentials in tests.

## Expected Files

### Runtime

- `src/cron/types.ts`
- `src/cron/store.ts`
- `src/cron/task-service.ts` (new)
- `src/cron/delivery.ts` (new)
- `src/cron/executor.ts`
- `src/tools/cron/cron-tool.ts`
- `src/tools/registry.ts`
- `src/agent/types.ts`
- `src/agent/agent.ts`
- `src/gateway/agent-runner.ts`
- `src/gateway/gateway.ts`

### Tests

- `src/cron/store.test.ts` (new or expanded)
- `src/cron/task-service.test.ts` (new)
- `src/cron/delivery.test.ts` (new)
- `src/cron/executor.test.ts` (new)
- `src/tools/cron/cron-tool.test.ts` (new)
- `src/gateway/gateway.feishu.test.ts`
- Focused registry/agent-runner tests where context and allow-list behavior is introduced

### Documentation

- `docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md`
- `.harness/context/gateway-and-channels.md`
- `.harness/context/tools-skills-and-subagents.md`
- `.harness/context/market-data-sources.md`
- This plan's progress notes

## Test Matrix

### A. Persistence, creation, and authorization

| Scenario | Expected result |
|---|---|
| Feishu creates a `tushare_only` task | Store contains the creating account/chat target, isolated execution policy, and calculated next run; it contains no secret or chat-history text. |
| Caller attempts to supply a different `owner` or `deliveryTarget` through tool arguments | The schema/service ignores or rejects it; only the trusted inbound caller context determines target and owner. |
| Same `chatId`, different `accountId` | Both owner scope and Feishu delivery remain account-specific. |
| Other Feishu chat uses a full ID, a short ID, or the same task name | The task is absent/not-found and no list, run, update, pause, resume, or delete mutation occurs. |
| Short-ID prefix collision | The service refuses the ambiguous short ID and requires the full ID. |
| No gateway caller context / CLI caller | It cannot create a Feishu-bound task; existing non-Feishu behavior stays explicit and covered separately. |
| Quota boundary | The configured maximum active tasks succeeds; one additional active task fails; disabling, removing, or consuming a one-time task frees capacity as specified. |
| Concurrent creates | Two or more `Promise.all` adds persist every task exactly once; no lost update, duplicate ID, or quota bypass. |
| List view | Results are owner-scoped, sorted by next run, stable under disabled/no-next-run records, and contain only the intended Feishu-readable fields. |

### B. Store migration and malformed data

| Scenario | Expected result |
|---|---|
| Missing store | Returns a valid empty v2 store. |
| Invalid JSON, missing `jobs`, non-array `jobs` | Returns an explicit recoverable empty/error state; it never executes an invented job. |
| v1 targetless job | Remains readable/listable, cannot be silently rebound to Feishu, and takes only the chosen legacy/rebind path. |
| v2 job with incomplete owner/delivery/execution fields | Is rejected or marked invalid; it cannot execute or send. |
| Unknown future store version | Fails closed with an actionable diagnostic, rather than writing a destructive downgrade. |
| Atomic write failure | Temporary file is cleaned up and the last valid store remains readable. |

### C. Schedule calculation, runner, and restart behavior

| Scenario | Expected result |
|---|---|
| One-time schedule in the past, invalid ISO timestamp, invalid cron | Creation/update rejects it without writing an enabled runnable task. |
| `everyMs` and Cron expressions faster than the agreed one-minute floor | Both are rejected; a six-field Cron cannot bypass the interval floor. |
| Exact interval boundary and restart with missing `nextRunAtMs` | Calculates the next future run without a spin loop or duplicate immediate fire. |
| `Asia/Shanghai` default, explicit timezone, and date/day transition | The next run is calculated in the task timezone, not the host's implicit timezone. |
| Update schedule, disable, then re-enable | Next run is recomputed correctly; a disabled task is not accidentally executed. |
| Active-hours/day restriction | A due job outside its window is skipped and rescheduled without Agent or Feishu delivery. |
| Multiple due jobs | Runner executes serially in deterministic due order; one failure does not prevent the next job or re-arming. |
| Stop during a tick | No subsequent job starts after stop, and no later timer remains armed. |
| New job while idle | Runner sees it within the documented 60-second polling cap. |
| Restart/misfire | One-time and periodic jobs follow the final confirmed missed-run policy, including multiple overdue periodic occurrences. |

### D. Execution, notification, retry, and model policy

| Scenario | Expected result |
|---|---|
| Isolated Feishu execution | Agent receives `sessionKey: cron:<jobId>`, `isolatedSession: true`, and `channel: 'feishu'`; no originating chat history is passed. |
| Model resolution | Per-job override wins over gateway config, then `DEXTER_AGENT_*`, then settings/default. |
| `always` report | Each nonempty successful run sends its result; the actionable-only suppression prompt is absent. |
| Actionable monitoring: empty, `HEARTBEAT_OK`, dismissive phrase, and duplicate | No Feishu send occurs and state records the correct suppression status. |
| Duplicate after process restart | First-release policy is explicit and tested: suppression is process-local, so a restart may permit one repeat of the same alert. |
| `once` task with a delivered alert | It sends once, then disables only after confirmed delivery. |
| `once` task with a suppressed/no-action result | It is not falsely recorded as fulfilled; its final scheduling behavior is explicit and tested. |
| Agent failure | Error count, duration, `lastError`, and backoff are written correctly. |
| Feishu delivery failure | Same error/backoff path applies; no duplicate-suppression update, false `ok`, or premature `once` disable. |
| Terminal one-time failure | After the retry limit, it disables and follows the final confirmed failure-notification rule exactly once. |
| `ask` fulfillment | Either the defined Feishu continuation behavior works end to end, or the tool rejects/does not expose `ask` for Feishu in the first release. |

### E. Feishu delivery and legacy safety

| Scenario | Expected result |
|---|---|
| Newer Feishu or WhatsApp conversations exist before firing | The task sends only to its persisted original Feishu `chatId`; session-recency storage is never consulted. |
| Feishu account missing, disabled, or lacks credentials | No message is sent; the job enters the retry/error contract without exposing credential values. |
| Rich text, table, and long paginated result | The Feishu adapter receives the persisted chat target and preserves existing post/card/fallback behavior. |
| Legacy WhatsApp job with explicit target | It retains outbound allowlist validation and does not route through Feishu. |
| Legacy targetless job after recent Feishu activity | It is never sent to the recent Feishu chat. |
| Global heartbeat after Feishu activity | It is never bound or redirected to a Feishu chat implicitly. |

### F. Source-policy capability and budget enforcement

| Scenario | Expected result |
|---|---|
| Missing `TUSHARE_TOKEN` | Both A-share policies are rejected at task creation; an invalid task is not persisted. |
| `tushare_plus_news` with no configured web provider | Creation is rejected with an actionable configuration error. |
| `tushare_only` tool set | Contains only the four approved Tushare/calculation tools; it omits `web_search`, `web_fetch`, browser, generic market data, cron, heartbeat, writes, skills, and subagents. |
| `tushare_only` model attempts web/news research | `web_search` is not bindable, no Tavily call occurs, and the final prompt/output records the news limitation instead of inventing a news claim. |
| `tushare_plus_news` tool set | Adds only `web_search` and `web_fetch` to the Tushare-only set. |
| Two `web_search` calls in one concurrent tool-call batch | The first reservation succeeds and the second is rejected; only one provider invocation occurs. |
| Two `web_fetch` calls or total-tool-budget overflow | Per-tool/total budget rejections occur before invocation and do not consume a second Tavily request. |
| Current provider configuration has only Tavily | One permitted `web_search` maps to one Tavily invocation; a future preferred provider still follows the existing fallback chain. |

## Acceptance Criteria

- A Feishu P2P user can create a task whose results always return to the same persisted Feishu chat.
- Scheduled Agent runs remain isolated from the originating conversation history.
- New Feishu task management is owner-scoped; one chat cannot list, run, edit, pause, resume, or delete another chat's task.
- `tushare_only` makes Tavily use structurally impossible for the run.
- `tushare_plus_news` permits at most one generic web search per run and retains the current provider-selection behavior.
- A Tushare-only report does not invent current-news explanations; it names that news was not queried when relevant.
- Delivery failure participates in retry/backoff and never creates a false successful completion.
- Concurrent task mutations cannot lose jobs or exceed the configured active-task quota.
- Schedule validation, timezone, active-hours, runner stop/re-arm, and confirmed missed-run behavior have deterministic virtual-time tests.
- Feishu task creation cannot accept an untrusted owner or delivery target from model-generated tool input.
- Every Tushare-only and news-policy capability restriction is tested from the final Agent-bound tool list, not only from a prompt string.
- No Feishu credentials, API keys, or raw conversation history enter `.dexter/cron/jobs.json`, tests, logs, or committed documentation.
- Existing targetless/WhatsApp behavior and global heartbeat handling have explicit compatibility tests; no task is silently rerouted to Feishu.
- Focused tests, `bun run typecheck`, and `git diff --check` pass.
- Harness context and the Feishu specification match the implemented behavior.

## Open Decisions Before Implementation

These choices affect user-visible scheduling semantics and should be confirmed before code starts:

1. **Timezone default:** propose `Asia/Shanghai` for newly created Feishu tasks when the user omits a timezone.
2. **Missed-run policy:** propose running a missed one-time reminder as soon as the gateway returns, while skipping overdue periodic reports and scheduling their next normal occurrence.
3. **Quota:** propose a configurable default of 20 enabled Feishu tasks per P2P chat, with a minimum one-minute schedule for both interval and cron-expression schedules.
4. **Terminal error notice:** propose sending one concise Feishu failure message after a one-time task exhausts its three retries; recurring tasks remain enabled with backoff unless explicitly disabled.
5. **Legacy targetless jobs:** decide whether to preserve their current WhatsApp fallback indefinitely or require explicit rebind before execution. The safe long-term outcome is explicit rebind.
6. **`ask` fulfillment:** propose not exposing `ask` for newly created Feishu tasks in the first release. It currently asks a natural-language follow-up but has no durable confirmation state machine; `keep` and `once` are sufficient for the planned task-management flow.

## Risks And Mitigations

### Misdelivery or cross-user management

Risk: selecting a recent session can deliver a task to an unrelated user, while global job IDs can expose or delete another user's task.

Mitigation: persist the creation target, scope every management action by owner, and remove recency lookup for target-bound tasks.

### Tavily cost leakage

Risk: natural-language instructions alone do not prevent a model from calling `web_search` repeatedly.

Mitigation: omit `web_search` from the Tushare-only tool set and enforce a per-tool budget of one in news mode.

### Context leakage or surprise behavior

Risk: reusing the live Feishu session would make an old scheduled task depend on unrelated later messages.

Mitigation: use an isolated execution session and the persisted task instruction only.

### Serial backlog and gateway restarts

Risk: the in-process runner executes due jobs serially; many overdue or slow tasks can delay later jobs.

Mitigation: enforce quotas/frequency floors, define missed-run behavior, retain per-job backoff, and defer distributed scheduling to a later design.

### Persisted-data migration

Risk: old jobs lack a safe recipient identity.

Mitigation: make version migration tolerant, never infer a Feishu target, and require explicit rebind for a safe target-bound contract.

## Out of Scope

- Feishu group-chat tasks, callback buttons, cron-management UI, or Webhook delivery.
- Push/event-driven price feeds; monitoring remains scheduled polling.
- A general Tushare news adapter. The current Tushare integration does not expose news endpoints.
- Distributed locks, multi-process scheduling, or a database migration beyond the local JSON store version.
- Persisting or replaying original Feishu chat history into a scheduled task.
- Replacing the existing generic web-search provider selection algorithm.
- Redesigning global heartbeat into per-user Feishu monitoring; that is a separate follow-up.

## Progress Notes

- 2026-09-14: Plan created after source review and product decisions. No runtime code changed. Existing unrelated working-tree changes were preserved.
- 2026-09-14: Test review expanded the matrix to cover persistence corruption/migration, caller spoofing, short-ID ambiguity, concurrent mutation, virtual-time scheduling, restart/misfire, delivery/error ordering, capability allow-lists, and concurrent budget reservations. No runtime code changed.
- 2026-09-14: Implemented v2 owner-scoped cron storage, Feishu/WhatsApp target delivery, isolated scheduled Agent runs, source-policy allow-lists and budgets, notification modes, task lifecycle serialization, runner misfire handling, and explicit WhatsApp-only heartbeat compatibility. Existing unrelated working-tree changes were preserved.
- 2026-09-14: Focused cron/gateway/tool tests pass (61 tests, 178 expectations); `bun run typecheck` and `git diff --check` pass. The broader suite still has the pre-existing controller mock timeouts (316 pass, 14 fail) in `src/controllers/agent-runner*.test.ts`; no controller files are part of this change.
- 2026-09-14: Review follow-up tightened owner/target consistency, filtered restricted tools from prompt-visible descriptions, exposed active-hour task management, preserved legacy WhatsApp-only fallback, kept legacy/CLI timezone behavior stable, and redacted unsafe provider diagnostics before persistence/logging.
