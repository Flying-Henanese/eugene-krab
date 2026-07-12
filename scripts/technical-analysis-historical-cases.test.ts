import { describe, expect, test } from 'bun:test';
import type { TushareApiName, TushareClient, TushareRow } from '../src/tools/finance/tushare/client.js';
import {
  CutoffTushareClient,
  HISTORICAL_CASES,
  addCalendarDays,
  calculateForwardOutcome,
  formatHistoricalCaseReport,
  redactSecret,
  runHistoricalCaseEvaluation,
  type HistoricalCaseDefinition,
} from './technical-analysis-historical-cases.js';

const sampleCase: HistoricalCaseDefinition = {
  tsCode: '000001.SZ',
  name: '平安银行',
  industry: '银行',
  asOfDate: '20240101',
};

function datesAfter(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addCalendarDays(start, index + 1));
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) dates.push(date);
  return dates;
}

function dailyRows(symbol: string, dates: string[], closes: number[]): TushareRow[] {
  return dates.map((date, index) => ({
    ts_code: symbol,
    trade_date: date,
    open: closes[index],
    high: closes[index],
    low: closes[index],
    close: closes[index],
    pre_close: index === 0 ? closes[index] : closes[index - 1],
    vol: 1_000 + index,
    amount: 2_000 + index,
  })).reverse();
}

function factorRows(symbol: string, dates: string[], factors: number[]): TushareRow[] {
  return dates.map((date, index) => ({
    ts_code: symbol,
    trade_date: date,
    adj_factor: factors[index],
  })).reverse();
}

describe('pre-registered historical cases', () => {
  test('freezes eight cross-industry code/date pairs before data access', () => {
    expect(HISTORICAL_CASES.map(({ tsCode, asOfDate }) => `${tsCode}@${asOfDate}`)).toEqual([
      '000001.SZ@20230331',
      '000333.SZ@20230630',
      '002415.SZ@20230928',
      '300750.SZ@20231229',
      '600276.SH@20240329',
      '600309.SH@20240628',
      '600519.SH@20240930',
      '601088.SH@20241231',
    ]);
    expect(new Set(HISTORICAL_CASES.map(({ industry }) => industry)).size).toBe(8);
    expect(Object.isFrozen(HISTORICAL_CASES)).toBe(true);
    expect(HISTORICAL_CASES.every((item) => Object.isFrozen(item))).toBe(true);
  });
});

describe('CutoffTushareClient', () => {
  test('uses frozen stock metadata, rejects future requests, and filters future rows', async () => {
    const calls: TushareApiName[] = [];
    const delegate: TushareClient = {
      async call(apiName) {
        calls.push(apiName);
        return [
          { trade_date: '20240101', close: 10 },
          { trade_date: '20240102', close: 11 },
        ];
      },
    };
    const client = new CutoffTushareClient(delegate, '20240101', [
      { ts_code: sampleCase.tsCode, symbol: '000001', name: sampleCase.name },
    ]);

    expect(await client.call('stock_basic')).toEqual([
      { ts_code: sampleCase.tsCode, symbol: '000001', name: sampleCase.name },
    ]);
    expect(calls).toEqual([]);

    expect(await client.call('daily', { end_date: '20240101' })).toEqual([
      { trade_date: '20240101', close: 10 },
    ]);
    await expect(client.call('daily', { end_date: '20240102' }))
      .rejects.toThrow('exceeds cutoff');
    expect(calls).toEqual(['daily']);
  });
});

