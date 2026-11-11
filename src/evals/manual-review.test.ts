import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EvalExample } from './dataset.js';
import {
  appendManualReviewCase,
  createManualReviewBundle,
  createManualReviewCase,
  writeManualReviewBundle,
} from './manual-review.js';

const example: EvalExample = {
  id: 'q2',
  inputs: { question: '只做技术分析' },
  outputs: { answer: '应直接调用 technical_analysis' },
  questionType: '技术路由',
  expertTimeMinutes: 10,
  rubric: [
    { id: 'c1', operator: 'correctness', criteria: '包含数据日期' },
    { id: 'c2', operator: 'contradiction', criteria: '给出买入建议' },
  ],
  behavior: { requiredTools: ['technical_analysis'] },
  sources: [],
};

describe('manual review bundle', () => {
  test('keeps semantic judgments pending and preserves deterministic behavior evidence', () => {
    const reviewCase = createManualReviewCase(example, {
      answer: '数据截至今天，技术状态中性。',
      toolCalls: [
        { tool: 'technical_analysis', args: { ticker: '600519.SH' }, result: '{}' },
      ],
      behaviorPass: true,
      behaviorChecks: [
        { id: 'required_tools', passed: true, detail: 'technical_analysis observed' },
      ],
      iterations: 2,
      latencyMs: 100,
      maxObservedSubagentToolCalls: 0,
    });

    expect(reviewCase.semanticEvaluation).toMatchObject({
      status: 'pending',
      score: null,
    });
    expect(reviewCase.semanticEvaluation.criteria).toHaveLength(2);
    expect(reviewCase.behaviorEvaluation.passed).toBe(true);
    expect(reviewCase.target.toolCalls[0].tool).toBe('technical_analysis');
  });

  test('writes an incrementally resumable JSON artifact', () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eugene-eval-'));
    const outputPath = path.join(temporaryDirectory, 'manual-review.json');
    try {
      const bundle = createManualReviewBundle({
        runId: 'run-1',
        createdAt: '2026-07-26T10:00:00.000Z',
        suite: 'a-share',
        datasetHash: 'abc123',
        targetModel: 'deepseek-v4-pro',
        selectedCaseIds: ['q2'],
      });
      const updated = appendManualReviewCase(
        bundle,
        createManualReviewCase(example, {
          answer: 'answer',
          toolCalls: [],
          behaviorPass: false,
          behaviorChecks: [],
          iterations: 1,
          latencyMs: 50,
          maxObservedSubagentToolCalls: 0,
        }),
        '2026-07-26T10:01:00.000Z',
      );

      writeManualReviewBundle(outputPath, updated);
      const saved = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as {
        completedCaseIds: string[];
        cases: unknown[];
      };
      expect(saved.completedCaseIds).toEqual(['q2']);
      expect(saved.cases).toHaveLength(1);
      expect(fs.existsSync(`${outputPath}.tmp`)).toBe(false);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
