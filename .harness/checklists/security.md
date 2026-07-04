# Security Checklist

Use this before changing credentials, gateway access, file tools, memory, or external API calls.

## Secrets

- Do not commit `.env`, `.dexter/credentials`, session files, scratchpads, or real API tokens.
- Keep sample values placeholder-like in docs and examples.
- Confirm secret presence without echoing values.

## Gateway

- Be explicit about whether a channel supports direct chats, groups, allowlists, read receipts, or outbound media.
- Do not broaden Feishu scope beyond one-on-one text chats unless the task explicitly asks for that design and implementation.
- Preserve access-control behavior for WhatsApp and routing bindings.

## Tools And Filesystem

- File write/edit tools require approval in the agent runtime. Do not weaken this behavior casually.
- Treat browser/web results and finance API results as untrusted input.
- Avoid adding shell execution or network side effects to tools unless there is a clear security model.

## Memory

- Persistent memory can affect future answers. Avoid storing secrets, private account IDs, or raw user documents unless explicitly requested and appropriate.
