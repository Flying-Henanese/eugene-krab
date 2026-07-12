export type AdjustmentMode = 'none' | 'qfq';

export interface Candle {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  adjustment: AdjustmentMode;
  partial?: boolean;
}

export interface BollingerPoint {
  middle: number | null;
  upper: number | null;
  lower: number | null;
  stddev: number | null;
}

export interface KdjPoint {
  rsv: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
}

export type SignalName =
  | 'BUY_NEW'
  | 'SELL_J_TURN_ABOVE_80'
  | 'SELL_TOUCH_UPPER'
  | 'SELL_J_CROSS_100'
  | 'SELL_POST_BUY_TURN'
  | 'WEEKLY_BUY_LOWER'
  | 'WEEKLY_SELL_UPPER';

export type StrategySignalName =
  | 'STRATEGY_TREND_RECOVERY_ENTRY'
  | 'STRATEGY_STOP_LOSS'
  | 'STRATEGY_TRAILING_EXIT'
  | 'STRATEGY_MA20_BREAK_EXIT';

export interface TechnicalSignal {
  name: SignalName;
  side: 'buy' | 'sell';
  timeframe: 'daily' | 'weekly';
  date: string;
  partial?: boolean;
  evidence: Record<string, number | boolean | null>;
}

export interface PositionEvent {
  date: string;
  action: 'open' | 'close';
  signal: SignalName | StrategySignalName;
  evidence?: Record<string, number | boolean | null>;
}

export interface UnavailableData {
  api: string;
  reason: 'permission_denied' | 'error' | 'missing_rows';
  message: string;
}

/** Internal research result. Conversational surfaces must use the public adapter. */
export interface TechnicalAnalysisResult {
  status: 'ok' | 'partial' | 'not_found' | 'ambiguous' | 'insufficient_data';
  asset?: { type: 'stock' | 'index'; ts_code: string; name: string };
  message?: string;
  candidates?: Array<{ ts_code: string; name: string }>;
  as_of_date?: string;
  data_range?: {
    start: string;
    end: string;
    daily_count: number;
    weekly_count: number;
    latest_week_partial: boolean;
  };
  methodology?: {
    provider: 'Tushare';
    apis: string[];
    adjustment: 'qfq' | 'none' | 'not_applicable';
    boll: { period: 20; multiplier: 2; stddev: 'sample' | 'population' };
    kdj: { period: 9; smooth_k: 3; smooth_d: 3; initial: number };
    strategy: {
      name: 'trend_recovery_v1';
      minimum_hold_bars: 5;
      stop_loss: 0.08;
      trailing_drawdown: 0.15;
      ma_break_bars: 2;
    };
  };
  latest?: {
    candle: Candle;
    ma: Record<'ma5' | 'ma10' | 'ma20' | 'ma30' | 'ma60', number | null>;
    boll: BollingerPoint;
    kdj: KdjPoint;
  };
  performance?: {
    return_5d: number | null;
    return_20d: number | null;
    return_60d: number | null;
    distance_ma20: number | null;
    distance_ma60: number | null;
    realized_volatility_20d: number | null;
    max_drawdown_20d: number | null;
    boll_bandwidth: number | null;
  };
  interpretation?: {
    trend: 'bullish' | 'bearish' | 'mixed' | 'insufficient_data';
    volatility: 'expanding' | 'contracting' | 'normal' | 'insufficient_data';
    momentum: string;
    evidence: string[];
  };
  signals?: {
    recent_start_date?: string;
    latest_daily: TechnicalSignal[];
    latest_weekly: TechnicalSignal[];
    recent: TechnicalSignal[];
    position_events: PositionEvent[];
    baseline_v0_position_events: PositionEvent[];
  };
  warnings: string[];
  unavailable_data: UnavailableData[];
}

export interface IndicatorSeries {
  ma5: Array<number | null>;
  ma10: Array<number | null>;
  ma20: Array<number | null>;
  ma30: Array<number | null>;
  ma60: Array<number | null>;
  boll: BollingerPoint[];
  kdj: KdjPoint[];
}

