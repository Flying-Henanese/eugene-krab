import { describe, expect, test } from 'bun:test';
import { DEFAULT_MODEL } from '../model/llm.js';
import {
  DEFAULT_EVAL_CONCURRENCY,
  DEFAULT_EVAL_SEED,
  DEFAULT_EVAL_TIMEOUT_MS,
  DEFAULT_JUDGE_MODEL,
  parseEvalOptions,
  resolveDefaultEvalModel,
} from './options.js';

describe('parseEvalOptions', () => {
  test('uses reproducible defaults', () => {
    const previousModel = process.env.DEXTER_AGENT_MODEL;
    delete process.env.DEXTER_AGENT_MODEL;
    try {
      expect(parseEvalOptions([])).toEqual({
        model: DEFAULT_MODEL,
        judgeModel: DEFAULT_JUDGE_MODEL,
        judgeMode: 'auto',
        suite: 'finance',
        quick: false,
        seed: DEFAULT_EVAL_SEED,
        concurrency: DEFAULT_EVAL_CONCURRENCY,
        timeoutMs: DEFAULT_EVAL_TIMEOUT_MS,
        allowSelfJudge: false,
        dryRun: false,
        headless: false,
      });
    } finally {
      if (previousModel === undefined) {
        delete process.env.DEXTER_AGENT_MODEL;
      } else {
        process.env.DEXTER_AGENT_MODEL = previousModel;
      }
    }
  });

  test('uses the main-agent model from the environment by default', () => {
    const previousModel = process.env.DEXTER_AGENT_MODEL;
    process.env.DEXTER_AGENT_MODEL = 'deepseek-v4-flash';
    try {
      expect(resolveDefaultEvalModel()).toBe('deepseek-v4-flash');
      expect(parseEvalOptions([]).model).toBe('deepseek-v4-flash');
      expect(parseEvalOptions(['--model', 'deepseek-v4-pro']).model).toBe('deepseek-v4-pro');
    } finally {
      if (previousModel === undefined) {
        delete process.env.DEXTER_AGENT_MODEL;
      } else {
        process.env.DEXTER_AGENT_MODEL = previousModel;
      }
    }
  });

  test('parses suite, cases, models, and execution controls', () => {
    expect(parseEvalOptions([
      '--suite', 'a-share',
      '--case', 'q1',
      '--case', 'q3',
      '--model', 'gpt-5.6-terra',
      '--judge-model', 'claude-opus-4-8',
      '--judge-mode', 'manual',
      '--seed', 'routing-v1',
      '--concurrency', '2',
      '--timeout', '120',
      '--dry-run',
      '--headless',
    ])).toMatchObject({
      suite: 'a-share',
      caseIds: ['q1', 'q3'],
      model: 'gpt-5.6-terra',
      judgeModel: 'claude-opus-4-8',
      judgeMode: 'manual',
      seed: 'routing-v1',
      concurrency: 2,
      timeoutMs: 120_000,
      dryRun: true,
      headless: true,
    });
  });

  test('rejects ambiguous or malformed options', () => {
    expect(() => parseEvalOptions(['--quick', '--sample', '2'])).toThrow(
      'Use either --quick or --sample',
    );
    expect(() => parseEvalOptions(['--suite', 'crypto'])).toThrow('Invalid suite');
    expect(() => parseEvalOptions(['--judge-mode', 'hybrid'])).toThrow('Invalid judge mode');
    expect(() => parseEvalOptions([
      '--model', 'gpt-5.5',
      '--judge-model', 'gpt-5.5',
    ])).toThrow('Target model and judge model must differ');
  });

  test('manual judging does not require a different judge model', () => {
    expect(parseEvalOptions([
      '--model', 'deepseek-v4-pro',
      '--judge-model', 'deepseek-v4-pro',
      '--judge-mode', 'manual',
    ])).toMatchObject({
      model: 'deepseek-v4-pro',
      judgeModel: 'deepseek-v4-pro',
      judgeMode: 'manual',
    });
  });
});
