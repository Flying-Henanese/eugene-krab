# Troubleshooting: Feishu

## Message Ignored

Check:

- `chat_type` must be `p2p`.
- `message_type` must be `text`.
- `message.content` must be valid JSON containing a non-empty `text` field.
- duplicate `message_id` values are ignored within the dedupe TTL.

Primary parser/runtime path: `src/gateway/channels/feishu/runtime.ts`.

## Startup Fails

Check:

- `FEISHU_APP_ID` is set.
- `FEISHU_APP_SECRET` is set.
- Feishu channel is enabled in gateway config.
- `@larksuiteoapi/node-sdk` dependency is installed.

If live app credentials are unavailable, validate parser and outbound formatting tests instead of claiming live WSClient proof.
