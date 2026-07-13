# Subagent Routing Boundaries Implementation Plan

## Status

- State: planned
- Created: 2026-07-13
- Implementation started: no
- Owner: next implementation session

## Goal

Increase useful `spawn_subagent` usage for genuinely independent research lanes without allowing an isolated worker to bypass the main agent's single-company analysis rules.

The intended behavior is:

- Keep the `stock-analysis` skill, structured fundamentals, and final single-company synthesis in the main agent.
- Allow `research` to handle a clearly isolated recent-information lane in a broad company report.
- Allow `technical-analysis` to handle a clearly isolated deterministic technical lane in a broad company report.
- Keep `analysis` restricted to one standardized company lane in a multi-company comparison or a tightly scoped dense multi-year financial evidence packet.
- Prevent `general-purpose` from becoming a fallback that bypasses the specialized financial subagent boundaries.

## Current Problem

The runtime has no deterministic `shouldSpawnSubagent()` classifier. The main model decides whether to emit `spawn_subagent` from prompt-visible policy and tool metadata.

Current guidance is conservative and partly ambiguous:

- The main prompt broadly mentions delegating analysis of one company, then separately says ordinary one-company analysis must stay in the main agent.
- The detailed `SPAWN_SUBAGENT_DESCRIPTION` is stored in the registry, but `buildCompactToolDescriptions()` injects only `compactDescription`, while the bound `DynamicStructuredTool` uses a short description that says to consult the system prompt.
- `stock-analysis` currently describes direct main-agent calls for all three evidence lanes and does not explicitly permit `research` or `technical-analysis` as isolated auxiliary lanes.
- `general-purpose` has broad read-only financial tool access but its routing text does not tell the model to prefer specialized financial subagent types.

## Safety Rationale

Every subagent is created with `memoryEnabled: false` and `systemPromptOverride`. It does not automatically inherit:

- the parent conversation;
- the main system prompt;
- loaded skill instructions;
- prior main-agent tool results;
- user constraints stated earlier in the conversation.

For that reason, this plan does not allow the complete ordinary single-company analysis to move into `analysis` or `general-purpose`. Auxiliary delegation is limited to lanes whose worker prompt and tool contract are sufficiently self-contained.

## Scope

### Expected files to change

- `src/agent/prompts.ts`
- `src/agent/prompts.test.ts` (new)
- `src/tools/subagent/spawn-subagent.ts`
- `src/tools/subagent/types.ts`
- `src/tools/subagent/spawn-subagent.test.ts`
- `src/skills/stock-analysis/SKILL.md`
- `src/skills/registry.test.ts`
- `.harness/context/tools-skills-and-subagents.md`
- `.harness/context/market-data-sources.md`

### Explicitly out of scope

- No changes to `src/agent/agent.ts`.
- No changes to `src/agent/tool-executor.ts` or concurrency limits.
- No changes to `src/model/llm.ts`, model selection, or reasoning-effort resolution.
- No new keyword router or hard-coded `shouldSpawnSubagent()` classifier.
- No changes to financial tool calculations or public result contracts.
- No changes to gateway or CLI behavior.
- No recursive subagents.
- No child access to `skill`, `spawn_subagent`, write/edit tools, or interactive questions.
- No Phase 1 removal of financial tools from the `general-purpose` allow-list.
- No environment-variable changes.

## Routing Contract

Implement and test the following behavior contract.

### Main agent only

- Simple conceptual or conversational questions.
- A request satisfied by one direct tool call.
- A narrow single-company fundamental, valuation, news-only, or technical-only request.
- Ordinary single-company structured fundamentals.
- Loading and applying the `stock-analysis` skill.
- Cross-lane evidence reconciliation and the final company-level synthesis.
- Material final arithmetic checks and the pre-publication review.

### `research` auxiliary lane

Use for multi-step recent public information that is independent from the main fundamental lane, including:

- company announcements and disclosures;
- recent operating developments;
- material industry context;
- current news requiring source cross-checking.

The delegated task must specify object/ticker, period, topics, source priority, required URLs, excluded scope, and output shape. The worker must return dated, attributed facts and limitations rather than a company-level investment conclusion.

