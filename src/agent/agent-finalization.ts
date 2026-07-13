export const RESEARCH_FINALIZATION_INSTRUCTION =
  'The research tool budget is exhausted. Do not request more tools. Produce the best available evidence packet now. Include dates, attribution, URLs already collected, conflicting evidence, missing information, and limitations.';

export interface ToolExecutionTurnOutcome {
  executedCount: number;
  budgetRejectedCount: number;
  totalBudgetExhausted: boolean;
}

export function shouldScheduleFinalization(outcome: ToolExecutionTurnOutcome): boolean {
  return outcome.totalBudgetExhausted
    || (outcome.budgetRejectedCount > 0 && outcome.executedCount === 0);
}

export function selectToolsForIteration<T>(
  tools: T[],
  iteration: number,
  maxIterations: number,
  reserveFinalIteration: boolean,
  finalizationScheduled: boolean,
): T[] {
  if (finalizationScheduled || (reserveFinalIteration && iteration >= maxIterations)) {
    return [];
  }
  return tools;
}
