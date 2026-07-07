# Feishu Card Table Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Markdown tables in Feishu as readable interactive-card table blocks while keeping ordinary Feishu answers on the existing rich-text `post` path.

**Architecture:** Keep the current Feishu gateway flow and `sendMessageFeishu(...)` call site intact. Add a Feishu card formatter that detects pipe Markdown tables, converts surrounding prose into card markdown blocks, converts each table into card row/column blocks, and has `sendMessageFeishu` choose `msg_type: "interactive"` only when a card table is present; otherwise it keeps the existing `msg_type: "post"` behavior.

**Tech Stack:** TypeScript, Bun test runner, `@larksuiteoapi/node-sdk`, Feishu `im.v1.message.create`, Feishu interactive card JSON, existing `src/gateway/channels/feishu/` outbound formatting.

---

## Current State

- Feishu inbound handling lives in `src/gateway/gateway.ts` and calls `sendMessageFeishu(...)` with the final agent answer.
- `src/gateway/channels/feishu/outbound.ts` currently always sends `msg_type: "post"`.
- `src/gateway/channels/feishu/post-format.ts` converts headings, bullets, links, and inline bold into Feishu post tags.
- Markdown table rows are currently preserved as text, but Feishu `post` text does not render Markdown tables into visual tables. The user-visible result is raw pipe-table syntax such as:

```text
| 指标 | 数据 |
|---|---|
| 最新收盘 | 374.51 元 |
```

## Desired Behavior

For an answer with no Markdown table:

- Keep sending `msg_type: "post"`.
- Keep existing post formatting and tests.

For an answer with at least one pipe Markdown table:

- Send `msg_type: "interactive"`.
- Preserve prose before and after the table.
- Render each table as card row blocks with aligned columns.
- Keep the answer readable on desktop and mobile.
- If card sending fails at runtime, fall back to the existing `post` message so the user still receives an answer.

## Important API Check Before Implementation

Before coding Task 1, inspect the current Feishu/Lark interactive card documentation or SDK examples for the accepted JSON shape for:

- `msg_type: "interactive"` in `client.im.v1.message.create(...)`.
- Card root fields such as `config`, `header`, and `elements`.
- Supported card elements for `div`, `hr`, `column_set`, and `column`.
- Text object tags such as `plain_text` and `lark_md`.

This plan uses the card JSON shape below as the target contract because it matches the common Feishu/Lark interactive-card model. If the official schema in the implementation environment differs, adjust the type definitions and tests in Task 1 before writing production code, and keep the same higher-level behavior.

## Proposed File Structure

- Create `src/gateway/channels/feishu/markdown-table.ts`
  - Owns small, deterministic parsing of pipe Markdown tables.
  - Exports `parseMarkdownTables(body: string): FeishuMarkdownSegment[]`.
  - Does not know anything about Feishu card or post payloads.

- Create `src/gateway/channels/feishu/markdown-table.test.ts`
  - Covers table detection, prose/table segmentation, alignment separator removal, multiple tables, and malformed table fallback.

- Create `src/gateway/channels/feishu/card-format.ts`
  - Owns conversion from parsed Markdown segments into Feishu interactive card JSON.
  - Exports `formatFeishuTableCard(body: string): FeishuInteractiveCard | null`.
  - Returns `null` when the answer has no parseable table.

- Create `src/gateway/channels/feishu/card-format.test.ts`
  - Covers card generation for one table, prose around tables, multiple tables, wide table safety, and no-table fallback.

- Modify `src/gateway/channels/feishu/outbound.ts`
  - Extends `FeishuMessageClient` to allow `msg_type: "interactive"`.
  - Calls `formatFeishuTableCard(params.body)` first.
  - Sends `interactive` when a card is returned.
  - Falls back to `post` if no table is present.
  - Falls back to `post` if interactive send throws.

- Modify `src/gateway/channels/feishu/outbound.test.ts`
  - Adds tests for interactive card send, non-table post send, and card-send failure fallback.

