import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../types.js';
import { HttpTushareClient, type TushareClient } from '../tushare/client.js';
import { toPublicTechnicalAnalysisResult } from './assessment.js';
import { calculateIndicators } from './indicators.js';
import { interpretPositionEvents } from './position-state.js';
import { collectTechnicalData } from './provider.js';
import { evaluateDailySignals, evaluateWeeklySignals } from './signals.js';
import { evaluateTrendRecoveryStrategy, TREND_RECOVERY_V1 } from './strategy.js';
import { buildTechnicalSummary } from './summary.js';
import type { TechnicalAnalysisResult, TechnicalSignal } from './types.js';

export const TECHNICAL_ANALYSIS_DESCRIPTION = `
Descriptive daily/weekly technical-state analysis for one China A-share or supported China stock index. Uses Tushare OHLC data and local TypeScript calculations for MA5/10/20/30/60, BOLL(20,2), KDJ(9,3,3), trend alignment, momentum, volatility, drawdown, neutral technical observations, and observed structural changes. Baseline V0 formula evidence and experimental Trend Recovery V1 historical state events support the description; they do not constitute a validated predictive or trading strategy.

Use for Chinese requests about 技术面分析、近期走势、价格波动、波动率、均线、布林带、KDJ、超买超卖、技术状态、技术结构变化、已发生回撤, and supported indices such as 上证指数、深证成指、创业板指、沪深300、中证500、科创50.

Upper or lower Bollinger-band contacts are neutral location observations, not opportunities, reversal signals, or future-risk forecasts. Experimental Applicability V2.1 remains offline research and is not included in ordinary single-symbol output. Describe technical state, observed structural changes, realized drawdowns, multi-horizon tension, and conditions that would confirm or invalidate the current state. The next five trading sessions may be used as a review cadence for short-term daily momentum, band contact, and recent structural changes, but T+5 is not a validated predictive horizon; MA20/MA60 and 20/60-day context remain medium-term background until state changes. Do not claim that an event raises future loss probability or covers a T+N horizon. Do not turn technical events into buy/sell recommendations, return probabilities, personalized position guidance, or order instructions. Do not use for valuation or financial statements alone, US/global equities, current news or policy explanations, or real-time/minute data. Pair with a_share_analysis for fundamentals and web_search for explicitly requested current-event context.
`.trim();

export const TECHNICAL_ANALYSIS_SCHEMA = z.object({
  query: z.string().describe('A-share or supported China index name/code, optionally inside a technical-analysis request'),
  asset_type: z.enum(['auto', 'stock', 'index']).default('auto'),
  as_of_date: z.string().regex(/^\d{8}$/).optional(),
  adjustment: z.enum(['qfq', 'none']).default('qfq'),
  lookback_days: z.number().int().min(120).max(1000).default(450),
  completed_weeks_only: z.boolean().default(false),
});

function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replaceAll('-', '');
}

function roundNumbers(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null;
  if (Array.isArray(value)) return value.map(roundNumbers);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundNumbers(item)]));
  }
  return value;
}

function latestSignals(signals: TechnicalSignal[], date: string): TechnicalSignal[] {
  return signals.filter((signal) => signal.date === date);
}

