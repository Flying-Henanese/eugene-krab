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

  test('converts plain urls into clickable links', () => {
    const result = formatFeishuPostContent('来源：https://example.com/report?id=1');

    expect(result.zh_cn.content).toEqual([
      [
        { tag: 'text', text: '来源：' },
        { tag: 'a', text: 'https://example.com/report?id=1', href: 'https://example.com/report?id=1' },
      ],
    ]);
  });

  test('preserves markdown tables so Feishu can render them directly', () => {
    const result = formatFeishuPostContent([
      '| 指标 | 数值 |',
      '|---|---|',
      '| PE | 22.5 |',
      '| PB | 2.1 |',
    ].join('\n'));

    expect(result.zh_cn.content).toEqual([
      [{ tag: 'text', text: '| 指标 | 数值 |' }],
      [{ tag: 'text', text: '|---|---|' }],
      [{ tag: 'text', text: '| PE | 22.5 |' }],
      [{ tag: 'text', text: '| PB | 2.1 |' }],
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

  test('drops markdown horizontal rule separators', () => {
    const result = formatFeishuPostContent([
      '**当前股价**：~13.16元',
      '---',
      '## 核心财务数据',
    ].join('\n'));

    expect(result.zh_cn.content).toEqual([
      [
        { tag: 'text', text: '当前股价', style: ['bold'] },
        { tag: 'text', text: '：~13.16元' },
      ],
      [{ tag: 'text', text: '核心财务数据', style: ['bold'] }],
    ]);
  });

  test('returns a readable fallback line for empty input', () => {
    const result = formatFeishuPostContent('   \n\n');

    expect(result.zh_cn.content).toEqual([
      [{ tag: 'text', text: 'Dexter returned an empty response.' }],
    ]);
  });
});
