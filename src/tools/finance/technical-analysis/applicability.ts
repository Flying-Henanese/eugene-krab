import { mean, percentageReturn } from './math.js';
import type { Candle, IndicatorSeries } from './types.js';

export interface TrendApplicabilityFeatures {
  ma20Slope10: number | null;
  ma60Slope20: number | null;
  ma20Crosses60: number | null;
  closesAboveMa20Ratio20: number | null;
  logTrendR2_60: number | null;
  maxDrawdown20: number | null;
  relativeStrength20: number | null;
  relativeStrength60: number | null;
  currentVolumeRatio20: number | null;
  volumeTrendRatio5To20: number | null;
  bollBandwidthRatio20: number | null;
}

export interface TrendApplicabilityCandidate {
  symbol: string;
  date: string;
  features: TrendApplicabilityFeatures;
  marketRegime: {
    benchmarkCloseAboveMa60: boolean | null;
    benchmarkMa20Slope10: number | null;
    eligible: boolean | null;
  };
}

export interface TrendApplicabilityComponents {
  trendStrength: number | null;
  trendStability: number | null;
  relativeStrength: number | null;
  volumeConfirmation: number | null;
  volatilityExpansion: number | null;
}

export interface RankedTrendApplicability extends TrendApplicabilityCandidate {
  score: number | null;
  scorePercentile: number | null;
  featureCoverage: number;
  components: TrendApplicabilityComponents;
  decision: 'execute' | 'watch' | 'reject' | 'insufficient_data' | 'insufficient_cohort';
}

export interface TrendApplicabilityRankingOptions {
  minimumCohortSize?: number;
  consensusPercentile?: number;
  watchPercentile?: number;
  minimumFeatureCoverage?: number;
  requireMarketRegime?: boolean;
}

export const TREND_APPLICABILITY_V2_1 = {
  name: 'trend_applicability_v2_1',
  componentWeights: {
    relativeStrength: 0.50,
    volumeConfirmation: 0.50,
  },
  consensusPercentile: 0.70,
  watchPercentile: 0.70,
  minimumCohortSize: 10,
  minimumFeatureCoverage: 1,
  marketRegime: 'benchmark_close_above_ma60_and_ma20_slope10_positive',
} as const;

const COMPONENT_WEIGHTS = TREND_APPLICABILITY_V2_1.componentWeights;

type FeatureName = keyof TrendApplicabilityFeatures;
type ComponentName = keyof TrendApplicabilityComponents;
type ScoredComponentName = keyof typeof COMPONENT_WEIGHTS;

const COMPONENT_FEATURES: Record<ComponentName, FeatureName[]> = {
  trendStrength: ['ma20Slope10', 'ma60Slope20'],
  trendStability: ['ma20Crosses60', 'closesAboveMa20Ratio20', 'logTrendR2_60', 'maxDrawdown20'],
  relativeStrength: ['relativeStrength20', 'relativeStrength60'],
  volumeConfirmation: ['currentVolumeRatio20', 'volumeTrendRatio5To20'],
  volatilityExpansion: ['bollBandwidthRatio20'],
};

const LOWER_IS_BETTER = new Set<FeatureName>(['ma20Crosses60']);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator === 0
    ? null
    : numerator / denominator;
}

function trailingReturn(values: number[], index: number, period: number): number | null {
  if (index < period) return null;
  return percentageReturn(values[index], values[index - period]);
}

function seriesSlope(series: Array<number | null>, index: number, period: number): number | null {
  if (index < period) return null;
  const current = series[index];
  const previous = series[index - period];
  return current === null || previous === null ? null : percentageReturn(current, previous);
}

function crossingCount(candles: Candle[], ma: Array<number | null>, index: number, period: number): number | null {
  if (index + 1 < period) return null;
  let count = 0;
  let comparisons = 0;
  for (let offset = index + 2 - period; offset <= index; offset++) {
    const previousMa = ma[offset - 1];
    const currentMa = ma[offset];
    if (previousMa === null || currentMa === null) continue;
    const previousDistance = candles[offset - 1].close - previousMa;
    const currentDistance = candles[offset].close - currentMa;
    comparisons++;
    if ((previousDistance <= 0 && currentDistance > 0)
      || (previousDistance >= 0 && currentDistance < 0)) count++;
  }
  return comparisons === 0 ? null : count;
}

