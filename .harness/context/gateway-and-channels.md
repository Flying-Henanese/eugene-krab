# Gateway And Channels

Read this before changing Feishu, WhatsApp, routing, gateway config, chat formatting, or headless agent behavior.

## Gateway Scope

The gateway turns channel messages into agent runs and sends responses back to the originating chat. Channel-specific code belongs under `src/gateway/channels/<channel>/`; shared routing, sessions, access control, heartbeat, and agent-runner behavior belongs under `src/gateway/`.

## Channel Plugins

Existing channels:

- WhatsApp: `src/gateway/channels/whatsapp/`
- Feishu: `src/gateway/channels/feishu/`

`src/gateway/channels/index.ts` documents the extension shape: implement a channel plugin, register it in gateway bootstrap, and reuse the common manager lifecycle.

## Feishu Current Scope

This file is the current working context for Feishu changes. Consult `docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md` only when you need the original design rationale or to revisit the initial scope.

Current Feishu behavior:

- Uses Feishu/Lark `WSClient` long connection.
- Credentials come from `FEISHU_APP_ID` and `FEISHU_APP_SECRET`.
- Accepts only `im.message.receive_v1` one-on-one text messages.
- Ignores non-`p2p` chats and non-text message types.
- Deduplicates message IDs with a TTL.
- Sends outbound answers through Feishu-specific outbound formatting.
- Can optionally send an updateable “processing” card before an agent run and replace it with the final answer. This is disabled by default under `channels.feishu.processingCard` so deployments without the Feishu update-message permission retain the existing behavior.
- Falls back to the existing standalone outbound path when processing-card creation or final update fails; empty answers and agent failures are best-effort updates to a terminal card state.

The current scope still excludes group chats, webhooks, images, per-tool progress updates, and project-local allowlists.

## Gateway Config

Config is loaded from `.dexter/gateway.json` or `DEXTER_GATEWAY_CONFIG`. Feishu is disabled by default when no config file exists. WhatsApp defaults enabled. Gateway model policy can come from JSON config or environment variables.

## Testing Targets

Gateway work should usually run a focused test subset before full `bun test`, for example:

- `src/gateway/config.test.ts`
- `src/gateway/access-control.test.ts`
- `src/gateway/routing/resolve-route.test.ts`
- `src/gateway/channels/feishu/*.test.ts`
- `src/gateway/channels/whatsapp/*.test.ts`

Run `bun run typecheck` after behavior changes.
