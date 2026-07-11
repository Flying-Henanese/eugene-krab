import type { BollingerPoint, Candle, KdjPoint, TechnicalSignal } from './types.js';

export function cross(previousA: number | null, currentA: number | null, previousB: number | null, currentB: number | null): boolean {
  return previousA !== null && currentA !== null && previousB !== null && currentB !== null
    && previousA <= previousB && currentA > currentB;
}

export function existsWithin(values: boolean[], index: number, period: number): boolean {
  return values.slice(Math.max(0, index - period + 1), index + 1).some(Boolean);
}

/** TongdaXin FILTER(X, N): retain a true bar, then suppress the following N bars. */
export function filterCooldown(values: boolean[], bars: number): boolean[] {
  let blockedThrough = -1;
  return values.map((value, index) => {
    if (!value || index <= blockedThrough) return false;
    blockedThrough = index + bars;
    return true;
  });
}

function finiteEvidence(entries: Record<string, number | boolean | null>): Record<string, number | boolean | null> {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [
    key,
    typeof value === 'number' && !Number.isFinite(value) ? null : value,
  ]));
}

export function evaluateDailySignals(candles: Candle[], kdj: KdjPoint[], boll: BollingerPoint[]): TechnicalSignal[] {
  const buys = candles.map((_, index) => index > 0 && cross(
    kdj[index - 1].j,
    kdj[index].j,
    kdj[index - 1].k,
    kdj[index].k,
  ) && kdj[index].k !== null && kdj[index].d !== null && kdj[index].j !== null
    && kdj[index].k! > kdj[index].d! && kdj[index].j! < 20);

  const signals: TechnicalSignal[] = [];
  candles.forEach((candle, index) => {
    const current = kdj[index];
    const previous = kdj[index - 1];
    const twoBack = kdj[index - 2];
    if (buys[index]) {
      signals.push({
        name: 'BUY_NEW', side: 'buy', timeframe: 'daily', date: candle.date,
        evidence: finiteEvidence({ j: current.j, k: current.k, d: current.d }),
      });
    }
    if (index >= 2 && previous.j !== null && current.j !== null && twoBack.j !== null
      && previous.j > 80 && current.j < previous.j && previous.j > twoBack.j) {
      signals.push({
        name: 'SELL_J_TURN_ABOVE_80', side: 'sell', timeframe: 'daily', date: candle.date,
        evidence: finiteEvidence({ j: current.j, previous_j: previous.j }),
      });
    }
    const upper = boll[index].upper;
    if (upper !== null && candle.high >= upper) {
      signals.push({
        name: 'SELL_TOUCH_UPPER', side: 'sell', timeframe: 'daily', date: candle.date,
        evidence: finiteEvidence({ high: candle.high, boll_upper: upper }),
      });
    }
    if (index > 0 && cross(previous.j, current.j, 100, 100)) {
      signals.push({
        name: 'SELL_J_CROSS_100', side: 'sell', timeframe: 'daily', date: candle.date,
        evidence: finiteEvidence({ j: current.j, previous_j: previous.j }),
      });
    }
    if (index >= 2 && current.j !== null && previous.j !== null && twoBack.j !== null
      && current.j < previous.j && previous.j > twoBack.j && previous.j < 80
      && existsWithin(buys, index, 10)) {
      signals.push({
        name: 'SELL_POST_BUY_TURN', side: 'sell', timeframe: 'daily', date: candle.date,
        evidence: finiteEvidence({ j: current.j, previous_j: previous.j, buy_within_10_bars: true }),
      });
    }
  });
  return signals;
}

export function evaluateWeeklySignals(candles: Candle[], boll: BollingerPoint[]): TechnicalSignal[] {
  const lowerTouches = candles.map((candle, index) => boll[index].lower !== null && candle.low <= boll[index].lower!);
  const upperTouches = candles.map((candle, index) => boll[index].upper !== null && candle.high >= boll[index].upper!);
  const filteredUpper = filterCooldown(upperTouches, 20);
  const signals: TechnicalSignal[] = [];
  candles.forEach((candle, index) => {
    if (lowerTouches[index]) {
      signals.push({
        name: 'WEEKLY_BUY_LOWER', side: 'buy', timeframe: 'weekly', date: candle.date, partial: candle.partial,
        evidence: finiteEvidence({ low: candle.low, boll_lower: boll[index].lower }),
      });
    }
    if (filteredUpper[index]) {
      signals.push({
        name: 'WEEKLY_SELL_UPPER', side: 'sell', timeframe: 'weekly', date: candle.date, partial: candle.partial,
        evidence: finiteEvidence({ high: candle.high, boll_upper: boll[index].upper }),
      });
    }
  });
  return signals;
}
