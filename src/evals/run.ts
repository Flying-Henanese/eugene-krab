/**
 * LangSmith evaluation runner for Eugene Krab.
 *
 * Examples:
 *   bun run src/evals/run.ts --dry-run --suite a-share
 *   bun run src/evals/run.ts --suite finance --quick
 *   bun run src/evals/run.ts --suite a-share --judge-mode manual --case q2
 *   bun run src/evals/run.ts --suite a-share --judge-mode manual --case q2 --headless
 */

import 'dotenv/config';
import { ProcessTerminal, TUI } from '@mariozechner/pi-tui';
import { Client } from 'langsmith';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../agent/agent.js';
import type { DoneEvent } from '../agent/types.js';
import { decodeSubagentProgress } from '../tools/subagent/progress.js';
import { dexterPath } from '../utils/paths.js';
import { getModelDisplayName } from '../utils/model.js';
import { evaluateBehavior, type EvalTrace } from './behavior.js';
import { EvalApp, type EvalProgressEvent } from './components/index.js';
import { loadEvalDataset, type EvalExample } from './dataset.js';
import {
  createRubricEvaluator,
  type RubricEvaluationResult,
} from './evaluator.js';
import {
  appendManualReviewCase,
  createManualReviewBundle,
  createManualReviewCase,
  writeManualReviewBundle,
} from './manual-review.js';
import { parseEvalOptions, type EvalOptions, type EvalSuite } from './options.js';
import { selectEvalExamples } from './sampling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type FailureType = 'agent_error' | 'timeout' | 'judge_error';

interface TargetResult extends EvalTrace {
  totalTimeMs: number;
  failureType?: FailureType;
  failureMessage?: string;
}

interface EvalQuestionResult {
  index: number;
  id: string;
  question: string;
  questionType: string;
  score: number | null;
  semanticStatus: 'scored' | 'pending' | 'unavailable';
  exactPass: boolean;
  behaviorPass: boolean;
  comment: string;
  answer: string;
  failureType?: FailureType;
  failureMessage?: string;
  contradictionDetected: boolean;
  passedCriteria: number;
  totalCriteria: number;
  criteria: RubricEvaluationResult['criteria'];
  toolCalls: DoneEvent['toolCalls'];
  behaviorChecks: ReturnType<typeof evaluateBehavior>['checks'];
  latencyMs: number;
  agentLatencyMs: number;
  judgeLatencyMs: number;
  iterations: number;
  topLevelToolCallCount: number;
  maxObservedSubagentToolCalls: number;
}

function datasetFileForSuite(suite: EvalSuite): string {
  return suite === 'a-share' ? 'a_share_agent.csv' : 'finance_agent.csv';
}

function slugify(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'value';
}

function classifyAgentAnswer(answer: string): Pick<TargetResult, 'failureType' | 'failureMessage'> {
  if (answer.startsWith('Reached maximum iterations') || answer.startsWith('Error:')) {
    return { failureType: 'agent_error', failureMessage: answer };
  }
  return {};
}

