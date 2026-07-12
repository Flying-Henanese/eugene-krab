import { config as loadDotenv } from 'dotenv';
import type { PositionEvent } from '../src/tools/finance/technical-analysis/types.js';
import { HttpTushareClient, type TushareClient } from '../src/tools/finance/tushare/client.js';
import { redactSecret } from './technical-analysis-historical-cases.js';
import {
  RISK_STUDY_COHORT,
  calculateRiskForwardOutcome,
  loadRiskStudyDataset,
  type RiskAssetSeries,
} from './technical-analysis-v1-risk-case-study.js';

export const STATE_STUDY_START_DATE = '20230101';
export const STATE_STUDY_END_DATE = '20241231';

export interface StateForwardStudyOptions {
  studyStartDate?: string;
  studyEndDate?: string;
  dataStartDate?: string;
  dataEndDate?: string;
}

export type PublicTrendState = 'upward_alignment' | 'downward_alignment' | 'mixed';
export type Horizon = 't5' | 't10' | 't20';

const HORIZONS: ReadonlyArray<{ key: Horizon; sessions: number }> = [
  { key: 't5', sessions: 5 },
  { key: 't10', sessions: 10 },
  { key: 't20', sessions: 20 },
];

export interface StateSnapshot {
  tsCode: string;
  name: string;
  date: string;
  state: PublicTrendState;
  futureReturns: Record<Horizon, number | null>;
  futureExcessReturns: Record<Horizon, number | null>;
  futureStates: Record<Horizon, PublicTrendState | null>;
}

export interface HorizonStateAggregate {
  sampleSize: number;
  meanReturn: number | null;
  medianReturn: number | null;
  meanExcessReturn: number | null;
  positiveRate: number | null;
  directionalMatchRate: number | null;
  relativeDirectionalMatchRate: number | null;
  statePersistenceRate: number | null;
}

export interface StateAggregate {
  state: PublicTrendState;
  snapshotCount: number;
  horizons: Record<Horizon, HorizonStateAggregate>;
}

export type StructureEventType = 'trend_recovery_observed' | 'trend_recovery_condition_ended';

export interface StructureEventOutcome {
  tsCode: string;
  name: string;
  date: string;
  type: StructureEventType;
  returns: Record<Horizon, number | null>;
  conditionPersists: Record<Horizon, boolean | null>;
}

export interface StructureEventAggregate {
  type: StructureEventType;
  eventCount: number;
  horizons: Record<Horizon, {
    sampleSize: number;
    meanReturn: number | null;
    positiveRate: number | null;
    conditionPersistenceRate: number | null;
  }>;
}

