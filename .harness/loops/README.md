# Development Loops

Use this directory for reusable outer-loop specifications that guide a coding
agent through a bounded development task. A loop is more than an ordered
workflow: it observes verification evidence, chooses the next transition, and
stops in a named terminal state.

## Start Here

- Use `verified-code-change.md` for an ordinary feature, bug fix, or refactor.
- Copy `TEMPLATE.md` when defining a new loop.
- Validate persistent execution state against `state.schema.json`.
- Store active, uncommitted state under `.harness/loops/.state/`. That directory
  is gitignored.

## Relationship To The Rest Of The Harness

- `context/` records current project facts and boundaries.
- `standards/` defines continuing quality expectations.
- `checklists/` defines checks for a particular stage.
- `workflows/` provides domain-specific ordered procedures.
- `plans/` describes one concrete implementation.
- `loops/` controls iteration, verification feedback, recovery, and stopping.
- `runs/` records concise evidence from important completed executions.

A loop should route to these assets instead of copying them.

## Required Loop Contract

Every loop must define:

1. trigger and entry conditions;
2. inputs and verifiable acceptance criteria;
3. context-loading rules;
4. invariants, allowed actions, and forbidden actions;
5. phases and transition rules;
6. deterministic verification where possible;
7. failure classification and retry policy;
8. execution budgets and human gates;
9. persistent state and resume behavior;
10. named terminal states and completion evidence.

## Terminal States

Every execution must end in one of:

- `complete`: all required acceptance criteria and final verification passed;
- `no_change`: inspection proved that no repository change is needed;
- `needs_human`: product intent, scope, authorization, or safety requires a user decision;
- `blocked`: an external dependency or environment prevents meaningful progress;
- `budget_exhausted`: the configured iteration or retry budget was consumed;
- `cancelled`: the user or controlling process cancelled the run.

Do not report `complete` unless the verification evidence was produced from the
final source state. Any source edit invalidates earlier affected test,
type-check, or review evidence.

## General Safety Rules

- Read `AGENTS.md` and `.harness/README.md` before entering a loop.
- Preserve unrelated user changes.
- Never weaken acceptance criteria or valid tests merely to obtain a pass.
- Prefer compiler, test, schema, and runtime evidence over model self-review.
- Keep the actor from changing its own verifier without an explicit human gate.
- Do not commit, push, tag, release, publish, or deploy unless explicitly authorized.
- Persist decisions and verification evidence, not private chain-of-thought.

## State Files

Use one JSON file per active execution:

```text
.harness/loops/.state/<task-id>.json
```

The state is operational and should not be committed. After a meaningful run,
distill durable results into the appropriate `context/`, `troubleshooting/`,
`decisions/`, or `runs/` file.
