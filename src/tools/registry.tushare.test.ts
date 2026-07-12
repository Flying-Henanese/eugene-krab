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
    const tool = getToolRegistry('gpt-5.5').find((item) => item.name === 'a_share_analysis');
    expect(tool).toBeDefined();
    expect(tool?.compactDescription).toContain('multi-period statements');
    expect(tool?.compactDescription).toContain('business composition');
    expect(tool?.compactDescription).toContain('instead of annual-report PDF parsing');
    expect(tool?.tool.description).toContain('updated Tushare rows');
    expect(tool?.tool.description).toContain('compare like-for-like periods');
  });

  test('registers the deterministic financial calculator independently of Tushare', () => {
    delete process.env.TUSHARE_TOKEN;
    const tool = getToolRegistry('gpt-5.5').find((item) => item.name === 'financial_calculator');

    expect(tool).toBeDefined();
    expect(tool?.compactDescription).toContain('万元');
    expect(tool?.tool.description).toContain('cny_10k');
    expect(tool?.concurrencySafe).toBe(true);
  });

  test('registers market_sentiment_analysis only when TUSHARE_TOKEN exists', () => {
    delete process.env.TUSHARE_TOKEN;
    expect(getToolRegistry('gpt-5.5').some((tool) => tool.name === 'market_sentiment_analysis')).toBe(false);

    process.env.TUSHARE_TOKEN = 'test-token';
    expect(getToolRegistry('gpt-5.5').some((tool) => tool.name === 'market_sentiment_analysis')).toBe(true);
  });

  test('registers technical_analysis only with TUSHARE_TOKEN and exposes China technical triggers', () => {
    delete process.env.TUSHARE_TOKEN;
    expect(getToolRegistry('gpt-5.5').some((tool) => tool.name === 'technical_analysis')).toBe(false);

    process.env.TUSHARE_TOKEN = 'test-token';
    const tool = getToolRegistry('gpt-5.5').find((item) => item.name === 'technical_analysis');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('技术面分析');
    expect(tool?.description).toContain('技术结构变化');
    expect(tool?.description).toContain('已发生回撤');
    expect(tool?.description).toContain('China stock index');
    expect(tool?.compactDescription).toContain('MA/BOLL/KDJ');
    expect(tool?.compactDescription).toContain('技术面');
    expect(tool?.compactDescription).toContain('V2.1不进入普通单标的输出');
    expect(tool?.compactDescription).toContain('不预测后续方向');
    expect(tool?.compactDescription).not.toContain('买卖信号');
    expect(tool?.tool.description).toContain('Trend Recovery V1');
    expect(tool?.tool.description).toContain('Applicability V2.1 remains offline research');
    expect(tool?.tool.description).toContain('neutral location observations');
    expect(tool?.tool.description).toContain('Do not claim that an event raises future loss probability');
    expect(tool?.tool.description).toContain('T+5 is not a validated predictive horizon');
    expect(tool?.tool.description).not.toContain('买卖信号');
    expect(tool?.concurrencySafe).toBe(true);
  });

  test('keeps Tavily web_search registration independent from Tushare', () => {
    delete process.env.TUSHARE_TOKEN;
    process.env.TAVILY_API_KEY = 'test-tavily-key';

    const registry = getToolRegistry('gpt-5.5');

    expect(registry.some((tool) => tool.name === 'web_search')).toBe(true);
    expect(registry.some((tool) => tool.name === 'a_share_analysis')).toBe(false);
  });
});
