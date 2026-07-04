# Verification Checklist

Use this before claiming a change is done.

## Minimum For Docs-Only Harness Changes

- `git diff --check`
- A targeted grep/readback that verifies `AGENTS.md` points to `.harness/README.md`.
- A targeted grep/readback that verifies `.harness/README.md` routes key task types to context files.

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

## Report Honestly

If network, credentials, Feishu app access, or upstream finance permissions prevent full verification, state that clearly and report the static/unit checks that did run.
