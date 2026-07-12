import { config as loadDotenv } from 'dotenv';
import { aggregateWeeklyCandles } from '../src/tools/finance/technical-analysis/aggregate.js';
import { normalizeDailyRows } from '../src/tools/finance/technical-analysis/adjustment.js';
import { calculateIndicators } from '../src/tools/finance/technical-analysis/indicators.js';
import { interpretPositionEvents } from '../src/tools/finance/technical-analysis/position-state.js';
import { evaluateDailySignals, evaluateWeeklySignals } from '../src/tools/finance/technical-analysis/signals.js';
import type { Candle, SignalName, TechnicalSignal } from '../src/tools/finance/technical-analysis/types.js';
import {
  HttpTushareClient,
  type TushareClient,
  type TushareRow,
} from '../src/tools/finance/tushare/client.js';
import { HISTORICAL_CASES, redactSecret } from './technical-analysis-historical-cases.js';

const DAILY_FIELDS = ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'pre_close', 'vol', 'amount'];
const FACTOR_FIELDS = ['ts_code', 'trade_date', 'adj_factor'];
const TRADE_CAL_FIELDS = ['exchange', 'cal_date', 'is_open'];

export const EVENT_START_DATE = '20230101';
export const EVENT_END_DATE = '20251231';
export const DATA_START_DATE = '20220101';
export const DATA_END_DATE = '20260131';
export const ILLUSTRATIVE_ROUND_TRIP_COST = 0.002;

export interface EventStudyAsset {
  tsCode: string;
  name: string;
  industry: string;
}

export const EVENT_STUDY_UNIVERSE: readonly EventStudyAsset[] = Object.freeze(
  HISTORICAL_CASES.map(({ tsCode, name, industry }) => Object.freeze({ tsCode, name, industry })),
);

export type HorizonKey = 't1' | 't2' | 't3' | 't5';

const HORIZONS: ReadonlyArray<{ key: HorizonKey; sessions: number }> = [
  { key: 't1', sessions: 1 },
  { key: 't2', sessions: 2 },
  { key: 't3', sessions: 3 },
  { key: 't5', sessions: 5 },
];

const SIGNAL_ORDER: SignalName[] = [
  'BUY_NEW',
  'SELL_J_TURN_ABOVE_80',
  'SELL_TOUCH_UPPER',
  'SELL_J_CROSS_100',
  'SELL_POST_BUY_TURN',
  'WEEKLY_BUY_LOWER',
  'WEEKLY_SELL_UPPER',
];

export interface SignalEventOutcome {
  tsCode: string;
  name: string;
  signal: SignalName;
  side: 'buy' | 'sell';
  signalDate: string;
  executionDate: string | null;
  executionOpen: number | null;
  returns: Record<HorizonKey, number | null>;
}

export interface HorizonAggregate {
  sampleSize: number;
  meanUnderlyingReturn: number | null;
  medianUnderlyingReturn: number | null;
  meanDirectionalReturn: number | null;
  directionConsistency: number | null;
}

export interface SignalAggregate {
  signal: SignalName;
  side: 'buy' | 'sell';
  eventCount: number;
  horizons: Record<HorizonKey, HorizonAggregate>;
}

export interface V0PositionTrade {
  tsCode: string;
  name: string;
  entrySignalDate: string;
  exitSignalDate: string;
  entryExecutionDate: string;
  exitExecutionDate: string;
  entryOpen: number;
  exitOpen: number;
  holdingSessions: number;
  grossReturn: number;
  netReturn20Bps: number;
  exitSignal: SignalName;
}

export interface TradeAggregate {
  tradeCount: number;
  winRate: number | null;
  averageGrossReturn: number | null;
  medianGrossReturn: number | null;
  averageNetReturn20Bps: number | null;
  averageHoldingSessions: number | null;
}

export interface V0EventStudyResult {
  universe: readonly EventStudyAsset[];
  signalEvents: readonly SignalEventOutcome[];
  signalAggregates: readonly SignalAggregate[];
  trades: readonly V0PositionTrade[];
  overallTrades: TradeAggregate;
  tradesByAsset: ReadonlyArray<{ asset: EventStudyAsset; aggregate: TradeAggregate }>;
  errors: ReadonlyArray<{ tsCode: string; message: string }>;
}

