import { Scratchpad } from './scratchpad.js';
import { TokenCounter } from './token-counter.js';
import { ToolExecutionBudget, type ToolExecutionBudgetConfig } from './tool-budget.js';

export interface RunContextConfig {
  toolExecutionBudget?: ToolExecutionBudgetConfig;
  reserveFinalIteration?: boolean;
}

/**
 * Mutable state for a single agent run.
 */
export interface RunContext {
  readonly query: string;
  readonly scratchpad: Scratchpad;
  readonly tokenCounter: TokenCounter;
  readonly toolBudget?: ToolExecutionBudget;
  readonly reserveFinalIteration: boolean;
  readonly startTime: number;
  iteration: number;
  finalizationScheduled: boolean;
  finalizationInstructionAppended: boolean;
  /**
   * Input token count from the most recent API response.
   * This is the actual context size reported by the API — far more accurate
   * than character-based estimation. Used by manageContextThreshold() to
   * anchor token estimates on real data.
   */
  lastApiInputTokens: number;
}

export function createRunContext(query: string, config: RunContextConfig = {}): RunContext {
  return {
    query,
    scratchpad: new Scratchpad(query),
    tokenCounter: new TokenCounter(),
    toolBudget: config.toolExecutionBudget
      ? new ToolExecutionBudget(config.toolExecutionBudget)
      : undefined,
    reserveFinalIteration:
      config.reserveFinalIteration ?? config.toolExecutionBudget?.reserveFinalIteration ?? false,
    startTime: Date.now(),
    iteration: 0,
    finalizationScheduled: false,
    finalizationInstructionAppended: false,
    lastApiInputTokens: 0,
  };
}
