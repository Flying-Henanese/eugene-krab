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

Enter this loop when a requested feature, bug fix, or refactor is multi-step,
must survive a session boundary, has repeated verification failures, or carries
unusual risk. The result must have verifiable acceptance criteria.

For a small bounded change, use `.harness/checklists/code-change.md` and
`.harness/checklists/verification.md` directly without persistent loop state.
Do not enter for explanation, diagnosis, status, or a code review without an
authorized change.

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
- Coding conventions: `.harness/standards/coding.md`
- Testing and review checks: `.harness/checklists/verification.md`

Load only context relevant to the task and current criterion.

## State

Create `.harness/loops/.state/<task-id>.json` using `state.schema.json`.
Record the original request, authorized scope, acceptance criteria, current
phase, changed files, verification evidence, failure signatures, budgets,
blockers, and terminal status.

Record the current `HEAD` and whether tracked or untracked working-tree changes
exist for orientation. These fields alone do not identify the verified contents.

To reuse verification evidence across sessions, store a reproducible content
fingerprint in the optional `sourceState.diffHash` field. Cover the paths and
contents of all relevant verification inputs, including implementation, tests,
configuration, dependency manifests and lockfiles, relevant untracked files,
and additions or deletions. Record the fingerprint's scope and generation method
in the verification summary, and bind each verification entry's `sourceState`
to the verified `HEAD` and fingerprint. A plain `git diff` hash omits untracked
file contents and is insufficient on its own. Exclude `.harness/loops/.state/`
from the fingerprint so recording execution state does not invalidate it.

Without a reliable fingerprint, verification evidence cannot be reused on
resume. Any edit invalidates affected verification evidence.

## Phases

### 0. Bootstrap

- Load rules and relevant context.
- Inspect implementation and tests.
- Establish acceptance criteria and scope.
- Capture repository and authorization state.

Transition to `needs_human` when conflicting requirements prevent a safe next
step or an indispensable scope expansion is not authorized. Continue independent
work while a decision is pending.

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
| `test_defect` | repair if the authorized behavior clearly resolves it; otherwise `needs_human` |
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

Use authorization already given in the conversation. Stop only when the next
action needs a decision or authorization that has not been given, such as:

- changing an agreed public API or user-visible contract beyond the requested scope;
- expanding into a materially different module beyond the requested scope;
- choosing between conflicting product behaviors not resolved by the request;
- weakening a security, privacy, gateway access, or financial-analysis boundary;
- weakening valid test assertions or bypassing verification without explicit authorization;
- deleting or rewriting a test whose expected behavior is unresolved;
- using live credentials outside the authorized verification scope;
- destructive data or filesystem operations outside the authorized scope;
- commit, push, tag, release, publish, or deployment without authorization.

Adding regression tests and updating tests to match already authorized behavior
are normal implementation work and do not require separate approval. Never
weaken or bypass valid verification merely to obtain a pass.

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

On resume, load the state and recompute its content fingerprint using the
recorded scope and generation method. Reuse a verification entry only when its
recorded `HEAD` and fingerprint match the current repository and its fingerprint
scope covers the inputs used by that check. Matching `HEAD` and `dirty` alone
is never sufficient.

If the fingerprint is absent, incomplete, mismatched, or cannot be recomputed,
invalidate the affected verification entries and reopen acceptance criteria
that relied on them. If the affected scope cannot be established, invalidate
all prior test, type-check, and review evidence. Continue from the earliest
phase with stale or missing evidence and rerun those checks before completion.