- Modify `src/agent/channels.ts`
  - Update Feishu guidance from “Markdown tables will be sent directly” to “Use compact Markdown tables; Feishu card rendering will format them.”
  - Keep the existing ban on slash-separated pseudo-tables.

- Modify `src/agent/channels.test.ts`
  - Update assertions to match the new card-rendering guidance.

## Card Rendering Strategy

Use one Feishu card per answer when at least one Markdown table exists.

Text outside tables:

```ts
{
  tag: 'div',
  text: {
    tag: 'lark_md',
    content: '原文段落，保留 **加粗** 和链接语义的可读文本'
  }
}
```

Each Markdown table:

```markdown
| 指标 | Q1 2026 | 同比 |
|---|---:|---:|
| 营收 | 1,291 亿 | +52.5% |
| 归母净利 | 207.4 亿 | +48.5% |
```

Card target shape:

```ts
{
  tag: 'column_set',
  flex_mode: 'none',
  background_style: 'grey',
  columns: [
    {
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: '**指标**' }
        }
      ]
    },
    {
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: '**Q1 2026**' }
        }
      ]
    },
    {
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: '**同比**' }
        }
      ]
    }
  ]
}
```

Each data row becomes another `column_set`. Add an `hr` between separate tables, not between every row, to avoid noisy cards.

## Limits And Fallbacks

- Table columns: render up to 4 columns in card columns. If a table has more than 4 columns, keep the first 4 columns and append a text block saying `表格列数较多，已展示前 4 列。`
- Cell length: truncate each cell to 60 characters with `...`.
- Total card elements: keep under 80 elements. If conversion would exceed this, render the first tables that fit and append `内容较长，已省略部分表格行。`
- Malformed tables: leave them in a text block rather than trying to repair them.
- Runtime failure: if `interactive` send throws, send the same answer through existing `post` formatting.

## Task 1: Add Markdown Table Parser Tests

**Files:**
- Create: `src/gateway/channels/feishu/markdown-table.test.ts`
- Create later: `src/gateway/channels/feishu/markdown-table.ts`

- [ ] **Step 1: Write failing tests for table segmentation**

Create `src/gateway/channels/feishu/markdown-table.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseMarkdownTables } from './markdown-table.js';

describe('parseMarkdownTables', () => {
  test('splits prose and one markdown table into ordered segments', () => {
    const result = parseMarkdownTables([
      '## 股价概览',
      '',
      '| 指标 | 数据 |',
      '|---|---|',
      '| 最新收盘 | 374.51 元 |',
      '| 静态PE | 24.0 |',
      '',
      '近一个月显著回调。',
    ].join('\n'));

    expect(result).toEqual([
      { type: 'text', lines: ['## 股价概览'] },
      {
        type: 'table',
        header: ['指标', '数据'],
        rows: [
          ['最新收盘', '374.51 元'],
          ['静态PE', '24.0'],
        ],
      },
      { type: 'text', lines: ['近一个月显著回调。'] },
    ]);
  });

  test('keeps malformed pipe rows as text', () => {
    const result = parseMarkdownTables([
      '| 指标 | 数据 |',
      '| 最新收盘 | 374.51 元 |',
    ].join('\n'));

    expect(result).toEqual([
      {
        type: 'text',
        lines: [
          '| 指标 | 数据 |',
          '| 最新收盘 | 374.51 元 |',
        ],
      },
    ]);
  });

  test('parses multiple tables without merging intervening prose', () => {
    const result = parseMarkdownTables([
      '| 指标 | 数据 |',
      '|---|---|',
      '| 收盘 | 374.51 |',
      '',
      'Q1 业绩',
      '',
      '| 指标 | Q1 | 同比 |',
      '|---|---:|---:|',
      '| 营收 | 1,291 亿 | +52.5% |',
    ].join('\n'));

    expect(result).toEqual([
      {
        type: 'table',
        header: ['指标', '数据'],
        rows: [['收盘', '374.51']],
      },
      { type: 'text', lines: ['Q1 业绩'] },
      {
        type: 'table',
        header: ['指标', 'Q1', '同比'],
        rows: [['营收', '1,291 亿', '+52.5%']],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the parser tests and verify they fail**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/markdown-table.test.ts
```

