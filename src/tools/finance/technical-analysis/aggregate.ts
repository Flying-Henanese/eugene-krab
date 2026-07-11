import type { Candle } from './types.js';

function parseDate(date: string): Date {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function weekKey(dateText: string): string {
  const date = parseDate(dateText);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return formatDate(date);
}

export function aggregateWeeklyCandles(
  daily: Candle[],
  asOfDate: string,
  completedWeeksOnly = false,
): Candle[] {
  const groups = new Map<string, Candle[]>();
  for (const candle of daily) {
    const key = weekKey(candle.date);
    const group = groups.get(key) ?? [];
    group.push(candle);
    groups.set(key, group);
  }

  const asOfWeek = weekKey(asOfDate);
  const asOfDay = parseDate(asOfDate).getUTCDay() || 7;
  return Array.from(groups.entries()).flatMap(([key, candles]) => {
    const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
    const latestDate = sorted.at(-1)!.date;
    const partial = key === asOfWeek && (asOfDay < 5 || (asOfDay === 5 && latestDate < asOfDate));
    if (partial && completedWeeksOnly) return [];
    const volumes = sorted.map((item) => item.volume);
    const amounts = sorted.map((item) => item.amount);
    return [{
      symbol: sorted[0].symbol,
      date: latestDate,
      open: sorted[0].open,
      high: Math.max(...sorted.map((item) => item.high)),
      low: Math.min(...sorted.map((item) => item.low)),
      close: sorted.at(-1)!.close,
      volume: volumes.some((value) => value === null) ? null : (volumes as number[]).reduce((a, b) => a + b, 0),
      amount: amounts.some((value) => value === null) ? null : (amounts as number[]).reduce((a, b) => a + b, 0),
      adjustment: sorted[0].adjustment,
      partial,
    }];
  });
}
