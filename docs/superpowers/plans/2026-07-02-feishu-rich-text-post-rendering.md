# Feishu Rich Text Post Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Feishu chat readability by sending Dexter answers as Feishu `post` rich text messages instead of raw Markdown-looking `text` messages.

**Architecture:** Keep the Feishu gateway flow unchanged, but add a small outbound formatting layer under `src/gateway/channels/feishu/`. The formatter converts Dexter's limited Markdown-ish output into Feishu post content blocks, then `sendMessageFeishu` sends `msg_type: "post"` with a plain-text fallback path for unsupported or empty content.

**Tech Stack:** TypeScript, Bun test runner, `@larksuiteoapi/node-sdk`, Feishu `im.v1.message.create`, existing Dexter gateway channel architecture.

---

## Current State

- Feishu replies are sent from `src/gateway/channels/feishu/outbound.ts`.
- Current send shape:

```ts
await client.im.v1.message.create({
  params: {
    receive_id_type: 'chat_id',
  },
  data: {
    receive_id: params.chatId,
    msg_type: 'text',
    content: JSON.stringify({ text: params.body }),
  },
});
```

- Feishu chat displays Markdown syntax literally because the first version intentionally sends plain text only.
- `src/agent/channels.ts` already has a Feishu profile that discourages tables and Markdown headers, but agent output can still contain Markdown-style bold, bullets, section labels, links, and source notes.

## Scope

### In Scope

- Convert outbound Feishu replies to `post` rich text messages.
- Support a conservative Markdown subset:
  - `**bold**` -> Feishu bold text tags.
  - Markdown links `[label](https://example.com)` -> Feishu `a` tags.
  - Plain URLs -> clickable links where practical.
  - Markdown bullets (`- item`, `* item`) -> readable bullet lines.
  - Markdown headings (`#`, `##`, `###`) -> bold text lines without literal `#`.
  - Markdown tables -> compact text lines instead of raw pipe tables.
  - Code fences and inline code -> plain text with minimal delimiters.
- Keep messages concise and mobile-friendly.
- Add unit tests for conversion and outbound payload shape.
- Preserve `text` fallback for empty rich-text output or SDK/API failure if the implementation chooses retry fallback.

### Out of Scope

- No Feishu interactive cards.
- No buttons, menus, images, files, or media upload.
- No inbound rich-text message parsing.
- No group chat support.
- No broad agent prompt redesign beyond a small Feishu profile wording update if needed.
- No changes to WhatsApp formatting.

## Proposed File Structure

- Create `src/gateway/channels/feishu/post-format.ts`
  - Owns conversion from Markdown-ish text to Feishu `post` content.
  - Exports `formatFeishuPostContent(body: string): FeishuPostContent`.
  - Exports small helpers only if tests need them.

- Create `src/gateway/channels/feishu/post-format.test.ts`
  - Unit tests for bold, headings, bullets, links, tables, code fences, blank lines, and fallback text.

- Modify `src/gateway/channels/feishu/outbound.ts`
  - Calls `formatFeishuPostContent`.
  - Sends `msg_type: "post"` and `content: JSON.stringify(postContent)`.
  - Keeps the SDK client construction and `receive_id_type: "chat_id"` unchanged.

- Create `src/gateway/channels/feishu/outbound.test.ts`
  - Tests that `sendMessageFeishu` sends `post` payloads.
  - Tests that the serialized content has `zh_cn.content`.
  - Tests that secrets are not included in message content.

- Optionally modify `src/agent/channels.ts`
  - Tighten Feishu output guidance so the model naturally emits short sections and bullets that convert well.

- Optionally update `docs/superpowers/specs/2026-07-01-feishu-wsclient-design.md`
  - Add a short "Second-stage rich text rendering" note if documentation drift matters.

## Feishu Post Data Shape

Use the Feishu post message content shape:

```ts
type FeishuPostTag =
  | { tag: 'text'; text: string; style?: ['bold'] }
  | { tag: 'a'; text: string; href: string; style?: ['bold'] };

type FeishuPostContent = {
  zh_cn: {
    title?: string;
    content: FeishuPostTag[][];
  };
};
```

Each inner array is one paragraph/line. Keep the first implementation simple: one parsed source line becomes one Feishu post line.

