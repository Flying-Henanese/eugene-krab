import type {
  PositionEvent,
  PublicTechnicalAnalysisResult,
  TechnicalAnalysisResult,
  TechnicalAssessment,
  TechnicalDecisionContext,
  TechnicalObservation,
  TechnicalStructuralChange,
  TechnicalSignal,
} from './types.js';

const LIMITATIONS = [
  'This assessment describes deterministic historical price and volume conditions and observed structural changes.',
  'No directional probability, expected return, or position size is provided.',
  'Observed structural changes do not establish subsequent continuation, reversal, or higher future loss.',
  'Formula conditions and trend-state events are descriptive evidence, not validated predictive claims or transaction recommendations.',
  'Use the next five trading sessions only as a review cadence for short-term daily momentum, Bollinger-band contact, and recent structural-change conditions; T+5 is not a validated predictive horizon.',
  'MA20/MA60 alignment and 20/60-day context describe a medium-term background that remains relevant until the observed state changes; they do not have a fixed T+N validity period.',
  'Local formula conditions follow the documented semantics; exact parity with external charting platforms is not guaranteed until a golden fixture is available.',
] as const;

const TREND_EVENT_EVIDENCE_KEYS: Partial<Record<PositionEvent['signal'], readonly string[]>> = {
  STRATEGY_TREND_RECOVERY_ENTRY: ['close', 'ma20', 'ma60', 'k', 'd'],
  STRATEGY_MA20_BREAK_EXIT: ['close', 'ma20', 'bars_held', 'return_from_entry', 'drawdown_from_peak'],
  STRATEGY_STOP_LOSS: ['close', 'ma20', 'bars_held', 'return_from_entry', 'drawdown_from_peak'],
  STRATEGY_TRAILING_EXIT: ['close', 'ma20', 'bars_held', 'return_from_entry', 'drawdown_from_peak'],
};

const FORMULA_EVIDENCE_KEYS: Record<TechnicalSignal['name'], readonly string[]> = {
  BUY_NEW: ['j', 'k', 'd'],
  WEEKLY_BUY_LOWER: ['low', 'boll_lower'],
  SELL_J_TURN_ABOVE_80: ['j', 'previous_j'],
  SELL_TOUCH_UPPER: ['high', 'boll_upper'],
  SELL_J_CROSS_100: ['j', 'previous_j'],
  SELL_POST_BUY_TURN: ['j', 'previous_j', 'buy_within_10_bars'],
  WEEKLY_SELL_UPPER: ['high', 'boll_upper'],
};

function neutralEvidence(
  evidence: Record<string, number | boolean | null> | undefined,
  allowedKeys: readonly string[],
): Record<string, number | boolean | null> {
  if (!evidence) return {};

  const renamed: Record<string, string> = {
    close: 'closing_price',
    bars_held: 'bars_since_reference',
    return_from_entry: 'return_from_reference',
    buy_within_10_bars: 'momentum_recovery_within_10_bars',
  };

  return Object.fromEntries(allowedKeys.flatMap((key) => (
    Object.hasOwn(evidence, key) ? [[renamed[key] ?? key, evidence[key]]] : []
  )));
}

function mapTrendEvent(event: PositionEvent): TechnicalObservation | TechnicalStructuralChange | null {
  const allowedEvidenceKeys = TREND_EVENT_EVIDENCE_KEYS[event.signal];
  if (!allowedEvidenceKeys) return null;
  const evidence = neutralEvidence(event.evidence, allowedEvidenceKeys);

  switch (event.signal) {
    case 'STRATEGY_TREND_RECOVERY_ENTRY':
      return {
        type: 'trend_recovery_observation',
        date: event.date,
        timeframe: 'daily',
        basis: 'trend_state_event',
        evidence,
        interpretation: 'Price moved from at or below MA20 to above MA20 while MA20 was above MA60 and K was above D. This records the technical state on the event date without implying subsequent direction.',
        follow_up_condition: 'Track whether subsequent closes remain above MA20 or move below it on repeated sessions.',
      };
    case 'STRATEGY_MA20_BREAK_EXIT':
      return {
        type: 'trend_recovery_condition_ended',
        date: event.date,
        timeframe: 'daily',
        basis: 'trend_state_event',
        significance: 'material_change',
        evidence,
        interpretation: 'Price closed below MA20 on repeated sessions, so the earlier trend-recovery condition no longer held. This change does not determine subsequent direction.',
      };
    case 'STRATEGY_STOP_LOSS':
      return {
        type: 'reference_drawdown_observation',
        date: event.date,
        timeframe: 'daily',
        basis: 'trend_state_event',
        significance: 'material_change',
        evidence,
        interpretation: 'The closing price had moved materially below the earlier trend-recovery reference price. This describes an observed drawdown, not a forecast of further decline.',
      };
    case 'STRATEGY_TRAILING_EXIT':
      return {
        type: 'peak_drawdown_observation',
        date: event.date,
        timeframe: 'daily',
        basis: 'trend_state_event',
        significance: 'material_change',
        evidence,
        interpretation: 'The closing price had moved materially below the highest close recorded after the earlier trend-recovery observation. This describes an observed drawdown, not a forecast of further decline.',
      };
    default:
      return null;
  }
}

