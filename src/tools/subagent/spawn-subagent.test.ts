import { afterEach, describe, expect, test } from 'bun:test';
import { resolveSubagentModel, resolveSubagentReasoningEffort } from './spawn-subagent.js';
import { resolveSubagentTools, SUBAGENT_TYPES, SUBAGENT_TYPE_NAMES } from './types.js';

const originalSubagentModel = process.env.SUBAGENT_MODEL;
const originalAnalysisModel = process.env.SUBAGENT_ANALYSIS_MODEL;
const originalReasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT;
const originalSubagentReasoningEffort = process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT;
const originalAnalysisSubagentReasoningEffort = process.env.DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT;

afterEach(() => {
  if (originalSubagentModel === undefined) delete process.env.SUBAGENT_MODEL;
  else process.env.SUBAGENT_MODEL = originalSubagentModel;

  if (originalAnalysisModel === undefined) delete process.env.SUBAGENT_ANALYSIS_MODEL;
  else process.env.SUBAGENT_ANALYSIS_MODEL = originalAnalysisModel;

  if (originalReasoningEffort === undefined) delete process.env.DEEPSEEK_REASONING_EFFORT;
  else process.env.DEEPSEEK_REASONING_EFFORT = originalReasoningEffort;

  if (originalSubagentReasoningEffort === undefined) delete process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT;
  else process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT = originalSubagentReasoningEffort;

  if (originalAnalysisSubagentReasoningEffort === undefined) delete process.env.DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT;
  else process.env.DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT = originalAnalysisSubagentReasoningEffort;
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
    expect(resolveSubagentModel('deepseek-v4-pro', 'technical-analysis')).toBe('deepseek-v4-flash');
  });

  test('falls back to parent model when provider has no fast model', () => {
    delete process.env.SUBAGENT_MODEL;
    delete process.env.SUBAGENT_ANALYSIS_MODEL;

    expect(resolveSubagentModel('ollama:llama3.1', 'research')).toBe('ollama:llama3.1');
  });
});

describe('resolveSubagentReasoningEffort', () => {
  test('uses analysis-specific reasoning effort only for analysis subagents', () => {
    process.env.DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT = 'high';
    process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT = 'medium';

    expect(resolveSubagentReasoningEffort('analysis')).toBe('high');
    expect(resolveSubagentReasoningEffort('research')).toBe('medium');
    expect(resolveSubagentReasoningEffort('technical-analysis')).toBe('medium');
  });

  test('uses subagent-specific reasoning effort before main effort', () => {
    delete process.env.DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT;
    process.env.DEEPSEEK_REASONING_EFFORT = 'high';
    process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT = 'low';

    expect(resolveSubagentReasoningEffort('research')).toBe('low');
  });

  test('falls back to main reasoning effort when subagent effort is unset', () => {
    delete process.env.DEEPSEEK_ANALYSIS_SUBAGENT_REASONING_EFFORT;
    process.env.DEEPSEEK_REASONING_EFFORT = 'medium';
    delete process.env.DEEPSEEK_SUBAGENT_REASONING_EFFORT;

    expect(resolveSubagentReasoningEffort('analysis')).toBe('medium');
  });
});

describe('resolveSubagentTools', () => {
  test('allows A-share structured data and web context tools for delegated analysis', () => {
    expect(resolveSubagentTools('general-purpose')).toContain('a_share_analysis');
    expect(resolveSubagentTools('general-purpose')).toContain('market_sentiment_analysis');

    const analysisTools = resolveSubagentTools('analysis');
    expect(analysisTools).toContain('a_share_analysis');
    expect(analysisTools).toContain('financial_calculator');
    expect(analysisTools).toContain('market_sentiment_analysis');
    expect(analysisTools).toContain('web_search');

    const analysisPrompt = SUBAGENT_TYPES.analysis.systemPrompt;
    expect(SUBAGENT_TYPES.analysis.whenToUse).toContain('multi-company comparison');
    expect(SUBAGENT_TYPES.analysis.whenToUse).toContain('Ordinary one-company analysis stays in the main agent');
    expect(analysisPrompt).toContain('n_income_attr_p');
    expect(analysisPrompt).toContain('update_flag=1');
    expect(analysisPrompt).toContain('financial_calculator');
    expect(analysisPrompt).toContain('must not depend on annual-report PDF parsing');
    expect(analysisPrompt).toContain('Do not omit a material adverse comparison');
    expect(analysisPrompt).toContain('exactly once');
    expect(analysisPrompt).toContain('operating_cashflow_less_capex');
    expect(analysisPrompt).toContain('not standalone quarterly margins');

    expect(SUBAGENT_TYPE_NAMES).toContain('technical-analysis');
    const technicalTools = resolveSubagentTools('technical-analysis');
    expect(technicalTools).toContain('technical_analysis');
    expect(technicalTools).not.toContain('spawn_subagent');
    expect(technicalTools).not.toContain('ask_user_question');
    expect(resolveSubagentTools('general-purpose')).toContain('technical_analysis');

    const technicalPrompt = SUBAGENT_TYPES['technical-analysis'].systemPrompt;
    expect(technicalPrompt).toContain('current technical state');
    expect(technicalPrompt).toContain('neutral price-location or momentum observations');
    expect(technicalPrompt).toContain('observed structural changes');
    expect(technicalPrompt).toContain('low_zone_momentum_recovery_observation');
    expect(technicalPrompt).toContain('Bollinger-band contact as location evidence');
    expect(technicalPrompt).toContain('Applicability V2.1 remains offline');
    expect(technicalPrompt).toContain('covers a T+N horizon');
    expect(technicalPrompt).toContain('decision-relevant context');
    expect(technicalPrompt).toContain('T+5 is not a validated predictive horizon');
    expect(technicalPrompt).not.toContain('actual positions');
  });
});