Example output:

```json
{
  "zh_cn": {
    "content": [
      [{ "tag": "text", "text": "结论：", "style": ["bold"] }, { "tag": "text", "text": "稳健医疗短期关注业绩修复。" }],
      [{ "tag": "text", "text": "• 估值：PE 22.5，PB 2.1" }],
      [{ "tag": "a", "text": "来源", "href": "https://example.com" }]
    ]
  }
}
```

## Formatting Rules

1. Normalize newlines to `\n`.
2. Trim trailing whitespace per line.
3. Drop excessive blank lines; keep at most one blank separator.
4. Convert Markdown headings:

```text
## 估值
```

to:

```json
[{ "tag": "text", "text": "估值", "style": ["bold"] }]
```

5. Convert bullets:

```text
- PE：22.5
```

to:

```json
[{ "tag": "text", "text": "• PE：22.5" }]
```

6. Convert inline bold:

```text
**结论**：偏谨慎
```

to:

```json
[
  { "tag": "text", "text": "结论", "style": ["bold"] },
  { "tag": "text", "text": "：偏谨慎" }
]
```

7. Convert links:

```text
[公告](https://example.com)
```

to:

```json
[{ "tag": "a", "text": "公告", "href": "https://example.com" }]
```

8. Convert simple tables to text lines. Example:

```markdown
| 指标 | 数值 |
|---|---|
| PE | 22.5 |
| PB | 2.1 |
```

to:

```text
指标：数值
PE：22.5
PB：2.1
```

9. Strip code fences while preserving text content:

````markdown
```text
TUSHARE_TOKEN=your-token
```
````

to:

```text
TUSHARE_TOKEN=your-token
```

10. Inline code keeps the value but removes backticks:

```text
使用 `TUSHARE_TOKEN`
```

to:

```text
使用 TUSHARE_TOKEN
```

## Task 1: Add Feishu Post Formatter Tests

**Files:**
- Create: `src/gateway/channels/feishu/post-format.test.ts`
- Create later: `src/gateway/channels/feishu/post-format.ts`

- [ ] **Step 1: Write failing tests for core conversion**

