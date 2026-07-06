import { describe, expect, test } from 'bun:test';
import {
  calculateBreadthScore,
  calculateLimitScore,
  calculateMarketScore,
  calculateMoneyFlowScore,
  calculateSectorScore,
  combineSentimentScores,
  labelFromScore,
} from './market-sentiment-score.js';

describe('market sentiment scoring', () => {
  test('labels scores by threshold', () => {
    expect(labelFromScore(30)).toBe('optimistic');
    expect(labelFromScore(0)).toBe('neutral');
    expect(labelFromScore(-30)).toBe('pessimistic');
  });

  test('calculates market score from average index moves', () => {
    const component = calculateMarketScore([
      { ts_code: '000001.SH', pct_chg: 1.5 },
      { ts_code: '000300.SH', pct_chg: 0.5 },
      { ts_code: '399006.SZ', pct_chg: -0.5 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBeCloseTo(10, 5);
  });

  test('calculates breadth score from up and down counts', () => {
    const component = calculateBreadthScore([
      { ts_code: '000001.SZ', pct_chg: 1 },
      { ts_code: '000002.SZ', pct_chg: 2 },
      { ts_code: '000003.SZ', pct_chg: -1 },
      { ts_code: '000004.SZ', pct_chg: 0 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBe(25);
  });

  test('calculates limit score from explicit limit rows', () => {
    const component = calculateLimitScore([
      { ts_code: '000001.SZ', limit: 'U' },
      { ts_code: '000002.SZ', limit: 'U' },
      { ts_code: '000003.SZ', limit: 'D' },
    ], []);

    expect(component.available).toBe(true);
    expect(component.score).toBeCloseTo(33.333333, 5);
  });

  test('falls back to daily pct_chg for limit proxy', () => {
    const component = calculateLimitScore([], [
      { ts_code: '000001.SZ', pct_chg: 10.01 },
      { ts_code: '000002.SZ', pct_chg: -10.02 },
      { ts_code: '000003.SZ', pct_chg: 9.9 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBeCloseTo(33.333333, 5);
    expect(component.rationale).toContain('proxy');
  });

  test('calculates sector score from sector moves', () => {
    const component = calculateSectorScore([
      { ts_code: '885001.TI', pct_chg: 3 },
      { ts_code: '885002.TI', pct_change: 1 },
      { ts_code: '885003.TI', pct_chg: -2 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBeGreaterThan(0);
  });

  test('calculates money flow score from positive and negative net flows', () => {
    const component = calculateMoneyFlowScore([
      { ts_code: '000001.SZ', net_mf_amount: 100 },
      { ts_code: '000002.SZ', net_mf_amount: -20 },
      { ts_code: '000003.SZ', net_mf_amount: 30 },
    ]);

    expect(component.available).toBe(true);
    expect(component.score).toBeCloseTo(73.333333, 5);
  });

  test('redistributes unavailable component weights', () => {
    const result = combineSentimentScores([
      { name: 'market', score: 50, weight: 0.25, available: true, rationale: 'market' },
      { name: 'breadth', score: 50, weight: 0.25, available: true, rationale: 'breadth' },
      { name: 'money_flow', score: 0, weight: 0.50, available: false, rationale: 'missing' },
    ]);

    expect(result.overallScore).toBe(50);
    expect(result.label).toBe('optimistic');
  });
});
