# Research Subagent Tool Budget And Forced Finalization Plan

## Status

- State: implemented; live behavioral evaluation pending
- Created: 2026-07-13
- Implementation started: yes
- Owner: current implementation session

## Goal

Prevent a research subagent from spending every agent iteration on expanding
web searches and then returning Reached maximum iterations without an evidence
packet.

The intended behavior is:

- keep research delegation model-driven;
- keep the existing research tool allow-list and maxIterations value;
- bound the number of external tool executions for a research worker;
- enforce the budget before concurrent calls start;
- return explicit budget-exhausted ToolMessages for skipped calls;
- reserve a final tool-free model turn so the worker always has an opportunity
  to synthesize the evidence already collected;
- return partial findings and limitations when the budget is insufficient;
- leave the main agent and other subagent types unchanged in Phase 1.

## Production Evidence

The plan is based on a 2026-07-13 broad single-company evaluation.

Routing worked:

- one technical-analysis worker completed successfully;
- one research worker was created for a recent-information lane.

The research worker did not complete:

- maxIterations: 8;
- web_search executions: 18;
- web_fetch executions: 4;
- total tool executions: 22;
- reported token usage: 213,182;
- elapsed tool-result window: approximately 80 seconds;
- final result: Reached maximum iterations (8).

The final child web_search result was written at 2026-07-13T07:52:22.190Z.
The parent spawn_subagent failure result was written at
2026-07-13T07:52:22.198Z. The eight-millisecond gap shows that the worker did
not receive another model turn for synthesis after its final search batch.

The call order showed repeated search expansion:

- four web searches, then two fetches;
- four more web searches, then one fetch;
- five more web searches, then one fetch;
- five final web searches before the loop exited.

This is evidence of a stopping and execution-budget problem, not a subagent
routing problem.

## Current Mechanism

### Soft warnings do not enforce a limit

src/agent/scratchpad.ts defines ToolLimitConfig with a default
maxCallsPerTool of 3. Scratchpad.canCallTool() deliberately returns
allowed: true even after the suggested limit. The existing behavior is useful
as a general main-agent warning and must not be converted into a global hard
limit in this change.

### Counting happens after execution

src/agent/tool-executor.ts currently calls canCallTool() before execution but
calls recordToolCall() only after the tool finishes or errors.

For a concurrent batch, several generators can all observe the same old count
before any result increments it. A hard limit implemented only by changing
allowed to false would therefore still permit an oversized first batch.

### The final iteration can still request tools

src/agent/agent.ts binds the full tool set on every loop iteration, including
the final allowed iteration. If that iteration returns tool calls, the tools
run and the while loop exits immediately afterward with the maximum-iterations
message. There is no reserved tool-free synthesis turn.

### Budget state is not part of AgentConfig

src/agent/types.ts has maxIterations and toolAllowlist but no execution-budget
or final-iteration policy. createRunContext() always constructs a Scratchpad
with the default soft-warning configuration.

## Scope

### Expected files to change

- src/agent/types.ts
- src/agent/run-context.ts
- src/agent/agent.ts
- src/agent/tool-executor.ts
- src/agent/tool-budget.ts (new)
- src/agent/tool-budget.test.ts (new)
- src/agent/tool-executor.test.ts (new, if integration coverage cannot fit
  cleanly in tool-budget.test.ts)
- src/tools/subagent/types.ts
- src/tools/subagent/spawn-subagent.ts
- src/tools/subagent/spawn-subagent.test.ts
- src/agent/prompts.ts
- src/agent/prompts.test.ts
- src/skills/stock-analysis/SKILL.md
- src/skills/registry.test.ts
- .harness/context/tools-skills-and-subagents.md
- .harness/context/market-data-sources.md

### Explicitly out of scope

- No deterministic subagent router.
- No change to spawn_subagent input schema or return format.
- No change to model selection or reasoning-effort resolution.
- No increase or decrease to research maxIterations in Phase 1.
- No removal of research tools from its allow-list.
- No global hard limit for the main agent.
- No hard budget for analysis, technical-analysis, or general-purpose workers
  without separate runtime evidence.
- No search-provider, gateway, CLI, environment-variable, or persistence
  changes.
- No change to financial or technical calculation contracts.
- No recursive subagents.

## Recommended Budget

Apply the following budget only to the research subagent:

    maxTotalExecutions: 6
    perTool:
      web_search: 3
      web_fetch: 2
      x_search: 1
      read_filings: 1
      get_market_data: 1
    reserveFinalIteration: true

The per-tool values intentionally sum to more than the total budget. The worker
may choose one bounded mix, but it can never execute more than six tools.

Examples:

- three web searches, two fetches, and one filing read;
- three web searches, two fetches, and one market-data call;
- two web searches, two fetches, one X search, and one filing read.