Create `src/gateway/channels/feishu/post-format.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { formatFeishuPostContent } from './post-format.js';

describe('formatFeishuPostContent', () => {
  test('converts headings, bold text, bullets, and links into Feishu post lines', () => {
    const result = formatFeishuPostContent([
      '## 结论',
      '**稳健医疗**：短期关注业绩修复。',
      '- 估值：[PE](https://example.com/pe) 22.5',
    ].join('\n'));

    expect(result).toEqual({
      zh_cn: {
        content: [
          [{ tag: 'text', text: '结论', style: ['bold'] }],
          [
            { tag: 'text', text: '稳健医疗', style: ['bold'] },
            { tag: 'text', text: '：短期关注业绩修复。' },
          ],
          [
            { tag: 'text', text: '• 估值：' },
            { tag: 'a', text: 'PE', href: 'https://example.com/pe' },
            { tag: 'text', text: ' 22.5' },
          ],
        ],
      },
    });
  });

  test('converts markdown tables into compact text lines', () => {
    const result = formatFeishuPostContent([
      '| 指标 | 数值 |',
      '|---|---|',
      '| PE | 22.5 |',
      '| PB | 2.1 |',
    ].join('\n'));

    expect(result.zh_cn.content).toEqual([
      [{ tag: 'text', text: '指标：数值', style: ['bold'] }],
      [{ tag: 'text', text: 'PE：22.5' }],
      [{ tag: 'text', text: 'PB：2.1' }],
    ]);
  });

  test('strips code fences and inline code markers without dropping content', () => {
    const result = formatFeishuPostContent([
      '```text',
      'TUSHARE_TOKEN=your-tushare-token',
      '```',
      '使用 `web_search` 补充新闻。',
    ].join('\n'));

    expect(result.zh_cn.content).toEqual([
      [{ tag: 'text', text: 'TUSHARE_TOKEN=your-tushare-token' }],
      [{ tag: 'text', text: '使用 web_search 补充新闻。' }],
    ]);
  });

  test('returns a readable fallback line for empty input', () => {
    const result = formatFeishuPostContent('   \n\n');

    expect(result.zh_cn.content).toEqual([
      [{ tag: 'text', text: 'Dexter returned an empty response.' }],
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/post-format.test.ts
```

Expected: FAIL because `./post-format.js` does not exist.

- [ ] **Step 3: Commit only the failing test if using strict checkpoint commits**

```bash
git add src/gateway/channels/feishu/post-format.test.ts
git commit -m "test: specify Feishu post formatting"
```

If the worker prefers one commit per completed task, skip this commit and commit at the end of Task 2.

## Task 2: Implement Feishu Post Formatter

**Files:**
- Create: `src/gateway/channels/feishu/post-format.ts`
- Test: `src/gateway/channels/feishu/post-format.test.ts`

- [ ] **Step 1: Implement formatter types and line pipeline**

Create `src/gateway/channels/feishu/post-format.ts`:

```ts
export type FeishuPostTextTag = {
  tag: 'text';
  text: string;
  style?: ['bold'];
};

export type FeishuPostLinkTag = {
  tag: 'a';
  text: string;
  href: string;
  style?: ['bold'];
};

export type FeishuPostTag = FeishuPostTextTag | FeishuPostLinkTag;

export type FeishuPostContent = {
  zh_cn: {
    title?: string;
    content: FeishuPostTag[][];
  };
};

export function formatFeishuPostContent(body: string): FeishuPostContent {
  const lines = normalizeLines(body);
  const content: FeishuPostTag[][] = [];
  let inCodeFence = false;

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (!inCodeFence && isMarkdownTableSeparator(rawLine)) {
      continue;
    }

    const convertedTableLine = !inCodeFence && isMarkdownTableRow(rawLine)
      ? tableRowToText(rawLine)
      : rawLine;
    const line = stripInlineCode(convertedTableLine).trim();

    if (!line) {
      continue;
    }

    if (!inCodeFence && isMarkdownTableRow(rawLine) && content.length === 0) {
      content.push([{ tag: 'text', text: line, style: ['bold'] }]);
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      content.push([{ tag: 'text', text: heading[1].trim(), style: ['bold'] }]);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    const displayLine = bullet ? `• ${bullet[1].trim()}` : line;
    content.push(parseInlineTags(displayLine));
  }

  return {
    zh_cn: {
      content: content.length > 0
        ? content
        : [[{ tag: 'text', text: 'Dexter returned an empty response.' }]],
    },
  };
}

function normalizeLines(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());
}

function stripInlineCode(line: string): string {
  return line.replace(/`([^`]+)`/g, '$1');
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return [];
  }
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function tableRowToText(line: string): string {
  const cells = splitTableCells(line);
  if (cells.length === 2) {
    return `${cells[0]}：${cells[1]}`;
  }
  return cells.join(' / ');
}

function parseInlineTags(line: string): FeishuPostTag[] {
  const tags: FeishuPostTag[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      pushText(tags, line.slice(cursor, match.index));
    }

    if (match[2]) {
      pushText(tags, match[2], true);
    } else if (match[4] && match[5]) {
      tags.push({ tag: 'a', text: match[4], href: match[5] });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    pushText(tags, line.slice(cursor));
  }

  return tags.length > 0 ? tags : [{ tag: 'text', text: line }];
}

function pushText(tags: FeishuPostTag[], text: string, bold = false): void {
  if (!text) {
    return;
  }
  tags.push(bold ? { tag: 'text', text, style: ['bold'] } : { tag: 'text', text });
}
```

- [ ] **Step 2: Run formatter tests**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/post-format.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit formatter**

```bash
git add src/gateway/channels/feishu/post-format.ts src/gateway/channels/feishu/post-format.test.ts
git commit -m "feat: format Feishu replies as rich text post content"
```

## Task 3: Send Feishu Replies as Post Messages

**Files:**
- Modify: `src/gateway/channels/feishu/outbound.ts`
- Create: `src/gateway/channels/feishu/outbound.test.ts`

- [ ] **Step 1: Write failing outbound payload test**

Create `src/gateway/channels/feishu/outbound.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'bun:test';

const originalClient = (await import('@larksuiteoapi/node-sdk')).Client;
const createCalls: unknown[] = [];

class FakeClient {
  readonly im = {
    v1: {
      message: {
        create: async (payload: unknown) => {
          createCalls.push(payload);
          return {};
        },
      },
    },
  };

  constructor(readonly config: unknown) {}
}

describe('sendMessageFeishu', () => {
  afterEach(async () => {
    createCalls.length = 0;
    const lark = await import('@larksuiteoapi/node-sdk');
    // @ts-expect-error test restores SDK constructor
    lark.Client = originalClient;
  });

  test('sends rich text post content to the target chat', async () => {
    const lark = await import('@larksuiteoapi/node-sdk');
    // @ts-expect-error test replaces SDK constructor
    lark.Client = FakeClient;
    const { sendMessageFeishu } = await import('./outbound.js');

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: '**结论**：短期关注业绩修复。',
    });

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toEqual({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: 'oc_chat',
        msg_type: 'post',
        content: JSON.stringify({
          zh_cn: {
            content: [
              [
                { tag: 'text', text: '结论', style: ['bold'] },
                { tag: 'text', text: '：短期关注业绩修复。' },
              ],
            ],
          },
        }),
      },
    });
  });
});
```

If Bun cannot monkey-patch the ESM SDK export, replace this test with dependency injection:

```ts
export type FeishuMessageClient = {
  im: {
    v1: {
      message: {
        create(payload: unknown): Promise<unknown>;
      };
    };
  };
};

export async function sendMessageFeishu(params: SendMessageFeishuParams, client = createFeishuClient(params)): Promise<void> {
  // implementation
}
```

Then pass a fake client in the test. Prefer dependency injection if the direct mock is brittle.

- [ ] **Step 2: Run outbound test to verify it fails**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/outbound.test.ts
```

Expected: FAIL because current outbound sends `msg_type: "text"`.

- [ ] **Step 3: Modify outbound sender**

Replace `src/gateway/channels/feishu/outbound.ts` with this shape:

```ts
import * as Lark from '@larksuiteoapi/node-sdk';
import { formatFeishuPostContent } from './post-format.js';

export type SendMessageFeishuParams = {
  appId: string;
  appSecret: string;
  chatId: string;
  body: string;
};

export async function sendMessageFeishu(params: SendMessageFeishuParams): Promise<void> {
  const client = new Lark.Client({
    appId: params.appId,
    appSecret: params.appSecret,
  });

  await client.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: params.chatId,
      msg_type: 'post',
      content: JSON.stringify(formatFeishuPostContent(params.body)),
    },
  });
}
```

If the test uses dependency injection, use this implementation instead:

```ts
import * as Lark from '@larksuiteoapi/node-sdk';
import { formatFeishuPostContent } from './post-format.js';

