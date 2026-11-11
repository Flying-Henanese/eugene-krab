import type { DoneEvent } from '../agent/types.js';
import type {
  BehaviorExpectation,
  BehaviorRoute,
} from './dataset.js';

export interface EvalTrace {
  answer: string;
  iterations: number;
  toolCalls: DoneEvent['toolCalls'];
  maxObservedSubagentToolCalls: number;
}

export interface BehaviorCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface BehaviorEvaluationResult {
  key: 'behavior_gate';
  passed: boolean;
  checks: BehaviorCheck[];
}

function toolNames(trace: EvalTrace): string[] {
  return trace.toolCalls.map((call) => call.tool);
}

function skillNames(trace: EvalTrace): string[] {
  return trace.toolCalls
    .filter((call) => call.tool === 'skill' && typeof call.args.skill === 'string')
    .map((call) => call.args.skill as string);
}

function subagentTypes(trace: EvalTrace): string[] {
  return trace.toolCalls
    .filter((call) => call.tool === 'spawn_subagent')
    .map((call) => {
      return typeof call.args.subagent_type === 'string'
        ? call.args.subagent_type
        : 'general-purpose';
    });
}

function containsAll(actual: string[], expected: string[]): boolean {
  return expected.every((item) => actual.includes(item));
}

function routePassed(
  route: BehaviorRoute,
  tools: string[],
  skills: string[],
  subagents: string[],
): boolean {
  return containsAll(tools, route.tools ?? [])
    && containsAll(skills, route.skills ?? [])
    && containsAll(subagents, route.subagentTypes ?? []);
}

function listCheck(
  checks: BehaviorCheck[],
  id: string,
  actual: string[],
  expected: string[] | undefined,
  mode: 'required' | 'forbidden',
): void {
  if (!expected?.length) {
    return;
  }
  const matches = expected.filter((item) => actual.includes(item));
  const passed = mode === 'required'
    ? matches.length === expected.length
    : matches.length === 0;
  checks.push({
    id,
    passed,
    detail: mode === 'required'
      ? `required=${expected.join(', ')}; observed=${actual.join(', ') || 'none'}`
      : `forbidden=${expected.join(', ')}; observed=${matches.join(', ') || 'none'}`,
  });
}

export function evaluateBehavior(
  expectation: BehaviorExpectation | undefined,
  trace: EvalTrace,
): BehaviorEvaluationResult {
  if (!expectation) {
    return { key: 'behavior_gate', passed: true, checks: [] };
  }

  const tools = toolNames(trace);
  const skills = skillNames(trace);
  const subagents = subagentTypes(trace);
  const checks: BehaviorCheck[] = [];

  listCheck(checks, 'required_tools', tools, expectation.requiredTools, 'required');
  listCheck(checks, 'forbidden_tools', tools, expectation.forbiddenTools, 'forbidden');
  listCheck(checks, 'required_skills', skills, expectation.requiredSkills, 'required');
  listCheck(checks, 'forbidden_skills', skills, expectation.forbiddenSkills, 'forbidden');
  listCheck(
    checks,
    'required_subagent_types',
    subagents,
    expectation.requiredSubagentTypes,
    'required',
  );
  listCheck(
    checks,
    'forbidden_subagent_types',
    subagents,
    expectation.forbiddenSubagentTypes,
    'forbidden',
  );

  if (expectation.minimumSubagentCalls) {
    for (const [type, minimum] of Object.entries(expectation.minimumSubagentCalls)) {
      const observed = subagents.filter((candidate) => candidate === type).length;
      checks.push({
        id: `minimum_subagent_calls:${type}`,
        passed: observed >= minimum,
        detail: `minimum=${minimum}; observed=${observed}`,
      });
    }
  }

  if (expectation.anyOfRoutes?.length) {
    checks.push({
      id: 'any_of_routes',
      passed: expectation.anyOfRoutes.some((route) => routePassed(route, tools, skills, subagents)),
      detail: `observed tools=${tools.join(', ') || 'none'}; skills=${skills.join(', ') || 'none'}; subagents=${subagents.join(', ') || 'none'}`,
    });
  }

  if (expectation.maxTopLevelToolCalls !== undefined) {
    checks.push({
      id: 'max_top_level_tool_calls',
      passed: trace.toolCalls.length <= expectation.maxTopLevelToolCalls,
      detail: `maximum=${expectation.maxTopLevelToolCalls}; observed=${trace.toolCalls.length}`,
    });
  }

  if (expectation.maxSubagentToolCalls !== undefined) {
    checks.push({
      id: 'max_subagent_tool_calls',
      passed: trace.maxObservedSubagentToolCalls <= expectation.maxSubagentToolCalls,
      detail: `maximum=${expectation.maxSubagentToolCalls}; observed=${trace.maxObservedSubagentToolCalls}`,
    });
  }

  if (expectation.forbiddenAnswerPhrases?.length) {
    const normalizedAnswer = trace.answer.toLocaleLowerCase();
    const matches = expectation.forbiddenAnswerPhrases.filter(
      (phrase) => normalizedAnswer.includes(phrase.toLocaleLowerCase()),
    );
    checks.push({
      id: 'forbidden_answer_phrases',
      passed: matches.length === 0,
      detail: `observed=${matches.join(', ') || 'none'}`,
    });
  }

  return {
    key: 'behavior_gate',
    passed: checks.every((check) => check.passed),
    checks,
  };
}