function rowDate(row: TushareRow, field: 'trade_date' | 'cal_date'): string | null {
  const value = row[field];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function openSessionDates(rows: TushareRow[]): string[] {
  return [...new Set(rows.flatMap((row) => {
    const date = rowDate(row, 'cal_date');
    return date && String(row.is_open) === '1' ? [date] : [];
  }))].sort();
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentageReturn(value: number, reference: number): number | null {
  return reference === 0 ? null : value / reference - 1;
}

function nextSessionIndex(openDates: readonly string[], date: string): number {
  return openDates.findIndex((candidate) => candidate > date);
}

function emptyReturns(): Record<HorizonKey, number | null> {
  return { t1: null, t2: null, t3: null, t5: null };
}

/**
 * A signal is known only after its bar closes. The executable reference is the
 * next exchange session's stock open; T+N is that Nth session's close.
 */
export function evaluateSignalEvents(
  asset: EventStudyAsset,
  signals: readonly TechnicalSignal[],
  candles: readonly Candle[],
  openDates: readonly string[],
): SignalEventOutcome[] {
  const candleByDate = new Map(candles.map((candle) => [candle.date, candle]));
  return signals
    .filter((signal) => signal.date >= EVENT_START_DATE && signal.date <= EVENT_END_DATE && !signal.partial)
    .map((signal) => {
      const startIndex = nextSessionIndex(openDates, signal.date);
      const executionDate = startIndex >= 0 ? openDates[startIndex] : null;
      const executionCandle = executionDate ? candleByDate.get(executionDate) : undefined;
      const returns = emptyReturns();
      if (startIndex >= 0 && executionCandle) {
        for (const horizon of HORIZONS) {
          const exitDate = openDates[startIndex + horizon.sessions - 1];
          const exitCandle = exitDate ? candleByDate.get(exitDate) : undefined;
          returns[horizon.key] = exitCandle
            ? percentageReturn(exitCandle.close, executionCandle.open)
            : null;
        }
      }
      return {
        tsCode: asset.tsCode,
        name: asset.name,
        signal: signal.name,
        side: signal.side,
        signalDate: signal.date,
        executionDate,
        executionOpen: executionCandle?.open ?? null,
        returns,
      };
    });
}

function aggregateHorizon(
  events: readonly SignalEventOutcome[],
  side: SignalEventOutcome['side'],
  key: HorizonKey,
): HorizonAggregate {
  const values = events.flatMap((event) => event.returns[key] === null ? [] : [event.returns[key] as number]);
  const directional = values.map((value) => side === 'buy' ? value : -value);
  return {
    sampleSize: values.length,
    meanUnderlyingReturn: mean(values),
    medianUnderlyingReturn: median(values),
    meanDirectionalReturn: mean(directional),
    directionConsistency: directional.length === 0
      ? null
      : directional.filter((value) => value > 0).length / directional.length,
  };
}

export function aggregateSignalEvents(events: readonly SignalEventOutcome[]): SignalAggregate[] {
  return SIGNAL_ORDER.flatMap((signal): SignalAggregate[] => {
    const matching = events.filter((event) => event.signal === signal);
    if (matching.length === 0) return [];
    const side = matching[0].side;
    return [{
      signal,
      side,
      eventCount: matching.length,
      horizons: Object.fromEntries(HORIZONS.map(({ key }) => [
        key,
        aggregateHorizon(matching, side, key),
      ])) as Record<HorizonKey, HorizonAggregate>,
    }];
  });
}

export function buildV0PositionTrades(
  asset: EventStudyAsset,
  dailySignals: readonly TechnicalSignal[],
  candles: readonly Candle[],
  openDates: readonly string[],
): V0PositionTrade[] {
  const studySignals = dailySignals.filter((signal) =>
    signal.date >= EVENT_START_DATE && signal.date <= EVENT_END_DATE,
  );
  const events = interpretPositionEvents([...studySignals]);
  const candleByDate = new Map(candles.map((candle) => [candle.date, candle]));
  const trades: V0PositionTrade[] = [];

  for (let index = 0; index + 1 < events.length; index++) {
    const entry = events[index];
    const exit = events[index + 1];
    if (entry.action !== 'open' || exit.action !== 'close') continue;
    const entryIndex = nextSessionIndex(openDates, entry.date);
    const exitIndex = nextSessionIndex(openDates, exit.date);
    if (entryIndex < 0 || exitIndex < 0 || exitIndex <= entryIndex) continue;
    const entryExecutionDate = openDates[entryIndex];
    const exitExecutionDate = openDates[exitIndex];
    const entryCandle = candleByDate.get(entryExecutionDate);
    const exitCandle = candleByDate.get(exitExecutionDate);
    if (!entryCandle || !exitCandle) continue;
    const grossReturn = percentageReturn(exitCandle.open, entryCandle.open);
    if (grossReturn === null) continue;
    trades.push({
      tsCode: asset.tsCode,
      name: asset.name,
      entrySignalDate: entry.date,
      exitSignalDate: exit.date,
      entryExecutionDate,
      exitExecutionDate,
      entryOpen: entryCandle.open,
      exitOpen: exitCandle.open,
      holdingSessions: exitIndex - entryIndex,
      grossReturn,
      netReturn20Bps: grossReturn - ILLUSTRATIVE_ROUND_TRIP_COST,
      exitSignal: exit.signal as SignalName,
    });
    index++;
  }
  return trades;
}

export function aggregateTrades(trades: readonly V0PositionTrade[]): TradeAggregate {
  const gross = trades.map((trade) => trade.grossReturn);
  return {
    tradeCount: trades.length,
    winRate: trades.length === 0 ? null : trades.filter((trade) => trade.grossReturn > 0).length / trades.length,
    averageGrossReturn: mean(gross),
    medianGrossReturn: median(gross),
    averageNetReturn20Bps: mean(trades.map((trade) => trade.netReturn20Bps)),
    averageHoldingSessions: mean(trades.map((trade) => trade.holdingSessions)),
  };
}

async function collectAssetStudy(
  client: TushareClient,
  asset: EventStudyAsset,
  openDates: readonly string[],
): Promise<{ signalEvents: SignalEventOutcome[]; trades: V0PositionTrade[] }> {
  const params = { ts_code: asset.tsCode, start_date: DATA_START_DATE, end_date: DATA_END_DATE };
  const [dailyRows, factorRows] = await Promise.all([
    client.call('daily', params, DAILY_FIELDS),
    client.call('adj_factor', params, FACTOR_FIELDS),
  ]);
  const normalized = normalizeDailyRows(asset.tsCode, dailyRows, 'qfq', factorRows);
  if (normalized.missingFactorDates.length > 0 || normalized.rejectedRows > 0) {
    throw new Error(
      `qfq normalization incomplete: missing_factors=${normalized.missingFactorDates.length}, rejected=${normalized.rejectedRows}`,
    );
  }
  const candles = normalized.candles;
  if (candles.length < 120) throw new Error(`Need at least 120 candles; received ${candles.length}.`);

  const dailyIndicators = calculateIndicators(candles);
  const dailySignals = evaluateDailySignals(candles, dailyIndicators.kdj, dailyIndicators.boll);
  const weekly = aggregateWeeklyCandles(candles, DATA_END_DATE, true);
  const weeklyIndicators = calculateIndicators(weekly);
  const weeklySignals = evaluateWeeklySignals(weekly, weeklyIndicators.boll);
  const signalEvents = evaluateSignalEvents(
    asset,
    [...dailySignals, ...weeklySignals],
    candles,
    openDates,
  );
  const trades = buildV0PositionTrades(asset, dailySignals, candles, openDates);
  return { signalEvents, trades };
}

export async function runV0EventStudy(
  client: TushareClient,
  universe: readonly EventStudyAsset[] = EVENT_STUDY_UNIVERSE,
): Promise<V0EventStudyResult> {
  const calendarRows = await client.call('trade_cal', {
    exchange: 'SSE',
    start_date: DATA_START_DATE,
    end_date: DATA_END_DATE,
    is_open: '1',
  }, TRADE_CAL_FIELDS);
  const openDates = openSessionDates(calendarRows);
  const signalEvents: SignalEventOutcome[] = [];
  const trades: V0PositionTrade[] = [];
  const errors: Array<{ tsCode: string; message: string }> = [];

  for (const asset of universe) {
    try {
      const result = await collectAssetStudy(client, asset, openDates);
      signalEvents.push(...result.signalEvents);
      trades.push(...result.trades);
    } catch (error) {
      errors.push({
        tsCode: asset.tsCode,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    universe: Object.freeze(universe.map((asset) => Object.freeze({ ...asset }))),
    signalEvents: Object.freeze(signalEvents),
    signalAggregates: Object.freeze(aggregateSignalEvents(signalEvents)),
    trades: Object.freeze(trades),
    overallTrades: aggregateTrades(trades),
    tradesByAsset: universe.map((asset) => ({
      asset,
      aggregate: aggregateTrades(trades.filter((trade) => trade.tsCode === asset.tsCode)),
    })),
    errors: Object.freeze(errors),
  };
}

function percentage(value: number | null): string {
  return value === null ? '不可用' : `${(value * 100).toFixed(2)}%`;
}

function number(value: number | null): string {
  return value === null ? '不可用' : value.toFixed(2);
}

function horizonCell(aggregate: HorizonAggregate): string {
  if (aggregate.sampleSize === 0) return '不可用';
  return `${percentage(aggregate.meanDirectionalReturn)} / ${percentage(aggregate.directionConsistency)} (n=${aggregate.sampleSize})`;
}

function tradeRow(label: string, aggregate: TradeAggregate): string {
  return [
    label,
    String(aggregate.tradeCount),
    percentage(aggregate.winRate),
    percentage(aggregate.averageGrossReturn),
    percentage(aggregate.medianGrossReturn),
    percentage(aggregate.averageNetReturn20Bps),
    number(aggregate.averageHoldingSessions),
  ].join(' | ');
}

export function formatV0EventStudyReport(result: V0EventStudyResult): string {
  const signalRows = result.signalAggregates.map((aggregate) => [
    aggregate.signal,
    aggregate.side,
    String(aggregate.eventCount),
    horizonCell(aggregate.horizons.t1),
    horizonCell(aggregate.horizons.t2),
    horizonCell(aggregate.horizons.t3),
    horizonCell(aggregate.horizons.t5),
  ].join(' | '));
  const tradeRows = [
    tradeRow('全部', result.overallTrades),
    ...result.tradesByAsset.map(({ asset, aggregate }) => tradeRow(`${asset.name} ${asset.tsCode}`, aggregate)),
  ];
  const errorLines = result.errors.map((error) => `- ${error.tsCode}: ${error.message}`);

  return [
    '# V0事件驱动短周期历史研究',
    '',
    `> 股票池在取数前固定为8只股票，事件窗口固定为 ${EVENT_START_DATE}–${EVENT_END_DATE}。信号在T日收盘确认，统一使用下一交易日开盘作为执行参考，再观察T+1、T+2、T+3、T+5收盘。`,
    '',
    '> “方向化均值”将买方条件的标的收益保持原符号，将卖方条件取反，因此正值表示与V0原始方向一致。方向一致率只统计正负，不代表可交易收益。',
    '',
    '## 原始V0条件事件',
    '',
    'V0条件 | 原始方向 | 事件数 | T+1方向化均值/一致率 | T+2方向化均值/一致率 | T+3方向化均值/一致率 | T+5方向化均值/一致率',
    '--- | --- | ---: | ---: | ---: | ---: | ---:',
    ...signalRows,
    '',
    '## Baseline V0配对交易',
    '',
    '> 配对规则沿用内部V0状态机：空状态遇到BUY_NEW建立参考，之后遇到首个日线卖方条件结束。进出均使用信号确认后的下一交易日开盘。20bps仅为统一敏感性假设，不代表真实佣金、印花税或滑点。',
    '',
    '范围 | 交易数 | 毛胜率 | 平均毛收益 | 毛收益中位数 | 扣20bps后平均 | 平均持有交易日',
    '--- | ---: | ---: | ---: | ---: | ---: | ---:',
    ...tradeRows,
    ...(errorLines.length > 0 ? ['', '## 数据错误', '', ...errorLines] : []),
    '',
    '## 边界',
    '',
    '- 同一条件的连续触发会形成相关事件，原始事件数不等于独立样本数。',
    '- 事件研究未扣除基准或行业同期收益，也未模拟涨跌停、停牌成交、最小佣金和滑点。',
    '- qfq用于保持除权前后价格连续；本研究不据此调整或选择V0参数。',
    '- 这是历史条件研究，不构成交易建议或预测能力证明。',
  ].join('\n');
}

export async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    process.stdout.write('# V0事件驱动短周期历史研究\n\n执行失败：未配置 TUSHARE_TOKEN。\n');
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runV0EventStudy(new HttpTushareClient(token));
    process.stdout.write(`${redactSecret(formatV0EventStudyReport(result), token)}\n`);
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), token);
    process.stdout.write(`# V0事件驱动短周期历史研究\n\n执行失败：${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
