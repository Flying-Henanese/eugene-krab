import { config as loadDotenv } from 'dotenv';
import { normalizeDailyRows } from '../src/tools/finance/technical-analysis/adjustment.js';
import { toPublicTechnicalAnalysisResult } from '../src/tools/finance/technical-analysis/assessment.js';
import { runTechnicalAnalysis } from '../src/tools/finance/technical-analysis/technical-analysis.js';
import type {
  PublicTechnicalAnalysisResult,
  TechnicalObservation,
  TechnicalStructuralChange,
} from '../src/tools/finance/technical-analysis/types.js';
import {
  HttpTushareClient,
  type TushareApiName,
  type TushareClient,
  type TushareRow,
} from '../src/tools/finance/tushare/client.js';

const DAILY_FIELDS = ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'pre_close', 'vol', 'amount'];
const FACTOR_FIELDS = ['ts_code', 'trade_date', 'adj_factor'];
const TRADE_CAL_FIELDS = ['exchange', 'cal_date', 'is_open'];
const FORWARD_SESSIONS = 20;
const CALENDAR_BUFFER_DAYS = 90;

export interface HistoricalCaseDefinition {
  tsCode: string;
  name: string;
  industry: string;
  asOfDate: string;
}

/**
 * Pre-registered before fetching any case data. Codes are sorted ascending and
 * mapped to eight consecutive quarter ends, so neither signals nor outcomes
 * influence the selected stock/date pairs.
 */
export const HISTORICAL_CASES: readonly HistoricalCaseDefinition[] = Object.freeze([
  { tsCode: '000001.SZ', name: '平安银行', industry: '银行', asOfDate: '20230331' },
  { tsCode: '000333.SZ', name: '美的集团', industry: '家电', asOfDate: '20230630' },
  { tsCode: '002415.SZ', name: '海康威视', industry: '安防科技', asOfDate: '20230928' },
  { tsCode: '300750.SZ', name: '宁德时代', industry: '新能源电池', asOfDate: '20231229' },
  { tsCode: '600276.SH', name: '恒瑞医药', industry: '医药', asOfDate: '20240329' },
  { tsCode: '600309.SH', name: '万华化学', industry: '化工材料', asOfDate: '20240628' },
  { tsCode: '600519.SH', name: '贵州茅台', industry: '消费', asOfDate: '20240930' },
  { tsCode: '601088.SH', name: '中国神华', industry: '能源', asOfDate: '20241231' },
].map((item) => Object.freeze(item)));

export interface FrozenHistoricalAssessment {
  case: HistoricalCaseDefinition;
  result: PublicTechnicalAnalysisResult;
}

export interface ForwardCheckpoints {
  t2: number | null;
  t5: number | null;
  t10: number | null;
  t15: number | null;
  t20: number | null;
}

export interface ForwardOutcome {
  case: HistoricalCaseDefinition;
  analysisDate: string | null;
  status: 'ok' | 'partial' | 'unavailable';
  message?: string;
  horizonStart: string | null;
  horizonEnd: string | null;
  expectedSessions: number;
  observedSessions: number;
  missingSessionDates: string[];
  checkpoints: ForwardCheckpoints;
  periodEndReturn: number | null;
  maximumClosingGain: number | null;
  maximumClosingDrawdown: number | null;
}

export interface HistoricalCaseEvaluation {
  assessments: readonly FrozenHistoricalAssessment[];
  outcomes: readonly ForwardOutcome[];
}

