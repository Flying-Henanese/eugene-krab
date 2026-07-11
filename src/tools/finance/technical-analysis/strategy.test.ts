import { describe, expect, test } from 'bun:test';
import { evaluateTrendRecoveryStrategy } from './strategy.js';
import type { Candle, IndicatorSeries, KdjPoint } from './types.js';

function candle(index: number, close: number): Candle {
  return {
    symbol: 'TEST', date: `202501${String(index + 1).padStart(2, '0')}`,
    open: close, high: close, low: close, close, volume: null, amount: null,
    adjustment: 'qfq',
  };
}

function indicators(
  ma20: Array<number | null>,
  ma60: Array<number | null>,
  kdj: KdjPoint[],
): IndicatorSeries {
  const empty = ma20.map(() => null);
  return {
    ma5: empty, ma10: empty, ma20, ma30: empty, ma60,
    boll: ma20.map(() => ({ middle: null, upper: null, lower: null, stddev: null })),
    kdj,
  };
}

const positiveKdj = (): KdjPoint => ({ rsv: 50, k: 55, d: 45, j: 75 });

describe('Trend Recovery V1 strategy', () => {
  test('opens on an MA20 recovery inside an MA20 > MA60 uptrend', () => {
    const candles = [candle(0, 9), candle(1, 11)];
    const result = evaluateTrendRecoveryStrategy(candles, indicators(
      [10, 10], [8, 8], [positiveKdj(), positiveKdj()],
    ));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '20250102', action: 'open', signal: 'STRATEGY_TREND_RECOVERY_ENTRY',
    });
  });

  test('rejects recovery entries without trend or KDJ confirmation', () => {
    const candles = [candle(0, 9), candle(1, 11)];
    const weakKdj: KdjPoint = { rsv: 50, k: 40, d: 50, j: 20 };
    expect(evaluateTrendRecoveryStrategy(candles, indicators(
      [10, 10], [12, 12], [positiveKdj(), positiveKdj()],
    ))).toEqual([]);
    expect(evaluateTrendRecoveryStrategy(candles, indicators(
      [10, 10], [8, 8], [positiveKdj(), weakKdj],
    ))).toEqual([]);
  });

  test('waits five bars and requires two closes below MA20 for a normal exit', () => {
    const closes = [9, 10.2, 10.5, 10.4, 10.2, 9.5, 9.5];
    const candles = closes.map((close, index) => candle(index, close));
    const result = evaluateTrendRecoveryStrategy(candles, indicators(
      closes.map(() => 10), closes.map(() => 8), closes.map(positiveKdj),
    ));

    expect(result.map((event) => [event.date, event.signal])).toEqual([
      ['20250102', 'STRATEGY_TREND_RECOVERY_ENTRY'],
      ['20250107', 'STRATEGY_MA20_BREAK_EXIT'],
    ]);
  });

  test('applies the stop loss without waiting for the minimum hold period', () => {
    const candles = [candle(0, 9), candle(1, 11), candle(2, 10)];
    const result = evaluateTrendRecoveryStrategy(candles, indicators(
      [10, 10, 10], [8, 8, 8], [positiveKdj(), positiveKdj(), positiveKdj()],
    ));

    expect(result.at(-1)).toMatchObject({
      date: '20250103', action: 'close', signal: 'STRATEGY_STOP_LOSS',
    });
  });

  test('exits after a fifteen-percent close-based drawdown from the peak', () => {
    const closes = [9, 10, 12, 10.1];
    const candles = closes.map((close, index) => candle(index, close));
    const result = evaluateTrendRecoveryStrategy(candles, indicators(
      closes.map(() => 9.5), closes.map(() => 8), closes.map(positiveKdj),
    ));

    expect(result.at(-1)).toMatchObject({
      date: '20250104', action: 'close', signal: 'STRATEGY_TRAILING_EXIT',
    });
  });
});
