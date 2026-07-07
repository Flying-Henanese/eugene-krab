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
      const rowLines: string[] = [];
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && isMarkdownTableRow(lines[index] ?? '')) {
        const rowLine = lines[index] ?? '';
        const cells = splitTableCells(rowLine);
        rowLines.push(rowLine);
        rows.push(normalizeRowWidth(cells, header.length));
        index += 1;
      }

      if (header.length >= 2 && rows.length > 0) {
        flushText();
        segments.push({ type: 'table', header, rows });
        continue;
      }

      textBuffer.push(line, next, ...rowLines);
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
