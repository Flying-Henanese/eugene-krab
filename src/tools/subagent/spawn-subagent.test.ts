import { afterEach, describe, expect, test } from 'bun:test';
import { resolveSubagentModel } from './spawn-subagent.js';

const originalSubagentModel = process.env.SUBAGENT_MODEL;
const originalAnalysisModel = process.env.SUBAGENT_ANALYSIS_MODEL;

afterEach(() => {
  if (originalSubagentModel === undefined) delete process.env.SUBAGENT_MODEL;
  else process.env.SUBAGENT_MODEL = originalSubagentModel;

  if (originalAnalysisModel === undefined) delete process.env.SUBAGENT_ANALYSIS_MODEL;
  else process.env.SUBAGENT_ANALYSIS_MODEL = originalAnalysisModel;
});

describe('resolveSubagentModel', () => {
  test('defaults DeepSeek subagents to provider fast model', () => {
    delete process.env.SUBAGENT_MODEL;
    delete process.env.SUBAGENT_ANALYSIS_MODEL;

    expect(resolveSubagentModel('deepseek-v4-pro', 'research')).toBe('deepseek-v4-flash');
  });

  test('uses SUBAGENT_MODEL for all subagent types', () => {
    process.env.SUBAGENT_MODEL = 'deepseek-v4-flash';
    delete process.env.SUBAGENT_ANALYSIS_MODEL;

    expect(resolveSubagentModel('deepseek-v4-pro', 'research')).toBe('deepseek-v4-flash');
    expect(resolveSubagentModel('deepseek-v4-pro', 'general-purpose')).toBe('deepseek-v4-flash');
  });

  test('uses SUBAGENT_ANALYSIS_MODEL for analysis subagents only', () => {
    process.env.SUBAGENT_MODEL = 'deepseek-v4-flash';
    process.env.SUBAGENT_ANALYSIS_MODEL = 'deepseek-v4-pro';

    expect(resolveSubagentModel('deepseek-v4-pro', 'analysis')).toBe('deepseek-v4-pro');
    expect(resolveSubagentModel('deepseek-v4-pro', 'research')).toBe('deepseek-v4-flash');
  });

  test('falls back to parent model when provider has no fast model', () => {
    delete process.env.SUBAGENT_MODEL;
    delete process.env.SUBAGENT_ANALYSIS_MODEL;

    expect(resolveSubagentModel('ollama:llama3.1', 'research')).toBe('ollama:llama3.1');
  });
});
