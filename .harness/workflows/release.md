# Workflow: Release

1. Confirm the user explicitly asked to release, tag, push, or publish.
2. Read `AGENTS.md` release instructions.
3. Check `git status --short`.
4. Run `bun run typecheck` and `bun test`.
5. Use `scripts/release.sh` only after explicit confirmation.
6. Do not push tags or create GitHub releases without explicit user confirmation.
