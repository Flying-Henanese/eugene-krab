# Feishu WSClient Gateway Design

Date: 2026-07-01

## Goal

Add a Feishu channel so Dexter can be used from Feishu one-on-one bot chats. The first version should be small, deployable on Alibaba Cloud without a public callback domain, and consistent with the existing gateway architecture.

## Decisions

- Use Feishu's `@larksuiteoapi/node-sdk` `WSClient` long connection, not webhook callbacks.
- Support only direct one-on-one Feishu chats in the first version.
- Support only text inbound messages in the first version.
- Rely on Feishu app availability scope for access control. Do not add a Dexter-side allowlist yet.
- Store Feishu credentials in `.env`, not `.dexter/gateway.json`.
- Keep `bun run gateway` as the single runtime entrypoint.

## Configuration

Environment variables:

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

Gateway config:

```json
{
  "channels": {
    "feishu": {
      "enabled": true
    }
  }
}
```

`APP_ID` and `APP_SECRET` must not be written to `.dexter/gateway.json` or committed.

## Feishu App Setup

The Feishu application should:

- Enable bot capability.
- Subscribe to `im.message.receive_v1`.
- Grant permission for one-on-one bot messages, such as `im:message.p2p_msg:readonly`.
- Grant bot send-message permission, such as `im:message:send_as_bot` or equivalent current Feishu send-message permission.
- Set the application availability scope to only the intended users, currently the project owner and the owner's father.

## Architecture

Add a new channel under:

```text
src/gateway/channels/feishu/
```

Expected files:

- `types.ts`: Feishu inbound message shape used inside the channel.
- `runtime.ts`: Creates the Feishu `WSClient`, registers `im.message.receive_v1`, parses events, and forwards accepted messages.
- `outbound.ts`: Sends text replies to Feishu with `receive_id_type=chat_id`.
- `plugin.ts`: Implements `ChannelPlugin<GatewayConfig, FeishuAccountConfig>`.
- `index.ts`: Public exports.

The existing `ChannelManager` should manage Feishu lifecycle just like WhatsApp.

## Inbound Flow

1. `bun run gateway` loads `.env` and `.dexter/gateway.json`.
2. Gateway creates both WhatsApp and Feishu channel managers when enabled.
3. Feishu `WSClient` receives `im.message.receive_v1`.
4. Feishu runtime ignores non-`p2p` messages.
5. Feishu runtime ignores non-`text` messages.
6. Feishu runtime parses `message.content` JSON and extracts `text`.
7. Gateway resolves route with:
   - `channel: "feishu"`
   - `peer.kind: "direct"`
   - `peer.id: message.chat_id`
8. Gateway runs the existing `runAgentForMessage`.
9. Gateway sends the answer back to the same Feishu `chat_id`.

## Outbound Flow

Use Feishu send-message API through the Node SDK:

- `receive_id_type`: `chat_id`
- `receive_id`: inbound `message.chat_id`
- `msg_type`: `text`
- `content`: serialized JSON string, for example `{"text":"..."}`

The first version should send plain text only. Do not add Feishu cards, images, files, or rich text yet.

## Gateway Refactor Scope

Keep the first implementation narrow:

- It is acceptable to add a Feishu-specific handler next to the current WhatsApp handler if that keeps the diff small.
- Avoid a broad gateway abstraction rewrite unless the code becomes too duplicated.
- Add only the minimal shared helpers needed for routing, session metadata, model selection, agent invocation, and response sending.

## Agent Formatting

Add a `feishu` channel profile in `src/agent/channels.ts`.

Recommended behavior:

- Mobile IM style.
- Short, direct answers.
- No wide markdown tables.
- Avoid WhatsApp-specific formatting assumptions.

Do not reuse `cleanMarkdownForWhatsApp` for Feishu without checking the rendered result. A simple first version may send the raw agent answer or a light Feishu text sanitizer.

## Cron And Heartbeat

The first version does not need Feishu delivery for cron or heartbeat unless explicitly requested during implementation. Existing WhatsApp cron behavior can remain unchanged.

## Non-Goals

- No Feishu group chat support.
- No Feishu webhook server.
- No project-local Feishu allowlist.
- No Feishu card rendering.
- No media upload or file handling.
- No interactive message buttons.
- No migration of WhatsApp internals beyond what is necessary for Feishu.

## Testing

Unit/static tests should cover:

- Feishu config parsing with defaults.
- Feishu direct text event parsing.
- Non-p2p events are ignored.
- Non-text events are ignored.
- Route session keys include `feishu`.
- Feishu channel profile resolves.

Manual integration test:

1. Set `FEISHU_APP_ID` and `FEISHU_APP_SECRET` in `.env`.
2. Enable `channels.feishu.enabled` in `.dexter/gateway.json`.
3. Run `bun run gateway`.
4. Send a one-on-one text message to the Feishu bot.
5. Confirm Dexter replies in the same one-on-one chat.

## Open Implementation Notes

- Check the installed `@larksuiteoapi/node-sdk` TypeScript types before finalizing runtime code.
- Prefer the SDK's built-in token handling if available.
- Log connection state and rejected unsupported message types at the same level/style as the existing gateway logs.
- Keep secrets out of logs.
