import type { Candle, IndicatorSeries, PositionEvent } from './types.js';

export const TREND_RECOVERY_V1 = {
  name: 'trend_recovery_v1',
  minimumHoldBars: 5,
  stopLoss: 0.08,
  trailingDrawdown: 0.15,
  maBreakBars: 2,
} as const;

function crossedAbove(
  previousValue: number,
  currentValue: number,
  previousReference: number | null,
  currentReference: number | null,
): boolean {
  return previousReference !== null && currentReference !== null
    && previousValue <= previousReference && currentValue > currentReference;
}

/**
 * Trend Recovery V1: enter when price recovers MA20 inside an MA20 > MA60
 * uptrend with positive KDJ confirmation. Exit only after a confirmed MA20
 * break or an explicit risk limit, rather than on every raw formula warning.
 */
export function evaluateTrendRecoveryStrategy(
  candles: Candle[],
  indicators: IndicatorSeries,
): PositionEvent[] {
  let entryIndex: number | null = null;
  let entryClose = 0;
  let peakClose = 0;
  let consecutiveBelowMa20 = 0;
  const events: PositionEvent[] = [];

  for (let index = 1; index < candles.length; index++) {
    const candle = candles[index];
    const ma20 = indicators.ma20[index];
    const ma60 = indicators.ma60[index];
    const kdj = indicators.kdj[index];

    if (entryIndex === null) {
      const recoveredMa20 = crossedAbove(
        candles[index - 1].close,
        candle.close,
        indicators.ma20[index - 1],
        ma20,
      );
      if (recoveredMa20 && ma20 !== null && ma60 !== null
        && ma20 > ma60 && kdj.k !== null && kdj.d !== null && kdj.k > kdj.d) {
        entryIndex = index;
        entryClose = candle.close;
        peakClose = candle.close;
        consecutiveBelowMa20 = 0;
        events.push({
          date: candle.date,
          action: 'open',
          signal: 'STRATEGY_TREND_RECOVERY_ENTRY',
          evidence: { close: candle.close, ma20, ma60, k: kdj.k, d: kdj.d },
        });
      }
      continue;
    }

    peakClose = Math.max(peakClose, candle.close);
    consecutiveBelowMa20 = ma20 !== null && candle.close < ma20
      ? consecutiveBelowMa20 + 1
      : 0;
    const barsHeld = index - entryIndex;
    const returnFromEntry = candle.close / entryClose - 1;
    const drawdownFromPeak = candle.close / peakClose - 1;
    let exitSignal: PositionEvent['signal'] | null = null;

    if (returnFromEntry <= -TREND_RECOVERY_V1.stopLoss) {
      exitSignal = 'STRATEGY_STOP_LOSS';
    } else if (drawdownFromPeak <= -TREND_RECOVERY_V1.trailingDrawdown) {
      exitSignal = 'STRATEGY_TRAILING_EXIT';
    } else if (barsHeld >= TREND_RECOVERY_V1.minimumHoldBars
      && consecutiveBelowMa20 >= TREND_RECOVERY_V1.maBreakBars) {
      exitSignal = 'STRATEGY_MA20_BREAK_EXIT';
    }

    if (exitSignal) {
      events.push({
        date: candle.date,
        action: 'close',
        signal: exitSignal,
        evidence: {
          close: candle.close,
          ma20,
          bars_held: barsHeld,
          return_from_entry: returnFromEntry,
          drawdown_from_peak: drawdownFromPeak,
        },
      });
      entryIndex = null;
      entryClose = 0;
      peakClose = 0;
      consecutiveBelowMa20 = 0;
    }
  }

  return events;
}
