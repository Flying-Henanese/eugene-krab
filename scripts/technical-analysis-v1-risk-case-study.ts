import { config as loadDotenv } from 'dotenv';
import {
  extractTrendApplicabilityCandidate,
  rankTrendApplicabilityCandidates,
  type RankedTrendApplicability,
} from '../src/tools/finance/technical-analysis/applicability.js';
import { normalizeDailyRows } from '../src/tools/finance/technical-analysis/adjustment.js';
import { calculateIndicators } from '../src/tools/finance/technical-analysis/indicators.js';
import { evaluateTrendRecoveryStrategy } from '../src/tools/finance/technical-analysis/strategy.js';
import type { Candle, IndicatorSeries, PositionEvent } from '../src/tools/finance/technical-analysis/types.js';
import {
  HttpTushareClient,
  type TushareClient,
  type TushareRow,
} from '../src/tools/finance/tushare/client.js';
import { redactSecret } from './technical-analysis-historical-cases.js';

const DAILY_FIELDS = ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'pre_close', 'vol', 'amount'];
const FACTOR_FIELDS = ['ts_code', 'trade_date', 'adj_factor'];
const CALENDAR_FIELDS = ['exchange', 'cal_date', 'is_open'];
const DATA_START_DATE = '20220101';
const DATA_END_DATE = '20250228';
const EVENT_START_DATE = '20240101';
const EVENT_END_DATE = '20241231';

export interface RiskStudyAsset {
  tsCode: string;
  name: string;
  industry: string;
}

export const RISK_STUDY_COHORT: readonly RiskStudyAsset[] = Object.freeze([
  { tsCode: '600000.SH', name: '浦发银行', industry: '银行' },
  { tsCode: '601398.SH', name: '工商银行', industry: '银行' },
  { tsCode: '601939.SH', name: '建设银行', industry: '银行' },
  { tsCode: '601288.SH', name: '农业银行', industry: '银行' },
  { tsCode: '601857.SH', name: '中国石油', industry: '能源' },
  { tsCode: '601668.SH', name: '中国建筑', industry: '建筑' },
  { tsCode: '600050.SH', name: '中国联通', industry: '通信' },
  { tsCode: '600276.SH', name: '恒瑞医药', industry: '医药' },
  { tsCode: '600436.SH', name: '片仔癀', industry: '医药' },
  { tsCode: '603259.SH', name: '药明康德', industry: '医药服务' },
  { tsCode: '600690.SH', name: '海尔智家', industry: '家电' },
  { tsCode: '603288.SH', name: '海天味业', industry: '消费' },
  { tsCode: '002714.SZ', name: '牧原股份', industry: '养殖' },
  { tsCode: '300760.SZ', name: '迈瑞医疗', industry: '医疗器械' },
  { tsCode: '002230.SZ', name: '科大讯飞', industry: '软件' },
  { tsCode: '600031.SH', name: '三一重工', industry: '机械' },
  { tsCode: '600660.SH', name: '福耀玻璃', industry: '汽车零部件' },
  { tsCode: '600048.SH', name: '保利发展', industry: '房地产' },
  { tsCode: '002352.SZ', name: '顺丰控股', industry: '物流' },
  { tsCode: '000725.SZ', name: '京东方A', industry: '面板' },
  { tsCode: '000338.SZ', name: '潍柴动力', industry: '汽车零部件' },
  { tsCode: '600019.SH', name: '宝钢股份', industry: '钢铁' },
].map((asset) => Object.freeze(asset)));

export const RISK_CASE_CODES = Object.freeze([
  '600276.SH',
  '600690.SH',
  '002714.SZ',
  '002230.SZ',
  '600048.SH',
  '000725.SZ',
]);

export interface RiskAssetSeries {
  asset: RiskStudyAsset;
  candles: Candle[];
  indicators: IndicatorSeries;
  events: PositionEvent[];
}

export interface RiskStudyDataset {
  series: RiskAssetSeries[];
  openDates: string[];
  benchmarkCandles: Candle[];
}

export interface RiskStudyDataOptions {
  dataStartDate?: string;
  dataEndDate?: string;
}