function closesAboveRatio(candles: Candle[], ma: Array<number | null>, index: number, period: number): number | null {
  if (index + 1 < period) return null;
  let above = 0;
  let available = 0;
  for (let offset = index + 1 - period; offset <= index; offset++) {
    const reference = ma[offset];
    if (reference === null) continue;
    available++;
    if (candles[offset].close > reference) above++;
  }
  return available === period ? above / available : null;
}

function regressionR2(values: number[]): number | null {
  if (values.length < 2 || values.some((value) => value <= 0)) return null;
  const logs = values.map(Math.log);
  const xMean = (values.length - 1) / 2;
  const yMean = mean(logs);
  if (yMean === null) return null;
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let index = 0; index < logs.length; index++) {
    const xDelta = index - xMean;
    const yDelta = logs[index] - yMean;
    covariance += xDelta * yDelta;
    xVariance += xDelta ** 2;
    yVariance += yDelta ** 2;
  }
  if (xVariance === 0 || yVariance === 0) return 0;
  const correlationSquared = (covariance ** 2) / (xVariance * yVariance);
  return covariance <= 0 ? 0 : Math.min(1, correlationSquared);
}

function maxDrawdown(values: number[]): number | null {
  if (values.length === 0) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak !== 0) worst = Math.min(worst, value / peak - 1);
  }
  return worst;
}

function bandwidth(point: IndicatorSeries['boll'][number]): number | null {
  return point.upper === null || point.lower === null || point.middle === null || point.middle === 0
    ? null
    : (point.upper - point.lower) / point.middle;
}

function benchmarkReturn(
  candles: Candle[],
  benchmarkByDate: Map<string, number>,
  index: number,
  period: number,
): number | null {
  if (index < period) return null;
  const current = benchmarkByDate.get(candles[index].date);
  const previous = benchmarkByDate.get(candles[index - period].date);
  return current === undefined || previous === undefined ? null : percentageReturn(current, previous);
}

function benchmarkRegime(benchmarkCandles: Candle[], date: string): TrendApplicabilityCandidate['marketRegime'] {
  const sorted = [...benchmarkCandles].sort((left, right) => left.date.localeCompare(right.date));
  const index = sorted.findIndex((candle) => candle.date === date);
  if (index < 59) {
    return { benchmarkCloseAboveMa60: null, benchmarkMa20Slope10: null, eligible: null };
  }
  const closes = sorted.map((candle) => candle.close);
  const ma60 = mean(closes.slice(index - 59, index + 1));
  const ma20 = mean(closes.slice(index - 19, index + 1));
  const previousMa20 = mean(closes.slice(index - 29, index - 9));
  const ma20Slope10 = ma20 === null || previousMa20 === null
    ? null : percentageReturn(ma20, previousMa20);
  const benchmarkCloseAboveMa60 = ma60 === null ? null : closes[index] > ma60;
  return {
    benchmarkCloseAboveMa60,
    benchmarkMa20Slope10: ma20Slope10,
    eligible: benchmarkCloseAboveMa60 === null || ma20Slope10 === null
      ? null : benchmarkCloseAboveMa60 && ma20Slope10 > 0,
  };
}

/**
 * Extracts only information available at the candidate close. It does not
 * decide whether to trade; decisions require a same-date cross-sectional rank.
 */