export async function runTechnicalAnalysis(
  input: z.infer<typeof TECHNICAL_ANALYSIS_SCHEMA>,
  client: TushareClient,
): Promise<TechnicalAnalysisResult> {
  const asOfDate = input.as_of_date ?? today();
  const collected = await collectTechnicalData({ ...input, as_of_date: asOfDate }, client);
  if (!('daily' in collected)) {
    return {
      status: collected.status,
      message: collected.message,
      candidates: collected.candidates?.map(({ ts_code, name }) => ({ ts_code, name })),
      warnings: collected.warnings,
      unavailable_data: collected.unavailable_data,
    };
  }

  const dailyIndicators = calculateIndicators(collected.daily);
  const weeklyIndicators = calculateIndicators(collected.weekly);
  const dailySignals = evaluateDailySignals(collected.daily, dailyIndicators.kdj, dailyIndicators.boll);
  const weeklySignals = evaluateWeeklySignals(collected.weekly, weeklyIndicators.boll);
  const allSignals = [...dailySignals, ...weeklySignals].sort((a, b) => a.date.localeCompare(b.date));
  const baselinePositionEvents = interpretPositionEvents(dailySignals);
  const positionEvents = evaluateTrendRecoveryStrategy(collected.daily, dailyIndicators);
  const summary = buildTechnicalSummary(collected.daily, dailyIndicators);
  const lastIndex = collected.daily.length - 1;
  const latestDaily = collected.daily[lastIndex];
  const latestWeekly = collected.weekly.at(-1)!;
  const recentStart = collected.daily[Math.max(0, collected.daily.length - 20)].date;

  return {
    status: collected.status,
    asset: collected.asset,
    as_of_date: latestDaily.date,
    data_range: {
      start: collected.daily[0].date,
      end: latestDaily.date,
      daily_count: collected.daily.length,
      weekly_count: collected.weekly.length,
      latest_week_partial: Boolean(latestWeekly.partial),
    },
    methodology: {
      provider: 'Tushare', apis: collected.apis, adjustment: collected.adjustment,
      boll: { period: 20, multiplier: 2, stddev: 'sample' },
      kdj: { period: 9, smooth_k: 3, smooth_d: 3, initial: 50 },
      strategy: {
        name: TREND_RECOVERY_V1.name,
        minimum_hold_bars: TREND_RECOVERY_V1.minimumHoldBars,
        stop_loss: TREND_RECOVERY_V1.stopLoss,
        trailing_drawdown: TREND_RECOVERY_V1.trailingDrawdown,
        ma_break_bars: TREND_RECOVERY_V1.maBreakBars,
      },
    },
    latest: {
      candle: latestDaily,
      ma: {
        ma5: dailyIndicators.ma5[lastIndex], ma10: dailyIndicators.ma10[lastIndex],
        ma20: dailyIndicators.ma20[lastIndex], ma30: dailyIndicators.ma30[lastIndex],
        ma60: dailyIndicators.ma60[lastIndex],
      },
      boll: dailyIndicators.boll[lastIndex],
      kdj: dailyIndicators.kdj[lastIndex],
    },
    ...summary,
    signals: {
      recent_start_date: recentStart,
      latest_daily: latestSignals(dailySignals, latestDaily.date),
      latest_weekly: latestSignals(weeklySignals, latestWeekly.date),
      recent: allSignals.filter((signal) => signal.date >= recentStart).slice(-30),
      position_events: positionEvents.slice(-20),
      baseline_v0_position_events: baselinePositionEvents.slice(-20),
    },
    warnings: [
      ...collected.warnings,
      ...(latestWeekly.partial ? ['The latest weekly candle is partial and may change before week close.'] : []),
      'Technical signals are based on historical prices and are not investment advice.',
      'Trend Recovery V1 position events are experimental and are reported separately from raw formula signals and Baseline V0 events.',
      'Formula semantics are documented and tested; exact chart-platform parity requires a golden fixture.',
    ],
    unavailable_data: collected.unavailable_data,
  };
}

export function createTechnicalAnalysis(
  token = process.env.TUSHARE_TOKEN,
  clientFactory: (token: string) => TushareClient = (value) => new HttpTushareClient(value),
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'technical_analysis',
    description: TECHNICAL_ANALYSIS_DESCRIPTION,
    schema: TECHNICAL_ANALYSIS_SCHEMA,
    func: async (input) => {
      if (!token) throw new Error('TUSHARE_TOKEN is required for technical_analysis');
      const internalResult = await runTechnicalAnalysis(input, clientFactory(token));
      return formatToolResult(roundNumbers(toPublicTechnicalAnalysisResult(internalResult)), []);
    },
  });
}