Expected: FAIL because `./markdown-table.js` does not exist.

## Task 2: Implement Markdown Table Parser

**Files:**
- Create: `src/gateway/channels/feishu/markdown-table.ts`
- Test: `src/gateway/channels/feishu/markdown-table.test.ts`

- [ ] **Step 1: Implement the parser**

Create `src/gateway/channels/feishu/markdown-table.ts`:

```ts
export type FeishuMarkdownTextSegment = {
  type: 'text';
  lines: string[];
};

export type FeishuMarkdownTableSegment = {
  type: 'table';
  header: string[];
  rows: string[][];
};

export type FeishuMarkdownSegment = FeishuMarkdownTextSegment | FeishuMarkdownTableSegment;

export function parseMarkdownTables(body: string): FeishuMarkdownSegment[] {
  const lines = normalizeLines(body);
  const segments: FeishuMarkdownSegment[] = [];
  let textBuffer: string[] = [];
  let index = 0;

  const flushText = () => {
    const compact = compactTextLines(textBuffer);
    if (compact.length > 0) {
      segments.push({ type: 'text', lines: compact });
    }
    textBuffer = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const next = lines[index + 1] ?? '';

    if (isMarkdownTableRow(line) && isMarkdownTableSeparator(next)) {
      const header = splitTableCells(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && isMarkdownTableRow(lines[index] ?? '')) {
        const cells = splitTableCells(lines[index] ?? '');
        rows.push(normalizeRowWidth(cells, header.length));
        index += 1;
      }

      if (header.length >= 2 && rows.length > 0) {
        flushText();
        segments.push({ type: 'table', header, rows });
        continue;
      }

      textBuffer.push(line, next, ...rows.map(row => `| ${row.join(' | ')} |`));
      continue;
    }

    textBuffer.push(line);
    index += 1;
  }

  flushText();
  return segments;
}

function normalizeLines(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd());
}

function compactTextLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    result.push(line.trimEnd());
  }
  return result;
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && splitTableCells(trimmed).length >= 2;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return [];
  }
  return trimmed
    .slice(1, -1)
    .split('|')
    .map(cell => cell.trim());
}

function normalizeRowWidth(cells: string[], width: number): string[] {
  if (cells.length === width) {
    return cells;
  }
  if (cells.length > width) {
    return cells.slice(0, width);
  }
  return [...cells, ...Array.from({ length: width - cells.length }, () => '')];
}
```

- [ ] **Step 2: Run parser tests and verify they pass**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/markdown-table.test.ts
```

Expected: 3 pass, 0 fail.

- [ ] **Step 3: Commit parser work**

```bash
git add src/gateway/channels/feishu/markdown-table.ts src/gateway/channels/feishu/markdown-table.test.ts
git commit -m "feat: parse Feishu markdown table segments"
```

## Task 3: Add Feishu Card Formatter Tests

**Files:**
- Create: `src/gateway/channels/feishu/card-format.test.ts`
- Create later: `src/gateway/channels/feishu/card-format.ts`

- [ ] **Step 1: Write failing card formatter tests**

Create `src/gateway/channels/feishu/card-format.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { formatFeishuTableCard } from './card-format.js';