function rowDate(row: TushareRow, key: 'trade_date' | 'cal_date'): string | null {
  const value = row[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function stockBasicRows(cases: readonly HistoricalCaseDefinition[]): TushareRow[] {
  return cases.map((item) => ({
    ts_code: item.tsCode,
    symbol: item.tsCode.slice(0, 6),
    name: item.name,
  }));
}

/**
 * Guards the analysis phase from future rows even if an upstream stub or API
 * returns data outside the requested range. stock_basic is supplied from the
 * frozen manifest because current metadata is unnecessary for the calculation.
 */
export class CutoffTushareClient implements TushareClient {
  constructor(
    private readonly delegate: TushareClient,
    private readonly cutoffDate: string,
    private readonly frozenStockRows: TushareRow[],
  ) {}

  async call(
    apiName: TushareApiName,
    params: Record<string, unknown> = {},
    fields: string[] = [],
  ): Promise<TushareRow[]> {
    if (apiName === 'stock_basic') return this.frozenStockRows.map((row) => ({ ...row }));

    for (const key of ['start_date', 'end_date', 'trade_date', 'cal_date'] as const) {
      const value = params[key];
      if ((typeof value === 'string' || typeof value === 'number') && String(value) > this.cutoffDate) {
        throw new Error(`Historical analysis request ${key} exceeds cutoff ${this.cutoffDate}.`);
      }
    }

    const rows = await this.delegate.call(apiName, params, fields);
    return rows.filter((row) => {
      const date = rowDate(row, 'trade_date') ?? rowDate(row, 'cal_date');
      return date === null || date <= this.cutoffDate;
    });
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export async function collectFrozenAssessments(
  client: TushareClient,
  cases: readonly HistoricalCaseDefinition[] = HISTORICAL_CASES,
): Promise<readonly FrozenHistoricalAssessment[]> {
  const frozenStocks = stockBasicRows(cases);
  const assessments: FrozenHistoricalAssessment[] = [];

  // Deliberately sequential: every public assessment is complete and frozen
  // before the future-data phase is allowed to begin.
  for (const item of cases) {
    const cutoffClient = new CutoffTushareClient(client, item.asOfDate, frozenStocks);
    const internalResult = await runTechnicalAnalysis({
      query: item.tsCode,
      asset_type: 'stock',
      as_of_date: item.asOfDate,
      adjustment: 'qfq',
      lookback_days: 450,
      completed_weeks_only: false,
    }, cutoffClient);
    const publicResult = toPublicTechnicalAnalysisResult(internalResult);

    if (publicResult.as_of_date && publicResult.as_of_date > item.asOfDate) {
      throw new Error(`Analysis for ${item.tsCode} returned data after its cutoff.`);
    }

    assessments.push(deepFreeze({
      case: { ...item },
      result: structuredClone(publicResult),
    }));
  }

  return Object.freeze(assessments);
}

function parseDate(value: string): Date {
  return new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
  ));
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10).replaceAll('-', '');
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function emptyCheckpoints(): ForwardCheckpoints {
  return { t2: null, t5: null, t10: null, t15: null, t20: null };
}

function unavailableOutcome(
  item: HistoricalCaseDefinition,
  analysisDate: string | null,
  message: string,
): ForwardOutcome {
  return {
    case: item,
    analysisDate,
    status: 'unavailable',
    message,
    horizonStart: null,
    horizonEnd: null,
    expectedSessions: FORWARD_SESSIONS,
    observedSessions: 0,
    missingSessionDates: [],
    checkpoints: emptyCheckpoints(),
    periodEndReturn: null,
    maximumClosingGain: null,
    maximumClosingDrawdown: null,
  };
}

function percentageReturn(value: number | undefined, reference: number): number | null {
  return value === undefined || reference === 0 ? null : value / reference - 1;
}

function maximumDrawdown(values: number[]): number | null {
  if (values.length === 0) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak !== 0) worst = Math.min(worst, value / peak - 1);
  }
  return worst;
}

/**
 * Computes a fixed exchange-session outcome. Missing stock candles remain gaps;
 * later candles never extend the preselected 20-session horizon.
 */
