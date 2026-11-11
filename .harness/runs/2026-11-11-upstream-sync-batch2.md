# Upstream sync: Bash and permissions

Batch 1 checkpoint: `a90a79e` (`feat: sync upstream finance and CLI improvements`).
Batch 2 ports `78546e6`, `3987842`, and `f665197` from upstream into the working
tree. Batch 2 remains uncommitted; nothing has been pushed or deployed.

## Integration

- Unified permission decisions preserve file-write session approvals and apply
  before the existing synchronous hard-budget reservation.
- Bash is serial, non-Windows, CLI-only, excluded from subagents and Gateway
  bindings. Compact descriptions reflect the actual bound tool set.
- Shell execution supports output caps, timeout/abort, and process-group cleanup.
- Bash exact-command grants last for one CLI query; permanent allow rules live
  in local settings. Unknown syntax always asks without reusable grants.
- Both local tool-context/budget imports and the upstream permission import are
  retained in `src/agent/types.ts`; local scheduled policies are unchanged.

Local fixes to the upstream implementation:

- Preserve redirection targets for sensitive-path checks (`cat < .env` is denied
  even with a permissive rule or a cached grant).
- Display the complete shell command in approval prompts; label exact-command
  grants accurately and omit reusable choices for non-cacheable requests.
- Do not spawn a shell when its signal is already aborted.
- Align tool descriptions with rule-based approvals and both Gateway channels.

Bash has no OS sandbox and runs with normal user permissions, as in upstream.
Model/provider updates, eval changes and dependency bumps remain deferred.
Original stash `92ac10e819d0367cb745423e87072ad32890a7e7` remains unapplied.

## Verification

- `bun run typecheck`: passed.
- Focused `bun test --isolate`: 266 passed across 12 files, covering permissions,
  shell execution, approval UI, budgets, bindings, subagents and CLI controller.
- Full `bun test --isolate`: 556 passed, 0 failed, 1335 assertions across 72 files.
- `git diff --check`: passed.

Tests ran in a temporary copy without `.env` or private `.dexter/` data, using
the existing dependency directory and file isolation, as established in batch 1.
Shell tests exercised real local process capture, timeout, cancellation, output
limits and background-child termination. Permission integration used stub tools
and temporary settings. Interactive terminal operation, Windows execution and
live Gateway services were not exercised.
