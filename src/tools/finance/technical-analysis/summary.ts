import { logReturn, mean, percentageReturn, standardDeviation } from './math.js';
import type { Candle, IndicatorSeries } from './types.js';

export const SUMMARY_THRESHOLDS = {
  volatilityExpansionRatio: 1.1,
  volatilityContractionRatio: 0.9,
} as const;

function trailingReturn(closes: number[], period: number): number | null {
  if (closes.length <= period) return null;
  return percentageReturn(closes.at(-1)!, closes[closes.length - 1 - period]);
}

function distance(value: number, reference: number | null): number | null {
  return reference === null || reference === 0 ? null : value / reference - 1;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
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

export function buildTechnicalSummary(candles: Candle[], indicators: IndicatorSeries) {
  const closes = candles.map((candle) => candle.close);
  const index = candles.length - 1;
  const latest = candles[index];
  const ma5 = indicators.ma5[index];
  const ma10 = indicators.ma10[index];
  const ma20 = indicators.ma20[index];
  const ma60 = indicators.ma60[index];
  const boll = indicators.boll[index];
  const kdj = indicators.kdj[index];
  const bandwidths = indicators.boll.flatMap((point) =>
    point.upper !== null && point.lower !== null && point.middle !== null && point.middle !== 0
      ? [(point.upper - point.lower) / point.middle]
      : [],
  );
  const currentBandwidth = boll.upper !== null && boll.lower !== null && boll.middle !== null && boll.middle !== 0
    ? (boll.upper - boll.lower) / boll.middle
    : null;
  const baselineBandwidth = median(bandwidths.slice(-20));

  const logReturns = closes.slice(-21).flatMap((value, offset, window) => {
    if (offset === 0) return [];
    const result = logReturn(value, window[offset - 1]);
    return result === null ? [] : [result];
  });
  const dailyStddev = logReturns.length === 20 ? standardDeviation(logReturns, 'sample') : null;

  const trend = ma5 === null || ma10 === null || ma20 === null || ma60 === null
    ? 'insufficient_data' as const
    : latest.close > ma20 && ma20 > ma60 && ma5 > ma10
      ? 'bullish' as const
      : latest.close < ma20 && ma20 < ma60 && ma5 < ma10
        ? 'bearish' as const
        : 'mixed' as const;
  const volatility = currentBandwidth === null || baselineBandwidth === null || baselineBandwidth === 0
    ? 'insufficient_data' as const
    : currentBandwidth > baselineBandwidth * SUMMARY_THRESHOLDS.volatilityExpansionRatio
      ? 'expanding' as const
      : currentBandwidth < baselineBandwidth * SUMMARY_THRESHOLDS.volatilityContractionRatio
        ? 'contracting' as const
        : 'normal' as const;

  const momentum = kdj.j === null ? 'insufficient_data'
    : kdj.j > 100 ? 'J above 100'
      : kdj.j > 80 ? 'overbought zone'
        : kdj.j < 20 ? 'oversold zone'
          : 'neutral KDJ zone';

  return {
    performance: {
      return_5d: trailingReturn(closes, 5),
      return_20d: trailingReturn(closes, 20),
      return_60d: trailingReturn(closes, 60),
      distance_ma20: distance(latest.close, ma20),
      distance_ma60: distance(latest.close, ma60),
      realized_volatility_20d: dailyStddev === null ? null : dailyStddev * Math.sqrt(252),
      max_drawdown_20d: maxDrawdown(closes.slice(-20)),
      boll_bandwidth: currentBandwidth,
    },
    interpretation: {
      trend,
      volatility,
      momentum,
      evidence: [
        `close=${latest.close}, ma20=${ma20 ?? 'n/a'}, ma60=${ma60 ?? 'n/a'}`,
        `ma5=${ma5 ?? 'n/a'}, ma10=${ma10 ?? 'n/a'}`,
        `boll_bandwidth=${currentBandwidth ?? 'n/a'}, 20-point median=${baselineBandwidth ?? 'n/a'}`,
        `K=${kdj.k ?? 'n/a'}, D=${kdj.d ?? 'n/a'}, J=${kdj.j ?? 'n/a'}`,
      ],
    },
  };
}
