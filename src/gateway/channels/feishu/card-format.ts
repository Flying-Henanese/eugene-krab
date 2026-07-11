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
    update_multi: boolean;
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
const MAX_CARD_BYTES = 28 * 1024;
const PAGE_NUMBER_RESERVE_BYTES = 128;

export function formatFeishuTableCard(body: string): FeishuInteractiveCard | null {
  return formatFeishuTableCards(body)?.[0] ?? null;
}

export function formatFeishuTableCards(body: string): FeishuInteractiveCard[] | null {
  const segments = parseMarkdownTables(body);
  if (!segments.some(segment => segment.type === 'table')) {
    return null;
  }

  const elements: FeishuCardElement[] = [];
  let renderedTable = false;

  for (const segment of segments) {
    if (segment.type === 'text') {
      pushTextSegment(elements, segment);
      continue;
    }

    if (renderedTable) {
      elements.push({ tag: 'hr' });
    }

    const tableElements = tableToElements(segment.header, segment.rows);
    elements.push(...tableElements);
    renderedTable = true;
  }

  return paginateElements(elements.length > 0 ? elements : [markdownDiv('无可展示内容。')]);
}

export function formatFeishuAnswerCard(body: string): FeishuInteractiveCard {
  return formatFeishuAnswerCards(body)[0];
}

export function formatFeishuAnswerCards(body: string): FeishuInteractiveCard[] {
  const tableCards = formatFeishuTableCards(body);
  if (tableCards) return tableCards;

  const content = body
    .split('\n')
    .map(convertMarkdownLine)
    .join('\n')
    .trim() || '无可展示内容。';
  return paginateElements([markdownDiv(content)]);
}

export function formatFeishuTextCard(text: string): FeishuInteractiveCard {
  return paginateElements([markdownDiv(text.trim() || '无可展示内容。')])[0];
}

function paginateElements(sourceElements: FeishuCardElement[]): FeishuInteractiveCard[] {
  const safeElements = sourceElements.flatMap(splitOversizedElement);
  const pages: FeishuCardElement[][] = [];
  let current: FeishuCardElement[] = [];

  for (const element of safeElements) {
    const candidate = [...current, element];
    if (
      current.length > 0 &&
      (candidate.length > MAX_ELEMENTS || serializedBytes(buildCard(candidate)) > MAX_CARD_BYTES - PAGE_NUMBER_RESERVE_BYTES)
    ) {
      pages.push(current);
      current = [element];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) pages.push(current);

  const total = Math.max(1, pages.length);
  return (pages.length > 0 ? pages : [[markdownDiv('无可展示内容。')]])
    .map((elements, index) => buildCard(elements, total > 1 ? `${CARD_TITLE} · ${index + 1}/${total}` : CARD_TITLE));
}

function buildCard(elements: FeishuCardElement[], title = CARD_TITLE): FeishuInteractiveCard {
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: {
        tag: 'plain_text',
        content: title,
      },
    },
    elements,
  };
}

function serializedBytes(card: FeishuInteractiveCard): number {
  return new TextEncoder().encode(JSON.stringify(card)).byteLength;
}

function splitOversizedElement(element: FeishuCardElement): FeishuCardElement[] {
  if (element.tag !== 'div' || serializedBytes(buildCard([element])) <= MAX_CARD_BYTES - PAGE_NUMBER_RESERVE_BYTES) {
    return [element];
  }

  const parts: FeishuCardElement[] = [];
  let remaining = element.text.content;
  while (remaining.length > 0) {
    const prefixLength = fittingPrefixLength(remaining, element.text.tag);
    const splitAt = preferredBreak(remaining, prefixLength);
    parts.push({ tag: 'div', text: { ...element.text, content: remaining.slice(0, splitAt) } });
    remaining = remaining.slice(splitAt);
  }
  return parts;
}

function fittingPrefixLength(content: string, tag: FeishuCardText['tag']): number {
  let low = 0;
  let high = content.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    const candidate = buildCard([{ tag: 'div', text: { tag, content: content.slice(0, midpoint) } }]);
    if (serializedBytes(candidate) <= MAX_CARD_BYTES - PAGE_NUMBER_RESERVE_BYTES) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }
  return Math.max(1, low);
}

function preferredBreak(content: string, limit: number): number {
  if (limit >= content.length) return content.length;
  const minimum = Math.floor(limit * 0.6);
  const prefix = content.slice(0, limit);
  for (const separator of ['\n', '。', '；', '！', '？', '. ', '; ', ' ']) {
    const index = prefix.lastIndexOf(separator);
    if (index >= minimum) return index + separator.length;
  }
  return limit;
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
