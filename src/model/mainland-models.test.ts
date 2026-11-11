import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getChatModel, getFastModel } from './llm.js';
import { getModelDisplayName, getModelIdsForProvider } from '../utils/model.js';

const originalFetch = globalThis.fetch;
const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
const originalMoonshotKey = process.env.MOONSHOT_API_KEY;
const originalEffort = process.env.DEEPSEEK_REASONING_EFFORT;
let requests: Array<{ url: string; body: Record<string, unknown> }> = [];

beforeEach(() => {
  requests = [];
  process.env.DEEPSEEK_API_KEY = 'deepseek-test-key';
  process.env.MOONSHOT_API_KEY = 'moonshot-test-key';
  process.env.DEEPSEEK_REASONING_EFFORT = 'high';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '{}';
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, body: JSON.parse(body) });
    return new Response(JSON.stringify({
      id: 'mainland-test', object: 'chat.completion', created: 0,
      model: 'mainland-test',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [
    ['DEEPSEEK_API_KEY', originalDeepSeekKey],
    ['MOONSHOT_API_KEY', originalMoonshotKey],
    ['DEEPSEEK_REASONING_EFFORT', originalEffort],
  ]) {
    if (value === undefined) delete process.env[name!];
    else process.env[name!] = value;
  }
});

describe('mainland model updates', () => {
  test('adds current upstream model IDs while retaining older choices and GLM', () => {
    expect(getModelIdsForProvider('deepseek')).toEqual(['deepseek-v4-pro', 'deepseek-flash', 'deepseek-v4-flash']);
    expect(getModelIdsForProvider('moonshot')).toEqual(['kimi-k3', 'kimi-k2-5']);
    expect(getModelIdsForProvider('glm')).toContain('glm-5.3-flash');
    expect(getModelDisplayName('deepseek-flash')).toBe('DeepSeek V4.1 Flash');
    expect(getModelDisplayName('kimi-k3')).toBe('Kimi K3');
    expect(getFastModel('deepseek', 'deepseek-v4-pro')).toBe('deepseek-flash');
    expect(getFastModel('moonshot', 'kimi-k2-5')).toBe('kimi-k3');
    expect(getFastModel('glm', 'glm-5.3-flash')).toBe('glm-5.3-flash');
  });

  test.each(['deepseek-v4-pro', 'deepseek-flash', 'deepseek-v4-flash'])('%s preserves explicit reasoning effort on the DeepSeek endpoint', async model => {
    await getChatModel(model, false, { reasoningEffort: 'low' }).invoke('test');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.deepseek.com/chat/completions');
    expect(requests[0]?.body).toMatchObject({ model, reasoning_effort: 'low', thinking: { type: 'enabled' } });
  });

  test('Kimi K3 uses the existing mainland endpoint', async () => {
    await getChatModel('kimi-k3').invoke('test');
    expect(requests[0]?.url).toBe('https://api.moonshot.cn/v1/chat/completions');
    expect(requests[0]?.body.model).toBe('kimi-k3');
  });

  test('uses the configured DeepSeek effort when no per-call override is supplied', async () => {
    process.env.DEEPSEEK_REASONING_EFFORT = 'medium';
    await getChatModel('deepseek-flash').invoke('test');
    expect(requests[0]?.body.reasoning_effort).toBe('medium');
  });

  test('explicit provider selection still wins over the model-name prefix', async () => {
    await getChatModel('deployment-alias', false, { provider: 'deepseek' }).invoke('test');
    expect(requests[0]?.url).toBe('https://api.deepseek.com/chat/completions');
    expect(requests[0]?.body.model).toBe('deployment-alias');
  });
});
