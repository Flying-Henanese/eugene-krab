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
  signal: SignalName;
}

export interface UnavailableData {
  api: string;
  reason: 'permission_denied' | 'error' | 'missing_rows';
  message: string;
}

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
    latest_daily: TechnicalSignal[];
    latest_weekly: TechnicalSignal[];
    recent: TechnicalSignal[];
    position_events: PositionEvent[];
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