function mapFormulaSignal(signal: TechnicalSignal): TechnicalObservation | TechnicalStructuralChange {
  const common = {
    date: signal.date,
    timeframe: signal.timeframe,
    basis: 'formula_condition' as const,
    ...(signal.partial === undefined ? {} : { partial: signal.partial }),
    evidence: neutralEvidence(signal.evidence, FORMULA_EVIDENCE_KEYS[signal.name]),
  };

  switch (signal.name) {
    case 'BUY_NEW':
      return {
        ...common,
        type: 'low_zone_momentum_recovery_observation',
        interpretation: 'KDJ momentum turned upward from a low zone with K above D. This records a momentum-state change without implying subsequent direction.',
        follow_up_condition: 'Track whether K remains above D or moves back below D.',
      };
    case 'WEEKLY_BUY_LOWER':
      return {
        ...common,
        type: 'weekly_lower_band_contact_observation',
        interpretation: 'The weekly price range contacted the lower Bollinger band; this is a location observation rather than a directional forecast.',
        follow_up_condition: 'Track whether the weekly range returns inside the band, remains near the lower band, or the band width changes.',
      };
    case 'SELL_J_TURN_ABOVE_80':
      return {
        ...common,
        type: 'elevated_momentum_turn_observation',
        significance: 'notice',
        interpretation: 'J turned down after reaching an elevated zone, recording a change in short-term momentum direction without forecasting the next price move.',
      };
    case 'SELL_TOUCH_UPPER':
      return {
        ...common,
        type: 'daily_upper_band_contact_observation',
        interpretation: 'The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast.',
        follow_up_condition: 'Watch whether price remains near the upper band, returns inside it, or volatility expands.',
      };
    case 'SELL_J_CROSS_100':
      return {
        ...common,
        type: 'extreme_momentum_state_observation',
        significance: 'notice',
        interpretation: 'J crossed above 100, recording an unusually extended short-term momentum state without implying a reversal.',
      };
    case 'SELL_POST_BUY_TURN':
      return {
        ...common,
        type: 'momentum_direction_change_observation',
        significance: 'notice',
        interpretation: 'KDJ momentum turned down soon after a low-zone recovery observation. This records a direction change in the indicator, not a price forecast.',
      };
    case 'WEEKLY_SELL_UPPER':
      return {
        ...common,
        type: 'weekly_upper_band_contact_observation',
        interpretation: 'The weekly price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast.',
        follow_up_condition: 'Watch whether the weekly range remains extended, returns inside the band, or volatility expands.',
      };
  }
}

function recentFormulaSignals(result: TechnicalAnalysisResult): TechnicalSignal[] {
  if (!result.signals) return [];

  const unique = new Map<string, TechnicalSignal>();
  for (const signal of [
    ...result.signals.recent,
    ...result.signals.latest_daily,
    ...result.signals.latest_weekly,
  ]) {
    unique.set(`${signal.date}:${signal.timeframe}:${signal.name}`, signal);
  }
  return [...unique.values()];
}

function newestFirst<T extends { date: string; type: string }>(items: T[]): T[] {
  return items.sort((left, right) => right.date.localeCompare(left.date) || left.type.localeCompare(right.type));
}

