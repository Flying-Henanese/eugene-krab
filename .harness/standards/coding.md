# Coding Standards

Use this as the local TypeScript/Bun coding standard. Keep `AGENTS.md` authoritative for repo-wide rules and use `testing.md` for test-specific depth.

## TypeScript And Runtime

- Use TypeScript ESM with strict typing; the repo runs on Bun first.
- Keep local relative imports compatible with this ESM setup: existing source files import sibling modules with `.js` suffixes, for example `./config.js`.
- Use the `@/` path alias only when it matches nearby repo style or avoids fragile deep relative paths.
- Prefer `import type` for type-only imports when practical.
- Do not introduce CommonJS patterns such as `require`, `module.exports`, or Node-only assumptions unless an existing integration requires them.

## Types And Validation

- Avoid `any`; use explicit types, narrow interfaces, discriminated unions, or `unknown` plus narrowing.
- Validate untrusted boundaries with Zod or focused parsing helpers: config JSON, env-derived settings, API responses, web/search results, and channel events.
- Keep environment variables as strings at the edge, then resolve them into typed config objects before business logic uses them.
- Prefer small exported types near the module boundary over broad shared catch-all types.
- When returning partial external data, model missing or unavailable fields explicitly instead of hiding them behind nullable blobs.

## Module Boundaries

- Prefer repo-local patterns over new abstractions.
- Keep provider-specific behavior in provider modules, for example LLM providers, search providers, finance data providers, and channel providers.
- Keep gateway channel parsing, dedupe, outbound formatting, runtime code, and applicable auth artifacts under `src/gateway/channels/<channel>/`.
- Put shared routing, sessions, access control, heartbeat, cron, and agent-runner behavior under `src/gateway/` only when it applies across channels.
- Keep finance provider specifics under `src/tools/finance/<provider>/`; do not mix Tushare behavior into Financial Datasets tools.
- Update prompt-visible tool descriptions when a tool's behavior, inputs, or availability changes.

## Error Handling

- Throw clear errors for unrecoverable configuration problems such as missing required credentials.
- For recoverable upstream finance/search/provider failures, return structured partial or unavailable data when the caller can still produce a useful answer.
- Preserve enough provider context in error messages to diagnose the failing service without leaking secrets.
- Do not swallow errors silently; either handle them locally with a typed result or let the existing caller/reporting path handle them.

## Async And Lifecycle

- Use `async`/`await` consistently for I/O and provider calls.
- Gateway/channel runtimes should respect `AbortSignal` and update status through the existing manager lifecycle.
- Avoid background timers, long-running loops, or global caches unless they have a clear owner and cleanup path.
- Keep concurrency assumptions explicit; tool registry entries should set `concurrencySafe` according to actual side effects.

## Files, Comments, And Logging

- Keep files concise and extract helpers when duplication becomes meaningful.
- Add brief comments only for non-obvious logic, protocol quirks, or provider-specific behavior.
- Do not add logging unless explicitly asked or required by an existing diagnostic path.
- Never log API keys, tokens, raw private chat history, or other credentials.
- Avoid unrelated refactors while making a targeted behavior change.

## Verification Habits

- Run `bun run typecheck` for TypeScript behavior changes when feasible.
- Run focused `bun test` coverage for changed parser, config, routing, tool, or channel behavior.
- Run `git diff --check` before completion.
