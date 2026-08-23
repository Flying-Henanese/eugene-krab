import { afterEach, describe, expect, test } from 'bun:test';
import { getChatModel, resolveDeepSeekReasoningEffort } from './llm.js';

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

describe('OpenAI API routing', () => {
  test('uses the Responses API for the GPT-5.6 family', () => {
    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';

    try {
      for (const model of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
        const llm = getChatModel(model) as { useResponsesApi?: boolean };
        expect(llm.useResponsesApi).toBe(true);
      }
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });
});