export function calculateForwardOutcome(
  item: HistoricalCaseDefinition,
  analysisDate: string,
  openSessionDates: readonly string[],
  dailyRows: TushareRow[],
  factorRows: TushareRow[],
): ForwardOutcome {
  const sessions = [...new Set(openSessionDates)]
    .filter((date) => date > analysisDate)
    .sort()
    .slice(0, FORWARD_SESSIONS);
  if (sessions.length < FORWARD_SESSIONS) {
    return unavailableOutcome(item, analysisDate, 'Fewer than 20 future exchange sessions are available.');
  }

  const horizonStart = sessions[0];
  const horizonEnd = sessions.at(-1)!;
  const boundedDailyRows = dailyRows.filter((row) => {
    const date = rowDate(row, 'trade_date');
    return date !== null && date >= analysisDate && date <= horizonEnd;
  });
  const boundedFactorRows = factorRows.filter((row) => {
    const date = rowDate(row, 'trade_date');
    return date !== null && date >= analysisDate && date <= horizonEnd;
  });
  const normalized = normalizeDailyRows(item.tsCode, boundedDailyRows, 'qfq', boundedFactorRows);
  const candleByDate = new Map(normalized.candles.map((candle) => [candle.date, candle]));
  const reference = candleByDate.get(analysisDate);
  if (!reference) {
    return {
      ...unavailableOutcome(item, analysisDate, 'The analysis-date qfq close is unavailable.'),
      horizonStart,
      horizonEnd,
      missingSessionDates: sessions.filter((date) => !candleByDate.has(date)),
    };
  }

  const observedCandles = sessions.flatMap((date) => {
    const candle = candleByDate.get(date);
    return candle ? [candle] : [];
  });
  const missingSessionDates = sessions.filter((date) => !candleByDate.has(date));
  const closes = observedCandles.map((candle) => candle.close);
  const checkpoint = (sessionNumber: number): number | null => {
    const date = sessions[sessionNumber - 1];
    return percentageReturn(candleByDate.get(date)?.close, reference.close);
  };
  const maximumClose = closes.length > 0 ? Math.max(...closes) : undefined;
  const hasDataGap = missingSessionDates.length > 0
    || normalized.missingFactorDates.length > 0
    || normalized.rejectedRows > 0;

  return {
    case: item,
    analysisDate,
    status: hasDataGap ? 'partial' : 'ok',
    ...(hasDataGap ? { message: 'The fixed horizon contains missing or rejected stock rows; it was not extended.' } : {}),
    horizonStart,
    horizonEnd,
    expectedSessions: FORWARD_SESSIONS,
    observedSessions: observedCandles.length,
    missingSessionDates,
    checkpoints: {
      t2: checkpoint(2),
      t5: checkpoint(5),
      t10: checkpoint(10),
      t15: checkpoint(15),
      t20: checkpoint(20),
    },
    periodEndReturn: checkpoint(20),
    maximumClosingGain: percentageReturn(maximumClose, reference.close),
    maximumClosingDrawdown: maximumDrawdown([reference.close, ...closes]),
  };
}

function openCalendarDates(rows: TushareRow[]): string[] {
  return [...new Set(rows.flatMap((row) => {
    const date = rowDate(row, 'cal_date');
    return date && String(row.is_open) === '1' ? [date] : [];
  }))].sort();
}

