import { describe, expect, test } from 'bun:test';
import type { RankedTrendApplicability } from '../src/tools/finance/technical-analysis/applicability.js';
import {
  aggregateRiskEvents,
  formatExpandedRiskStudyReport,
  riskContext,
  type ExpandedRiskEvent,
} from './technical-analysis-v1-risk-event-study.js';

function event(t20: number, benchmarkT20 = 0, drawdown = t20): ExpandedRiskEvent {
  return {
    tsCode: '000001.SZ',
    name: '测试',
    date: '20240101',
    signal: 'STRATEGY_MA20_BREAK_EXIT',
    context: 'weak',
    applicability: null,
    outcome: { t5: t20 / 4, t10: t20 / 2, t20, maximumClosingGain20: 0, maximumClosingDrawdown20: drawdown },
    benchmarkOutcome: { t5: 0, t10: 0, t20: benchmarkT20, maximumClosingGain20: 0, maximumClosingDrawdown20: 0 },
  };
}

describe('aggregateRiskEvents', () => {
  test('reports absolute, benchmark-relative, and drawdown incidence separately', () => {
    const aggregate = aggregateRiskEvents([event(-0.10, -0.02), event(0.04, 0.01, -0.06)]);
    expect(aggregate.eventCount).toBe(2);
    expect(aggregate.t20Mean).toBeCloseTo(-0.03);
    expect(aggregate.t20Median).toBeCloseTo(-0.03);
    expect(aggregate.t20NegativeRate).toBe(0.5);
    expect(aggregate.t20ExcessMean).toBeCloseTo(-0.025);
    expect(aggregate.t20UnderperformRate).toBe(0.5);
    expect(aggregate.drawdown5Rate).toBe(1);
  });
});

describe('riskContext', () => {
  test('maps applicability decisions to neutral background labels', () => {
    const ranked = (decision: RankedTrendApplicability['decision']) => ({ decision }) as RankedTrendApplicability;
    expect(riskContext(ranked('execute'))).toBe('strong');
    expect(riskContext(ranked('watch'))).toBe('mixed');
    expect(riskContext(ranked('reject'))).toBe('weak');
    expect(riskContext(ranked('insufficient_data'))).toBe('unavailable');
  });
});

describe('formatExpandedRiskStudyReport', () => {
  test('states the baseline dependence and neutral product boundary', () => {
    const empty = aggregateRiskEvents([]);
    const report = formatExpandedRiskStudyReport({
      events: [],
      overall: empty,
      bySignal: [],
      byContext: [],
      byYear: [],
      byAsset: [],
      baseline: {
        observationCount: 0,
        t20Mean: null,
        t20Median: null,
        t20NegativeRate: null,
        t20ExcessMean: null,
        t20UnderperformRate: null,
        drawdown20Mean: null,
        drawdown5Rate: null,
      },
      matchedBaseline: {
        observationCount: 0,
        t20Mean: null,
        t20Median: null,
        t20NegativeRate: null,
        t20ExcessMean: null,
        t20UnderperformRate: null,
        drawdown20Mean: null,
        drawdown5Rate: null,
      },
      cohortSize: 22,
    });
    expect(report).toContain('不能视为独立样本');
    expect(report).toContain('不构成买卖建议');
    expect(report).not.toContain('应该卖出');
  });
});
