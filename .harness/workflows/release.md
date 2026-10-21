# Workflow: Release

1. Check that the user has authorized release, tag, push, and publication in the
   conversation. Authorization from an earlier turn remains valid.
2. Read `AGENTS.md` authorization rules and inspect `scripts/release.sh` before
   using it. Versions follow SemVer with a `v` tag prefix; without a version
   argument, the script increments the current patch version.
3. Check `git status --short`.
4. Run `bun run typecheck` and `bun test`.
5. Review the script's release preview and use its interactive confirmation
   only for actions already authorized by the user.
6. Verify the tag, target remote, and GitHub release after the script finishes.
