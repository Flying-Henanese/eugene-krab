import fs from 'node:fs';
import path from 'node:path';
import type { DoneEvent } from '../agent/types.js';
import type { BehaviorCheck } from './behavior.js';
import type { EvalExample } from './dataset.js';

export interface ManualReviewCaseResult {
  answer: string;
  toolCalls: DoneEvent['toolCalls'];
  behaviorPass: boolean;
  behaviorChecks: BehaviorCheck[];
  iterations: number;
  latencyMs: number;
  maxObservedSubagentToolCalls: number;
  failureType?: string;
  failureMessage?: string;
}

export interface ManualReviewCase {
  id: string;
  questionType: string;
  question: string;
  referenceAnswer: string;
  rubric: EvalExample['rubric'];
  sources: EvalExample['sources'];
  target: {
    answer: string;
    toolCalls: DoneEvent['toolCalls'];
    iterations: number;
    latencyMs: number;
    maxObservedSubagentToolCalls: number;
    failureType?: string;
    failureMessage?: string;
  };
  behaviorEvaluation: {
    passed: boolean;
    checks: BehaviorCheck[];
  };
  semanticEvaluation: {
    status: 'pending' | 'unavailable';
    score: null;
    comment: string;
    criteria: Array<{
      id: string;
      operator: EvalExample['rubric'][number]['operator'];
      criteria: string;
      judgment: 'pending';
      rationale: string;
    }>;
  };
}

export interface ManualReviewBundle {
  schemaVersion: 1;
  runId: string;
  status: 'pending_review';
  createdAt: string;
  updatedAt: string;
  suite: string;
  datasetHash: string;
  targetModel: string;
  judgeMode: 'manual';
  selectedCaseIds: string[];
  completedCaseIds: string[];
  cases: ManualReviewCase[];
}

export function createManualReviewBundle(input: {
  runId: string;
  createdAt: string;
  suite: string;
  datasetHash: string;
  targetModel: string;
  selectedCaseIds: string[];
}): ManualReviewBundle {
  return {
    schemaVersion: 1,
    runId: input.runId,
    status: 'pending_review',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    suite: input.suite,
    datasetHash: input.datasetHash,
    targetModel: input.targetModel,
    judgeMode: 'manual',
    selectedCaseIds: input.selectedCaseIds,
    completedCaseIds: [],
    cases: [],
  };
}

export function createManualReviewCase(
  example: EvalExample,
  result: ManualReviewCaseResult,
): ManualReviewCase {
  const semanticStatus = result.failureType ? 'unavailable' : 'pending';
  return {
    id: example.id,
    questionType: example.questionType,
    question: example.inputs.question,
    referenceAnswer: example.outputs.answer,
    rubric: example.rubric,
    sources: example.sources,
    target: {
      answer: result.answer,
      toolCalls: result.toolCalls,
      iterations: result.iterations,
      latencyMs: result.latencyMs,
      maxObservedSubagentToolCalls: result.maxObservedSubagentToolCalls,
      failureType: result.failureType,
      failureMessage: result.failureMessage,
    },
    behaviorEvaluation: {
      passed: result.behaviorPass,
      checks: result.behaviorChecks,
    },
    semanticEvaluation: {
      status: semanticStatus,
      score: null,
      comment: result.failureType
        ? 'Target execution failed; semantic review is unavailable.'
        : 'Awaiting manual rubric review.',
      criteria: example.rubric.map((criterion) => ({
        ...criterion,
        judgment: 'pending',
        rationale: '',
      })),
    },
  };
}

export function appendManualReviewCase(
  bundle: ManualReviewBundle,
  reviewCase: ManualReviewCase,
  updatedAt: string,
): ManualReviewBundle {
  const cases = [
    ...bundle.cases.filter((existing) => existing.id !== reviewCase.id),
    reviewCase,
  ].sort(
    (left, right) => bundle.selectedCaseIds.indexOf(left.id) - bundle.selectedCaseIds.indexOf(right.id),
  );
  return {
    ...bundle,
    updatedAt,
    completedCaseIds: cases.map((item) => item.id),
    cases,
  };
}

export function writeManualReviewBundle(
  outputPath: string,
  bundle: ManualReviewBundle,
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf-8');
  fs.renameSync(temporaryPath, outputPath);
}
