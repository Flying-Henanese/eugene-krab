import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  callLlmWithMessages,
  getChatModel,
  resolveDeepSeekReasoningEffort,
  resolveGlmReasoningEffort,
} from './llm.js';

const originalReasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT;
const originalGlmApiKey = process.env.GLM_API_KEY;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalGlmReasoningEffort = process.env.GLM_REASONING_EFFORT;

afterEach(() => {
  if (originalReasoningEffort === undefined) delete process.env.DEEPSEEK_REASONING_EFFORT;
  else process.env.DEEPSEEK_REASONING_EFFORT = originalReasoningEffort;

  if (originalGlmApiKey === undefined) delete process.env.GLM_API_KEY;
  else process.env.GLM_API_KEY = originalGlmApiKey;

  if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiApiKey;

  if (originalGlmReasoningEffort === undefined) delete process.env.GLM_REASONING_EFFORT;
  else process.env.GLM_REASONING_EFFORT = originalGlmReasoningEffort;
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

describe('GLM 5.3 Flash routing', () => {
  test('defaults to max and only accepts GLM 5.3 Flash reasoning levels', () => {
    delete process.env.GLM_REASONING_EFFORT;
    expect(resolveGlmReasoningEffort()).toBe('max');

    process.env.GLM_REASONING_EFFORT = 'low';
    expect(resolveGlmReasoningEffort()).toBe('low');

    process.env.GLM_REASONING_EFFORT = 'medium';
    expect(resolveGlmReasoningEffort()).toBe('max');
  });

  test('uses the GLM endpoint and prefers GLM_API_KEY over OPENAI_API_KEY', () => {
    process.env.GLM_API_KEY = 'glm-test-key';
    process.env.OPENAI_API_KEY = 'openai-fallback-key';
    process.env.GLM_REASONING_EFFORT = 'high';

    const llm = getChatModel('glm-5.3-flash') as unknown as {
      apiKey?: string;
      clientConfig: { baseURL?: string };
      disableStreaming?: boolean;
      modelKwargs?: Record<string, unknown>;
    };

    expect(llm.apiKey).toBe('glm-test-key');
    expect(llm.clientConfig.baseURL).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(llm.disableStreaming).toBe(true);
    expect(llm.modelKwargs).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
  });

  test('replays GLM reasoning_content before sending tool results back', async () => {
    const originalFetch = globalThis.fetch;
    const requestBodies: Array<{ messages?: Array<Record<string, unknown>> }> = [];
    let responseIndex = 0;

    const responses = [
      {
        id: 'glm-response-1',
        object: 'chat.completion',
        model: 'glm-5.3-flash',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: '',
              reasoning_content: 'I need the calculator result before answering.',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'financial_calculator', arguments: '{"expression":"1+1"}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      {
        id: 'glm-response-2',
        object: 'chat.completion',
        model: 'glm-5.3-flash',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'The result is 2.' },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? init.body
        : input instanceof Request
          ? await input.clone().text()
          : '';
      requestBodies.push(JSON.parse(body) as { messages?: Array<Record<string, unknown>> });

      return new Response(JSON.stringify(responses[responseIndex++]), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    process.env.GLM_API_KEY = 'glm-test-key';

    try {
      const first = await callLlmWithMessages([new HumanMessage('What is 1 + 1?')], {
        model: 'glm-5.3-flash',
      });
      const firstResponse = first.response as AIMessage;

      expect(firstResponse.additional_kwargs.glm_reasoning_content).toBe(
        'I need the calculator result before answering.',
      );

      await callLlmWithMessages([
        new HumanMessage('What is 1 + 1?'),
        firstResponse,
        new ToolMessage({ content: '2', tool_call_id: 'call-1', name: 'financial_calculator' }),
      ], { model: 'glm-5.3-flash' });

      const replayedAssistantMessage = requestBodies[1].messages?.find(
        (message) => message.role === 'assistant',
      );
      expect(replayedAssistantMessage?.reasoning_content).toBe(
        'I need the calculator result before answering.',
      );
      expect(replayedAssistantMessage?.name).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
