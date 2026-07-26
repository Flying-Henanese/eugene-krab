---
name: verified-code-change
version: 1
status: active
applies_to:
  - feature
  - bugfix
  - refactor
max_iterations: 5
max_repeated_failure: 2
---

# Loop: Verified Code Change

## Purpose

Implement one bounded repository change and iterate on real verification
feedback until the acceptance criteria pass or a named non-success terminal
state is reached.

## Trigger

Enter this loop when the user asks to implement, fix, or refactor code and the
result can be checked with tests, type checking, static checks, runtime
evidence, or explicit review criteria.

Do not enter when the user asks only for explanation, diagnosis, status, or a
code review without authorizing a change.

## Entry Conditions

1. Read `AGENTS.md`, `.harness/README.md`, and
   `.harness/checklists/code-change.md`.
2. Follow harness routing to the smallest relevant context and workflow files.
3. Inspect the relevant implementation and existing tests.
4. Run `git status --short` and record unrelated changes.
5. Translate the request into individually verifiable acceptance criteria.
6. Record whether commit, push, release, or other external actions are authorized.

## Invariants

- Preserve unrelated user changes.
- Keep edits inside the smallest applicable module boundary.
- Do not change acceptance criteria without user direction.
- Do not skip, weaken, or delete a valid failing test merely to obtain a pass.
- Use Bun for project commands.
- Keep TypeScript ESM and strict typing conventions.
- Do not expose credentials or generated private runtime state.
- Do not commit, push, tag, release, publish, or deploy unless explicitly authorized.

## Context Routing

- Runtime, environment, model, or startup work:
  `.harness/context/runtime-and-config.md`
- Tools, skills, subagents, or tool descriptions:
  `.harness/context/tools-skills-and-subagents.md`
- Gateway or channel work:
  `.harness/context/gateway-and-channels.md`
- Finance or A-share work:
  `.harness/context/market-data-sources.md`
- Domain procedure: the matching file under `.harness/workflows/`
- Coding, testing, and review expectations: `.harness/standards/`

Load only context relevant to the task and current criterion.

## State

Create `.harness/loops/.state/<task-id>.json` using `state.schema.json`.
Record the original request, authorized scope, acceptance criteria, current
phase, changed files, verification evidence, failure signatures, budgets,
blockers, and terminal status.

The source-state fingerprint should identify the current `HEAD` plus whether
tracked or untracked working-tree changes exist. If practical, include a diff
hash. Any edit invalidates affected verification evidence.

## Phases

### 0. Bootstrap

- Load rules and relevant context.
- Inspect implementation and tests.
- Establish acceptance criteria and scope.
- Capture repository and authorization state.

Transition to `needs_human` when the request has materially different reasonable
interpretations or requires unauthorized scope.

### 1. Select Work

Choose exactly one smallest unresolved item, in this order:

1. a failure preventing verification from running;
2. missing behavior required by an acceptance criterion;
3. a regression caused by the current change;
4. an actionable blocking review finding;
5. a non-blocking improvement explicitly required by the task.

### 2. Act

- Make the smallest coherent implementation and test change for the selected item.
- Avoid unrelated cleanup and speculative refactors.
- Update prompt-visible descriptions, environment examples, or harness context
  when the behavior contract requires it.

### 3. Focused Verify

Run the cheapest checks that directly cover the selected item:

1. focused Bun tests for the touched behavior;
2. relevant static or schema checks;
3. `git diff --check`.

On success, mark the criterion satisfied and return to `select_work`. On
failure, classify it before choosing a transition.

### 4. Repair

For a retryable implementation failure, record:

- stable failure signature;
- expected and actual behavior;
- relevant file or test;
- previous attempted corrections;
- constraints the repair must preserve.

The next attempt must be materially different and supported by the failure
evidence. Two consecutive occurrences of the same signature require
reassessment; if no safe alternative remains, stop with `needs_human`.

### 5. Final Verify

After all acceptance criteria appear satisfied, apply
`.harness/checklists/verification.md` against the final source state.

For TypeScript logic changes, normally run:

```text
bun run typecheck
bun test
git diff --check
git status --short
```

Use focused or domain-specific commands when the checklist defines a more
appropriate scope. Report credentials, network, provider access, or live
channel verification that could not run.

### 6. Review

Review the final diff for:

- agreement with the original request and acceptance criteria;
- behavior regressions and missing edge cases;
- unrelated or over-broad changes;
- stale prompt-visible descriptions or harness context;
- security, credential, or private-data exposure;
- CLI-only assumptions leaking into gateway code;
- current verification evidence for the final source state.

Blocking findings transition to `repair`. No blocking findings transition to
`complete`.

## Failure Transitions

| Failure class | Transition |
|---|---|
| `implementation` | `repair` while budget remains |
| `test_defect` | `needs_human` unless the agreed specification clearly resolves it |
| `environment` | safe alternative, otherwise `blocked` |
| `scope_conflict` | `needs_human` |
| `spec_ambiguity` | `needs_human` |
| `pre_existing` | record separately; continue only if it does not invalidate completion |
| `flaky` | confirm once; then `needs_human` or report the limitation |
| `unsafe` | stop immediately with `needs_human` |

## Budgets

- Maximum iterations: 5
- Maximum consecutive repeats of one failure signature: 2
- Maximum full `bun test` runs: 2 unless new evidence justifies another
- Scope expansions without user approval: 0

Reaching a budget ends in `budget_exhausted`; it does not redefine success.

## Human Gates

Stop before:

- changing an agreed public API or user-visible contract;
- expanding into a materially different module;
- choosing between conflicting product behaviors;
- weakening a security, privacy, gateway access, or financial-analysis boundary;
- deleting or rewriting a test whose expected behavior is not resolved by the task;
- using live credentials for otherwise unverifiable behavior;
- destructive data or filesystem operations;
- commit, push, tag, release, publish, or deployment without authorization.

## Completion Evidence

Return:

- terminal state;
- acceptance criteria with pass/fail status;
- changed files and behavior summary;
- verification commands and outcomes;
- limitations and unverified live behavior;
- external actions not taken.

Write a `.harness/runs/` note only when the verification or debugging result
will help a future agent avoid repeating meaningful work.

## Resume Policy

On resume, load the state, compare it with the current repository, and
invalidate verification evidence that does not match the current source state.
Continue from the earliest phase with stale or missing evidence.
