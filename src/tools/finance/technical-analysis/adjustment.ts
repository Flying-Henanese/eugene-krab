import type { TushareRow } from '../tushare/client.js';
import { rowNumber } from './math.js';
import type { AdjustmentMode, Candle } from './types.js';

export interface NormalizeResult {
  candles: Candle[];
  missingFactorDates: string[];
  rejectedRows: number;
}

function rowString(row: TushareRow, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function normalizeDailyRows(
  symbol: string,
  rows: TushareRow[],
  adjustment: AdjustmentMode,
  factorRows: TushareRow[] = [],
): NormalizeResult {
  const factorByDate = new Map<string, number>();
  for (const row of factorRows) {
    const date = rowString(row, 'trade_date');
    const factor = rowNumber(row, 'adj_factor');
    if (date && factor !== null && factor > 0) factorByDate.set(date, factor);
  }

  const parsed = rows.flatMap((row) => {
    const date = rowString(row, 'trade_date');
    const open = rowNumber(row, 'open');
    const high = rowNumber(row, 'high');
    const low = rowNumber(row, 'low');
    const close = rowNumber(row, 'close');
    if (!date || [open, high, low, close].some((value) => value === null)) return [];
    return [{
      date,
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: rowNumber(row, 'vol'),
      amount: rowNumber(row, 'amount'),
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));

  for (let index = 1; index < parsed.length; index++) {
    if (parsed[index].date <= parsed[index - 1].date) {
      throw new Error(`Daily candles contain duplicate or non-monotonic date ${parsed[index].date}`);
    }
  }

  const latestFactor = adjustment === 'qfq'
    ? factorByDate.get(parsed.at(-1)?.date ?? '') ?? null
    : null;
  const missingFactorDates: string[] = [];
  const candles = parsed.flatMap((row): Candle[] => {
    let ratio = 1;
    if (adjustment === 'qfq') {
      const factor = factorByDate.get(row.date);
      if (factor === undefined || latestFactor === null) {
        missingFactorDates.push(row.date);
        return [];
      }
      ratio = factor / latestFactor;
    }
    return [{
      symbol,
      date: row.date,
      open: row.open * ratio,
      high: row.high * ratio,
      low: row.low * ratio,
      close: row.close * ratio,
      volume: row.volume,
      amount: row.amount,
      adjustment,
    }];
  });

  return { candles, missingFactorDates, rejectedRows: rows.length - parsed.length };
}