export async function collectForwardOutcomes(
  client: TushareClient,
  assessments: readonly FrozenHistoricalAssessment[],
): Promise<readonly ForwardOutcome[]> {
  const datedAssessments = assessments.filter((item): item is FrozenHistoricalAssessment & {
    result: PublicTechnicalAnalysisResult & { as_of_date: string };
  } => Boolean(item.result.as_of_date));

  if (datedAssessments.length === 0) {
    return Object.freeze(assessments.map(({ case: item }) =>
      unavailableOutcome(item, null, 'The historical assessment has no usable as-of date.')));
  }

  const analysisDates = datedAssessments.map(({ result }) => result.as_of_date);
  const calendarStart = analysisDates.reduce((left, right) => left < right ? left : right);
  const calendarEnd = addCalendarDays(
    analysisDates.reduce((left, right) => left > right ? left : right),
    CALENDAR_BUFFER_DAYS,
  );

  let calendarRows: TushareRow[];
  try {
    // Exactly one shared calendar request for the complete frozen case set.
    calendarRows = await client.call('trade_cal', {
      exchange: 'SSE',
      start_date: calendarStart,
      end_date: calendarEnd,
      is_open: '1',
    }, TRADE_CAL_FIELDS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Object.freeze(assessments.map(({ case: item, result }) =>
      unavailableOutcome(item, result.as_of_date ?? null, `trade_cal unavailable: ${message}`)));
  }

  const openDates = openCalendarDates(calendarRows);
  const outcomes: ForwardOutcome[] = [];
  for (const assessment of assessments) {
    const analysisDate = assessment.result.as_of_date;
    if (!analysisDate) {
      outcomes.push(unavailableOutcome(
        assessment.case,
        null,
        'The historical assessment has no usable as-of date.',
      ));
      continue;
    }

    const sessions = openDates.filter((date) => date > analysisDate).slice(0, FORWARD_SESSIONS);
    if (sessions.length < FORWARD_SESSIONS) {
      outcomes.push(unavailableOutcome(
        assessment.case,
        analysisDate,
        'Fewer than 20 future exchange sessions are available.',
      ));
      continue;
    }

    const horizonEnd = sessions.at(-1)!;
    try {
      const [dailyRows, factorRows] = await Promise.all([
        client.call('daily', {
          ts_code: assessment.case.tsCode,
          start_date: analysisDate,
          end_date: horizonEnd,
        }, DAILY_FIELDS),
        client.call('adj_factor', {
          ts_code: assessment.case.tsCode,
          start_date: analysisDate,
          end_date: horizonEnd,
        }, FACTOR_FIELDS),
      ]);
      outcomes.push(calculateForwardOutcome(
        assessment.case,
        analysisDate,
        sessions,
        dailyRows,
        factorRows,
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push(unavailableOutcome(assessment.case, analysisDate, `Future price data unavailable: ${message}`));
    }
  }

  return Object.freeze(outcomes);
}

export async function runHistoricalCaseEvaluation(
  client: TushareClient,
  cases: readonly HistoricalCaseDefinition[] = HISTORICAL_CASES,
): Promise<HistoricalCaseEvaluation> {
  const assessments = await collectFrozenAssessments(client, cases);
  const outcomes = await collectForwardOutcomes(client, assessments);
  return { assessments, outcomes };
}

function percentage(value: number | null): string {
  return value === null ? '不可用' : `${(value * 100).toFixed(2)}%`;
}

function number(value: number | null): string {
  return value === null ? '不可用' : value.toFixed(4);
}

function observationLine(item: TechnicalObservation): string {
  const partial = item.partial ? '（未完成周期）' : '';
  return `  - ${item.date} ${item.type}${partial}：${item.interpretation} 证据=${JSON.stringify(item.evidence)} 后续关注：${item.follow_up_condition}`;
}

function structuralChangeLine(item: TechnicalStructuralChange): string {
  const partial = item.partial ? '（未完成周期）' : '';
  return `  - ${item.date} ${item.type} [${item.significance}]${partial}：${item.interpretation} 证据=${JSON.stringify(item.evidence)}`;
}

function formatAssessment(item: FrozenHistoricalAssessment): string {
  const result = item.result;
  const latest = result.latest;
  const observations = result.assessment.observations.slice(0, 3);
  const structuralChanges = result.assessment.structural_changes.slice(0, 3);
  const lines = [
    `### ${item.case.name}（${item.case.tsCode}）`,
    '',
    `- 行业：${item.case.industry}`,
    `- 预注册日期：${item.case.asOfDate}`,
    `- 分析状态：${result.status}`,
    `- 实际数据截止日：${result.as_of_date ?? '不可用'}`,
    `- 状态：趋势=${result.assessment.state.trend}，波动=${result.assessment.state.volatility}，动量=${result.assessment.state.momentum}`,
    `- 数据质量：${result.assessment.evidence_quality.data_completeness}；指标覆盖：${result.assessment.evidence_quality.indicator_coverage}；方向概率：不提供`,
  ];

  if (result.message) lines.push(`- 分析说明：${result.message}`);
  if (result.methodology) {
    lines.push(`- 数据方法：provider=${result.methodology.provider}，adjustment=${result.methodology.adjustment}`);
  }
  if (result.data_range) {
    lines.push(
      `- 数据范围：${result.data_range.start}–${result.data_range.end}，日线=${result.data_range.daily_count}，周线=${result.data_range.weekly_count}，最新周线=${result.data_range.latest_week_partial ? '未完成' : '已完成'}`,
    );
  }

  if (latest) {
    lines.push(
      `- 截止日价格与均线：收盘=${number(latest.price.closing_price)}，MA5=${number(latest.moving_averages.ma5)}，MA10=${number(latest.moving_averages.ma10)}，MA20=${number(latest.moving_averages.ma20)}，MA60=${number(latest.moving_averages.ma60)}`,
      `- BOLL与KDJ：下轨=${number(latest.boll.lower)}，中轨=${number(latest.boll.middle)}，上轨=${number(latest.boll.upper)}；K=${number(latest.kdj.k)}，D=${number(latest.kdj.d)}，J=${number(latest.kdj.j)}`,
    );
  }
  if (result.performance) {
    lines.push(
      `- 历史窗口：20日收益=${percentage(result.performance.return_20d)}，距MA20=${percentage(result.performance.distance_ma20)}，距MA60=${percentage(result.performance.distance_ma60)}，20日年化波动率=${percentage(result.performance.realized_volatility_20d)}，20日最大回撤=${percentage(result.performance.max_drawdown_20d)}`,
    );
  }
  lines.push(`- 中性观察（最新3条/共${result.assessment.observations.length}条）：`);
  lines.push(...(observations.length > 0 ? observations.map(observationLine) : ['  - 无']));
  lines.push(`- 结构变化（最新3条/共${result.assessment.structural_changes.length}条）：`);
  lines.push(...(structuralChanges.length > 0 ? structuralChanges.map(structuralChangeLine) : ['  - 无']));
  if (result.data_warnings.length > 0) {
    lines.push(`- 数据提示：${result.data_warnings.join('；')}`);
  }
  if (result.unavailable_data.length > 0) {
    lines.push(`- 不可用数据：${result.unavailable_data.map((entry) =>
      `${entry.api}(${entry.reason}): ${entry.message}`).join('；')}`);
  }
  return lines.join('\n');
}

function outcomeCompleteness(item: ForwardOutcome): string {
  if (item.status === 'ok') return `${item.observedSessions}/${item.expectedSessions}`;
  if (item.status === 'partial') return `${item.observedSessions}/${item.expectedSessions}（有缺口）`;
  return '不可用';
}

export function formatHistoricalCaseReport(evaluation: HistoricalCaseEvaluation): string {
  const assessmentSections = evaluation.assessments.map(formatAssessment).join('\n\n');
  const outcomeRows = evaluation.outcomes.map((item) => [
    item.case.name,
    item.analysisDate ?? '不可用',
    item.horizonStart && item.horizonEnd ? `${item.horizonStart}–${item.horizonEnd}` : '不可用',
    percentage(item.checkpoints.t2),
    percentage(item.checkpoints.t5),
    percentage(item.checkpoints.t10),
    percentage(item.checkpoints.t15),
    percentage(item.periodEndReturn),
    percentage(item.maximumClosingGain),
    percentage(item.maximumClosingDrawdown),
    outcomeCompleteness(item),
  ].join(' | '));
  const gapNotes = evaluation.outcomes.flatMap((item) => {
    if (item.status === 'ok') return [];
    const missing = item.missingSessionDates.length > 0
      ? `；缺失交易日=${item.missingSessionDates.join(',')}`
      : '';
    return [`- ${item.case.name}：${item.message ?? '数据不完整'}${missing}`];
  });

  return [
    '# A股技术面历史案例审阅',
    '',
    '> 案例与日期在获取数据前预注册。Part A 仅使用截止日及之前的数据；全部 Part A 冻结后才获取 Part B。报告不判断匹配度，也不构成买卖建议。',
    '>',
    '> 本地公式按文档语义计算；在建立 golden fixture 前，不保证与外部图表平台逐点一致。',
    '',
    '## Part A：截止日技术面中性评估',
    '',
    assessmentSections,
    '',
    '## Part B：未来20个市场交易日的实际走势',
    '',
    '> 所有收益和回撤均使用同一 t0–t20 前复权收盘序列。停牌或数据缺口不向后补日。',
    '',
    '股票 | 分析日 | 固定窗口 | T+2 | T+5 | T+10 | T+15 | T+20/期末 | 最大收盘涨幅 | 最大收盘回撤 | 完整度',
    '--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:',
    ...outcomeRows,
    ...(gapNotes.length > 0 ? ['', '### 数据缺口', '', ...gapNotes] : []),
    '',
    '> 这是小样本历史案例审阅，不是统计验证；不应根据这些结果更换案例、调整阈值或宣称预测能力。',
  ].join('\n');
}

export function redactSecret(value: string, secret: string): string {
  return secret.length > 0 ? value.replaceAll(secret, '[redacted]') : value;
}

export async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    process.stdout.write('# A股技术面历史案例审阅\n\n执行失败：未配置 TUSHARE_TOKEN。\n');
    process.exitCode = 1;
    return;
  }

  try {
    const evaluation = await runHistoricalCaseEvaluation(new HttpTushareClient(token));
    const safeReport = redactSecret(formatHistoricalCaseReport(evaluation), token);
    process.stdout.write(`${safeReport}\n`);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeMessage = redactSecret(rawMessage, token);
    process.stdout.write(`# A股技术面历史案例审阅\n\n执行失败：${safeMessage}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