### `technical-analysis` auxiliary lane

Use for an isolated deterministic technical-state lane inside a broader report. The delegated task must specify ticker, adjustment if non-default, requested horizons, role in the parent report, and excluded scope.

Narrow technical-only requests should still call `technical_analysis` directly in the main agent. The worker must not receive responsibility for final cross-lane synthesis.

### `analysis` evidence lane

Use only for:

- one company lane in a multi-company comparison, with identical periods, metrics, units, scope, evidence rules, and output structure across workers; or
- unusually dense multi-year financial evidence extraction that has a tightly bounded table/evidence-packet contract.

Do not use it for the complete ordinary single-company report. Its result must be an evidence packet, not a final company-level conclusion.

### `general-purpose`

Use only when the focused task does not match a specialized subagent type. Do not use it for company, stock, market, or technical analysis when `research`, `analysis`, or `technical-analysis` applies.

## Implementation Steps

### 1. Establish the baseline

- Read `AGENTS.md`, `.harness/README.md`, `.harness/context/tools-skills-and-subagents.md`, `.harness/context/market-data-sources.md`, `.harness/checklists/code-change.md`, and `.harness/checklists/verification.md`.
- Run `git status --short` and preserve unrelated user changes.
- Read the current versions of all expected source and test files before editing.
- Optionally run the existing focused tests once to establish the baseline:
  - `bun test src/tools/subagent/spawn-subagent.test.ts`
  - `bun test src/skills/registry.test.ts`

### 2. Clarify the main-agent tool policy

Edit the subagent bullets in `src/agent/prompts.ts` so they explicitly encode the Routing Contract above.

Required prompt properties:

- Remove or rewrite any generic example that implies an ordinary one-company analysis should be delegated as a whole.
- State that a broad single-company report may delegate only clearly isolated `research` and `technical-analysis` auxiliary lanes.
- State that the main agent retains `stock-analysis`, structured fundamentals, material arithmetic verification, evidence reconciliation, and final synthesis.
- Keep `analysis` restricted to standardized comparison lanes or bounded dense multi-year financial evidence packets.
- State that `general-purpose` must not bypass a specialized financial subagent type.
- Preserve the existing instruction to emit independent calls in one model turn and chain dependent tasks across turns.
- Preserve the existing like-for-like comparison and final calculator requirements.

Avoid adding deterministic keyword logic. This remains model-driven routing.

### 3. Make the actual bound tool description truthful and type-aware

Edit `src/tools/subagent/spawn-subagent.ts`.

- Remove the ambiguous phrase/example `analysis of one company` from `SPAWN_SUBAGENT_DESCRIPTION`; replace it with a standardized company lane in a multi-company comparison or a bounded evidence packet.
- Add concise financial routing guidance for `research`, `analysis`, `technical-analysis`, and `general-purpose`.
- Make the `DynamicStructuredTool` description expose the detailed description that the implementation claims is visible. The simplest acceptable change is `description: SPAWN_SUBAGENT_DESCRIPTION`.
- Do not change the input schema, return format, model resolution, progress protocol, isolation behavior, or agent creation behavior.

Implementation note: exposing the rich description increases prompt tokens. Keep the description focused and avoid duplicating long financial evidence rules already present in the worker prompts.

### 4. Tighten subagent type boundaries without changing tool allow-lists

Edit `src/tools/subagent/types.ts`.

- `general-purpose.whenToUse`: make it non-financial-by-default when a specialized type applies.
- `general-purpose.systemPrompt`: add a bounded statement that it must not widen the assigned task or replace a specialized financial worker.
- `research.whenToUse`: explicitly include an isolated current-information lane inside a broader company report.
- `research.systemPrompt`: require dated/attributed findings, URLs where available, source-type separation, conflicting evidence, and limitations; prohibit final company-level investment conclusions.
- `analysis.whenToUse`: retain the existing ordinary-one-company restriction and emphasize standardized evidence packets.
- `analysis.systemPrompt`: explicitly prohibit completing the whole ordinary single-company synthesis and require adherence to the parent-provided periods, metrics, units, scope, and output structure.
- `technical-analysis.whenToUse`: explicitly permit an isolated technical lane inside a broad company report while keeping narrow technical-only requests on the direct tool path.
- Preserve all current technical safety language and deterministic-tool boundaries.
- Do not change `maxIterations` or any tool allow-list in Phase 1.

