# Code Change Checklist

Use this before and during nontrivial edits.

## Before Editing

- Read `AGENTS.md`.
- Read `.harness/README.md` and the task-specific context file.
- Inspect current source paths before trusting README or prior notes.
- Check `git status --short` so unrelated user changes are visible.
- If touching Feishu or gateway channels, read `.harness/context/gateway-and-channels.md`; consult `docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md` only for original rationale or scope questions.
- If touching A-share/Tushare/Tavily behavior, read `.harness/context/market-data-sources.md`; consult `docs/superpowers/specs/2026-07-02-tushare-tavily-stock-analysis-design.md` only for original rationale or scope questions.

## During Editing

- Keep edits localized to the relevant module boundary.
- Update prompt-visible tool descriptions when tool behavior changes.
- Update `env.example` when adding or changing environment variables.
- Keep gateway channel-specific code inside the channel directory.
- Do not add logging unless asked or necessary for an existing runtime diagnostic path.

## Completion

- Run focused tests for the touched area.
- Run `bun run typecheck` for TypeScript logic changes when feasible.
- Run `git diff --check`.
- Re-check `git status --short`.
- Record important validation details in `runs/` only when they are useful for future work.
