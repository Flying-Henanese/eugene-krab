import { describe, expect, test } from 'bun:test';
import { formatFeishuAnswerCard, formatFeishuTableCard } from './card-format.js';

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
      config: { wide_screen_mode: true, update_multi: true },
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

  test('formats a regular markdown answer as an updateable card', () => {
    const card = formatFeishuAnswerCard([
      '## 结论',
      '- **利润**继续修复',
      '[查看来源](https://example.com)',
    ].join('\n'));

    expect(card.config).toEqual({ wide_screen_mode: true, update_multi: true });
    expect(card.elements).toEqual([
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '**结论**\n• **利润**继续修复\n[查看来源](https://example.com)',
        },
      },
    ]);
  });

  test('keeps serialized cards below the safe size limit', () => {
    const card = formatFeishuAnswerCard('很长的回答'.repeat(20_000));
    expect(new TextEncoder().encode(JSON.stringify(card)).byteLength).toBeLessThanOrEqual(28 * 1024);
    expect(card.elements.at(-1)).toEqual({
      tag: 'div',
      text: { tag: 'lark_md', content: '内容较长，已省略部分内容。' },
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
