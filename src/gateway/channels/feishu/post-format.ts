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

const EMPTY_RESPONSE_TEXT = 'Dexter returned an empty response.';

export function formatFeishuPostContent(body: string): FeishuPostContent {
  const lines = normalizeLines(body);
  const content: FeishuPostTag[][] = [];
  let inCodeFence = false;

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (!trimmed) {
      continue;
    }

    if (!inCodeFence && isMarkdownHorizontalRule(trimmed)) {
      continue;
    }

    const line = stripInlineCode(rawLine).trim();

    if (!line) {
      continue;
    }

    const heading = !inCodeFence ? line.match(/^#{1,6}\s+(.+)$/) : null;
    if (heading) {
      content.push([{ tag: 'text', text: heading[1].trim(), style: ['bold'] }]);
      continue;
    }

    const bullet = !inCodeFence ? line.match(/^[-*]\s+(.+)$/) : null;
    const displayLine = bullet ? `• ${bullet[1].trim()}` : line;
    content.push(parseInlineTags(displayLine));
  }

  return {
    zh_cn: {
      content: content.length > 0 ? content : [[{ tag: 'text', text: EMPTY_RESPONSE_TEXT }]],
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

function isMarkdownHorizontalRule(line: string): boolean {
  return /^[-*_]{3,}$/.test(line.replace(/\s+/g, ''));
}

function parseInlineTags(line: string): FeishuPostTag[] {
  const tags: FeishuPostTag[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)]+)/g;
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
    } else if (match[6]) {
      tags.push({ tag: 'a', text: match[6], href: match[6] });
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
