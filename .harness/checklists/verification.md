# Verification Checklist

Use this before claiming a change is done.

## Minimum For Docs-Only Harness Changes

- `git diff --check`
- A targeted grep/readback that verifies `AGENTS.md` points to `.harness/README.md`.
- A targeted grep/readback that verifies `.harness/README.md` routes key task types to context files.
- Check local file references and links in every changed document, including
  references to moved or deleted files beyond the entrypoints. Resolve paths
  from their documented base; check glob matches where applicable. Clearly
  distinguish runtime-generated paths and placeholders, which need not exist
  in the checkout.
- Read back changed instructions for consistency with related harness rules,
  and verify descriptions of current behavior against the relevant source.

Bun tests and type checking are not required when only documentation changes.

## Minimum For TypeScript Logic Changes

- Focused `bun test` files for the touched module.
- `bun run typecheck`
- `git diff --check`

## Gateway Changes

Prefer focused tests first:

- `bun test src/gateway/config.test.ts`
- `bun test src/gateway/routing/resolve-route.test.ts`
- `bun test src/gateway/channels/feishu/*.test.ts`
- `bun test src/gateway/channels/whatsapp/*.test.ts`

Then run broader `bun test` when the blast radius is not obvious.

## Finance Tool Changes

Cover:

- provider selection and env-gated registration
- malformed or unsupported ticker inputs
- permission-denied partial-data behavior where applicable
- prompt-visible descriptions

## Test Design And Final Review

- Keep `*.test.ts` files close to the behavior they cover. Prefer deterministic
  unit tests for parser, config, and routing logic; mock or isolate upstream
  finance, search, and channel APIs when live access is unavailable.
- Review the final diff for regressions, stale tool descriptions, channel code
  in shared gateway modules, CLI-only assumptions in headless paths, missing
  `env.example` updates, credential exposure, missing focused tests, and harness
  context that no longer matches source.
- Lead review feedback with concrete findings and file paths.

## Report Honestly

If network, credentials, Feishu app access, or upstream finance permissions prevent full verification, state that clearly and report the static/unit checks that did run.
