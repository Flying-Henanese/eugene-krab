import { describe, expect, test } from 'bun:test';
import { evaluateBehavior, type EvalTrace } from './behavior.js';

function trace(overrides: Partial<EvalTrace> = {}): EvalTrace {
  return {
    answer: '中性技术状态，数据截至 2026-07-24。',
    iterations: 3,
    toolCalls: [],
    maxObservedSubagentToolCalls: 0,
    ...overrides,
  };
}

describe('behavior evaluator', () => {
  test('distinguishes skill, tool, and subagent routing', () => {
    const result = evaluateBehavior(
      {
        requiredSkills: ['stock-analysis'],
        requiredTools: ['a_share_analysis'],
        forbiddenSubagentTypes: ['analysis', 'general-purpose'],
        anyOfRoutes: [
          { tools: ['technical_analysis'] },
          { subagentTypes: ['technical-analysis'] },
        ],
      },
      trace({
        toolCalls: [
          { tool: 'skill', args: { skill: 'stock-analysis' }, result: 'instructions' },
          { tool: 'a_share_analysis', args: { query: '贵州茅台' }, result: '{}' },
          { tool: 'technical_analysis', args: { ticker: '600519.SH' }, result: '{}' },
        ],
      }),
    );

    expect(result.passed).toBe(true);
    expect(result.checks.map((check) => check.id)).toContain('any_of_routes');
  });

  test('requires two standardized analysis lanes for a comparison', () => {
    const result = evaluateBehavior(
      {
        requiredSubagentTypes: ['analysis'],
        minimumSubagentCalls: { analysis: 2 },
        forbiddenSubagentTypes: ['general-purpose'],
      },
      trace({
        toolCalls: [
          { tool: 'spawn_subagent', args: { subagent_type: 'analysis' }, result: 'A' },
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.find(
      (check) => check.id === 'minimum_subagent_calls:analysis',
    )?.detail).toContain('observed=1');
  });

  test('enforces research child budget and neutral-answer boundary separately', () => {
    const result = evaluateBehavior(
      {
        requiredSubagentTypes: ['research'],
        maxSubagentToolCalls: 6,
        forbiddenAnswerPhrases: ['建议买入', 'trend_recovery_v1'],
      },
      trace({
        answer: '出现 trend_recovery_v1，建议买入。',
        toolCalls: [
          { tool: 'spawn_subagent', args: { subagent_type: 'research' }, result: 'packet' },
        ],
        maxObservedSubagentToolCalls: 7,
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual([
      'max_subagent_tool_calls',
      'forbidden_answer_phrases',
    ]);
  });
});