export function extractTrendApplicabilityCandidate(
  candles: Candle[],
  indicators: IndicatorSeries,
  benchmarkCandles: Candle[],
  index = candles.length - 1,
): TrendApplicabilityCandidate {
  if (index < 0 || index >= candles.length) throw new RangeError('Candidate index is outside the candle series');
  const indicatorLengths = [
    indicators.ma20.length,
    indicators.ma60.length,
    indicators.boll.length,
  ];
  if (indicatorLengths.some((length) => length <= index)) {
    throw new RangeError('Indicator series does not cover the candidate index');
  }
  const closes = candles.map((candle) => candle.close);
  const benchmarkByDate = new Map(benchmarkCandles.map((candle) => [candle.date, candle.close]));
  const stockReturn20 = trailingReturn(closes, index, 20);
  const stockReturn60 = trailingReturn(closes, index, 60);
  const benchmarkReturn20 = benchmarkReturn(candles, benchmarkByDate, index, 20);
  const benchmarkReturn60 = benchmarkReturn(candles, benchmarkByDate, index, 60);
  const volumes20 = candles.slice(Math.max(0, index - 20), index)
    .flatMap((candle) => candle.volume === null ? [] : [candle.volume]);
  const volumes5 = candles.slice(Math.max(0, index - 4), index + 1)
    .flatMap((candle) => candle.volume === null ? [] : [candle.volume]);
  const currentVolume = candles[index].volume;
  const volumeMedian20 = volumes20.length === 20 ? median(volumes20) : null;
  const volumeMean20 = volumes20.length === 20 ? mean(volumes20) : null;
  const volumeMean5 = volumes5.length === 5 ? mean(volumes5) : null;
  const currentBandwidth = bandwidth(indicators.boll[index]);
  const previousBandwidths = indicators.boll.slice(Math.max(0, index - 20), index)
    .flatMap((point) => {
      const value = bandwidth(point);
      return value === null ? [] : [value];
    });
  const baselineBandwidth = previousBandwidths.length === 20 ? median(previousBandwidths) : null;

  return {
    symbol: candles[index].symbol,
    date: candles[index].date,
    marketRegime: benchmarkRegime(benchmarkCandles, candles[index].date),
    features: {
      ma20Slope10: seriesSlope(indicators.ma20, index, 10),
      ma60Slope20: seriesSlope(indicators.ma60, index, 20),
      ma20Crosses60: crossingCount(candles, indicators.ma20, index, 60),
      closesAboveMa20Ratio20: closesAboveRatio(candles, indicators.ma20, index, 20),
      logTrendR2_60: index + 1 < 60 ? null : regressionR2(closes.slice(index + 1 - 60, index + 1)),
      maxDrawdown20: index + 1 < 20 ? null : maxDrawdown(closes.slice(index + 1 - 20, index + 1)),
      relativeStrength20: stockReturn20 === null || benchmarkReturn20 === null
        ? null : stockReturn20 - benchmarkReturn20,
      relativeStrength60: stockReturn60 === null || benchmarkReturn60 === null
        ? null : stockReturn60 - benchmarkReturn60,
      currentVolumeRatio20: ratio(currentVolume, volumeMedian20),
      volumeTrendRatio5To20: ratio(volumeMean5, volumeMean20),
      bollBandwidthRatio20: ratio(currentBandwidth, baselineBandwidth),
    },
  };
}

function percentileRanks(
  candidates: TrendApplicabilityCandidate[],
  feature: FeatureName,
): Map<TrendApplicabilityCandidate, number> {
  return valuePercentileRanks(
    candidates,
    (candidate) => candidate.features[feature],
    LOWER_IS_BETTER.has(feature),
  );
}