export type SendMessageFeishuParams = {
  appId: string;
  appSecret: string;
  chatId: string;
  body: string;
};

export type FeishuMessageClient = {
  im: {
    v1: {
      message: {
        create(payload: {
          params: { receive_id_type: 'chat_id' };
          data: { receive_id: string; msg_type: 'post'; content: string };
        }): Promise<unknown>;
      };
    };
  };
};

function createFeishuClient(params: SendMessageFeishuParams): FeishuMessageClient {
  return new Lark.Client({
    appId: params.appId,
    appSecret: params.appSecret,
  }) as FeishuMessageClient;
}

export async function sendMessageFeishu(
  params: SendMessageFeishuParams,
  client: FeishuMessageClient = createFeishuClient(params),
): Promise<void> {
  await client.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: params.chatId,
      msg_type: 'post',
      content: JSON.stringify(formatFeishuPostContent(params.body)),
    },
  });
}
```

- [ ] **Step 4: Run outbound and formatter tests**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/post-format.test.ts src/gateway/channels/feishu/outbound.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit outbound post sending**

```bash
git add src/gateway/channels/feishu/outbound.ts src/gateway/channels/feishu/outbound.test.ts
git commit -m "feat: send Feishu replies as rich text posts"
```

## Task 4: Tune Feishu Agent Output Guidance

**Files:**
- Modify: `src/agent/channels.ts`
- Modify: `src/agent/channels.test.ts`

- [ ] **Step 1: Write failing profile test**

Modify `src/agent/channels.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { getChannelProfile } from './channels.js';

