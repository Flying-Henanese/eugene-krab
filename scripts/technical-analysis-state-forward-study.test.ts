import { describe, expect, test } from 'bun:test';
import type { RiskAssetSeries } from './technical-analysis-v1-risk-case-study.js';
import {
  formatStateForwardStudyReport,
  monthEndSessions,
  technicalStateAt,
} from './technical-analysis-state-forward-study.js';

describe('monthEndSessions', () => {
  test('selects the final exchange session of each month inside the frozen window', () => {
    expect(monthEndSessions(['20221230', '20230103', '20230131', '20230201', '20230228', '20250102']))
      .toEqual(['20230131', '20230228']);
    expect(monthEndSessions(['20241231', '20250102', '20250127'], '20250101', '20251231'))
      .toEqual(['20250127']);
  });
});

describe('technicalStateAt', () => {
  test('uses the same neutral public trend-alignment rules as the assessment', () => {
    const series = {
      asset: { tsCode: 'TEST', name: '测试', industry: '测试' },
      candles: [{ symbol: 'TEST', date: '20240131', open: 12, high: 12, low: 12, close: 12, volume: 1, amount: 1 }],
      indicators: {
        ma5: [11], ma10: [10.5], ma20: [10], ma30: [9.5], ma60: [9],
        boll: [{ middle: 10, upper: 11, lower: 9, stddev: 0.5 }],
        kdj: [{ rsv: 50, k: 50, d: 50, j: 50 }],
      },
      events: [],
    } satisfies RiskAssetSeries;
    expect(technicalStateAt(series, '20240131')).toBe('upward_alignment');
  });
});

describe('formatStateForwardStudyReport', () => {
  test('defines matching without presenting a transaction strategy', () => {
    const report = formatStateForwardStudyReport({
      snapshots: [],
      stateAggregates: [],
      stateAggregatesByYear: [],
      structureEvents: [],
      structureAggregates: [],
      cohortSize: 22,
      scheduledMonthEnds: 24,
      studyStartDate: '20230101',
      studyEndDate: '20241231',
    });
    expect(report).toContain('方向匹配定义');
    expect(report).toContain('不形成买卖规则');
    expect(report).not.toContain('建议买入');
  });
});
