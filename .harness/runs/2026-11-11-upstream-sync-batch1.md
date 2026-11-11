# Upstream sync: low-conflict batch

Local base: `1385c3d`. Upstream reference: `534f6be`.
Changes are ported into the working tree; no merge/cherry-pick commit was made.
Commit ancestry and ahead/behind counts therefore have not changed.

## Scope and provenance

- `bae6616`: formatter dispatch key and duplicate comment cleanup. Message
  truncation and timeout cleanup fixes were already present locally.
- `9090119`: insider ownership (Forms 3/5).
- `2f05c9a`: beneficial ownership (13D/13G), excluding the package version bump.
- `88ed7e1`: financial formatters, insider name resolution, and price queries.
- `ecaed30`: cursor pagination and 60-second finance sub-tool timeout.
- `e736590`: Tab completes slash commands without executing them.
- `62fcf1e`, `173a025`, `741a868`, `c8d8c53`: queued-message display and
  preservation across main-view restoration.
- `810ebde`: headless browser behavior was already present; no edit needed.
- `bba36f3`: byte-offset reading was already present; retained local prompt
  descriptions and extra tests.

Local adaptations: reject foreign-origin/credential-bearing pagination URLs
and repeated cursors; calculate same-day query widening in UTC to avoid an
extra day in Asia/Shanghai; align the market-data snapshot description.

Model/provider, permissions/bash, evals, package versions and dependencies
remain deferred. Local A-share tools, gateway policies and tool budgets are
preserved. Stash `92ac10e819d0367cb745423e87072ad32890a7e7`
(`pre-upstream-sync-2026-11-11`) remains unchanged and unapplied.

## Verification

- `bun run typecheck`: passed after the final code changes.
- Focused tests with `bun test --isolate`: 45 passed across 9 files; another
  5 formatter/date regression tests passed across 2 files.
- Final `bun test --isolate`: 325 passed, 0 failed across 64 files.
- `git diff --check`: passed.

Tests ran in a temporary copy of the tracked tree plus this batch's edits,
with the existing `node_modules` linked in. The copy excludes `.env` and
private `.dexter/` state because existing cache tests delete `.dexter/cache`.
The initial combined test command without file isolation timed out in
controller approval tests. The controller suite passed separately on both
the original HEAD and the updated tree (13 tests each); file-isolated
focused and full runs passed. Use `--isolate` to avoid cross-file mock state.

Financial API and name-resolution behavior use mocks in regression tests;
live API, LLM fallback and interactive terminal rendering were not exercised.
