# Testing Standards

- Use Bun's test runner for current tests.
- Keep tests close to the behavior they cover.
- For parser/config/routing logic, prefer deterministic unit tests over live provider tests.
- Mock or isolate upstream finance/search/channel APIs where credentials are unavailable.
- Run `bun run typecheck` for TypeScript behavior changes when feasible.
- Run `git diff --check` before completion.
