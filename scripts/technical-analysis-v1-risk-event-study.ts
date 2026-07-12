import { config as loadDotenv } from 'dotenv';
import {
  extractTrendApplicabilityCandidate,
  rankTrendApplicabilityCandidates,
  type RankedTrendApplicability,
} from '../src/tools/finance/technical-analysis/applicability.js';
import type { PositionEvent } from '../src/tools/finance/technical-analysis/types.js';
import { HttpTushareClient, type TushareClient } from '../src/tools/finance/tushare/client.js';
import { redactSecret } from './technical-analysis-historical-cases.js';
import {
  RISK_STUDY_COHORT,
  calculateRiskForwardOutcome,
  loadRiskStudyDataset,
  type RiskAssetSeries,
  type RiskForwardOutcome,
} from './technical-analysis-v1-risk-case-study.js';

export const RISK_EVENT_START_DATE = '20230101';
export const RISK_EVENT_END_DATE = '20241231';

export type RiskSignal = Extract<PositionEvent['signal'],
  'STRATEGY_STOP_LOSS' | 'STRATEGY_TRAILING_EXIT' | 'STRATEGY_MA20_BREAK_EXIT'>;
export type RiskContext = 'strong' | 'mixed' | 'weak' | 'unavailable';

export interface ExpandedRiskEvent {
  tsCode: string;
  name: string;
  date: string;
  signal: RiskSignal;
  context: RiskContext;
  applicability: RankedTrendApplicability | null;
  outcome: RiskForwardOutcome;
  benchmarkOutcome: RiskForwardOutcome;
}

export interface RiskAggregate {
  eventCount: number;
  t5Mean: number | null;
  t5NegativeRate: number | null;
  t10Mean: number | null;
  t10NegativeRate: number | null;
  t20Mean: number | null;
  t20Median: number | null;
  t20NegativeRate: number | null;
  t20ExcessMean: number | null;
  t20UnderperformRate: number | null;
  drawdown20Mean: number | null;
  drawdown5Rate: number | null;
}

export interface RiskBaseline {
  observationCount: number;
  t20Mean: number | null;
  t20Median: number | null;
  t20NegativeRate: number | null;
  t20ExcessMean: number | null;
  t20UnderperformRate: number | null;
  drawdown20Mean: number | null;
  drawdown5Rate: number | null;
}

