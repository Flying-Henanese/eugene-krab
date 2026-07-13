import { describe, expect, test } from 'bun:test';
import { ToolExecutionBudget } from './tool-budget.js';

describe('ToolExecutionBudget', () => {
  test('enforces the total execution budget exactly', () => {
    const budget = new ToolExecutionBudget({ maxTotalExecutions: 2 });

    expect(budget.reserve('web_search').allowed).toBe(true);
    expect(budget.reserve('web_fetch').allowed).toBe(true);
    const rejected = budget.reserve('read_filings');

    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toBe('total-exhausted');
    expect(rejected.executedTotal).toBe(2);
    expect(budget.isTotalExhausted()).toBe(true);
    expect(budget.remainingTotal()).toBe(0);
  });

  test('enforces a per-tool budget without consuming unused total budget', () => {
    const budget = new ToolExecutionBudget({
      maxTotalExecutions: 4,
      perTool: { web_search: 1 },
    });

    expect(budget.reserve('web_search').allowed).toBe(true);
    const rejected = budget.reserve('web_search');

    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toBe('tool-exhausted');
    expect(budget.remainingTotal()).toBe(3);
    expect(budget.getUsage()).toEqual({
      executedTotal: 1,
      remainingTotal: 3,
      perTool: { web_search: 1 },
    });
  });

  test('allows unlisted tools subject to the total budget', () => {
    const budget = new ToolExecutionBudget({
      maxTotalExecutions: 3,
      perTool: { web_search: 1 },
    });

    expect(budget.reserve('web_search').allowed).toBe(true);
    expect(budget.reserve('get_market_data').allowed).toBe(true);
    expect(budget.reserve('read_filings').allowed).toBe(true);
    expect(budget.getUsage().perTool).toEqual({
      web_search: 1,
      get_market_data: 1,
      read_filings: 1,
    });
  });

  test('rejections never consume execution count', () => {
    const budget = new ToolExecutionBudget({
      maxTotalExecutions: 3,
      perTool: { web_search: 1 },
    });

    budget.reserve('web_search');
    budget.reserve('web_search');
    budget.reserve('web_search');

    expect(budget.getUsage().executedTotal).toBe(1);
    expect(budget.remainingTotal()).toBe(2);
    expect(budget.isTotalExhausted()).toBe(false);
  });

  test('rejects invalid total and per-tool configurations', () => {
    expect(() => new ToolExecutionBudget({ maxTotalExecutions: 0 })).toThrow(
      'maxTotalExecutions must be a positive integer',
    );
    expect(() => new ToolExecutionBudget({ maxTotalExecutions: 1.5 })).toThrow(
      'maxTotalExecutions must be a positive integer',
    );
    expect(() => new ToolExecutionBudget({
      maxTotalExecutions: 2,
      perTool: { web_search: -1 },
    })).toThrow('perTool.web_search must be a positive integer');
  });
});
