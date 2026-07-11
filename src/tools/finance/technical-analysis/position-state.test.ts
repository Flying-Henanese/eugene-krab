import { describe, expect, test } from 'bun:test';
import { interpretPositionEvents } from './position-state.js';
import type { TechnicalSignal } from './types.js';

function signal(date: string, side: 'buy' | 'sell', name: TechnicalSignal['name']): TechnicalSignal {
  return { date, side, name, timeframe: 'daily', evidence: {} };
}

test('position interpretation ignores sells while flat and repeated buys while holding', () => {
  const result = interpretPositionEvents([
    signal('20250101', 'sell', 'SELL_TOUCH_UPPER'),
    signal('20250102', 'buy', 'BUY_NEW'),
    signal('20250103', 'buy', 'BUY_NEW'),
    signal('20250104', 'sell', 'SELL_J_CROSS_100'),
    signal('20250104', 'sell', 'SELL_TOUCH_UPPER'),
  ]);
  expect(result).toEqual([
    { date: '20250102', action: 'open', signal: 'BUY_NEW' },
    { date: '20250104', action: 'close', signal: 'SELL_J_CROSS_100' },
  ]);
});
