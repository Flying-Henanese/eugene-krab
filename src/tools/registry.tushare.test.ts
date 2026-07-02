import { afterEach, describe, expect, test } from 'bun:test';
import { getToolRegistry } from './registry.js';

const originalTushareToken = process.env.TUSHARE_TOKEN;
const originalTavilyKey = process.env.TAVILY_API_KEY;

describe('Tushare tool registration', () => {
  afterEach(() => {
    if (originalTushareToken === undefined) {
      delete process.env.TUSHARE_TOKEN;
    } else {
      process.env.TUSHARE_TOKEN = originalTushareToken;
    }
    if (originalTavilyKey === undefined) {
      delete process.env.TAVILY_API_KEY;
    } else {
      process.env.TAVILY_API_KEY = originalTavilyKey;
    }
  });

  test('registers a_share_analysis only when TUSHARE_TOKEN exists', () => {
    delete process.env.TUSHARE_TOKEN;
    expect(getToolRegistry('gpt-5.5').some((tool) => tool.name === 'a_share_analysis')).toBe(false);

    process.env.TUSHARE_TOKEN = 'test-token';
    expect(getToolRegistry('gpt-5.5').some((tool) => tool.name === 'a_share_analysis')).toBe(true);
  });

  test('keeps Tavily web_search registration independent from Tushare', () => {
    delete process.env.TUSHARE_TOKEN;
    process.env.TAVILY_API_KEY = 'test-tavily-key';

    const registry = getToolRegistry('gpt-5.5');

    expect(registry.some((tool) => tool.name === 'web_search')).toBe(true);
    expect(registry.some((tool) => tool.name === 'a_share_analysis')).toBe(false);
  });
});