describe('formatFeishuTableCard', () => {
  test('returns null when the body has no markdown table', () => {
    expect(formatFeishuTableCard('结论：短期关注业绩修复。')).toBeNull();
  });

  test('formats prose and a markdown table into an interactive card', () => {
    const card = formatFeishuTableCard([
      '## 股价概览',
      '| 指标 | 数据 |',
      '|---|---|',
      '| 最新收盘 | 374.51 元 |',
      '| 静态PE | 24.0 |',
      '近一个月显著回调。',
    ].join('\n'));

    expect(card).toEqual({
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: 'Eugene Krab',
        },
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: '**股价概览**' },
        },
        {
          tag: 'column_set',
          flex_mode: 'none',
          background_style: 'grey',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{ tag: 'div', text: { tag: 'lark_md', content: '**指标**' } }],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{ tag: 'div', text: { tag: 'lark_md', content: '**数据**' } }],
            },
          ],
        },
        {
          tag: 'column_set',
          flex_mode: 'none',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{ tag: 'div', text: { tag: 'plain_text', content: '最新收盘' } }],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{ tag: 'div', text: { tag: 'plain_text', content: '374.51 元' } }],
            },
          ],
        },
        {
          tag: 'column_set',
          flex_mode: 'none',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{ tag: 'div', text: { tag: 'plain_text', content: '静态PE' } }],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{ tag: 'div', text: { tag: 'plain_text', content: '24.0' } }],
            },
          ],
        },
        {
          tag: 'div',
          text: { tag: 'lark_md', content: '近一个月显著回调。' },
        },
      ],
    });
  });

  test('limits wide tables to four columns and appends a notice', () => {
    const card = formatFeishuTableCard([
      '| A | B | C | D | E |',
      '|---|---|---|---|---|',
      '| 1 | 2 | 3 | 4 | 5 |',
    ].join('\n'));

    expect(card?.elements).toContainEqual({
      tag: 'div',
      text: { tag: 'lark_md', content: '表格列数较多，已展示前 4 列。' },
    });
  });
});
```

- [ ] **Step 2: Run card tests and verify they fail**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/card-format.test.ts
```

Expected: FAIL because `./card-format.js` does not exist.

## Task 4: Implement Feishu Card Formatter

**Files:**
- Create: `src/gateway/channels/feishu/card-format.ts`
- Test: `src/gateway/channels/feishu/card-format.test.ts`

- [ ] **Step 1: Implement card formatter**

Create `src/gateway/channels/feishu/card-format.ts`:

```ts
import { parseMarkdownTables, type FeishuMarkdownSegment } from './markdown-table.js';

export type FeishuCardText = {
  tag: 'plain_text' | 'lark_md';
  content: string;
};

export type FeishuCardDiv = {
  tag: 'div';
  text: FeishuCardText;
};

export type FeishuCardColumn = {
  tag: 'column';
  width: 'weighted';
  weight: number;
  elements: FeishuCardDiv[];
};

export type FeishuCardColumnSet = {
  tag: 'column_set';
  flex_mode: 'none';
  background_style?: 'grey';
  columns: FeishuCardColumn[];
};

export type FeishuCardHr = {
  tag: 'hr';
};

export type FeishuCardElement = FeishuCardDiv | FeishuCardColumnSet | FeishuCardHr;

export type FeishuInteractiveCard = {
  config: {
    wide_screen_mode: boolean;
  };
  header: {
    title: {
      tag: 'plain_text';
      content: string;
    };
  };
  elements: FeishuCardElement[];
};

const CARD_TITLE = 'Eugene Krab';
const MAX_COLUMNS = 4;
const MAX_CELL_LENGTH = 60;
const MAX_ELEMENTS = 80;

export function formatFeishuTableCard(body: string): FeishuInteractiveCard | null {
  const segments = parseMarkdownTables(body);
  if (!segments.some(segment => segment.type === 'table')) {
    return null;
  }

  const elements: FeishuCardElement[] = [];
  let omittedRows = false;

  for (const segment of segments) {
    if (elements.length >= MAX_ELEMENTS) {
      omittedRows = true;
      break;
    }

    if (segment.type === 'text') {
      pushTextSegment(elements, segment);
      continue;
    }

    const tableElements = tableToElements(segment.header, segment.rows);
    for (const element of tableElements) {
      if (elements.length >= MAX_ELEMENTS) {
        omittedRows = true;
        break;
      }
      elements.push(element);
    }
  }

  if (omittedRows && elements.length < MAX_ELEMENTS) {
    elements.push(markdownDiv('内容较长，已省略部分表格行。'));
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: {
        tag: 'plain_text',
        content: CARD_TITLE,
      },
    },
    elements: elements.length > 0 ? elements : [markdownDiv('无可展示内容。')],
  };
}

function pushTextSegment(elements: FeishuCardElement[], segment: Extract<FeishuMarkdownSegment, { type: 'text' }>): void {
  for (const rawLine of segment.lines) {
    const line = convertMarkdownLine(rawLine);
    if (line) {
      elements.push(markdownDiv(line));
    }
  }
}

function tableToElements(header: string[], rows: string[][]): FeishuCardElement[] {
  const width = Math.min(header.length, MAX_COLUMNS);
  const truncated = header.length > MAX_COLUMNS;
  const elements: FeishuCardElement[] = [];

  elements.push(rowToColumnSet(header.slice(0, width), true));
  for (const row of rows) {
    elements.push(rowToColumnSet(row.slice(0, width), false));
  }

  if (truncated) {
    elements.push(markdownDiv('表格列数较多，已展示前 4 列。'));
  }

  return elements;
}

function rowToColumnSet(cells: string[], header: boolean): FeishuCardColumnSet {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    ...(header ? { background_style: 'grey' as const } : {}),
    columns: cells.map(cell => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [
        {
          tag: 'div',
          text: header
            ? { tag: 'lark_md', content: `**${escapeLarkMarkdown(truncateCell(cell))}**` }
            : { tag: 'plain_text', content: truncateCell(cell) },
        },
      ],
    })),
  };
}

function markdownDiv(content: string): FeishuCardDiv {
  return {
    tag: 'div',
    text: {
      tag: 'lark_md',
      content,
    },
  };
}

function convertMarkdownLine(line: string): string {
  const trimmed = line.trim();
  const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
  if (heading) {
    return `**${heading[1].trim()}**`;
  }

  const bullet = trimmed.match(/^[-*]\s+(.+)$/);
  if (bullet) {
    return `• ${bullet[1].trim()}`;
  }

  return trimmed;
}

function truncateCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_CELL_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_CELL_LENGTH - 3)}...`;
}