export interface ExpandedRiskStudyResult {
  events: ExpandedRiskEvent[];
  overall: RiskAggregate;
  bySignal: Array<{ signal: RiskSignal; aggregate: RiskAggregate }>;
  byContext: Array<{ context: RiskContext; aggregate: RiskAggregate }>;
  byYear: Array<{ year: string; aggregate: RiskAggregate }>;
  byAsset: Array<{ tsCode: string; name: string; aggregate: RiskAggregate }>;
  baseline: RiskBaseline;
  matchedBaseline: RiskBaseline;
  cohortSize: number;
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

function available(values: Array<number | null>): number[] {
  return values.flatMap((value) => value === null ? [] : [value]);
}

function rate(values: number[], predicate: (value: number) => boolean): number | null {
  return values.length === 0 ? null : values.filter(predicate).length / values.length;
}

function excess(stock: number | null, benchmark: number | null): number | null {
  return stock === null || benchmark === null ? null : stock - benchmark;
}

export function aggregateRiskEvents(events: readonly ExpandedRiskEvent[]): RiskAggregate {
  const t5 = available(events.map((event) => event.outcome.t5));
  const t10 = available(events.map((event) => event.outcome.t10));
  const t20 = available(events.map((event) => event.outcome.t20));
  const t20Excess = available(events.map((event) => excess(event.outcome.t20, event.benchmarkOutcome.t20)));
  const drawdowns = available(events.map((event) => event.outcome.maximumClosingDrawdown20));
  return {
    eventCount: events.length,
    t5Mean: mean(t5),
    t5NegativeRate: rate(t5, (value) => value < 0),
    t10Mean: mean(t10),
    t10NegativeRate: rate(t10, (value) => value < 0),
    t20Mean: mean(t20),
    t20Median: median(t20),
    t20NegativeRate: rate(t20, (value) => value < 0),
    t20ExcessMean: mean(t20Excess),
    t20UnderperformRate: rate(t20Excess, (value) => value < 0),
    drawdown20Mean: mean(drawdowns),
    drawdown5Rate: rate(drawdowns, (value) => value <= -0.05),
  };
}

export function riskContext(applicability: RankedTrendApplicability | null): RiskContext {
  if (!applicability
    || applicability.decision === 'insufficient_data'
    || applicability.decision === 'insufficient_cohort') return 'unavailable';
  if (applicability.decision === 'execute') return 'strong';
  if (applicability.decision === 'watch') return 'mixed';
  return 'weak';
}

function riskEvents(series: RiskAssetSeries): PositionEvent[] {
  return series.events.filter((event) =>
    event.action === 'close'
      && event.date >= RISK_EVENT_START_DATE
      && event.date <= RISK_EVENT_END_DATE,
  );
}

function rankingsAtDate(
  date: string,
  series: readonly RiskAssetSeries[],
  benchmarkCandles: Parameters<typeof extractTrendApplicabilityCandidate>[2],
): RankedTrendApplicability[] {
  const candidates = series.flatMap((item) => {
    const index = item.candles.findIndex((candle) => candle.date === date);
    return index < 0 ? [] : [extractTrendApplicabilityCandidate(
      item.candles, item.indicators, benchmarkCandles, index,
    )];
  });
  return rankTrendApplicabilityCandidates(candidates);
}

function baselineObservations(
  series: readonly RiskAssetSeries[],
  openDates: readonly string[],
  benchmarkCandles: Parameters<typeof calculateRiskForwardOutcome>[0],
  excludedDates: ReadonlySet<string>,
): ExpandedRiskEvent[] {
  return series.flatMap((item) => item.candles
    .filter((candle) => candle.date >= RISK_EVENT_START_DATE
      && candle.date <= RISK_EVENT_END_DATE
      && !excludedDates.has(`${item.asset.tsCode}:${candle.date}`))
    .map((candle): ExpandedRiskEvent => ({
      tsCode: item.asset.tsCode,
      name: item.asset.name,
      date: candle.date,
      signal: 'STRATEGY_MA20_BREAK_EXIT',
      context: 'unavailable',
      applicability: null,
      outcome: calculateRiskForwardOutcome(item.candles, candle.date, openDates),
      benchmarkOutcome: calculateRiskForwardOutcome(benchmarkCandles, candle.date, openDates),
    })));
}

function toBaseline(events: ExpandedRiskEvent[]): RiskBaseline {
  const aggregate = aggregateRiskEvents(events);
  return {
    observationCount: events.filter((event) => event.outcome.t20 !== null).length,
    t20Mean: aggregate.t20Mean,
    t20Median: aggregate.t20Median,
    t20NegativeRate: aggregate.t20NegativeRate,
    t20ExcessMean: aggregate.t20ExcessMean,
    t20UnderperformRate: aggregate.t20UnderperformRate,
    drawdown20Mean: aggregate.drawdown20Mean,
    drawdown5Rate: aggregate.drawdown5Rate,
  };
}

function matchedBaselineForEvents(
  events: readonly ExpandedRiskEvent[],
  baselineEvents: readonly ExpandedRiskEvent[],
): RiskBaseline {
  const strata = events.map((event) => aggregateRiskEvents(baselineEvents.filter((candidate) =>
    candidate.tsCode === event.tsCode && candidate.date.slice(0, 4) === event.date.slice(0, 4),
  )));
  return {
    observationCount: strata.filter((item) => item.t20Mean !== null).length,
    t20Mean: mean(available(strata.map((item) => item.t20Mean))),
    t20Median: mean(available(strata.map((item) => item.t20Median))),
    t20NegativeRate: mean(available(strata.map((item) => item.t20NegativeRate))),
    t20ExcessMean: mean(available(strata.map((item) => item.t20ExcessMean))),
    t20UnderperformRate: mean(available(strata.map((item) => item.t20UnderperformRate))),
    drawdown20Mean: mean(available(strata.map((item) => item.drawdown20Mean))),
    drawdown5Rate: mean(available(strata.map((item) => item.drawdown5Rate))),
  };
}

export async function runExpandedRiskEventStudy(client: TushareClient): Promise<ExpandedRiskStudyResult> {
  const { series, openDates, benchmarkCandles } = await loadRiskStudyDataset(client);
  const dates = [...new Set(series.flatMap((item) => riskEvents(item).map((event) => event.date)))];
  const rankings = new Map(dates.map((date) => [date, rankingsAtDate(date, series, benchmarkCandles)]));
  const events = series.flatMap((item) => riskEvents(item).map((event): ExpandedRiskEvent => {
    const applicability = rankings.get(event.date)?.find((candidate) => candidate.symbol === item.asset.tsCode) ?? null;
    return {
      tsCode: item.asset.tsCode,
      name: item.asset.name,
      date: event.date,
      signal: event.signal as RiskSignal,
      context: riskContext(applicability),
      applicability,
      outcome: calculateRiskForwardOutcome(item.candles, event.date, openDates),
      benchmarkOutcome: calculateRiskForwardOutcome(benchmarkCandles, event.date, openDates),
    };
  }));
  const signalOrder: RiskSignal[] = [
    'STRATEGY_MA20_BREAK_EXIT', 'STRATEGY_STOP_LOSS', 'STRATEGY_TRAILING_EXIT',
  ];
  const contextOrder: RiskContext[] = ['weak', 'mixed', 'strong', 'unavailable'];
  const excludedDates = new Set(events.map((event) => `${event.tsCode}:${event.date}`));
  const baselineEvents = baselineObservations(series, openDates, benchmarkCandles, excludedDates);
  return {
    events,
    overall: aggregateRiskEvents(events),
    bySignal: signalOrder.map((signal) => ({
      signal,
      aggregate: aggregateRiskEvents(events.filter((event) => event.signal === signal)),
    })),
    byContext: contextOrder.map((context) => ({
      context,
      aggregate: aggregateRiskEvents(events.filter((event) => event.context === context)),
    })),
    byYear: ['2023', '2024'].map((year) => ({
      year,
      aggregate: aggregateRiskEvents(events.filter((event) => event.date.startsWith(year))),
    })),
    byAsset: RISK_STUDY_COHORT.map((asset) => ({
      tsCode: asset.tsCode,
      name: asset.name,
      aggregate: aggregateRiskEvents(events.filter((event) => event.tsCode === asset.tsCode)),
    })),
    baseline: toBaseline(baselineEvents),
    matchedBaseline: matchedBaselineForEvents(events, baselineEvents),
    cohortSize: RISK_STUDY_COHORT.length,
  };
}

function percent(value: number | null): string {
  return value === null ? '不可用' : `${(value * 100).toFixed(2)}%`;
}

function aggregateRow(label: string, value: RiskAggregate): string {
  return [
    label,
    String(value.eventCount),
    `${percent(value.t5Mean)} / ${percent(value.t5NegativeRate)}`,
    `${percent(value.t10Mean)} / ${percent(value.t10NegativeRate)}`,
    `${percent(value.t20Mean)} / ${percent(value.t20NegativeRate)}`,
    percent(value.t20Median),
    `${percent(value.t20ExcessMean)} / ${percent(value.t20UnderperformRate)}`,
    `${percent(value.drawdown20Mean)} / ${percent(value.drawdown5Rate)}`,
  ].join(' | ');
}

const SIGNAL_LABELS: Record<RiskSignal, string> = {
  STRATEGY_MA20_BREAK_EXIT: '连续两日跌破MA20',
  STRATEGY_STOP_LOSS: '距恢复参考点下跌8%',
  STRATEGY_TRAILING_EXIT: '距阶段高点回撤15%',
};

const CONTEXT_LABELS: Record<RiskContext, string> = {
  weak: 'V2.1背景偏弱',
  mixed: 'V2.1背景混合',
  strong: 'V2.1背景较强',
  unavailable: 'V2.1不可用',
};

export function formatExpandedRiskStudyReport(result: ExpandedRiskStudyResult): string {
  const header = [
    '分组', '事件数', 'T+5均值/下跌率', 'T+10均值/下跌率', 'T+20均值/下跌率',
    'T+20中位数', 'T+20相对均值/跑输率', '20日最大下行均值/跌超5%率',
  ].join(' | ');
  const divider = '--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:';
  const baseline = result.baseline;
  const matched = result.matchedBaseline;
  return [
    '# V1风险事件扩展历史研究',
    '',
    `> 固定${result.cohortSize}只股票，事件窗口 ${RISK_EVENT_START_DATE}–${RISK_EVENT_END_DATE}，纳入全部V1风险事件。T+N均以事件日收盘为基准；V2.1仅作当日背景分组。`,
    '',
    '## 全部事件',
    '',
    header,
    divider,
    aggregateRow('全部V1风险事件', result.overall),
    '',
    '## 按风险类型',
    '',
    header,
    divider,
    ...result.bySignal.map(({ signal, aggregate }) => aggregateRow(SIGNAL_LABELS[signal], aggregate)),
    '',
    '## 按V2.1当日背景',
    '',
    '> V2.1原本用于趋势恢复候选；此处分组只用于检查风险发生时是否仍有相对强度、量能和大盘支持，不能覆盖V1风险事件。',
    '',
    header,
    divider,
    ...result.byContext.map(({ context, aggregate }) => aggregateRow(CONTEXT_LABELS[context], aggregate)),
    '',
    '## 按年份',
    '',
    header,
    divider,
    ...result.byYear.map(({ year, aggregate }) => aggregateRow(year, aggregate)),
    '',
    '## 按股票',
    '',
    header,
    divider,
    ...result.byAsset.map(({ tsCode, name, aggregate }) => aggregateRow(`${name} ${tsCode}`, aggregate)),
    '',
    '## 普通交易日描述性基线',
    '',
    `- 排除V1风险事件日后，具有完整T+20结果的观测数：${baseline.observationCount}。同一股票的相邻日期高度相关，不能视为独立样本。`,
    `- T+20平均 ${percent(baseline.t20Mean)}，中位数 ${percent(baseline.t20Median)}，下跌率 ${percent(baseline.t20NegativeRate)}。`,
    `- T+20相对沪深300平均差 ${percent(baseline.t20ExcessMean)}，跑输率 ${percent(baseline.t20UnderperformRate)}。`,
    `- 20日最大收盘下行平均 ${percent(baseline.drawdown20Mean)}，跌幅达到5%的比例 ${percent(baseline.drawdown5Rate)}。`,
    '',
    '## 同股票同年份匹配基线',
    '',
    `- 为${matched.observationCount}个风险事件分别计算同一股票、同一年普通交易日的基线，再按事件等权汇总。`,
    `- 匹配基线T+20平均 ${percent(matched.t20Mean)}，平均中位数 ${percent(matched.t20Median)}，下跌率 ${percent(matched.t20NegativeRate)}。`,
    `- 匹配基线T+20相对沪深300平均差 ${percent(matched.t20ExcessMean)}，跑输率 ${percent(matched.t20UnderperformRate)}。`,
    `- 匹配基线20日最大收盘下行平均 ${percent(matched.drawdown20Mean)}，跌幅达到5%的比例 ${percent(matched.drawdown5Rate)}。`,
    '',
    '## 边界',
    '',
    '- 这是历史事件研究，不是交易策略回测，不包含成交、费用、涨跌停或仓位假设。',
    '- 同一股票不同事件及普通交易日基线存在时间相关性；事件数不等于完全独立样本数。',
    '- 固定22股仍是有限样本，结果不能直接外推到全部A股或解释为概率承诺。',
    '- 所有结论只适合作为中性技术风险提醒，不构成买卖建议。',
  ].join('\n');
}

export async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    process.stdout.write('# V1风险事件扩展历史研究\n\n执行失败：未配置 TUSHARE_TOKEN。\n');
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runExpandedRiskEventStudy(new HttpTushareClient(token));
    process.stdout.write(`${redactSecret(formatExpandedRiskStudyReport(result), token)}\n`);
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), token);
    process.stdout.write(`# V1风险事件扩展历史研究\n\n执行失败：${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