### 5. Update the `stock-analysis` orchestration rules

Edit `src/skills/stock-analysis/SKILL.md` while preserving all existing evidence and safety rules.

- Update Non-Negotiable Rule 7 so the main agent retains structured fundamentals, skill application, evidence reconciliation, final synthesis, and pre-publication review.
- Continue prohibiting the complete ordinary single-company analysis from being delegated to `analysis` or `general-purpose`.
- Allow `research` for a clearly isolated multi-step current-information lane in a broad report.
- Allow `technical-analysis` for a clearly isolated technical lane in a broad report.
- Keep narrow technical-only requests on direct `technical_analysis` routing rather than widening them into a stock-analysis workflow.
- Update the workflow steps so direct tool calls remain valid for simple lanes, while delegation is optional for sufficiently independent multi-step auxiliary lanes.
- Require the main agent to reject or repair an auxiliary result that lacks material dates, periods, units, scope, attribution, URLs, technical metadata, conflicting evidence, or limitations.
- Do not weaken the six Combined Interpretation labels, valuation boundaries, technical boundaries, source priority, or pre-publication checks.

### 6. Add deterministic prompt and type tests

#### `src/tools/subagent/spawn-subagent.test.ts`

Add assertions that:

- the actual `createSpawnSubagent(...).description` exposes type-aware guidance;
- the description preserves isolation and one-level delegation language;
- `analysis` still states the ordinary-one-company restriction;
- `general-purpose` states that specialized types take precedence;
- `research` mentions the isolated current-information lane;
- `technical-analysis` mentions the broader-report auxiliary lane;
- no subagent receives `spawn_subagent` or `ask_user_question`.

Keep all existing model, reasoning-effort, tool-access, and financial-rule assertions.

#### `src/agent/prompts.test.ts`

Add a focused test for `buildSystemPrompt()` that asserts the generated main prompt contains:

- main-agent ownership of ordinary single-company fundamentals and final synthesis;
- optional `research` and `technical-analysis` auxiliary lanes for a broad multi-lane report;
- the narrow `analysis` boundary;
- the `general-purpose` non-bypass rule;
- same-turn parallelism for independent tasks;
- main-agent like-for-like review after workers return.

Do not assert exact full prompt snapshots. Use targeted semantic substrings so unrelated channel/profile wording does not make the test brittle.

#### `src/skills/registry.test.ts`

Extend the stock-analysis test to assert that loaded instructions contain:

- main-agent final synthesis ownership;
- permitted `research` and `technical-analysis` auxiliary lanes;
- the prohibition on complete ordinary one-company delegation to `analysis` or `general-purpose`.

### 7. Update repo-local operating context

Update:

- `.harness/context/tools-skills-and-subagents.md`
- `.harness/context/market-data-sources.md`

Document the same routing contract without duplicating the complete prompts. Keep these files source-backed and point to the relevant implementation paths.

Do not create a new README or design spec.

### 8. Verify

Run focused tests first:

```powershell
bun test src/tools/subagent/spawn-subagent.test.ts
bun test src/agent/prompts.test.ts
bun test src/skills/registry.test.ts
```

Then run repository-level static verification:

```powershell
bun run typecheck
git diff --check
git status --short
```

If focused tests or typecheck expose broader coupling, run:

```powershell
bun test
```

Read back the final generated prompt/tool descriptions and confirm there is no remaining contradiction between:

- main prompt policy;
- bound `spawn_subagent` description;
- subagent type descriptions;
- `stock-analysis` skill;
- harness context.

## Behavioral Evaluation Matrix

Unit tests can verify prompt-visible policy but cannot guarantee a particular model will choose a tool. After static verification, manually or through the existing evaluation surface exercise representative prompts.

