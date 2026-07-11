import type { PositionEvent, TechnicalSignal } from './types.js';

export function interpretPositionEvents(signals: TechnicalSignal[]): PositionEvent[] {
  let holding = false;
  const events: PositionEvent[] = [];
  const daily = signals
    .filter((signal) => signal.timeframe === 'daily')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1));
  for (const signal of daily) {
    if (!holding && signal.side === 'buy') {
      holding = true;
      events.push({ date: signal.date, action: 'open', signal: signal.name });
    } else if (holding && signal.side === 'sell') {
      holding = false;
      events.push({ date: signal.date, action: 'close', signal: signal.name });
    }
  }
  return events;
}
