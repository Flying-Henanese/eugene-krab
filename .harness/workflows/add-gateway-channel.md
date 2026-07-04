# Workflow: Add Or Change A Gateway Channel

1. Read `context/gateway-and-channels.md`.
2. Inspect `src/gateway/channels/types.ts`, `src/gateway/channels/manager.ts`, and an existing channel plugin.
3. Keep channel-specific parsing, dedupe, outbound formatting, runtime code, and auth artifacts where applicable under `src/gateway/channels/<channel>/`.
4. Put shared routing/session/access-control behavior under `src/gateway/` only when it applies across channels.
5. Add config schema changes in `src/gateway/config.ts` if the channel needs runtime config.
6. Register the plugin explicitly in `src/gateway/gateway.ts` bootstrap.
7. Add focused channel tests and any routing/config tests.
8. Run `bun run typecheck`, focused `bun test`, and `git diff --check`.

For Feishu, keep the first-version scope unless the task explicitly expands it: WSClient, one-on-one text chats, `.env` credentials, no local allowlist.
