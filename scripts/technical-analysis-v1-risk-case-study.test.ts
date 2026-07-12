import { describe, expect, test } from 'bun:test';
import type { Candle, PositionEvent } from '../src/tools/finance/technical-analysis/types.js';
import {
  RISK_CASE_CODES,
  RISK_STUDY_COHORT,
  calculateRiskForwardOutcome,
  firstRiskEventInWindow,
  formatRiskCaseStudyReport,
} from './technical-analysis-v1-risk-case-study.js';

function candle(date: string, close: number): Candle {
  return { symbol: 'TEST', date, open: close, high: close, low: close, close, volume: 1, amount: 1 };
}

describe('V1 risk historical case manifest', () => {
  test('uses a valid V2.1 cohort and six frozen cross-industry cases', () => {
    expect(RISK_STUDY_COHORT).toHaveLength(22);
    expect(RISK_CASE_CODES).toHaveLength(6);
    expect(new Set(RISK_CASE_CODES).size).toBe(6);
    expect(RISK_CASE_CODES.every((code) => RISK_STUDY_COHORT.some((asset) => asset.tsCode === code))).toBeTrue();
  });
});

describe('firstRiskEventInWindow', () => {
  test('selects the first 2024 close event without consulting outcomes', () => {
    const events: PositionEvent[] = [
      { date: '20231229', action: 'close', signal: 'STRATEGY_MA20_BREAK_EXIT', evidence: {} },
      { date: '20240105', action: 'open', signal: 'STRATEGY_TREND_RECOVERY_ENTRY', evidence: {} },
      { date: '20240201', action: 'close', signal: 'STRATEGY_STOP_LOSS', evidence: {} },
      { date: '20240501', action: 'close', signal: 'STRATEGY_TRAILING_EXIT', evidence: {} },
    ];
    expect(firstRiskEventInWindow(events)?.date).toBe('20240201');
  });
});

describe('calculateRiskForwardOutcome', () => {
  test('uses fixed future exchange sessions and keeps missing candles unavailable', () => {
    const dates = Array.from({ length: 21 }, (_, index) => `202401${String(index + 1).padStart(2, '0')}`);
    const candles = dates.map((date, index) => candle(date, 100 - index));
    candles.splice(10, 1);
    const outcome = calculateRiskForwardOutcome(candles, dates[0], dates.slice(1));
    expect(outcome.t5).toBeCloseTo(-0.05);
    expect(outcome.t10).toBeNull();
    expect(outcome.t20).toBeCloseTo(-0.20);
    expect(outcome.maximumClosingDrawdown20).toBeCloseTo(-0.20);
  });
});

describe('formatRiskCaseStudyReport', () => {
  test('keeps the report neutral and explicit about V2.1 boundaries', () => {
    const report = formatRiskCaseStudyReport({ cases: [], missingCases: [], cohortSize: 22 });
    expect(report).toContain('不能覆盖V1风险事件');
    expect(report).toContain('不构成交易建议');
    expect(report).not.toContain('应该卖出');
  });
});