export interface StateForwardStudyResult {
  snapshots: StateSnapshot[];
  stateAggregates: StateAggregate[];
  stateAggregatesByYear: Array<{ year: string; aggregates: StateAggregate[] }>;
  structureEvents: StructureEventOutcome[];
  structureAggregates: StructureEventAggregate[];
  cohortSize: number;
  scheduledMonthEnds: number;
  studyStartDate: string;
  studyEndDate: string;
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

function rate(values: boolean[]): number | null {
  return values.length === 0 ? null : values.filter(Boolean).length / values.length;
}

function available(values: Array<number | null>): number[] {
  return values.flatMap((value) => value === null ? [] : [value]);
}

function emptyHorizons<T>(value: T): Record<Horizon, T> {
  return { t5: value, t10: value, t20: value };
}

export function monthEndSessions(
  openDates: readonly string[],
  startDate = STATE_STUDY_START_DATE,
  endDate = STATE_STUDY_END_DATE,
): string[] {
  const byMonth = new Map<string, string>();
  for (const date of openDates) {
    if (date < startDate || date > endDate) continue;
    byMonth.set(date.slice(0, 6), date);
  }
  return [...byMonth.values()].sort();
}

export function technicalStateAt(series: RiskAssetSeries, date: string): PublicTrendState | null {
  const index = series.candles.findIndex((candle) => candle.date === date);
  if (index < 0) return null;
  const close = series.candles[index].close;
  const ma5 = series.indicators.ma5[index];
  const ma10 = series.indicators.ma10[index];
  const ma20 = series.indicators.ma20[index];
  const ma60 = series.indicators.ma60[index];
  if (ma5 === null || ma10 === null || ma20 === null || ma60 === null) return null;
  if (close > ma20 && ma20 > ma60 && ma5 > ma10) return 'upward_alignment';
  if (close < ma20 && ma20 < ma60 && ma5 < ma10) return 'downward_alignment';
  return 'mixed';
}

function horizonDate(openDates: readonly string[], date: string, sessions: number): string | null {
  const index = openDates.findIndex((candidate) => candidate > date);
  return index < 0 ? null : openDates[index + sessions - 1] ?? null;
}

function snapshotForDate(
  series: RiskAssetSeries,
  date: string,
  openDates: readonly string[],
  benchmarkCandles: Parameters<typeof calculateRiskForwardOutcome>[0],
): StateSnapshot | null {
  const state = technicalStateAt(series, date);
  if (!state) return null;
  const stock = calculateRiskForwardOutcome(series.candles, date, openDates);
  const benchmark = calculateRiskForwardOutcome(benchmarkCandles, date, openDates);
  const futureReturns = { t5: stock.t5, t10: stock.t10, t20: stock.t20 };
  const futureExcessReturns = Object.fromEntries(HORIZONS.map(({ key }) => [
    key,
    futureReturns[key] === null || benchmark[key] === null
      ? null : futureReturns[key]! - benchmark[key]!,
  ])) as Record<Horizon, number | null>;
  const futureStates = Object.fromEntries(HORIZONS.map(({ key, sessions }) => {
    const futureDate = horizonDate(openDates, date, sessions);
    return [key, futureDate ? technicalStateAt(series, futureDate) : null];
  })) as Record<Horizon, PublicTrendState | null>;
  return { tsCode: series.asset.tsCode, name: series.asset.name, date, state, futureReturns, futureExcessReturns, futureStates };
}

function directionalMatch(state: PublicTrendState, value: number): boolean | null {
  if (state === 'upward_alignment') return value > 0;
  if (state === 'downward_alignment') return value < 0;
  return null;
}

function aggregateState(state: PublicTrendState, snapshots: readonly StateSnapshot[]): StateAggregate {
  const matching = snapshots.filter((snapshot) => snapshot.state === state);
  const horizons = Object.fromEntries(HORIZONS.map(({ key }) => {
    const returns = available(matching.map((snapshot) => snapshot.futureReturns[key]));
    const excessReturns = available(matching.map((snapshot) => snapshot.futureExcessReturns[key]));
    const directional = matching.flatMap((snapshot) => {
      const value = snapshot.futureReturns[key];
      const match = value === null ? null : directionalMatch(state, value);
      return match === null ? [] : [match];
    });
    const relativeDirectional = matching.flatMap((snapshot) => {
      const value = snapshot.futureExcessReturns[key];
      const match = value === null ? null : directionalMatch(state, value);
      return match === null ? [] : [match];
    });
    const persistence = matching.flatMap((snapshot) =>
      snapshot.futureStates[key] === null ? [] : [snapshot.futureStates[key] === state],
    );
    return [key, {
      sampleSize: returns.length,
      meanReturn: mean(returns),
      medianReturn: median(returns),
      meanExcessReturn: mean(excessReturns),
      positiveRate: rate(returns.map((value) => value > 0)),
      directionalMatchRate: rate(directional),
      relativeDirectionalMatchRate: rate(relativeDirectional),
      statePersistenceRate: rate(persistence),
    }];
  })) as Record<Horizon, HorizonStateAggregate>;
  return { state, snapshotCount: matching.length, horizons };
}

function structureType(event: PositionEvent): StructureEventType | null {
  if (event.signal === 'STRATEGY_TREND_RECOVERY_ENTRY') return 'trend_recovery_observed';
  if (event.signal === 'STRATEGY_MA20_BREAK_EXIT') return 'trend_recovery_condition_ended';
  return null;
}

function ma20Condition(series: RiskAssetSeries, date: string, type: StructureEventType): boolean | null {
  const index = series.candles.findIndex((candle) => candle.date === date);
  if (index < 0) return null;
  const ma20 = series.indicators.ma20[index];
  if (ma20 === null) return null;
  return type === 'trend_recovery_observed'
    ? series.candles[index].close > ma20
    : series.candles[index].close < ma20;
}

function collectStructureEvents(
  series: RiskAssetSeries,
  openDates: readonly string[],
  startDate: string,
  endDate: string,
): StructureEventOutcome[] {
  return series.events.flatMap((event): StructureEventOutcome[] => {
    const type = structureType(event);
    if (!type || event.date < startDate || event.date > endDate) return [];
    const outcome = calculateRiskForwardOutcome(series.candles, event.date, openDates);
    const returns = { t5: outcome.t5, t10: outcome.t10, t20: outcome.t20 };
    const conditionPersists = Object.fromEntries(HORIZONS.map(({ key, sessions }) => {
      const date = horizonDate(openDates, event.date, sessions);
      return [key, date ? ma20Condition(series, date, type) : null];
    })) as Record<Horizon, boolean | null>;
    return [{ tsCode: series.asset.tsCode, name: series.asset.name, date: event.date, type, returns, conditionPersists }];
  });
}

function aggregateStructure(
  type: StructureEventType,
  events: readonly StructureEventOutcome[],
): StructureEventAggregate {
  const matching = events.filter((event) => event.type === type);
  const horizons = Object.fromEntries(HORIZONS.map(({ key }) => {
    const returns = available(matching.map((event) => event.returns[key]));
    const persistence = matching.flatMap((event) =>
      event.conditionPersists[key] === null ? [] : [event.conditionPersists[key]!],
    );
    return [key, {
      sampleSize: returns.length,
      meanReturn: mean(returns),
      positiveRate: rate(returns.map((value) => value > 0)),
      conditionPersistenceRate: rate(persistence),
    }];
  })) as StructureEventAggregate['horizons'];
  return { type, eventCount: matching.length, horizons };
}

function studyYears(startDate: string, endDate: string): string[] {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => String(startYear + index));
}

