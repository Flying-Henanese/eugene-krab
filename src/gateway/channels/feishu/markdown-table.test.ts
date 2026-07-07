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
