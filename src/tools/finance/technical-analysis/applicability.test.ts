import { describe, expect, test } from 'bun:test';
import { calculateIndicators } from './indicators.js';
import {
  extractTrendApplicabilityCandidate,
  rankTrendApplicabilityCandidates,
  type TrendApplicabilityCandidate,
  type TrendApplicabilityFeatures,
} from './applicability.js';
import type { Candle } from './types.js';

function candles(symbol: string, closes: number[], volumeOffset = 0): Candle[] {
  return closes.map((close, index) => ({
    symbol,
    date: `2025${String(index + 1).padStart(4, '0')}`,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 100 + volumeOffset + index,
    amount: null,
    adjustment: 'none',
  }));
}

function features(quality: number): TrendApplicabilityFeatures {
  return {
    ma20Slope10: quality,
    ma60Slope20: quality,
    ma20Crosses60: 10 - quality,
    closesAboveMa20Ratio20: quality,
    logTrendR2_60: quality,
    maxDrawdown20: quality - 10,
    relativeStrength20: quality,
    relativeStrength60: quality,
    currentVolumeRatio20: quality,
    volumeTrendRatio5To20: quality,
    bollBandwidthRatio20: quality,
  };
}

function candidate(
  symbol: string,
  date: string,
  quality: number,
  marketEligible: boolean | null = true,
): TrendApplicabilityCandidate {
  return {
    symbol,
    date,
    features: features(quality),
    marketRegime: {
      benchmarkCloseAboveMa60: marketEligible,
      benchmarkMa20Slope10: marketEligible === null ? null : marketEligible ? 0.01 : -0.01,
      eligible: marketEligible,
    },
  };
}

describe('Trend applicability V2 research primitives', () => {
  test('extracts point-in-time trend, relative-strength, volume, and volatility features', () => {
    const stock = candles('STOCK', Array.from({ length: 100 }, (_, index) => 10 + index * 0.2));
    const benchmark = candles('000300.SH', Array.from({ length: 100 }, (_, index) => 10 + index * 0.05));
    const result = extractTrendApplicabilityCandidate(stock, calculateIndicators(stock), benchmark);

    expect(result.symbol).toBe('STOCK');
    expect(result.date).toBe('20250100');
    expect(result.features.ma20Slope10).toBeGreaterThan(0);
    expect(result.features.ma60Slope20).toBeGreaterThan(0);
    expect(result.features.logTrendR2_60).toBeGreaterThan(0.99);
    expect(result.features.relativeStrength20).toBeGreaterThan(0);
    expect(result.features.relativeStrength60).toBeGreaterThan(0);
    expect(result.features.currentVolumeRatio20).toBeGreaterThan(1);
    expect(result.features.bollBandwidthRatio20).not.toBeNull();
    expect(result.marketRegime.eligible).toBe(true);
  });

  test('does not fabricate relative strength when benchmark dates are unavailable', () => {
    const stock = candles('STOCK', Array.from({ length: 100 }, (_, index) => 10 + index * 0.1));
    const result = extractTrendApplicabilityCandidate(stock, calculateIndicators(stock), []);

    expect(result.features.relativeStrength20).toBeNull();
    expect(result.features.relativeStrength60).toBeNull();
    expect(result.marketRegime.eligible).toBeNull();
  });

  test('executes only candidates with volume and relative-strength consensus', () => {
    const cohort = Array.from({ length: 10 }, (_, index) => candidate(`S${index}`, '20250101', index + 1));
    const ranked = rankTrendApplicabilityCandidates(cohort);
    const best = ranked.find((item) => item.symbol === 'S9');
    const second = ranked.find((item) => item.symbol === 'S8');
    const third = ranked.find((item) => item.symbol === 'S7');
    const fourth = ranked.find((item) => item.symbol === 'S6');

    expect(best).toMatchObject({ decision: 'execute', scorePercentile: 1, featureCoverage: 1 });
    expect(second?.decision).toBe('execute');
    expect(third?.decision).toBe('execute');
    expect(fourth?.decision).toBe('reject');
    expect(ranked.filter((item) => item.decision === 'execute')).toHaveLength(3);
  });

  test('downgrades component consensus to watch when the benchmark regime is unfavorable', () => {
    const cohort = Array.from({ length: 10 }, (_, index) =>
      candidate(`S${index}`, '20250101', index + 1, false));

    expect(rankTrendApplicabilityCandidates(cohort).find((item) => item.symbol === 'S9')?.decision)
      .toBe('watch');
  });

  test('refuses a decision when the benchmark regime is unavailable', () => {
    const cohort = Array.from({ length: 10 }, (_, index) =>
      candidate(`S${index}`, '20250101', index + 1, null));

    expect(rankTrendApplicabilityCandidates(cohort)
      .every((item) => item.decision === 'insufficient_data')).toBe(true);
  });

  test('keeps trend diagnostics out of the V2.1 decision score', () => {
    const cohort = Array.from({ length: 10 }, (_, index) => candidate(`S${index}`, '20250101', index + 1));
    const strongestCore = cohort[9].features;
    strongestCore.ma20Slope10 = -100;
    strongestCore.ma60Slope20 = -100;
    strongestCore.logTrendR2_60 = -100;
    const weakestCore = cohort[0].features;
    weakestCore.ma20Slope10 = 100;
    weakestCore.ma60Slope20 = 100;
    weakestCore.logTrendR2_60 = 100;

    const ranked = rankTrendApplicabilityCandidates(cohort);
    expect(ranked.find((item) => item.symbol === 'S9')?.decision).toBe('execute');
    expect(ranked.find((item) => item.symbol === 'S0')?.decision).toBe('reject');
  });

  test('never combines candidates from different dates to satisfy cohort size', () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, index) => candidate(`A${index}`, '20250101', index + 1)),
      ...Array.from({ length: 5 }, (_, index) => candidate(`B${index}`, '20250102', index + 1)),
    ];

    expect(rankTrendApplicabilityCandidates(candidates)
      .every((item) => item.decision === 'insufficient_cohort')).toBe(true);
  });

  test('rejects a full score when missing benchmark coverage is material', () => {
    const incomplete = Array.from({ length: 10 }, (_, index) => {
      const value = features(index + 1);
      value.relativeStrength20 = null;
      value.relativeStrength60 = null;
      return {
        symbol: `S${index}`,
        date: '20250101',
        features: value,
        marketRegime: {
          benchmarkCloseAboveMa60: true,
          benchmarkMa20Slope10: 0.01,
          eligible: true,
        },
      };
    });

    const ranked = rankTrendApplicabilityCandidates(incomplete);
    expect(ranked.every((item) => item.featureCoverage === 0.5)).toBe(true);
    expect(ranked.every((item) => item.decision === 'insufficient_data')).toBe(true);
  });
});