function dataCompleteness(result: TechnicalAnalysisResult): 'high' | 'medium' | 'low' {
  if (result.status === 'ok' && result.unavailable_data.length === 0) return 'high';
  if ((result.status === 'ok' || result.status === 'partial') && result.latest) return 'medium';
  return 'low';
}

function indicatorCoverage(result: TechnicalAnalysisResult): 'high' | 'medium' | 'low' {
  if (result.latest && result.interpretation) return 'high';
  if (result.latest) return 'medium';
  return 'low';
}

export function buildTechnicalAssessment(result: TechnicalAnalysisResult): TechnicalAssessment {
  const latestTrendEvent = [...(result.signals?.position_events ?? [])]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(mapTrendEvent)
    .filter((event): event is TechnicalObservation | TechnicalStructuralChange => event !== null)
    .at(-1);
  const recentStartDate = result.signals?.recent_start_date;
  const currentTrendEvent = latestTrendEvent && (
    'follow_up_condition' in latestTrendEvent
    || recentStartDate === undefined
    || latestTrendEvent.date >= recentStartDate
  )
    ? latestTrendEvent
    : undefined;
  const mappedFormulaSignals = recentFormulaSignals(result).map(mapFormulaSignal);
  const mapped = [...(currentTrendEvent ? [currentTrendEvent] : []), ...mappedFormulaSignals];

  return {
    state: {
      trend: result.interpretation?.trend === 'bullish'
        ? 'upward_alignment'
        : result.interpretation?.trend === 'bearish'
          ? 'downward_alignment'
          : result.interpretation?.trend ?? 'insufficient_data',
      volatility: result.interpretation?.volatility ?? 'insufficient_data',
      momentum: result.interpretation?.momentum ?? 'Insufficient data for a momentum interpretation.',
      evidence: result.interpretation?.evidence ?? [],
    },
    observations: newestFirst(mapped.filter((item): item is TechnicalObservation => 'follow_up_condition' in item)),
    structural_changes: newestFirst(mapped.filter(
      (item): item is TechnicalStructuralChange => 'significance' in item,
    )),
    evidence_quality: {
      analysis_scope: 'descriptive_state_and_structure',
      data_completeness: dataCompleteness(result),
      indicator_coverage: indicatorCoverage(result),
      predictive_validation: 'not_established',
      directional_probability: null,
    },
    limitations: [...LIMITATIONS],
  };
}

function publicDataWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => ![
    'Technical signals are based on historical prices',
    'Trend Recovery V1 position events',
    'Formula semantics are documented and tested',
  ].some((prefix) => warning.startsWith(prefix)));
}

function relativePosition(
  price: number,
  reference: number | null,
): { relation: 'above' | 'below' | 'equal'; difference: number; distance_pct: number } | null {
  if (reference === null || reference === 0) return null;
  const difference = price - reference;
  return {
    relation: difference > 0 ? 'above' : difference < 0 ? 'below' : 'equal',
    difference,
    distance_pct: (difference / reference) * 100,
  };
}

function relationText(relation: 'above' | 'below' | 'equal', reference: 'MA20' | 'MA60'): string {
  if (relation === 'above') return `The closing price is above ${reference}.`;
  if (relation === 'below') return `The closing price is below ${reference}.`;
  return `The closing price is equal to ${reference} within calculation precision.`;
}

function repeatedCloseConditions(
  relation: 'above' | 'below' | 'equal',
  reference: 'MA20' | 'MA60',
): { confirmation: string; invalidation: string } {
  if (relation === 'above') {
    return {
      confirmation: `Repeated closes remaining above ${reference} would preserve the current above-${reference} location state.`,
      invalidation: `Repeated closes below ${reference} would invalidate the current above-${reference} location state.`,
    };
  }
  if (relation === 'below') {
    return {
      confirmation: `Repeated closes remaining below ${reference} would preserve the current below-${reference} location state.`,
      invalidation: `Repeated closes above ${reference} would invalidate the current below-${reference} location state.`,
    };
  }
  return {
    confirmation: `Repeated closes on the same side of ${reference} are needed before describing a stable location relationship.`,
    invalidation: `A close moving away from ${reference} would end the current equal-to-${reference} location state.`,
  };
}