function escapeLarkMarkdown(value: string): string {
  return value.replace(/\*/g, '\\*');
}
```

- [ ] **Step 2: Run card tests and verify they pass**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/card-format.test.ts
```

Expected: 3 pass, 0 fail.

- [ ] **Step 3: Run parser and card tests together**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/markdown-table.test.ts src/gateway/channels/feishu/card-format.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit card formatter**

```bash
git add src/gateway/channels/feishu/card-format.ts src/gateway/channels/feishu/card-format.test.ts
git commit -m "feat: format Feishu table replies as cards"
```

## Task 5: Route Table Answers Through Interactive Cards

**Files:**
- Modify: `src/gateway/channels/feishu/outbound.ts`
- Modify: `src/gateway/channels/feishu/outbound.test.ts`

- [ ] **Step 1: Replace outbound tests with table-aware expectations**

Update `src/gateway/channels/feishu/outbound.test.ts` to include these tests:

```ts
import { describe, expect, test } from 'bun:test';
import { sendMessageFeishu, type FeishuMessageClient } from './outbound.js';

function createMockClient(createCalls: unknown[]): FeishuMessageClient {
  return {
    im: {
      v1: {
        message: {
          create: async (payload: unknown) => {
            createCalls.push(payload);
            return {};
          },
        },
      },
    },
  };
}

describe('sendMessageFeishu', () => {
  test('sends rich text post content when the answer has no table', async () => {
    const createCalls: unknown[] = [];
    const client = createMockClient(createCalls);

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: '**结论**：短期关注业绩修复。',
    }, client);

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

  test('sends interactive card content when the answer has a markdown table', async () => {
    const createCalls: Array<{ data: { msg_type: string; content: string } }> = [];
    const client = createMockClient(createCalls) as FeishuMessageClient;

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: [
        '## 股价概览',
        '| 指标 | 数据 |',
        '|---|---|',
        '| 最新收盘 | 374.51 元 |',
      ].join('\n'),
    }, client);

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].data.msg_type).toBe('interactive');
    const card = JSON.parse(createCalls[0].data.content);
    expect(card.elements).toContainEqual({
      tag: 'column_set',
      flex_mode: 'none',
      background_style: 'grey',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: '**指标**' } }],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: '**数据**' } }],
        },
      ],
    });
  });

  test('falls back to post content if interactive card send fails', async () => {
    const createCalls: Array<{ data: { msg_type: string; content: string } }> = [];
    const client: FeishuMessageClient = {
      im: {
        v1: {
          message: {
            create: async (payload) => {
              createCalls.push(payload);
              if (createCalls.length === 1) {
                throw new Error('interactive card rejected');
              }
              return {};
            },
          },
        },
      },
    };

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: [
        '| 指标 | 数据 |',
        '|---|---|',
        '| 最新收盘 | 374.51 元 |',
      ].join('\n'),
    }, client);

    expect(createCalls).toHaveLength(2);
    expect(createCalls[0].data.msg_type).toBe('interactive');
    expect(createCalls[1].data.msg_type).toBe('post');
  });

  test('does not include credentials in serialized message content', async () => {
    const createCalls: Array<{ data: { content: string } }> = [];
    const client = createMockClient(createCalls) as FeishuMessageClient;

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: 'hello',
    }, client);

    expect(createCalls[0].data.content).not.toContain('cli_test');
    expect(createCalls[0].data.content).not.toContain('secret_test');
  });
});
```