describe('calculateForwardOutcome', () => {
  test('calculates fixed close-based checkpoints, terminal return, upside, and drawdown', () => {
    const sessions = datesAfter(sampleCase.asOfDate, 20);
    const futureCloses = [
      110, 99, 100, 101, 103,
      104, 106, 105, 107, 108,
      107, 106, 105, 104, 103,
      102, 103, 104, 105, 105,
    ];
    const allDates = [sampleCase.asOfDate, ...sessions, addCalendarDays(sessions.at(-1)!, 1)];
    const allCloses = [100, ...futureCloses, 999];
    const outcome = calculateForwardOutcome(
      sampleCase,
      sampleCase.asOfDate,
      sessions,
      dailyRows(sampleCase.tsCode, allDates, allCloses),
      factorRows(sampleCase.tsCode, allDates, allDates.map(() => 1)),
    );

    expect(outcome.status).toBe('ok');
    expect(outcome.horizonEnd).toBe(sessions.at(-1));
    expect(outcome.observedSessions).toBe(20);
    expect(outcome.checkpoints.t2).toBeCloseTo(-0.01);
    expect(outcome.checkpoints.t5).toBeCloseTo(0.03);
    expect(outcome.checkpoints.t10).toBeCloseTo(0.08);
    expect(outcome.checkpoints.t15).toBeCloseTo(0.03);
    expect(outcome.periodEndReturn).toBeCloseTo(0.05);
    expect(outcome.maximumClosingGain).toBeCloseTo(0.10);
    expect(outcome.maximumClosingDrawdown).toBeCloseTo(-0.10);
  });

  test('marks a suspension gap without extending the 20-session horizon', () => {
    const sessions = datesAfter(sampleCase.asOfDate, 20);
    const missingDate = sessions[4];
    const extraDate = addCalendarDays(sessions.at(-1)!, 1);
    const availableDates = [sampleCase.asOfDate, ...sessions.filter((date) => date !== missingDate), extraDate];
    const closes = availableDates.map((date) => date === extraDate ? 999 : 100);
    const outcome = calculateForwardOutcome(
      sampleCase,
      sampleCase.asOfDate,
      [...sessions, extraDate],
      dailyRows(sampleCase.tsCode, availableDates, closes),
      factorRows(sampleCase.tsCode, availableDates, availableDates.map(() => 1)),
    );

    expect(outcome.status).toBe('partial');
    expect(outcome.horizonEnd).toBe(sessions.at(-1));
    expect(outcome.observedSessions).toBe(19);
    expect(outcome.missingSessionDates).toEqual([missingDate]);
    expect(outcome.checkpoints.t5).toBeNull();
    expect(outcome.periodEndReturn).toBe(0);
    expect(outcome.maximumClosingGain).toBe(0);
  });

  test('uses one qfq anchor for t0 through t20 across a corporate action', () => {
    const sessions = datesAfter(sampleCase.asOfDate, 20);
    const allDates = [sampleCase.asOfDate, ...sessions];
    const outcome = calculateForwardOutcome(
      sampleCase,
      sampleCase.asOfDate,
      sessions,
      dailyRows(sampleCase.tsCode, allDates, [100, ...sessions.map(() => 50)]),
      factorRows(sampleCase.tsCode, allDates, [1, ...sessions.map(() => 2)]),
    );

    expect(outcome.status).toBe('ok');
    expect(outcome.periodEndReturn).toBeCloseTo(0);
    expect(outcome.maximumClosingGain).toBeCloseTo(0);
    expect(outcome.maximumClosingDrawdown).toBeCloseTo(0);
  });
});

class PhaseRecordingClient implements TushareClient {
  readonly calls: Array<{ apiName: TushareApiName; params: Record<string, unknown> }> = [];

  async call(
    apiName: TushareApiName,
    params: Record<string, unknown> = {},
  ): Promise<TushareRow[]> {
    this.calls.push({ apiName, params: { ...params } });
    const start = String(params.start_date ?? '');
    const end = String(params.end_date ?? '');

    if (apiName === 'trade_cal') {
      return dateRange(start, end).map((date) => ({ cal_date: date, is_open: 1 }));
    }
    if (apiName !== 'daily' && apiName !== 'adj_factor') return [];

    const requestedDays = Math.round((Date.parse(
      `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}T00:00:00Z`,
    ) - Date.parse(
      `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T00:00:00Z`,
    )) / 86_400_000);
    const dates = requestedDays > 200
      ? Array.from({ length: 150 }, (_, index) => addCalendarDays(end, index - 149))
      : dateRange(start, end);
    const symbol = String(params.ts_code);
    if (apiName === 'adj_factor') return factorRows(symbol, dates, dates.map(() => 1));
    return dailyRows(symbol, dates, dates.map((_, index) => 10 + index / 100));
  }
}

describe('runHistoricalCaseEvaluation', () => {
  test('freezes every public assessment before the single calendar reveal and future pulls', async () => {
    const cases: HistoricalCaseDefinition[] = [
      { ...sampleCase, asOfDate: '20240131' },
      { tsCode: '000333.SZ', name: '美的集团', industry: '家电', asOfDate: '20240229' },
    ];
    const client = new PhaseRecordingClient();
    const evaluation = await runHistoricalCaseEvaluation(client, cases);
    const calendarIndex = client.calls.findIndex(({ apiName }) => apiName === 'trade_cal');

    expect(calendarIndex).toBe(4);
    expect(client.calls.filter(({ apiName }) => apiName === 'trade_cal')).toHaveLength(1);
    expect(client.calls.slice(0, calendarIndex).map(({ apiName }) => apiName).sort()).toEqual([
      'adj_factor', 'adj_factor', 'daily', 'daily',
    ]);
    expect(client.calls.slice(calendarIndex + 1).map(({ apiName }) => apiName).sort()).toEqual([
      'adj_factor', 'adj_factor', 'daily', 'daily',
    ]);
    expect(evaluation.assessments).toHaveLength(2);
    expect(evaluation.outcomes.every(({ status }) => status === 'ok')).toBe(true);
    expect(Object.isFrozen(evaluation.assessments)).toBe(true);
    expect(Object.isFrozen(evaluation.assessments[0].result.assessment)).toBe(true);

    const report = formatHistoricalCaseReport(evaluation);
    expect(report.indexOf('Part A')).toBeLessThan(report.indexOf('Part B'));
    expect(report).toContain('T+2');
    expect(report).toContain('报告不判断匹配度');
    expect(report).not.toContain('命中率=');
  });
});

describe('redactSecret', () => {
  test('removes every exact token occurrence from report and error text', () => {
    const token = 'placeholder-sensitive-token';
    const redacted = redactSecret(`first=${token}; second=${token}`, token);

    expect(redacted).toBe('first=[redacted]; second=[redacted]');
    expect(redacted).not.toContain(token);
  });
});