Budget-rejected calls do not count as executed calls.

## Design

### 1. Add a separate hard-budget abstraction

Create src/agent/tool-budget.ts with a small synchronous budget manager.

Suggested types:

    export interface ToolExecutionBudgetConfig {
      maxTotalExecutions: number;
      perTool?: Record<string, number>;
      reserveFinalIteration?: boolean;
    }

    export interface ToolBudgetReservation {
      allowed: boolean;
      toolName: string;
      executedTotal: number;
      toolExecutions: number;
      reason?: "total-exhausted" | "tool-exhausted";
      message?: string;
    }

The manager should expose:

- reserve(toolName): atomically checks and increments the execution count;
- isTotalExhausted(): true when the total execution budget is consumed;
- remainingTotal();
- getUsage() for prompt/debug formatting if needed.

Keep this separate from Scratchpad ToolLimitConfig. The scratchpad mechanism
continues to provide similarity and general soft warnings.

### 2. Reserve before the first tool-start yield

In AgentToolExecutor.executeSingleWithId(), reserve the budget synchronously
after approval handling and before yielding tool_start.

This ordering is required for concurrent safety. The concurrent runner advances
each generator to its first yield; reserving before that yield ensures later
generators observe the updated count.

Required behavior for an allowed call:

1. reserve the budget;
2. emit any existing soft warning;
3. emit tool_start;
4. invoke the actual tool;
5. persist the normal result or error.

Required behavior for a rejected call:

1. do not invoke the underlying tool;
2. emit tool_limit with blocked: true;
3. emit tool_error with the same toolCallId and a stable budget message;
4. add an error-style tool_result to the scratchpad so the parent and operator
   can audit the rejected attempt;
5. do not call Scratchpad.recordToolCall(), because the tool did not execute.

Suggested stable message:

    Research tool budget exhausted for web_search. Use the evidence already
    collected, state missing information and limitations, and finalize now.

The existing ToolMessage collection path already converts tool_error events
into protocol-correct ToolMessages in original tool-call order.

### 3. Track per-turn execution and rejection outcomes

Extend the result returned by executeToolsAndCollectMessages() with enough
metadata for the agent loop to decide whether to finalize:

- executedCount;
- budgetRejectedCount;
- totalBudgetExhausted.

Do not infer these values from scratchpad timestamps.

Finalization should be scheduled when either condition is true:

- the total execution budget is exhausted; or
- a turn contains one or more budget-rejected calls and zero executed calls.

The second condition prevents a model from repeatedly requesting a tool whose
per-tool budget is exhausted while unused total budget remains for other tools.

Do not force finalization merely because one call in a mixed batch was rejected.
For example, if three searches are allowed and two additional searches are
rejected, the next turn must still be able to fetch selected URLs.

### 4. Reserve a tool-free final model turn

Add opt-in finalization state to AgentConfig and RunContext. Keep the behavior
disabled by default.

The research worker should enable reserveFinalIteration.

When finalization is scheduled, append a stable HumanMessage:

    The research tool budget is exhausted. Do not request more tools. Produce
    the best available evidence packet now. Include dates, attribution, URLs
    already collected, conflicting evidence, missing information, and
    limitations.

The next model request must be made with an empty tool list. This requires the
streaming and blocking model-call helpers in src/agent/agent.ts to accept a
per-call tool override instead of always using this.tools.

Also disable tools automatically on the final allowed iteration for agents
with reserveFinalIteration enabled. This guarantees that iteration 8 is a
synthesis turn even when the explicit tool budget has not been exhausted.

Both streaming and blocking fallback paths must use the same tool override.

If the model returns an empty response during forced finalization, preserve the
existing error behavior rather than silently claiming success.

### 5. Pass the policy only to research workers

Extend SubagentTypeConfig in src/tools/subagent/types.ts with optional fields
for the hard execution budget and final-iteration reservation.

Configure only SUBAGENT_TYPES.research with the recommended budget. Pass the
configuration through Agent.create() in createSpawnSubagent().

Regression requirements:

- general-purpose retains its current tools and iteration policy;
- analysis retains its current tools, model override, and iteration policy;
- technical-analysis retains its current deterministic-tool behavior;
- the main agent receives no hard budget unless explicitly configured in a
  future change.

### 6. Tighten research instructions

Update the research worker system prompt to say:

- prioritize at most five material findings rather than exhaustively covering
  every possible subtopic;
- combine related topics into broad search queries;
- use no more than three web searches and two fetches;
- prefer primary sources and fetch only the most material URLs;
- stop when the execution budget is reached;
- return partial evidence and limitations instead of continuing to search;
- never retry a call rejected by the execution budget.

