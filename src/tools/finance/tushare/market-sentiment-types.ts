import type { TushareRow } from './client.js';

export type SentimentLabel = 'optimistic' | 'neutral' | 'pessimistic';

export type SentimentComponentName =
  | 'market'
  | 'breadth'
  | 'limit'
  | 'sector'
  | 'money_flow'
  | 'news';

export interface UnavailableData {
  api: string;
  reason: 'permission_denied' | 'error' | 'not_configured';
  message: string;
}

export interface SentimentScoreComponent {
  name: SentimentComponentName;
  score: number;
  weight: number;
  available: boolean;
  rationale: string;
}

export interface MarketSentimentRawData {
  indices: TushareRow[];
  daily: TushareRow[];
  daily_basic: TushareRow[];
  limit_list: TushareRow[];
  moneyflow: TushareRow[];
  sectors: TushareRow[];
}

export interface MarketSentimentResult {
  status: 'ok' | 'partial';
  trade_date: string;
  market: 'china_a_share';
  label: SentimentLabel;
  overall_score: number;
  components: SentimentScoreComponent[];
  highlights: string[];
  pressures: string[];
  watch_next: string[];
  raw: MarketSentimentRawData;
  news_queries: string[];
  unavailable_data: UnavailableData[];
  source: {
    provider: 'Tushare';
    apis: string[];
  };
}