function buildDecisionContext(
  assessment: TechnicalAssessment,
  positions: NonNullable<PublicTechnicalAnalysisResult['latest']>['price_position'],
): TechnicalDecisionContext | undefined {
  const ma20 = positions.ma20;
  const ma60 = positions.ma60;
  if (!ma20 || !ma60) return undefined;

  const shortTermConditions = repeatedCloseConditions(ma20.relation, 'MA20');
  const mediumTermConditions = repeatedCloseConditions(ma60.relation, 'MA60');
  const currentStructure = assessment.state.trend === 'upward_alignment'
    ? 'Daily moving averages are upward-aligned.'
    : assessment.state.trend === 'downward_alignment'
      ? 'Daily moving averages are downward-aligned.'
      : assessment.state.trend === 'mixed'
        ? 'Daily moving-average relationships are mixed.'
        : 'The available data is insufficient to describe moving-average structure.';

  const crossHorizonRelationship = ma20.relation === ma60.relation
    ? `The closing price is ${ma20.relation} both MA20 and MA60, so short- and medium-term price-location evidence currently agrees.`
    : `The closing price is ${ma20.relation} MA20 but ${ma60.relation} MA60, so short- and medium-term price-location evidence is in tension.`;

  return {
    current_structure: currentStructure,
    short_term_context: `${relationText(ma20.relation, 'MA20')} Momentum state: ${assessment.state.momentum}`,
    medium_term_context: `${relationText(ma60.relation, 'MA60')} The 20/60-day return and MA60 relationship describe medium-term background rather than a fixed forecast horizon.`,
    cross_horizon_relationship: crossHorizonRelationship,
    confirmation_conditions: [shortTermConditions.confirmation, mediumTermConditions.confirmation],
    invalidation_conditions: [shortTermConditions.invalidation, mediumTermConditions.invalidation],
    observation_follow_up: assessment.observations
      .slice(0, 3)
      .map((observation) => observation.follow_up_condition),
    review_cadence: {
      short_term_trading_sessions: 5,
      short_term_scope: 'Re-check daily momentum, Bollinger-band contact, recent structural changes, and repeated closes relative to MA20.',
      predictive_horizon: 'not_established',
      medium_term_scope: 'MA20/MA60 alignment and 20/60-day context remain descriptive until the observed state changes; they have no fixed T+N expiry.',
    },
  };
}

/**
 * Removes research-only event names, directional sides, and model parameters
 * before a result is exposed to a conversational surface.
 */
export function toPublicTechnicalAnalysisResult(
  result: TechnicalAnalysisResult,
): PublicTechnicalAnalysisResult {
  const methodology = result.methodology
    ? {
        provider: result.methodology.provider,
        apis: result.methodology.apis,
        adjustment: result.methodology.adjustment,
        boll: result.methodology.boll,
        kdj: result.methodology.kdj,
      }
    : undefined;
  const positions = result.latest
    ? {
        ma20: relativePosition(result.latest.candle.close, result.latest.ma.ma20),
        ma60: relativePosition(result.latest.candle.close, result.latest.ma.ma60),
        boll_middle: relativePosition(result.latest.candle.close, result.latest.boll.middle),
      }
    : undefined;
  const latest = result.latest && positions
    ? {
        price: {
          symbol: result.latest.candle.symbol,
          date: result.latest.candle.date,
          opening_price: result.latest.candle.open,
          high: result.latest.candle.high,
          low: result.latest.candle.low,
          closing_price: result.latest.candle.close,
          volume: result.latest.candle.volume,
          amount: result.latest.candle.amount,
          adjustment: result.latest.candle.adjustment,
          ...(result.latest.candle.partial === undefined ? {} : { partial: result.latest.candle.partial }),
        },
        moving_averages: result.latest.ma,
        price_position: positions,
        boll: result.latest.boll,
        kdj: result.latest.kdj,
      }
    : undefined;

  const assessment = buildTechnicalAssessment(result);

  return {
    status: result.status,
    asset: result.asset,
    message: result.message,
    candidates: result.candidates,
    as_of_date: result.as_of_date,
    data_range: result.data_range,
    methodology,
    latest,
    performance: result.performance,
    assessment,
    decision_context: positions ? buildDecisionContext(assessment, positions) : undefined,
    data_warnings: publicDataWarnings(result.warnings),
    unavailable_data: result.unavailable_data,
  };
}