Update the main-agent routing prompt and stock-analysis skill so delegated
current-information tasks request prioritized material findings, not
exhaustive coverage. The parent task should still specify object, period,
topics, source priority, URLs, exclusions, and output shape, but topics are a
priority list rather than a completeness checklist.

Do not require ordinary users to mention tool budgets or subagent types.

## Implementation Steps

### 1. Establish the baseline

- Read AGENTS.md and .harness/README.md.
- Read .harness/context/tools-skills-and-subagents.md.
- Read .harness/context/market-data-sources.md.
- Read the code-change and verification checklists.
- Run git status --short and preserve unrelated changes.
- Read the current versions of every expected source and test file.
- Run existing focused tests when Bun is available:
  - bun test src/tools/subagent/spawn-subagent.test.ts
  - bun test src/agent/prompts.test.ts
  - bun test src/skills/registry.test.ts

### 2. Implement the pure budget manager

- Add the config and reservation types.
- Validate that budgets are positive integers.
- Treat a missing per-tool entry as allowed subject to the total limit, unless
  the implementation chooses an explicit deny-by-default mode. For Phase 1,
  prefer allowed subject to the total limit so optional research tools remain
  usable.
- Make reserve() synchronous and deterministic.
- Add focused unit tests before integrating it with the executor.

### 3. Thread budget configuration through Agent creation

- Add optional budget and finalization fields to AgentConfig.
- Store the configured policy on Agent.
- Create the per-run budget state in createRunContext().
- Pass the research policy from SUBAGENT_TYPES through createSpawnSubagent().
- Do not add environment variables for these constants.

### 4. Enforce reservations in the executor

- Reserve before tool_start.
- Preserve approval behavior.
- Preserve existing concurrency grouping and maxConcurrency.
- Emit blocked tool_limit and tool_error events with stable messages.
- Persist an auditable blocked result without counting it as an execution.
- Return per-turn execution/rejection metadata to the agent loop.

### 5. Add forced finalization

- Schedule finalization when the total budget is exhausted or a turn contains
  only rejected budget calls.
- Append the finalization instruction exactly once.
- Call the model with no tools on the forced-final turn.
- Use no tools on the final allowed iteration when reserveFinalIteration is
  enabled.
- Ensure both streaming and blocking fallback calls use the same selected tool
  list.
- Keep the ordinary max-iterations result for agents that do not opt in.

### 6. Update prompt-visible guidance

- Add bounded search/fetch language to the research worker prompt.
- Tell the main agent to request prioritized material findings rather than
  exhaustive topic completion.
- Update stock-analysis auxiliary-result rules accordingly.
- Keep the existing source attribution, conflict, limitation, and
  no-investment-conclusion boundaries.

### 7. Add deterministic tests

#### src/agent/tool-budget.test.ts

Cover:

- total budget enforcement;
- per-tool budget enforcement;
- mixed-tool usage;
- rejected calls do not consume execution count;
- exact exhaustion state;
- invalid configuration handling.

#### src/agent/tool-executor.test.ts

Cover:

- five concurrent web_search calls execute only the first three;
- blocked calls never invoke the underlying tool;
- blocked events use blocked: true;
- every original toolCallId receives a ToolMessage-compatible result;
- result ordering follows the original model tool-call order;
- allowed calls remain concurrent;
- soft scratchpad warnings remain warnings when no hard budget is configured.

#### Agent finalization coverage

Add focused coverage, either in a new src/agent/agent.test.ts or through small
exported pure helpers, for:

- total budget exhaustion schedules finalization;
- a rejected-only turn schedules finalization;
- a mixed allowed/rejected turn does not finalize prematurely;
- forced finalization calls the model with an empty tool list;
- the reserved final iteration cannot request tools;
- agents without the opt-in policy retain current behavior;
- streaming failure fallback also uses the empty tool list.

#### Existing prompt and subagent tests

Extend:

- src/tools/subagent/spawn-subagent.test.ts;
- src/agent/prompts.test.ts;
- src/skills/registry.test.ts.

Assert that:

- only research has the Phase 1 hard budget;
- research keeps maxIterations at 8;
- research instructions contain the bounded search/fetch and partial-result
  rules;
- other subagent tool allow-lists and model policy remain unchanged;
- the main prompt and stock-analysis skill request prioritized rather than
  exhaustive current-information evidence.

### 8. Update repo-local operating context

Update:

- .harness/context/tools-skills-and-subagents.md;
- .harness/context/market-data-sources.md.

Document:

- soft scratchpad warnings versus research hard budgets;
- execution-before-yield reservation semantics;
- the research budget values;
- forced tool-free finalization;
- the fact that only research is budgeted in Phase 1;
- how blocked attempts appear in scratchpad and tool events.