export async function runStateForwardStudy(
  client: TushareClient,
  options: StateForwardStudyOptions = {},
): Promise<StateForwardStudyResult> {
  const studyStartDate = options.studyStartDate ?? STATE_STUDY_START_DATE;
  const studyEndDate = options.studyEndDate ?? STATE_STUDY_END_DATE;
  const { series, openDates, benchmarkCandles } = await loadRiskStudyDataset(client, {
    dataStartDate: options.dataStartDate,
    dataEndDate: options.dataEndDate,
  });
  const scheduled = monthEndSessions(openDates, studyStartDate, studyEndDate);
  const snapshots = series.flatMap((item) => scheduled.flatMap((date) => {
    const snapshot = snapshotForDate(item, date, openDates, benchmarkCandles);
    return snapshot ? [snapshot] : [];
  }));
  const states: PublicTrendState[] = ['upward_alignment', 'downward_alignment', 'mixed'];
  const structureEvents = series.flatMap((item) => collectStructureEvents(
    item,
    openDates,
    studyStartDate,
    studyEndDate,
  ));
  const structureTypes: StructureEventType[] = [
    'trend_recovery_observed', 'trend_recovery_condition_ended',
  ];
  return {
    snapshots,
    stateAggregates: states.map((state) => aggregateState(state, snapshots)),
    stateAggregatesByYear: studyYears(studyStartDate, studyEndDate).map((year) => ({
      year,
      aggregates: states.map((state) => aggregateState(
        state,
        snapshots.filter((snapshot) => snapshot.date.startsWith(year)),
      )),
    })),
    structureEvents,
    structureAggregates: structureTypes.map((type) => aggregateStructure(type, structureEvents)),
    cohortSize: RISK_STUDY_COHORT.length,
    scheduledMonthEnds: scheduled.length,
    studyStartDate,
    studyEndDate,
  };
}

function percent(value: number | null): string {
  return value === null ? '不适用' : `${(value * 100).toFixed(2)}%`;
}

function stateRow(value: StateAggregate, key: Horizon): string {
  const horizon = value.horizons[key];
  return [
    value.state,
    key.toUpperCase(),
    String(horizon.sampleSize),
    percent(horizon.meanReturn),
    percent(horizon.medianReturn),
    percent(horizon.meanExcessReturn),
    percent(horizon.positiveRate),
    percent(horizon.directionalMatchRate),
    percent(horizon.relativeDirectionalMatchRate),
    percent(horizon.statePersistenceRate),
  ].join(' | ');
}