async function target(example: EvalExample, options: EvalOptions): Promise<TargetResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const startedAt = Date.now();
  let maxObservedSubagentToolCalls = 0;

  try {
    const agent = await Agent.create({
      model: options.model,
      maxIterations: 10,
      memoryEnabled: false,
      channel: 'eval',
      signal: controller.signal,
    });
    let doneEvent: DoneEvent | null = null;

    for await (const event of agent.run(example.inputs.question)) {
      if (event.type === 'tool_progress' && event.tool === 'spawn_subagent') {
        const progress = decodeSubagentProgress(event.message);
        if (progress) {
          maxObservedSubagentToolCalls = Math.max(
            maxObservedSubagentToolCalls,
            progress.toolUseCount,
          );
        }
      } else if (event.type === 'done') {
        doneEvent = event;
      }
    }

    if (!doneEvent) {
      return {
        answer: '',
        iterations: 0,
        toolCalls: [],
        maxObservedSubagentToolCalls,
        totalTimeMs: Date.now() - startedAt,
        failureType: 'agent_error',
        failureMessage: 'Agent did not produce a final answer.',
      };
    }

    return {
      answer: doneEvent.answer,
      iterations: doneEvent.iterations,
      toolCalls: doneEvent.toolCalls,
      maxObservedSubagentToolCalls,
      totalTimeMs: doneEvent.totalTime,
      ...classifyAgentAnswer(doneEvent.answer),
    };
  } catch (error) {
    return {
      answer: '',
      iterations: 0,
      toolCalls: [],
      maxObservedSubagentToolCalls,
      totalTimeMs: Date.now() - startedAt,
      failureType: controller.signal.aborted ? 'timeout' : 'agent_error',
      failureMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function failedResult(
  example: EvalExample,
  index: number,
  targetResult: TargetResult,
  agentLatencyMs: number,
  manualJudge: boolean,
): EvalQuestionResult {
  const behavior = evaluateBehavior(example.behavior, targetResult);
  return {
    index,
    id: example.id,
    question: example.inputs.question,
    questionType: example.questionType,
    score: manualJudge ? null : 0,
    semanticStatus: 'unavailable',
    exactPass: false,
    behaviorPass: false,
    comment: targetResult.failureMessage ?? targetResult.failureType ?? 'Agent failure',
    answer: targetResult.answer,
    failureType: targetResult.failureType,
    failureMessage: targetResult.failureMessage,
    contradictionDetected: false,
    passedCriteria: 0,
    totalCriteria: example.rubric.filter(
      (criterion) => criterion.operator === 'correctness',
    ).length,
    criteria: [],
    toolCalls: targetResult.toolCalls,
    behaviorChecks: behavior.checks,
    latencyMs: agentLatencyMs,
    agentLatencyMs,
    judgeLatencyMs: 0,
    iterations: targetResult.iterations,
    topLevelToolCallCount: targetResult.toolCalls.length,
    maxObservedSubagentToolCalls: targetResult.maxObservedSubagentToolCalls,
  };
}

async function evaluateExample(
  example: EvalExample,
  index: number,
  options: EvalOptions,
  evaluateRubric?: ReturnType<typeof createRubricEvaluator>,
): Promise<EvalQuestionResult> {
  const startedAt = Date.now();
  const targetResult = await target(example, options);
  const agentLatencyMs = Date.now() - startedAt;
  if (targetResult.failureType) {
    return failedResult(
      example,
      index,
      targetResult,
      agentLatencyMs,
      options.judgeMode === 'manual',
    );
  }

  const behavior = evaluateBehavior(example.behavior, targetResult);
  if (!evaluateRubric) {
    const failedChecks = behavior.checks.filter((check) => !check.passed);
    return {
      index,
      id: example.id,
      question: example.inputs.question,
      questionType: example.questionType,
      score: null,
      semanticStatus: 'pending',
      exactPass: false,
      behaviorPass: behavior.passed,
      comment: failedChecks.length > 0
        ? `Awaiting manual semantic review. Behavior failures: ${failedChecks.map((check) => check.id).join(', ')}`
        : 'Awaiting manual semantic review.',
      answer: targetResult.answer,
      contradictionDetected: false,
      passedCriteria: 0,
      totalCriteria: example.rubric.filter(
        (criterion) => criterion.operator === 'correctness',
      ).length,
      criteria: [],
      toolCalls: targetResult.toolCalls,
      behaviorChecks: behavior.checks,
      latencyMs: Date.now() - startedAt,
      agentLatencyMs,
      judgeLatencyMs: 0,
      iterations: targetResult.iterations,
      topLevelToolCallCount: targetResult.toolCalls.length,
      maxObservedSubagentToolCalls: targetResult.maxObservedSubagentToolCalls,
    };
  }

  const judgeStartedAt = Date.now();
  try {
    const rubric = await evaluateRubric(example, targetResult.answer);
    const failedChecks = behavior.checks.filter((check) => !check.passed);
    return {
      index,
      id: example.id,
      question: example.inputs.question,
      questionType: example.questionType,
      score: rubric.score,
      semanticStatus: 'scored',
      exactPass: rubric.score === 1 && behavior.passed,
      behaviorPass: behavior.passed,
      comment: failedChecks.length > 0
        ? `${rubric.comment} Behavior failures: ${failedChecks.map((check) => check.id).join(', ')}`
        : rubric.comment,
      answer: targetResult.answer,
      contradictionDetected: rubric.contradictionDetected,
      passedCriteria: rubric.passedCriteria,
      totalCriteria: rubric.totalCriteria,
      criteria: rubric.criteria,
      toolCalls: targetResult.toolCalls,
      behaviorChecks: behavior.checks,
      latencyMs: Date.now() - startedAt,
      agentLatencyMs,
      judgeLatencyMs: Date.now() - judgeStartedAt,
      iterations: targetResult.iterations,
      topLevelToolCallCount: targetResult.toolCalls.length,
      maxObservedSubagentToolCalls: targetResult.maxObservedSubagentToolCalls,
    };
  } catch (error) {
    return {
      ...failedResult(example, index, targetResult, agentLatencyMs, false),
      behaviorPass: behavior.passed,
      behaviorChecks: behavior.checks,
      failureType: 'judge_error',
      failureMessage: error instanceof Error ? error.message : String(error),
      comment: `Judge error: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs: Date.now() - startedAt,
      judgeLatencyMs: Date.now() - judgeStartedAt,
    };
  }
}

async function ensureLangSmithDataset(
  client: Client,
  datasetName: string,
  examples: EvalExample[],
  datasetHash: string,
) {
  try {
    return await client.readDataset({ datasetName });
  } catch {
    const dataset = await client.createDataset(datasetName, {
      description: `Eugene Krab evaluation dataset hash ${datasetHash}`,
    });
    await client.createExamples({
      datasetId: dataset.id,
      inputs: examples.map((example) => example.inputs),
      outputs: examples.map((example) => example.outputs),
    });
    return dataset;
  }
}

async function trackResult(
  client: Client,
  experimentName: string,
  datasetName: string,
  datasetHash: string,
  example: EvalExample,
  result: EvalQuestionResult,
  options: EvalOptions,
): Promise<string | undefined> {
  try {
    await client.createRun({
      name: 'eugene-krab-eval-run',
      run_type: 'chain',
      inputs: example.inputs,
      outputs: { answer: result.answer },
      start_time: Date.now() - result.latencyMs,
      end_time: Date.now(),
      project_name: experimentName,
      extra: {
        dataset: datasetName,
        dataset_hash: datasetHash,
        suite: options.suite,
        question_type: example.questionType,
        expert_time_minutes: example.expertTimeMinutes,
        sources: example.sources,
        models: { target: options.model, judge: options.judgeModel },
        judge_mode: options.judgeMode,
        eval_options: {
          quick: options.quick,
          sample_size: options.sampleSize,
          case_ids: options.caseIds,
          seed: options.seed,
          concurrency: options.concurrency,
          timeout_ms: options.timeoutMs,
        },
        semantic_evaluation: {
          score: result.score,
          contradiction_detected: result.contradictionDetected,
          passed_criteria: result.passedCriteria,
          total_criteria: result.totalCriteria,
          criteria: result.criteria,
        },
        behavior_evaluation: {
          passed: result.behaviorPass,
          checks: result.behaviorChecks,
        },
        telemetry: {
          exact_pass: result.exactPass,
          latency_ms: result.latencyMs,
          agent_latency_ms: result.agentLatencyMs,
          judge_latency_ms: result.judgeLatencyMs,
          iterations: result.iterations,
          top_level_tool_call_count: result.topLevelToolCallCount,
          max_observed_subagent_tool_calls: result.maxObservedSubagentToolCalls,
          failure_type: result.failureType,
          failure_message: result.failureMessage,
        },
      },
    });
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function* runExamples(
  examples: EvalExample[],
  options: EvalOptions,
  evaluateRubric?: ReturnType<typeof createRubricEvaluator>,
): AsyncGenerator<
  | { type: 'start'; example: EvalExample; index: number }
  | { type: 'end'; example: EvalExample; result: EvalQuestionResult },
  void,
  unknown
> {
  let nextIndex = 0;
  const running = new Map<number, Promise<EvalQuestionResult>>();

  while (nextIndex < examples.length || running.size > 0) {
    while (nextIndex < examples.length && running.size < options.concurrency) {
      const index = nextIndex;
      const example = examples[index];
      yield { type: 'start', example, index };
      running.set(index, evaluateExample(example, index, options, evaluateRubric));
      nextIndex++;
    }

    const completed = await Promise.race(
      [...running.entries()].map(async ([index, promise]) => ({
        index,
        result: await promise,
      })),
    );
    running.delete(completed.index);
    yield {
      type: 'end',
      example: examples[completed.index],
      result: completed.result,
    };
  }
}

function selectedDataset(options: EvalOptions) {
  const datasetPath = path.join(__dirname, 'dataset', datasetFileForSuite(options.suite));
  const dataset = loadEvalDataset(datasetPath);
  const examples = selectEvalExamples(dataset.examples, options);
  if (options.caseIds?.length && examples.length !== new Set(options.caseIds).size) {
    const found = new Set(examples.map((example) => example.id));
    const missing = options.caseIds.filter((id) => !found.has(id));
    throw new Error(`Unknown case id(s) for ${options.suite}: ${missing.join(', ')}`);
  }
  return { dataset, examples };
}

function validateLivePrerequisites(options: EvalOptions, examples: EvalExample[]): void {
  if (options.suite !== 'a-share') {
    return;
  }
  if (!process.env.TUSHARE_TOKEN) {
    throw new Error('TUSHARE_TOKEN is required for the live a-share eval suite.');
  }

  const needsCurrentInformation = examples.some(
    (example) => example.questionType === 'A股综合路由'
      || example.questionType === '研究子代理边界',
  );
  const hasSearchProvider = [
    'EXASEARCH_API_KEY',
    'PERPLEXITY_API_KEY',
    'TAVILY_API_KEY',
    'LANGSEARCH_API_KEY',
  ].some((name) => Boolean(process.env[name]));
  if (needsCurrentInformation && !hasSearchProvider) {
    throw new Error(
      'A configured web-search provider is required for the selected current-information cases.',
    );
  }
}

function printDryRun(options: EvalOptions): void {
  const { dataset, examples } = selectedDataset(options);
  const semanticCriteria = examples.reduce((sum, example) => sum + example.rubric.length, 0);
  const behaviorCases = examples.filter((example) => example.behavior).length;
  const sourceReferences = examples.reduce((sum, example) => sum + example.sources.length, 0);

  console.log(`Suite: ${options.suite}`);
  console.log(`Target model: ${options.model}`);
  console.log(`Judge mode: ${options.judgeMode}`);
  console.log(
    options.judgeMode === 'manual'
      ? 'Judge model: none (manual review artifact)'
      : `Judge model: ${options.judgeModel}`,
  );
  console.log(`Dataset hash: ${dataset.hash}`);
  console.log(`Selected cases: ${examples.length}/${dataset.examples.length}`);
  console.log(`Case ids: ${examples.map((example) => example.id).join(', ') || 'none'}`);
  console.log(`Semantic criteria: ${semanticCriteria}`);
  console.log(`Behavior-gated cases: ${behaviorCases}`);
  console.log(`Frozen source references: ${sourceReferences}`);
  console.log(`Output mode: ${options.headless ? 'headless' : 'tui'}`);
  console.log('Dry run only: no model, LangSmith, or market-data calls were made.');
}

function createEvaluationRunner(options: EvalOptions) {
  return async function* runEvaluation(): AsyncGenerator<EvalProgressEvent, void, unknown> {
    const { dataset, examples } = selectedDataset(options);
    validateLivePrerequisites(options, examples);
    const evaluateRubric = options.judgeMode === 'manual'
      ? undefined
      : createRubricEvaluator(options.judgeModel);
    const client = options.judgeMode === 'manual' ? undefined : new Client();
    const datasetName = [
      'eugene-krab',
      options.suite,
      dataset.hash,
      options.quick ? 'quick' : options.sampleSize ? `sample-${options.sampleSize}` : 'full',
    ].join('-');

    yield {
      type: 'init',
      total: examples.length,
      datasetName,
    };

    const experimentName = [
      'eugene-krab-eval',
      options.suite,
      slugify(options.model),
      'judge',
      options.judgeMode === 'manual' ? 'manual' : slugify(options.judgeModel),
      dataset.hash,
      Date.now().toString(36),
    ].join('-');
    let datasetSetupError: string | undefined;
    if (client) {
      try {
        await ensureLangSmithDataset(client, datasetName, examples, dataset.hash);
      } catch (error) {
        datasetSetupError = error instanceof Error ? error.message : String(error);
      }
    }

    const manualReviewPath = options.judgeMode === 'manual'
      ? path.resolve(dexterPath('evals', `${experimentName}.json`))
      : undefined;
    let manualReviewBundle = manualReviewPath
      ? createManualReviewBundle({
          runId: experimentName,
          createdAt: new Date().toISOString(),
          suite: options.suite,
          datasetHash: dataset.hash,
          targetModel: options.model,
          selectedCaseIds: examples.map((example) => example.id),
        })
      : undefined;
    if (manualReviewPath && manualReviewBundle) {
      writeManualReviewBundle(manualReviewPath, manualReviewBundle);
    }

    for await (const event of runExamples(examples, options, evaluateRubric)) {
      if (event.type === 'start') {
        yield { type: 'question_start', question: event.example.inputs.question };
        continue;
      }

      let trackingError: string | undefined;
      if (client) {
        trackingError = await trackResult(
          client,
          experimentName,
          datasetName,
          dataset.hash,
          event.example,
          event.result,
          options,
        );
      }
      if (manualReviewPath && manualReviewBundle) {
        manualReviewBundle = appendManualReviewCase(
          manualReviewBundle,
          createManualReviewCase(event.example, event.result),
          new Date().toISOString(),
        );
        writeManualReviewBundle(manualReviewPath, manualReviewBundle);
      }
      yield {
        type: 'question_end',
        question: event.result.question,
        score: event.result.score,
        behaviorPass: event.result.behaviorPass,
        comment: trackingError
          ? `${event.result.comment} Tracking error: ${trackingError}`
          : datasetSetupError
            ? `${event.result.comment} Dataset tracking error: ${datasetSetupError}`
            : event.result.comment,
      };
    }

    yield {
      type: 'complete',
      experimentName: options.judgeMode === 'manual'
        ? `${experimentName} • ${getModelDisplayName(options.model)} / manual review`
        : `${experimentName} • ${getModelDisplayName(options.model)} / ${getModelDisplayName(options.judgeModel)}`,
      reviewPath: manualReviewPath,
    };
  };
}

function summarizeQuestion(question: string, maxLength = 72): string {
  const singleLine = question.replace(/\s+/g, ' ').trim();
  return singleLine.length <= maxLength
    ? singleLine
    : `${singleLine.slice(0, maxLength - 3)}...`;
}

async function runHeadlessEvaluation(
  runEvaluation: () => AsyncGenerator<EvalProgressEvent, void, unknown>,
): Promise<void> {
  let total = 0;
  let started = 0;
  let completed = 0;

  for await (const event of runEvaluation()) {
    switch (event.type) {
      case 'init':
        total = event.total ?? 0;
        console.log(`[eval] dataset=${event.datasetName ?? 'unknown'} cases=${total}`);
        break;
      case 'question_start':
        started++;
        console.log(
          `[eval] start ${started}/${total}: ${summarizeQuestion(event.question ?? '')}`,
        );
        break;
      case 'question_end': {
        completed++;
        const semantic = event.score === null || event.score === undefined
          ? 'pending'
          : event.score.toFixed(2);
        const behavior = event.behaviorPass === false ? 'fail' : 'pass';
        console.log(
          `[eval] end ${completed}/${total}: semantic=${semantic} behavior=${behavior}`,
        );
        if (event.comment) {
          console.log(`[eval] note: ${summarizeQuestion(event.comment, 120)}`);
        }
        break;
      }
      case 'complete':
        console.log(`[eval] complete: ${event.experimentName ?? 'unknown'}`);
        if (event.reviewPath) {
          console.log(`[eval] review: ${event.reviewPath}`);
        }
        break;
    }
  }
}

async function main() {
  const options = parseEvalOptions(process.argv.slice(2));
  if (options.dryRun) {
    printDryRun(options);
    return;
  }

  const runEvaluation = createEvaluationRunner(options);
  if (options.headless) {
    await runHeadlessEvaluation(runEvaluation);
    return;
  }

  const tui = new TUI(new ProcessTerminal());
  const evalApp = new EvalApp(tui, runEvaluation);
  tui.addChild(evalApp);
  tui.start();
  try {
    await evalApp.run();
  } finally {
    evalApp.dispose();
    tui.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
