import { DEFAULT_MODEL } from '../model/llm.js';

export const DEFAULT_JUDGE_MODEL = 'claude-opus-4-8';
export const DEFAULT_EVAL_SEED = 'eugene-krab-eval';
export const DEFAULT_EVAL_CONCURRENCY = 1;
export const DEFAULT_EVAL_TIMEOUT_MS = 10 * 60 * 1000;

export type EvalSuite = 'finance' | 'a-share';
export type JudgeMode = 'auto' | 'manual';

export interface EvalOptions {
  model: string;
  judgeModel: string;
  judgeMode: JudgeMode;
  suite: EvalSuite;
  sampleSize?: number;
  quick: boolean;
  seed: string;
  concurrency: number;
  timeoutMs: number;
  allowSelfJudge: boolean;
  dryRun: boolean;
  headless: boolean;
  caseIds?: string[];
}

export function resolveDefaultEvalModel(): string {
  const configuredModel = process.env.DEXTER_AGENT_MODEL?.trim();
  return configuredModel || DEFAULT_MODEL;
}

function readFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function parseSuite(value: string): EvalSuite {
  if (value !== 'finance' && value !== 'a-share') {
    throw new Error(`Invalid suite: ${value}. Expected finance or a-share`);
  }
  return value;
}

function parseJudgeMode(value: string): JudgeMode {
  if (value !== 'auto' && value !== 'manual') {
    throw new Error(`Invalid judge mode: ${value}. Expected auto or manual`);
  }
  return value;
}

export function parseEvalOptions(args: string[]): EvalOptions {
  const options: EvalOptions = {
    model: resolveDefaultEvalModel(),
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
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case '--sample':
        options.sampleSize = parsePositiveInteger(
          readFlagValue(args, index, arg),
          'sample size',
        );
        index++;
        break;
      case '--quick':
        options.quick = true;
        break;
      case '--model':
        options.model = readFlagValue(args, index, arg);
        index++;
        break;
      case '--judge-model':
        options.judgeModel = readFlagValue(args, index, arg);
        index++;
        break;
      case '--judge-mode':
        options.judgeMode = parseJudgeMode(readFlagValue(args, index, arg));
        index++;
        break;
      case '--suite':
        options.suite = parseSuite(readFlagValue(args, index, arg));
        index++;
        break;
      case '--case':
        options.caseIds = [...(options.caseIds ?? []), readFlagValue(args, index, arg)];
        index++;
        break;
      case '--seed':
        options.seed = readFlagValue(args, index, arg);
        index++;
        break;
      case '--concurrency':
        options.concurrency = parsePositiveInteger(
          readFlagValue(args, index, arg),
          'concurrency',
        );
        index++;
        break;
      case '--timeout':
        options.timeoutMs = parsePositiveInteger(
          readFlagValue(args, index, arg),
          'timeout',
        ) * 1000;
        index++;
        break;
      case '--allow-self-judge':
        options.allowSelfJudge = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--headless':
        options.headless = true;
        break;
      default:
        throw new Error(`Unknown eval argument: ${arg}`);
    }
  }

  if (options.quick && options.sampleSize !== undefined) {
    throw new Error('Use either --quick or --sample, not both');
  }
  if (
    options.judgeMode === 'auto'
    && !options.allowSelfJudge
    && options.model === options.judgeModel
  ) {
    throw new Error('Target model and judge model must differ. Pass --allow-self-judge to override.');
  }
  return options;
}