| Request shape | Expected routing |
|---|---|
| Query one current stock price | No subagent; direct tool |
| Narrow technical analysis of one A-share | No subagent required; direct `technical_analysis` |
| Narrow fundamental analysis of one company | Main agent with the relevant structured tool/skill |
| Broad one-company report covering fundamentals, recent public information, and technical state | Main owns fundamentals/final synthesis; may spawn `research` and `technical-analysis` auxiliary lanes |
| Compare several companies over identical periods and metrics | One `analysis` worker per company in the same turn; main performs like-for-like review |
| Extract a dense five-year evidence table for one company with explicit fields and units | One bounded `analysis` evidence worker is allowed; main owns interpretation |
| Broad request to analyze one company completely | Must not delegate the entire request to `analysis` or `general-purpose` |
| Three independent non-financial research topics | Parallel `research` or `general-purpose` workers as appropriate |

Record observed model, emitted tool calls, subagent types, latency, and whether the final answer preserved the parent rules. Do not turn this model-dependent routing matrix into a strict unit test unless a deterministic router is introduced later.

## Acceptance Criteria

- The model can see explicit, consistent type-specific delegation guidance through both the system prompt and the bound tool description.
- Broad multi-lane single-company requests are explicitly permitted to delegate isolated `research` and `technical-analysis` lanes.
- Ordinary single-company analysis is still not delegated as a whole to `analysis` or `general-purpose`.
- `analysis` remains an evidence-packet worker for comparisons or tightly scoped dense multi-year work.
- The main agent retains the `stock-analysis` skill, structured fundamentals, material calculation review, evidence reconciliation, and final synthesis.
- No runtime API, tool schema, allow-list, model policy, concurrency behavior, financial calculation, gateway, or CLI contract changes.
- Focused tests pass.
- `bun run typecheck` passes.
- `git diff --check` passes.
- Harness context matches the implemented behavior.

## Risks And Mitigations

### Increased token and latency cost

More auxiliary delegation and a richer tool description may increase tokens and latency.

Mitigation: delegate only multi-step independent lanes; keep simple and narrow requests on direct tools; keep the rich description concise.

### `general-purpose` bypass

The model may choose `general-purpose` when `analysis` is restricted.

Mitigation: add explicit non-bypass language in main policy, tool description, and type metadata. Do not remove tools in Phase 1; consider an allow-list change only if evaluation shows continued bypass.

### Auxiliary result loses evidence detail

The main agent receives the worker's final answer rather than its complete scratchpad.

Mitigation: require structured evidence packets with dates, units, scope, attribution, URLs, conflicts, and limitations; keep final review in the main agent.

### Prompt duplication drifts again

The same policy appears in the main prompt, tool description, type prompts, skill, and harness.

Mitigation: add targeted tests for the critical invariants. A later refactor may centralize shared policy strings, but do not add that abstraction in this bounded change unless duplication causes implementation errors.

### Model-dependent routing remains inconsistent

Prompt changes influence probability but do not guarantee a tool call.

Mitigation: use the behavioral evaluation matrix and report observed behavior by model. Do not claim deterministic routing.

## Rollback

This change should be independently reversible because it does not alter runtime contracts or persisted data.

Rollback consists of reverting:

- main prompt routing text;
- bound tool/type descriptions;
- stock-analysis delegation wording;
- corresponding tests and harness context.

No data migration, environment change, cache reset, or gateway configuration rollback is expected.

## Optional Phase 2 — Only If Evaluation Shows Bypass

Do not implement this during Phase 1 without new evidence.

Possible follow-ups:

- Remove A-share/technical tools from the `general-purpose` allow-list so specialized types are enforced structurally.
- Introduce a shared financial evidence-policy fragment used by main and worker prompts to reduce drift.
- Add an explicit structured context template to the `spawn_subagent` input schema.
- Add model-specific routing evaluations to `src/evals/`.
- Consider a deterministic routing layer only if prompt-driven behavior remains operationally unacceptable.

## Progress Notes

- 2026-07-13: Plan created after source review and discussion. No implementation files changed.

## Open Questions

- Whether exposing the full existing `SPAWN_SUBAGENT_DESCRIPTION` is acceptable for prompt-token cost, or whether it should be shortened while preserving all routing boundaries.
- Which configured production model(s) should be used for the behavioral evaluation matrix.
- What observed `general-purpose` financial bypass rate would justify the optional Phase 2 allow-list restriction.