- [ ] **Step 2: Run outbound tests and verify they fail**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/outbound.test.ts
```

Expected: FAIL because `sendMessageFeishu` still always sends `post`.

- [ ] **Step 3: Modify outbound sending**

Update `src/gateway/channels/feishu/outbound.ts`:

```ts
import * as Lark from '@larksuiteoapi/node-sdk';
import { formatFeishuTableCard } from './card-format.js';
import { formatFeishuPostContent } from './post-format.js';

export type SendMessageFeishuParams = {
  appId: string;
  appSecret: string;
  chatId: string;
  body: string;
};

type FeishuMessagePayload =
  | {
      params: { receive_id_type: 'chat_id' };
      data: { receive_id: string; msg_type: 'post'; content: string };
    }
  | {
      params: { receive_id_type: 'chat_id' };
      data: { receive_id: string; msg_type: 'interactive'; content: string };
    };

export type FeishuMessageClient = {
  im: {
    v1: {
      message: {
        create(payload: FeishuMessagePayload): Promise<unknown>;
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
  const tableCard = formatFeishuTableCard(params.body);
  if (tableCard) {
    try {
      await client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: params.chatId,
          msg_type: 'interactive',
          content: JSON.stringify(tableCard),
        },
      });
      return;
    } catch {
      // Fall through to the post path so the user still receives the answer.
    }
  }

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

- [ ] **Step 4: Run outbound tests and verify they pass**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/outbound.test.ts
```

Expected: 4 pass, 0 fail.

- [ ] **Step 5: Run all Feishu channel tests**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/*.test.ts
```

Expected: all Feishu channel tests pass.

- [ ] **Step 6: Commit outbound routing**

```bash
git add src/gateway/channels/feishu/outbound.ts src/gateway/channels/feishu/outbound.test.ts
git commit -m "feat: send Feishu table replies as interactive cards"
```

## Task 6: Tune Feishu Prompt Guidance

**Files:**
- Modify: `src/agent/channels.ts`
- Modify: `src/agent/channels.test.ts`

- [ ] **Step 1: Update channel profile test**

In `src/agent/channels.test.ts`, make the Feishu test assert card-aware guidance:

```ts
import { describe, expect, test } from 'bun:test';
import { getChannelProfile } from './channels.js';

describe('getChannelProfile', () => {
  test('resolves Feishu profile', () => {
    const profile = getChannelProfile('feishu');

    expect(profile.label).toBe('Feishu');
    expect(profile.tables).toContain('Use markdown tables');
    expect(profile.tables).toContain('card rendering');
    expect(profile.responseFormat.join('\n')).toContain('Never simulate tables with slash-separated rows');
    expect(profile.responseFormat.join('\n')).toContain('Use short section labels');
  });
});
```

- [ ] **Step 2: Run channel profile test and verify it fails**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/agent/channels.test.ts
```

Expected: FAIL until `src/agent/channels.ts` mentions card rendering.

- [ ] **Step 3: Update Feishu profile wording**

In `src/agent/channels.ts`, set the Feishu table guidance to:

```ts
  tables: `Use markdown tables for compact comparative data. Feishu card rendering will format pipe markdown tables into readable table cards.

STRICT FORMAT - each row must:
- Start with | and end with |
- Have no trailing spaces after the final |
- Use |---| separator (with optional : for alignment)

Keep Feishu tables compact:
- Prefer 2-4 columns
- Split wide tables into multiple smaller tables
- Use short headers and compact numbers
- Do not use slash-separated pseudo-tables`,
```

- [ ] **Step 4: Run channel profile test and verify it passes**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/agent/channels.test.ts
```

Expected: 1 pass, 0 fail.

- [ ] **Step 5: Commit prompt guidance**

```bash
git add src/agent/channels.ts src/agent/channels.test.ts
git commit -m "chore: guide Feishu answers toward card tables"
```

## Task 7: Full Verification And Manual Feishu QA

**Files:**
- Verify only unless a previous task finds a defect.

- [ ] **Step 1: Run focused Feishu tests**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun test src/gateway/channels/feishu/*.test.ts src/agent/channels.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript typecheck**

Run:

```bash
/Users/zhoushujian/.bun/bin/bun run typecheck
```

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output, exit 0.

- [ ] **Step 4: Recreate the Docker container once if compose mounts changed**

If `docker-compose.yml` already has `./src:/app/src`, run:

```bash
docker compose up -d --force-recreate dexter-gateway
```

Expected: the existing container is recreated with the `src` bind mount. After this one-time recreate, code-only changes can usually use:

```bash
docker compose restart dexter-gateway
```

- [ ] **Step 5: Manual Feishu table rendering smoke test**

Send this one-on-one Feishu message:

```text
请用表格对比宁德时代最近股价和 Q1 2026 业绩，控制在 2 个小表格。
```

Expected visual result:

- The reply arrives as a Feishu card, not raw pipe-table text.
- The card includes the prose section labels.
- The card table rows align visually by columns.
- The card is readable on desktop and mobile.
- No `/` pseudo-table rows appear.

- [ ] **Step 6: Manual fallback smoke test**

Temporarily force the interactive card call to throw in a local test branch or mock-only test. Confirm the fallback sends a `post` payload with the answer content. Do not ship forced failures.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional implementation files are modified, or the working tree is clean after commits.

## Risk Notes

- Feishu interactive-card schema may differ by card version and region. Confirm schema against the current Feishu/Lark official docs before Task 1 and adapt the card type definitions if necessary.
- Card column layout may still be cramped on mobile for 4-column tables. If manual QA is poor, reduce `MAX_COLUMNS` from 4 to 3 and update tests.
- `interactive` card messages may require different bot permissions than `post` messages in some Feishu tenant configurations. If the SDK returns a permission error, keep the post fallback and update deployment setup docs.
- Very long financial answers can exceed card limits. The first implementation should truncate and append notices rather than splitting into multiple messages.
- Do not add general Markdown parsing. This implementation should parse only pipe tables and simple line-level prose because the gateway needs predictable output.

## Self-Review

- Spec coverage: The plan handles table detection, card formatting, outbound routing, prompt guidance, fallback behavior, Docker deployment, and manual Feishu QA.
- Completeness scan: All tasks include concrete files, code, commands, and expected outcomes.
- Type consistency: `formatFeishuTableCard`, `FeishuInteractiveCard`, `parseMarkdownTables`, and `FeishuMessageClient` names are used consistently across tasks.
- Scope control: The plan does not alter inbound Feishu parsing, WhatsApp formatting, gateway routing, model selection, or finance tools.