function structureRow(value: StructureEventAggregate, key: Horizon): string {
  const horizon = value.horizons[key];
  return [
    value.type,
    key.toUpperCase(),
    String(horizon.sampleSize),
    percent(horizon.meanReturn),
    percent(horizon.positiveRate),
    percent(horizon.conditionPersistenceRate),
  ].join(' | ');
}

export function formatStateForwardStudyReport(result: StateForwardStudyResult): string {
  return [
    '# 技术状态与后续趋势历史匹配研究',
    '',
    `> 固定${result.cohortSize}只股票，在${result.scheduledMonthEnds}个${result.studyStartDate}—${result.studyEndDate}月末交易日机械取样，共形成${result.snapshots.length}个技术状态快照。所有状态只使用快照日及以前数据。`,
    '',
    '> 方向匹配定义：向上排列对应后续收益为正，向下排列对应后续收益为负；mixed不计算方向匹配。相对方向匹配使用同期沪深300超额收益。状态延续表示未来仍属于同一均线排列类别。',
    '',
    '## 月末技术状态',
    '',
    '状态 | 周期 | 样本 | 平均收益 | 中位收益 | 平均超额 | 正收益率 | 方向匹配率 | 相对方向匹配率 | 状态延续率',
    '--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:',
    ...result.stateAggregates.flatMap((aggregate) => HORIZONS.map(({ key }) => stateRow(aggregate, key))),
    '',
    '## 按年份稳定性',
    '',
    '年份 | 状态 | 周期 | 样本 | 平均收益 | 平均超额 | 方向匹配率 | 相对方向匹配率',
    '--- | --- | --- | ---: | ---: | ---: | ---: | ---:',
    ...result.stateAggregatesByYear.flatMap(({ year, aggregates }) => aggregates.flatMap((aggregate) =>
      HORIZONS.map(({ key }) => {
        const horizon = aggregate.horizons[key];
        return [
          year,
          aggregate.state,
          key.toUpperCase(),
          String(horizon.sampleSize),
          percent(horizon.meanReturn),
          percent(horizon.meanExcessReturn),
          percent(horizon.directionalMatchRate),
          percent(horizon.relativeDirectionalMatchRate),
        ].join(' | ');
      }),
    )),
    '',
    '## V1结构变化事件',
    '',
    '> 恢复事件的“条件延续”表示未来收盘仍高于当日MA20；恢复结束事件的“条件延续”表示未来收盘仍低于当日MA20。它检查结构描述的持续性，不代表收益预测。',
    '',
    '结构事件 | 周期 | 样本 | 平均收益 | 正收益率 | MA20条件延续率',
    '--- | --- | ---: | ---: | ---: | ---:',
    ...result.structureAggregates.flatMap((aggregate) => HORIZONS.map(({ key }) => structureRow(aggregate, key))),
    '',
    '## 边界',
    '',
    '- 月末快照降低但没有消除时间相关性；同一股票的不同月份不是完全独立样本。',
    '- 本研究检验技术状态与后续趋势的描述性对应关系，不形成买卖规则、收益概率或仓位建议。',
    '- 固定22股和有限观察窗口仍然有限，任何明显差异都需要在未使用股票池与后续年份复核。',
  ].join('\n');
}

export async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    process.stdout.write('# 技术状态与后续趋势历史匹配研究\n\n执行失败：未配置 TUSHARE_TOKEN。\n');
    process.exitCode = 1;
    return;
  }
  try {
    const flags = Object.fromEntries(process.argv.slice(2).flatMap((argument) => {
      const match = argument.match(/^--(start|end|data-start|data-end)=(\d{8})$/);
      return match ? [[match[1], match[2]]] : [];
    }));
    const result = await runStateForwardStudy(new HttpTushareClient(token), {
      studyStartDate: flags.start,
      studyEndDate: flags.end,
      dataStartDate: flags['data-start'],
      dataEndDate: flags['data-end'],
    });
    process.stdout.write(`${redactSecret(formatStateForwardStudyReport(result), token)}\n`);
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), token);
    process.stdout.write(`# 技术状态与后续趋势历史匹配研究\n\n执行失败：${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