function valuePercentileRanks<T>(
  items: T[],
  valueOf: (item: T) => number | null,
  lowerIsBetter = false,
): Map<T, number> {
  const available = items
    .filter((item) => valueOf(item) !== null)
    .sort((left, right) => {
      const difference = valueOf(left)! - valueOf(right)!;
      return lowerIsBetter ? -difference : difference;
    });
  const result = new Map<T, number>();
  if (available.length === 1) {
    result.set(available[0], 0.5);
    return result;
  }
  for (let start = 0; start < available.length;) {
    let end = start;
    while (end + 1 < available.length
      && valueOf(available[end + 1]) === valueOf(available[start])) end++;
    const percentile = ((start + end) / 2) / (available.length - 1);
    for (let index = start; index <= end; index++) result.set(available[index], percentile);
    start = end + 1;
  }
  return result;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreDateCohort(
  candidates: TrendApplicabilityCandidate[],
  options: Required<TrendApplicabilityRankingOptions>,
): RankedTrendApplicability[] {
  const featureRanks = new Map<FeatureName, Map<TrendApplicabilityCandidate, number>>();
  for (const features of Object.values(COMPONENT_FEATURES)) {
    for (const feature of features) featureRanks.set(feature, percentileRanks(candidates, feature));
  }

  const provisional = candidates.map((candidate) => {
    const components = Object.fromEntries(Object.entries(COMPONENT_FEATURES).map(([name, features]) => {
      const ranks = features.flatMap((feature) => {
        const rank = featureRanks.get(feature)?.get(candidate);
        return rank === undefined ? [] : [rank * 100];
      });
      return [name, average(ranks)];
    })) as unknown as TrendApplicabilityComponents;
    let weightedScore = 0;
    let availableWeight = 0;
    for (const [name, weight] of Object.entries(COMPONENT_WEIGHTS) as Array<[ScoredComponentName, number]>) {
      const component = components[name];
      if (component === null) continue;
      const availableFeatures = COMPONENT_FEATURES[name].filter((feature) =>
        featureRanks.get(feature)?.has(candidate),
      ).length;
      const effectiveWeight = weight * availableFeatures / COMPONENT_FEATURES[name].length;
      weightedScore += component * effectiveWeight;
      availableWeight += effectiveWeight;
    }
    return {
      ...candidate,
      components,
      score: availableWeight === 0 ? null : weightedScore / availableWeight,
      featureCoverage: availableWeight,
    };
  });

  const eligible = provisional.filter((candidate) =>
    candidate.score !== null && candidate.featureCoverage >= options.minimumFeatureCoverage,
  );
  const scoreRanks = valuePercentileRanks(eligible, (candidate) => candidate.score);

  return provisional.map((candidate) => {
    const scorePercentile = scoreRanks.get(candidate) ?? null;
    const relativeStrength = candidate.components.relativeStrength;
    const volumeConfirmation = candidate.components.volumeConfirmation;
    const componentConsensus = relativeStrength !== null && volumeConfirmation !== null
      && relativeStrength / 100 >= options.consensusPercentile
      && volumeConfirmation / 100 >= options.consensusPercentile;
    let decision: RankedTrendApplicability['decision'];
    if (candidate.featureCoverage < options.minimumFeatureCoverage
      || candidate.score === null
      || (options.requireMarketRegime && candidate.marketRegime.eligible === null)) {
      decision = 'insufficient_data';
    } else if (eligible.length < options.minimumCohortSize) {
      decision = 'insufficient_cohort';
    } else if (componentConsensus
      && (!options.requireMarketRegime || candidate.marketRegime.eligible === true)) {
      decision = 'execute';
    } else if (componentConsensus
      || (scorePercentile !== null && scorePercentile >= options.watchPercentile)) {
      decision = 'watch';
    } else {
      decision = 'reject';
    }
    return { ...candidate, scorePercentile, decision };
  });
}

/**
 * Ranks candidates only against other candidates from the same date. This is
 * an offline research primitive; it is intentionally not wired into the public
 * technical_analysis response until out-of-sample validation is complete.
 */
export function rankTrendApplicabilityCandidates(
  candidates: TrendApplicabilityCandidate[],
  options: TrendApplicabilityRankingOptions = {},
): RankedTrendApplicability[] {
  const resolved: Required<TrendApplicabilityRankingOptions> = {
    minimumCohortSize: options.minimumCohortSize ?? TREND_APPLICABILITY_V2_1.minimumCohortSize,
    consensusPercentile: options.consensusPercentile ?? TREND_APPLICABILITY_V2_1.consensusPercentile,
    watchPercentile: options.watchPercentile ?? TREND_APPLICABILITY_V2_1.watchPercentile,
    minimumFeatureCoverage: options.minimumFeatureCoverage ?? TREND_APPLICABILITY_V2_1.minimumFeatureCoverage,
    requireMarketRegime: options.requireMarketRegime ?? true,
  };
  if (resolved.minimumCohortSize < 2
    || resolved.consensusPercentile < 0
    || resolved.consensusPercentile > 1
    || resolved.watchPercentile < 0
    || resolved.watchPercentile > 1
    || resolved.minimumFeatureCoverage <= 0
    || resolved.minimumFeatureCoverage > 1) {
    throw new RangeError('Ranking options are outside their supported ranges');
  }
  const byDate = new Map<string, TrendApplicabilityCandidate[]>();
  for (const candidate of candidates) {
    const cohort = byDate.get(candidate.date) ?? [];
    cohort.push(candidate);
    byDate.set(candidate.date, cohort);
  }
  return [...byDate.values()].flatMap((cohort) => scoreDateCohort(cohort, resolved));
}
