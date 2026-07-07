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
