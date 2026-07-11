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
const OMITTED_CONTENT_NOTICE = '内容较长，已省略部分内容。';

export function formatFeishuTableCard(body: string): FeishuInteractiveCard | null {
  const segments = parseMarkdownTables(body);
  if (!segments.some(segment => segment.type === 'table')) {
    return null;
  }

  const elements: FeishuCardElement[] = [];
  let omittedRows = false;
  let renderedTable = false;

  for (const segment of segments) {
    if (elements.length >= MAX_ELEMENTS) {
      omittedRows = true;
      break;
    }

    if (segment.type === 'text') {
      pushTextSegment(elements, segment);
      continue;
    }

    if (renderedTable && elements.length < MAX_ELEMENTS) {
      elements.push({ tag: 'hr' });
    }

    const tableElements = tableToElements(segment.header, segment.rows);
    for (const element of tableElements) {
      if (elements.length >= MAX_ELEMENTS) {
        omittedRows = true;
        break;
      }
      elements.push(element);
    }
    renderedTable = true;
  }

  return finalizeCard(elements.length > 0 ? elements : [markdownDiv('无可展示内容。')], omittedRows);
}

export function formatFeishuAnswerCard(body: string): FeishuInteractiveCard {
  const tableCard = formatFeishuTableCard(body);
  if (tableCard) {
    return tableCard;
  }

  const content = body
    .split('\n')
    .map(convertMarkdownLine)
    .join('\n')
    .trim() || '无可展示内容。';
  return finalizeCard([markdownDiv(content)]);
}

export function formatFeishuTextCard(text: string): FeishuInteractiveCard {
  return finalizeCard([markdownDiv(text.trim() || '无可展示内容。')]);
}

function finalizeCard(
  sourceElements: FeishuCardElement[],
  contentWasOmitted = false,
): FeishuInteractiveCard {
  const elements = [...sourceElements];
  let omitted = contentWasOmitted;
  let card = buildCard(elements);

  while (serializedBytes(card) > MAX_CARD_BYTES && elements.length > 1) {
    elements.pop();
    omitted = true;
    card = buildCard(elements);
  }

  if (serializedBytes(card) > MAX_CARD_BYTES) {
    const onlyElement = elements[0];
    if (onlyElement?.tag === 'div') {
      onlyElement.text.content = truncateToCardSize(onlyElement.text.content);
      omitted = true;
      card = buildCard(elements);
    }
  }

  if (omitted) {
    const notice = markdownDiv(OMITTED_CONTENT_NOTICE);
    while (
      elements.length > 0 &&
      serializedBytes(buildCard([...elements, notice])) > MAX_CARD_BYTES
    ) {
      elements.pop();
    }
    elements.push(notice);
  }

  return buildCard(elements.length > 0 ? elements : [markdownDiv(OMITTED_CONTENT_NOTICE)]);
}

function buildCard(elements: FeishuCardElement[]): FeishuInteractiveCard {
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: {
        tag: 'plain_text',
        content: CARD_TITLE,
      },
    },
    elements,
  };
}

function serializedBytes(card: FeishuInteractiveCard): number {
  return new TextEncoder().encode(JSON.stringify(card)).byteLength;
}

function truncateToCardSize(content: string): string {
  let low = 0;
  let high = content.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    const candidate = buildCard([
      markdownDiv(content.slice(0, midpoint)),
      markdownDiv(OMITTED_CONTENT_NOTICE),
    ]);
    if (serializedBytes(candidate) <= MAX_CARD_BYTES) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }
  return content.slice(0, low);
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
