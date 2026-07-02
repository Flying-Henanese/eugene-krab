import { afterEach, describe, expect, test } from 'bun:test';
import { resolveDeepSeekReasoningEffort } from './llm.js';

const originalReasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT;

afterEach(() => {
  if (originalReasoningEffort === undefined) delete process.env.DEEPSEEK_REASONING_EFFORT;
  else process.env.DEEPSEEK_REASONING_EFFORT = originalReasoningEffort;
});

describe('resolveDeepSeekReasoningEffort', () => {
  test('defaults to high when unset', () => {
    delete process.env.DEEPSEEK_REASONING_EFFORT;

    expect(resolveDeepSeekReasoningEffort()).toBe('high');
  });

  test('uses DEEPSEEK_REASONING_EFFORT when valid', () => {
    process.env.DEEPSEEK_REASONING_EFFORT = 'medium';

    expect(resolveDeepSeekReasoningEffort()).toBe('medium');
  });

  test('falls back to high for invalid values', () => {
    process.env.DEEPSEEK_REASONING_EFFORT = 'maximum';

    expect(resolveDeepSeekReasoningEffort()).toBe('high');
  });
});
