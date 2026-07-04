# Workflow: Debug Gateway

1. Read `context/gateway-and-channels.md` and `context/runtime-and-config.md`.
2. Identify whether the failure is startup/config, channel connection, inbound parsing, routing/session, agent execution, or outbound send.
3. Inspect `.dexter/gateway.json` only if needed and do not expose secrets.
4. For Feishu, check `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, message type, chat type, and message dedupe.
5. For WhatsApp, check login/auth dir, allowlist or policy, and reconnect behavior.
6. Run the smallest relevant tests before broad tests.
7. If credentials or live channel access are unavailable, verify parser/config/routing logic with unit tests and say live validation is pending.