Do not create a new README or environment variable.

## Verification

Run focused tests first:

    bun test src/agent/tool-budget.test.ts
    bun test src/agent/tool-executor.test.ts
    bun test src/tools/subagent/spawn-subagent.test.ts
    bun test src/agent/prompts.test.ts
    bun test src/skills/registry.test.ts

Run any new Agent finalization test file explicitly.

Then run:

    bun run typecheck
    git diff --check
    git status --short

If focused tests or typecheck expose broader coupling, run:

    bun test

## Behavioral Evaluation

After static verification, redeploy and repeat the natural user prompt:

    深入分析一下贵州茅台，基本面、近期动态和技术面都看一下。

Expected research-worker behavior:

- no more than three web_search executions;
- no more than two web_fetch executions;
- no more than six total tool executions;
- one final tool-free synthesis turn;
- a dated and attributed evidence packet, even if partial;
- explicit missing information and limitations;
- no Reached maximum iterations result.

Expected parent behavior:

- research remains an isolated recent-information lane;
- technical-analysis remains an isolated technical lane when selected;
- structured fundamentals and final synthesis remain in the main agent;
- incomplete auxiliary evidence is rejected or repaired before publication.

Record:

- parent model and subagent model;
- emitted subagent types;
- child tool counts from scratchpad;
- child token usage;
- child elapsed time;
- whether calls were budget-rejected;
- whether the worker returned a usable evidence packet;
- whether the parent preserved source and synthesis boundaries.

## Acceptance Criteria

- A research worker cannot execute more than its configured total or per-tool
  budget, including when one model turn emits many concurrent calls.
- Extra concurrent calls are rejected before underlying tools start.
- Every rejected call receives a protocol-correct ToolMessage and an auditable
  scratchpad result.
- A research worker always has a tool-free final synthesis opportunity.
- Budget exhaustion returns partial evidence and limitations rather than the
  generic maximum-iterations failure.
- The observed 18-search/4-fetch pattern is structurally impossible under the
  research configuration.
- Existing main-agent soft warnings remain unchanged.
- Existing model selection, reasoning effort, tool allow-lists, concurrency
  limit, financial calculations, gateway, and CLI contracts remain unchanged.
- Focused tests pass.
- Typecheck passes.
- git diff --check passes.
- Harness context matches the implemented behavior.

## Risks And Mitigations

### Too little evidence

A six-call budget may not cover every requested topic.

Mitigation: prioritize the most material findings, combine search topics, fetch
only primary or decisive sources, and return explicit limitations. The parent
can decide whether a separate follow-up lane is justified.

### Concurrent oversubscription

A naive check before completion can allow every call in a large batch.

Mitigation: synchronously reserve before the first generator yield.

### Rejected-call loop

The model may repeatedly request an exhausted tool.

Mitigation: force finalization after a rejected-only turn and disable tools for
the final response.

### Premature finalization

A mixed batch may reject extra searches while still needing URL fetches.

Mitigation: do not finalize after a mixed allowed/rejected turn unless the total
budget is exhausted.

### Global behavior regression

Changing Scratchpad.canCallTool() globally could block valid main-agent work.

Mitigation: preserve soft warnings and implement a separate opt-in execution
budget used only by research.

### Streaming and fallback drift

The streaming path may disable tools while the blocking fallback accidentally
rebinds them.

Mitigation: pass the selected tool list through both helpers and test the
fallback path.

## Rollback

This change has no persisted-data migration.

Rollback consists of reverting:

- the tool-budget abstraction and AgentConfig fields;
- executor reservation and blocked-call handling;
- research-only budget wiring;
- forced finalization tool override;
- bounded research prompt language;
- tests and harness context.

Existing scratchpad JSONL files remain readable. No environment, gateway, cache,
or database rollback is required.

## Follow-Up Criteria

Do not broaden hard budgets to other subagent types during Phase 1.

Consider a later phase only if evaluation shows:

- analysis workers exhibit the same repeated-tool pattern;
- technical-analysis workers retry deterministic tools;
- general-purpose workers create material uncontrolled cost;
- six research executions are consistently insufficient despite good query
  consolidation.

Any later budget change should be based on scratchpad tool counts, usable-result
rate, latency, and token cost rather than one isolated model preference.

## Progress Notes

- 2026-07-13: Plan created from production scratchpad evidence. No runtime code
  changed.
- 2026-07-13: Implemented the research-only hard execution budget, pre-yield
  reservation, auditable blocked-call results, tool-free finalization, bounded
  prompt guidance, deterministic tests, and Harness context updates. Verified
  253 Bun tests, TypeScript typecheck, and git diff --check. Live redeploy
  evaluation remains pending.