export type TechnicalObservationType =
  | 'trend_recovery_observation'
  | 'low_zone_momentum_recovery_observation'
  | 'daily_upper_band_contact_observation'
  | 'weekly_lower_band_contact_observation'
  | 'weekly_upper_band_contact_observation';

export type TechnicalStructuralChangeType =
  | 'trend_recovery_condition_ended'
  | 'reference_drawdown_observation'
  | 'peak_drawdown_observation'
  | 'elevated_momentum_turn_observation'
  | 'extreme_momentum_state_observation'
  | 'momentum_direction_change_observation';

export type TechnicalAssessmentBasis = 'trend_state_event' | 'formula_condition';

export interface TechnicalObservation {
  type: TechnicalObservationType;
  date: string;
  timeframe: 'daily' | 'weekly';
  basis: TechnicalAssessmentBasis;
  partial?: boolean;
  evidence: Record<string, number | boolean | null>;
  interpretation: string;
  follow_up_condition: string;
}

export interface TechnicalStructuralChange {
  type: TechnicalStructuralChangeType;
  date: string;
  timeframe: 'daily' | 'weekly';
  basis: TechnicalAssessmentBasis;
  significance: 'notice' | 'material_change';
  partial?: boolean;
  evidence: Record<string, number | boolean | null>;
  interpretation: string;
}

/**
 * Public, neutral interpretation of the deterministic technical calculations.
 * It intentionally contains no transaction action, position state, or return
 * forecast.
 */
export interface TechnicalAssessment {
  state: {
    trend: 'upward_alignment' | 'downward_alignment' | 'mixed' | 'insufficient_data';
    volatility: 'expanding' | 'contracting' | 'normal' | 'insufficient_data';
    momentum: string;
    evidence: string[];
  };
  observations: TechnicalObservation[];
  structural_changes: TechnicalStructuralChange[];
  evidence_quality: {
    analysis_scope: 'descriptive_state_and_structure';
    data_completeness: 'high' | 'medium' | 'low';
    indicator_coverage: 'high' | 'medium' | 'low';
    predictive_validation: 'not_established';
    directional_probability: null;
  };
  limitations: string[];
}

export interface TechnicalDecisionContext {
  current_structure: string;
  short_term_context: string;
  medium_term_context: string;
  cross_horizon_relationship: string;
  confirmation_conditions: string[];
  invalidation_conditions: string[];
  observation_follow_up: string[];
  review_cadence: {
    short_term_trading_sessions: 5;
    short_term_scope: string;
    predictive_horizon: 'not_established';
    medium_term_scope: string;
  };
}

export interface PublicPriceBar {
  symbol: string;
  date: string;
  opening_price: number;
  high: number;
  low: number;
  closing_price: number;
  volume: number | null;
  amount: number | null;
  adjustment: AdjustmentMode;
  partial?: boolean;
}

export interface PublicTechnicalAnalysisResult {
  status: TechnicalAnalysisResult['status'];
  asset?: TechnicalAnalysisResult['asset'];
  message?: string;
  candidates?: Array<{ ts_code: string; name: string }>;
  as_of_date?: string;
  data_range?: TechnicalAnalysisResult['data_range'];
  methodology?: {
    provider: 'Tushare';
    apis: string[];
    adjustment: 'qfq' | 'none' | 'not_applicable';
    boll: { period: 20; multiplier: 2; stddev: 'sample' | 'population' };
    kdj: { period: 9; smooth_k: 3; smooth_d: 3; initial: number };
  };
  latest?: {
    price: PublicPriceBar;
    moving_averages: Record<'ma5' | 'ma10' | 'ma20' | 'ma30' | 'ma60', number | null>;
    price_position: Record<'ma20' | 'ma60' | 'boll_middle', {
      relation: 'above' | 'below' | 'equal';
      difference: number;
      distance_pct: number;
    } | null>;
    boll: BollingerPoint;
    kdj: KdjPoint;
  };
  performance?: TechnicalAnalysisResult['performance'];
  assessment: TechnicalAssessment;
  decision_context?: TechnicalDecisionContext;
  data_warnings: string[];
  unavailable_data: UnavailableData[];
}