export interface RiskForwardOutcome {
  t5: number | null;
  t10: number | null;
  t20: number | null;
  maximumClosingGain20: number | null;
  maximumClosingDrawdown20: number | null;
}

export interface RiskHistoricalCase {
  asset: RiskStudyAsset;
  event: PositionEvent;
  close: number;
  ma20: number | null;
  ma60: number | null;
  k: number | null;
  d: number | null;
  applicability: RankedTrendApplicability | null;
  outcome: RiskForwardOutcome;
  benchmarkOutcome: RiskForwardOutcome;
}

export interface RiskCaseStudyResult {
  cases: RiskHistoricalCase[];
  missingCases: Array<{ tsCode: string; reason: string }>;
  cohortSize: number;
}

function rowDate(row: TushareRow, field: 'trade_date' | 'cal_date'): string | null {
  const value = row[field];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function percentageReturn(value: number, reference: number): number | null {
  return reference === 0 ? null : value / reference - 1;
}

export function firstRiskEventInWindow(events: readonly PositionEvent[]): PositionEvent | null {
  return events.find((event) =>
    event.action === 'close' && event.date >= EVENT_START_DATE && event.date <= EVENT_END_DATE,
  ) ?? null;
}

export function calculateRiskForwardOutcome(
  candles: readonly Candle[],
  eventDate: string,
  openDates: readonly string[],
): RiskForwardOutcome {
  const candleByDate = new Map(candles.map((candle) => [candle.date, candle]));
  const reference = candleByDate.get(eventDate);
  const sessions = openDates.filter((date) => date > eventDate).slice(0, 20);
  const returns = sessions.map((date) => {
    const candle = candleByDate.get(date);
    return candle && reference ? percentageReturn(candle.close, reference.close) : null;
  });
  const available = returns.flatMap((value) => value === null ? [] : [value]);
  const at = (session: number): number | null => returns[session - 1] ?? null;
  return {
    t5: at(5),
    t10: at(10),
    t20: at(20),
    maximumClosingGain20: available.length === 0 ? null : Math.max(...available),
    maximumClosingDrawdown20: available.length === 0 ? null : Math.min(...available),
  };
}

async function loadAssetSeries(
  client: TushareClient,
  asset: RiskStudyAsset,
  dataStartDate: string,
  dataEndDate: string,
): Promise<RiskAssetSeries> {
  const params = { ts_code: asset.tsCode, start_date: dataStartDate, end_date: dataEndDate };
  const [dailyRows, factorRows] = await Promise.all([
    client.call('daily', params, DAILY_FIELDS),
    client.call('adj_factor', params, FACTOR_FIELDS),
  ]);
  const normalized = normalizeDailyRows(asset.tsCode, dailyRows, 'qfq', factorRows);
  if (normalized.missingFactorDates.length > 0 || normalized.rejectedRows > 0) {
    throw new Error(`qfq normalization incomplete for ${asset.tsCode}`);
  }
  const indicators = calculateIndicators(normalized.candles);
  return {
    asset,
    candles: normalized.candles,
    indicators,
    events: evaluateTrendRecoveryStrategy(normalized.candles, indicators),
  };
}

function cohortAtDate(
  date: string,
  series: readonly RiskAssetSeries[],
  benchmarkCandles: Candle[],
): RankedTrendApplicability[] {
  const candidates = series.flatMap((item) => {
    const index = item.candles.findIndex((candle) => candle.date === date);
    return index < 0 ? [] : [extractTrendApplicabilityCandidate(
      item.candles,
      item.indicators,
      benchmarkCandles,
      index,
    )];
  });
  return rankTrendApplicabilityCandidates(candidates);
}

export async function loadRiskStudyDataset(
  client: TushareClient,
  options: RiskStudyDataOptions = {},
): Promise<RiskStudyDataset> {
  const dataStartDate = options.dataStartDate ?? DATA_START_DATE;
  const dataEndDate = options.dataEndDate ?? DATA_END_DATE;
  const [calendarRows, benchmarkRows, ...series] = await Promise.all([
    client.call('trade_cal', {
      exchange: 'SSE', start_date: dataStartDate, end_date: dataEndDate, is_open: '1',
    }, CALENDAR_FIELDS),
    client.call('index_daily', {
      ts_code: '000300.SH', start_date: dataStartDate, end_date: dataEndDate,
    }, DAILY_FIELDS),
    ...RISK_STUDY_COHORT.map((asset) => loadAssetSeries(client, asset, dataStartDate, dataEndDate)),
  ]);
  const openDates = calendarRows.flatMap((row) => {
    const date = rowDate(row, 'cal_date');
    return date && String(row.is_open) === '1' ? [date] : [];
  }).sort();
  const benchmarkCandles = normalizeDailyRows('000300.SH', benchmarkRows, 'none').candles;
  return { series, openDates, benchmarkCandles };
}

export async function runRiskCaseStudy(client: TushareClient): Promise<RiskCaseStudyResult> {
  const { series, openDates, benchmarkCandles } = await loadRiskStudyDataset(client);
  const cases: RiskHistoricalCase[] = [];
  const missingCases: Array<{ tsCode: string; reason: string }> = [];

  for (const tsCode of RISK_CASE_CODES) {
    const item = series.find((candidate) => candidate.asset.tsCode === tsCode);
    if (!item) {
      missingCases.push({ tsCode, reason: 'asset data unavailable' });
      continue;
    }
    const event = firstRiskEventInWindow(item.events);
    if (!event) {
      missingCases.push({ tsCode, reason: 'no V1 risk event in 2024' });
      continue;
    }
    const index = item.candles.findIndex((candle) => candle.date === event.date);
    const ranked = cohortAtDate(event.date, series, benchmarkCandles);
    cases.push({
      asset: item.asset,
      event,
      close: item.candles[index].close,
      ma20: item.indicators.ma20[index],
      ma60: item.indicators.ma60[index],
      k: item.indicators.kdj[index].k,
      d: item.indicators.kdj[index].d,
      applicability: ranked.find((candidate) => candidate.symbol === tsCode) ?? null,
      outcome: calculateRiskForwardOutcome(item.candles, event.date, openDates),
      benchmarkOutcome: calculateRiskForwardOutcome(benchmarkCandles, event.date, openDates),
    });
  }
  return { cases, missingCases, cohortSize: RISK_STUDY_COHORT.length };
}

function percent(value: number | null): string {
  return value === null ? '不可用' : `${(value * 100).toFixed(2)}%`;
}

function number(value: number | null): string {
  return value === null ? '不可用' : value.toFixed(2);
}

function signalLabel(signal: PositionEvent['signal']): string {
  if (signal === 'STRATEGY_STOP_LOSS') return '距恢复参考点下跌达到8%';
  if (signal === 'STRATEGY_TRAILING_EXIT') return '距阶段高点回撤达到15%';
  if (signal === 'STRATEGY_MA20_BREAK_EXIT') return '连续两日跌破MA20';
  return signal;
}

function contextLabel(value: RankedTrendApplicability | null): string {
  if (!value) return '不可用';
  const labels = {
    execute: '量价和市场背景较强（不抵消风险）',
    watch: '背景信号混合',
    reject: '量价背景偏弱',
    insufficient_data: '数据不足',
    insufficient_cohort: '横截面不足',
  } as const;
  return `${labels[value.decision]}；相对强度P${number(value.components.relativeStrength)}，量能P${number(value.components.volumeConfirmation)}`;
}

function excess(stock: number | null, benchmark: number | null): number | null {
  return stock === null || benchmark === null ? null : stock - benchmark;
}

function mean(values: Array<number | null>): number | null {
  const available = values.flatMap((value) => value === null ? [] : [value]);
  return available.length === 0
    ? null
    : available.reduce((sum, value) => sum + value, 0) / available.length;
}

function negativeRate(values: Array<number | null>): number | null {
  const available = values.flatMap((value) => value === null ? [] : [value]);
  return available.length === 0
    ? null
    : available.filter((value) => value < 0).length / available.length;
}

export function formatRiskCaseStudyReport(result: RiskCaseStudyResult): string {
  const t5 = result.cases.map((item) => item.outcome.t5);
  const t10 = result.cases.map((item) => item.outcome.t10);
  const t20 = result.cases.map((item) => item.outcome.t20);
  const t20Excess = result.cases.map((item) => excess(item.outcome.t20, item.benchmarkOutcome.t20));
  const sections = result.cases.flatMap((item, index) => [
    `## ${index + 1}. ${item.asset.name} ${item.asset.tsCode}｜${item.event.date}`,
    '',
    `- **当时可见结论：** 触发“${signalLabel(item.event.signal)}”风险事件。收盘 ${item.close.toFixed(2)}，MA20 ${number(item.ma20)}，MA60 ${number(item.ma60)}，K/D ${number(item.k)}/${number(item.d)}。原趋势恢复结构已经受损，应提高风险关注，但不能据此断言继续下跌。`,
    `- **V2.1背景：** ${contextLabel(item.applicability)}。V2.1在风险日只作为背景证据，不作为新的交易判断。`,
    `- **事后走势：** T+5 ${percent(item.outcome.t5)}，T+10 ${percent(item.outcome.t10)}，T+20 ${percent(item.outcome.t20)}；未来20个交易日最大收盘上行 ${percent(item.outcome.maximumClosingGain20)}，最大收盘下行 ${percent(item.outcome.maximumClosingDrawdown20)}。`,
    `- **同期市场对照：** 沪深300 T+5 ${percent(item.benchmarkOutcome.t5)}，T+10 ${percent(item.benchmarkOutcome.t10)}，T+20 ${percent(item.benchmarkOutcome.t20)}；个股T+20相对差 ${percent(excess(item.outcome.t20, item.benchmarkOutcome.t20))}。`,
    '',
  ]);
  const missing = result.missingCases.map((item) => `- ${item.tsCode}: ${item.reason}`);
  return [
    '# V1风险事件历史案例与V2.1背景对照',
    '',
    `> 固定使用${result.cohortSize}只股票作为同日横截面，从预先指定的6只跨行业股票中机械选择各自在2024年的首次V1风险事件。分析只使用事件日及以前数据；后续走势在结论冻结后揭示。`,
    '',
    '> 收益以事件日收盘为基准。最大收盘下行用于观察风险暴露，不等于可实现交易收益。本研究不构成交易建议。',
    '',
    '## 汇总',
    '',
    `- T+5平均 ${percent(mean(t5))}，下跌案例占 ${percent(negativeRate(t5))}。`,
    `- T+10平均 ${percent(mean(t10))}，下跌案例占 ${percent(negativeRate(t10))}。`,
    `- T+20平均 ${percent(mean(t20))}，下跌案例占 ${percent(negativeRate(t20))}。`,
    `- T+20相对沪深300平均差 ${percent(mean(t20Excess))}，跑输案例占 ${percent(negativeRate(t20Excess))}。`,
    `- 未来20个交易日平均最大收盘下行 ${percent(mean(result.cases.map((item) => item.outcome.maximumClosingDrawdown20)))}。`,
    '',
    ...sections,
    ...(missing.length > 0 ? ['## 未形成案例', '', ...missing, ''] : []),
    '## 解读边界',
    '',
    '- V1风险事件描述技术结构已经发生的变化，不保证未来继续下跌。',
    '- V2.1原本用于确认V1趋势恢复候选；这里仅展示风险日的量能、相对强度和大盘背景，不能覆盖V1风险事件。',
    '- 六个案例用于检查表达与方向是否合理，不足以估计概率或形成策略。',
  ].join('\n');
}

export async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    process.stdout.write('# V1风险事件历史案例与V2.1背景对照\n\n执行失败：未配置 TUSHARE_TOKEN。\n');
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runRiskCaseStudy(new HttpTushareClient(token));
    process.stdout.write(`${redactSecret(formatRiskCaseStudyReport(result), token)}\n`);
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), token);
    process.stdout.write(`# V1风险事件历史案例与V2.1背景对照\n\n执行失败：${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
