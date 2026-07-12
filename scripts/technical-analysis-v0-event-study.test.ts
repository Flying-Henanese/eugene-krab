import { describe, expect, test } from 'bun:test';
import type { Candle, TechnicalSignal } from '../src/tools/finance/technical-analysis/types.js';
import {
  EVENT_STUDY_UNIVERSE,
  ILLUSTRATIVE_ROUND_TRIP_COST,
  aggregateSignalEvents,
  aggregateTrades,
  buildV0PositionTrades,
  evaluateSignalEvents,
  formatV0EventStudyReport,
  type EventStudyAsset,
  type SignalEventOutcome,
  type V0EventStudyResult,
  type V0PositionTrade,
} from './technical-analysis-v0-event-study.js';

const asset: EventStudyAsset = { tsCode: '000001.SZ', name: '平安银行', industry: '银行' };
const dates = ['20240102', '20240103', '20240104', '20240105', '20240108', '20240109'];

function candle(date: string, open: number, close: number): Candle {
  return {
    symbol: asset.tsCode,
    date,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 100,
    amount: 200,
    adjustment: 'qfq',
  };
}

function signal(
  name: TechnicalSignal['name'],
  side: TechnicalSignal['side'],
  date: string,
): TechnicalSignal {
  return { name, side, timeframe: 'daily', date, evidence: {} };
}

describe('V0 event-study manifest', () => {
  test('reuses the frozen eight-stock cross-industry universe', () => {
    expect(EVENT_STUDY_UNIVERSE).toHaveLength(8);
    expect(EVENT_STUDY_UNIVERSE.map(({ tsCode }) => tsCode)).toEqual([
      '000001.SZ', '000333.SZ', '002415.SZ', '300750.SZ',
      '600276.SH', '600309.SH', '600519.SH', '601088.SH',
    ]);
    expect(new Set(EVENT_STUDY_UNIVERSE.map(({ industry }) => industry)).size).toBe(8);
  });
});

describe('evaluateSignalEvents', () => {
  test('uses next-session open and fixed future closes without same-close execution', () => {
    const candles = [
      candle('20240102', 90, 95),
      candle('20240103', 100, 101),
      candle('20240104', 101, 102),
      candle('20240105', 102, 103),
      candle('20240108', 103, 104),
      candle('20240109', 104, 105),
    ];
    const [outcome] = evaluateSignalEvents(
      asset,
      [signal('BUY_NEW', 'buy', '20240102')],
      candles,
      dates,
    );

    expect(outcome.executionDate).toBe('20240103');
    expect(outcome.executionOpen).toBe(100);
    expect(outcome.returns.t1).toBeCloseTo(0.01);
    expect(outcome.returns.t2).toBeCloseTo(0.02);
    expect(outcome.returns.t3).toBeCloseTo(0.03);
    expect(outcome.returns.t5).toBeCloseTo(0.05);
  });

  test('keeps a missing stock session unavailable instead of shifting the horizon', () => {
    const candles = [
      candle('20240102', 90, 95),
      candle('20240103', 100, 101),
      candle('20240105', 102, 103),
      candle('20240108', 103, 104),
      candle('20240109', 104, 105),
    ];
    const [outcome] = evaluateSignalEvents(
      asset,
      [signal('BUY_NEW', 'buy', '20240102')],
      candles,
      dates,
    );

    expect(outcome.returns.t1).toBeCloseTo(0.01);
    expect(outcome.returns.t2).toBeNull();
    expect(outcome.returns.t3).toBeCloseTo(0.03);
  });
});

describe('aggregateSignalEvents', () => {
  test('directionalizes sell conditions without changing the underlying return', () => {
    const events: SignalEventOutcome[] = [
      {
        tsCode: asset.tsCode,
        name: asset.name,
        signal: 'SELL_J_CROSS_100',
        side: 'sell',
        signalDate: '20240102',
        executionDate: '20240103',
        executionOpen: 100,
        returns: { t1: -0.02, t2: -0.03, t3: 0.01, t5: null },
      },
    ];
    const [aggregate] = aggregateSignalEvents(events);

    expect(aggregate.horizons.t2.meanUnderlyingReturn).toBeCloseTo(-0.03);
    expect(aggregate.horizons.t2.meanDirectionalReturn).toBeCloseTo(0.03);
    expect(aggregate.horizons.t2.directionConsistency).toBe(1);
    expect(aggregate.horizons.t3.directionConsistency).toBe(0);
  });
});

describe('buildV0PositionTrades', () => {
  test('pairs the first sell after BUY_NEW and executes both on the next open', () => {
    const candles = dates.map((date, index) => candle(date, 100 + index, 100 + index));
    const trades = buildV0PositionTrades(asset, [
      signal('BUY_NEW', 'buy', '20240102'),
      signal('BUY_NEW', 'buy', '20240103'),
      signal('SELL_TOUCH_UPPER', 'sell', '20240105'),
      signal('SELL_J_CROSS_100', 'sell', '20240108'),
    ], candles, dates);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      entrySignalDate: '20240102',
      entryExecutionDate: '20240103',
      exitSignalDate: '20240105',
      exitExecutionDate: '20240108',
      entryOpen: 101,
      exitOpen: 104,
      holdingSessions: 3,
      exitSignal: 'SELL_TOUCH_UPPER',
    });
    expect(trades[0].grossReturn).toBeCloseTo(104 / 101 - 1);
    expect(trades[0].netReturn20Bps).toBeCloseTo(104 / 101 - 1 - ILLUSTRATIVE_ROUND_TRIP_COST);
  });
});

describe('aggregateTrades and report', () => {
  test('reports gross and illustrative cost-adjusted results without a recommendation', () => {
    const trades: V0PositionTrade[] = [
      {
        tsCode: asset.tsCode,
        name: asset.name,
        entrySignalDate: '20240102',
        exitSignalDate: '20240105',
        entryExecutionDate: '20240103',
        exitExecutionDate: '20240108',
        entryOpen: 100,
        exitOpen: 110,
        holdingSessions: 3,
        grossReturn: 0.10,
        netReturn20Bps: 0.098,
        exitSignal: 'SELL_TOUCH_UPPER',
      },
      {
        tsCode: asset.tsCode,
        name: asset.name,
        entrySignalDate: '20240201',
        exitSignalDate: '20240205',
        entryExecutionDate: '20240202',
        exitExecutionDate: '20240206',
        entryOpen: 100,
        exitOpen: 95,
        holdingSessions: 2,
        grossReturn: -0.05,
        netReturn20Bps: -0.052,
        exitSignal: 'SELL_J_CROSS_100',
      },
    ];
    const aggregate = aggregateTrades(trades);
    expect(aggregate.tradeCount).toBe(2);
    expect(aggregate.winRate).toBe(0.5);
    expect(aggregate.averageGrossReturn).toBeCloseTo(0.025);
    expect(aggregate.averageNetReturn20Bps).toBeCloseTo(0.023);

    const result: V0EventStudyResult = {
      universe: [asset],
      signalEvents: [],
      signalAggregates: [],
      trades,
      overallTrades: aggregate,
      tradesByAsset: [{ asset, aggregate }],
      errors: [],
    };
    const report = formatV0EventStudyReport(result);
    expect(report).toContain('下一交易日开盘');
    expect(report).toContain('20bps仅为统一敏感性假设');
    expect(report).not.toContain('建议买入');
  });
});
