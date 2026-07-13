import { describe, expect, test } from 'bun:test';
import {
  selectToolsForIteration,
  shouldScheduleFinalization,
} from './agent-finalization.js';

describe('research finalization policy', () => {
  test('schedules finalization when the total budget is exhausted', () => {
    expect(shouldScheduleFinalization({
      executedCount: 2,
      budgetRejectedCount: 0,
      totalBudgetExhausted: true,
    })).toBe(true);
  });

  test('schedules finalization after a rejected-only turn', () => {
    expect(shouldScheduleFinalization({
      executedCount: 0,
      budgetRejectedCount: 2,
      totalBudgetExhausted: false,
    })).toBe(true);
  });

  test('does not finalize a mixed allowed and rejected turn prematurely', () => {
    expect(shouldScheduleFinalization({
      executedCount: 3,
      budgetRejectedCount: 2,
      totalBudgetExhausted: false,
    })).toBe(false);
  });

  test('forced finalization and the reserved final iteration expose no tools', () => {
    const tools = ['web_search', 'web_fetch'];

    expect(selectToolsForIteration(tools, 3, 8, true, true)).toEqual([]);
    expect(selectToolsForIteration(tools, 8, 8, true, false)).toEqual([]);
  });

  test('unbudgeted agents retain tools on their final iteration', () => {
    const tools = ['web_search'];

    expect(selectToolsForIteration(tools, 8, 8, false, false)).toBe(tools);
  });
});
