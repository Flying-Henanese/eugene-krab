---
name: replace-with-loop-name
version: 1
status: draft
applies_to:
  - replace-with-task-type
max_iterations: 5
max_repeated_failure: 2
---

# Loop: Replace With Name

## Purpose

Describe the bounded result this loop is designed to produce.

## Trigger

Enter this loop when:

- define an observable triggering condition.

Do not enter this loop when:

- define requests that require a different workflow or no repository mutation.

## Entry Conditions

1. Read `AGENTS.md` and `.harness/README.md`.
2. Follow harness routing to the smallest relevant context, workflow, standard,
   and checklist files.
3. Inspect the current source and tests.
4. Run `git status --short` and record pre-existing changes.
5. Convert the request into explicit acceptance criteria.

## Inputs

- Original request:
- Authorized scope:
- Excluded scope:
- Acceptance criteria:
- Allowed external effects:

## Invariants

- Preserve unrelated user changes.
- Do not change acceptance criteria without a human decision.
- Do not weaken valid tests to obtain a pass.
- Add task-specific non-negotiable constraints here.

## Allowed Actions

- List read, edit, test, or review actions permitted inside the loop.

## Forbidden Actions

- List destructive, external, security-sensitive, or scope-expanding actions.

## Context Loading

- Name the harness context and workflow files required for this loop.
- Load only the source and test files relevant to the current acceptance criterion.

## Loop State

Persist state using `state.schema.json`. At minimum, record:

- task and loop identifiers;
- current phase and iteration;
- source-state fingerprint;
- acceptance-criterion status;
- changed files;
- verification evidence;
- failure signatures and retry counts;
- budget usage;
- blockers and terminal status.

## Phases And Transitions

1. `bootstrap`: load rules, inspect the source, and establish acceptance criteria.
2. `select_work`: choose the smallest unresolved criterion or blocking failure.
3. `act`: make one bounded change.
4. `focused_verify`: run the cheapest relevant deterministic checks.
5. `repair`: feed actionable failure evidence into a materially different attempt.
6. `final_verify`: run the required completion checks against the final source state.
7. `review`: inspect behavior, scope, security, and documentation consistency.
8. terminate in a named terminal state.

Define task-specific transition rules here.

## Verification Ladder

- L0: source and existing-test inspection.
- L1: local structural and diff checks.
- L2: focused behavioral tests.
- L3: repository type or build verification.
- L4: broader regression tests.
- L5: independent semantic or security review when risk warrants it.

Name the exact commands and evidence required at each applicable level.

## Failure Classification

Classify each failure as one of:

- `implementation`
- `test_defect`
- `environment`
- `scope_conflict`
- `spec_ambiguity`
- `pre_existing`
- `flaky`
- `unsafe`

## Retry Policy

- Retry only when the next attempt is materially different and supported by evidence.
- Treat test name, error category, and normalized error summary as the failure signature.
- Reassess after the same failure signature repeats twice.
- Stop with `needs_human` if no materially different safe approach remains.

## Budgets

- Maximum iterations:
- Maximum repeated failure:
- Maximum full verification runs:
- Maximum wall-clock time, if enforced:

## Human Gates

Stop before:

- changing agreed public behavior;
- expanding into a materially different module;
- choosing between conflicting product requirements;
- weakening a security, privacy, or financial-analysis boundary;
- using live credentials when mocked verification is insufficient;
- committing, pushing, releasing, publishing, or deploying without authorization.

## Terminal States

Use the shared terminal states from `README.md` and add task-specific conditions
for each state.

## Completion Evidence

Report:

- acceptance criteria and status;
- changed files;
- verification commands and outcomes;
- source-state fingerprint for final evidence;
- unresolved limitations;
- external actions deliberately not taken.

## Resume Policy

On resume:

1. load the state file;
2. re-read current repository status;
3. compare the saved and current source-state fingerprints;
4. invalidate stale verification evidence;
5. continue from the earliest phase whose evidence is no longer valid.