describe('getChannelProfile', () => {
  test('resolves Feishu profile', () => {
    const profile = getChannelProfile('feishu');

    expect(profile.label).toBe('Feishu');
    expect(profile.tables).toBeNull();
    expect(profile.responseFormat.join('\n')).toContain('No tables');
    expect(profile.responseFormat.join('\n')).toContain('Use short section labels');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/agent/channels.test.ts
```

Expected: FAIL because the Feishu profile does not yet include "Use short section labels".

- [ ] **Step 3: Update Feishu profile wording**

Modify the `FEISHU_PROFILE.responseFormat` array in `src/agent/channels.ts`:

```ts
  responseFormat: [
    'No markdown tables — use short key-value lines instead',
    'Use short section labels like 结论, 估值, 风险, 来源; they will be rendered as rich text',
    'Use simple bullets only when they improve readability',
    'For simple questions, answer in 1-2 lines',
    'For complex questions, use 3-5 short lines, not a long report',
  ],
```

Keep `tables: null`.

- [ ] **Step 4: Run profile test**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/agent/channels.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit profile tuning**

```bash
git add src/agent/channels.ts src/agent/channels.test.ts
git commit -m "chore: tune Feishu response guidance for rich text"
```

## Task 5: Full Verification And Manual Feishu Check

**Files:**
- No required file changes.

- [ ] **Step 1: Run typecheck**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun run typecheck
```

Expected: exits 0 with `tsc --noEmit`.

- [ ] **Step 2: Run full test suite**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test
```

Expected: all tests pass.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 4: Manual Feishu integration test**

Ensure `.env` has real credentials locally but do not commit `.env`:

```bash
FEISHU_APP_ID=your-real-app-id
FEISHU_APP_SECRET=your-real-app-secret
TUSHARE_TOKEN=your-real-tushare-token
TAVILY_API_KEY=your-real-tavily-key
```

Run:

```bash
/Users/zhoushujian/.bun/bin/bun run gateway
```

Send this one-on-one Feishu message:

```text
帮我分析一下 300888.SZ
```

Expected visual result in Feishu:

- No literal `##` heading markers.
- Bold-looking section labels or key terms.
- Bullet-like short lines.
- Links are clickable when present.
- No raw Markdown pipe table.
- Answer remains in the same one-on-one chat.

- [ ] **Step 5: Confirm secrets are not staged**

Run:

```bash
git status --short
git check-ignore -v .env
git diff --cached --name-only
```

Expected:

- `.env` does not appear in staged files.
- `git check-ignore -v .env` reports `.gitignore`.

- [ ] **Step 6: Final commit if Tasks 1-4 were not individually committed**

```bash
git add src/gateway/channels/feishu/post-format.ts \
  src/gateway/channels/feishu/post-format.test.ts \
  src/gateway/channels/feishu/outbound.ts \
  src/gateway/channels/feishu/outbound.test.ts \
  src/agent/channels.ts \
  src/agent/channels.test.ts
git commit -m "feat: render Feishu replies as rich text posts"
```

## Risk Notes

- Feishu `post` content schema may be stricter than the local type. If the SDK rejects a tag shape, inspect the API error and adjust `FeishuPostTag` to the accepted shape before adding more rendering features.
- If Feishu mobile renders `style: ['bold']` differently than expected, keep the structure but rely on clean section labels and line breaks. Do not jump to interactive cards until the post path is proven insufficient.
- If Markdown parsing becomes complex, do not add a general Markdown parser in this iteration. Keep this as a conservative line-based converter tailored to Dexter's Feishu profile.
- Long stock-analysis answers can still be visually heavy. Prefer prompt guidance and compact conversion over splitting messages in this first pass.

## Self-Review

- Spec coverage: This plan implements the chosen方案2, Feishu rich text `post` messages. It deliberately excludes interactive cards and media.
- Placeholder scan: No `TBD`, open-ended "add tests", or unspecified file paths remain.
- Type consistency: `FeishuPostContent`, `FeishuPostTag`, and `sendMessageFeishu` names are consistent across tasks.
- Verification coverage: Formatter unit tests, outbound payload tests, channel profile tests, full typecheck, full test suite, `git diff --check`, and manual Feishu visual QA are included.
