import { afterEach, describe, expect, test } from 'bun:test';
import { resolveSubagentModel, resolveSubagentReasoningEffort } from './spawn-subagent.js';

const originalSubagentModel = process.env.SUBAGENT_MODEL;
const originalAnalysisModel = process.env.SUBAGENT_ANALYSIS_MODEL;
const originalReasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT;
const originalSubagentReasoningEffort = process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT;

afterEach(() => {
  if (originalSubagentModel === undefined) delete process.env.SUBAGENT_MODEL;
  else process.env.SUBAGENT_MODEL = originalSubagentModel;

  if (originalAnalysisModel === undefined) delete process.env.SUBAGENT_ANALYSIS_MODEL;
  else process.env.SUBAGENT_ANALYSIS_MODEL = originalAnalysisModel;

  if (originalReasoningEffort === undefined) delete process.env.DEEPSEEK_REASONING_EFFORT;
  else process.env.DEEPSEEK_REASONING_EFFORT = originalReasoningEffort;

  if (originalSubagentReasoningEffort === undefined) delete process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT;
  else process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT = originalSubagentReasoningEffort;
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

describe('resolveSubagentReasoningEffort', () => {
  test('uses subagent-specific reasoning effort before main effort', () => {
    process.env.DEEPSEEK_REASONING_EFFORT = 'high';
    process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT = 'low';

    expect(resolveSubagentReasoningEffort()).toBe('low');
  });

  test('falls back to main reasoning effort when subagent effort is unset', () => {
    process.env.DEEPSEEK_REASONING_EFFORT = 'medium';
    delete process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT;

    expect(resolveSubagentReasoningEffort()).toBe('medium');
  });
});
