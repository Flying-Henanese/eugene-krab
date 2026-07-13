export interface ToolExecutionBudgetConfig {
  maxTotalExecutions: number;
  perTool?: Record<string, number>;
  /** Optional convenience flag; AgentConfig.reserveFinalIteration takes precedence. */
  reserveFinalIteration?: boolean;
}

export type ToolBudgetRejectionReason = 'total-exhausted' | 'tool-exhausted';

export interface ToolBudgetReservation {
  allowed: boolean;
  toolName: string;
  executedTotal: number;
  toolExecutions: number;
  reason?: ToolBudgetRejectionReason;
  message?: string;
}

export interface ToolBudgetUsage {
  executedTotal: number;
  remainingTotal: number;
  perTool: Record<string, number>;
}

/**
 * Synchronous per-run execution budget. reserve() checks and increments in one
 * step so concurrent tool generators cannot all observe a stale count.
 */
export class ToolExecutionBudget {
  private readonly maxTotalExecutions: number;
  private readonly perToolLimits: Readonly<Record<string, number>>;
  private executedTotal = 0;
  private readonly toolExecutions = new Map<string, number>();

  constructor(config: ToolExecutionBudgetConfig) {
    assertPositiveInteger(config.maxTotalExecutions, 'maxTotalExecutions');
    for (const [toolName, limit] of Object.entries(config.perTool ?? {})) {
      assertPositiveInteger(limit, `perTool.${toolName}`);
    }

    this.maxTotalExecutions = config.maxTotalExecutions;
    this.perToolLimits = { ...config.perTool };
  }

  reserve(toolName: string): ToolBudgetReservation {
    const toolExecutions = this.toolExecutions.get(toolName) ?? 0;

    if (this.isTotalExhausted()) {
      return this.rejected(toolName, toolExecutions, 'total-exhausted');
    }

    const toolLimit = this.perToolLimits[toolName];
    if (toolLimit !== undefined && toolExecutions >= toolLimit) {
      return this.rejected(toolName, toolExecutions, 'tool-exhausted');
    }

    const nextToolExecutions = toolExecutions + 1;
    this.executedTotal++;
    this.toolExecutions.set(toolName, nextToolExecutions);

    return {
      allowed: true,
      toolName,
      executedTotal: this.executedTotal,
      toolExecutions: nextToolExecutions,
    };
  }

  isTotalExhausted(): boolean {
    return this.executedTotal >= this.maxTotalExecutions;
  }

  remainingTotal(): number {
    return Math.max(0, this.maxTotalExecutions - this.executedTotal);
  }

  getUsage(): ToolBudgetUsage {
    return {
      executedTotal: this.executedTotal,
      remainingTotal: this.remainingTotal(),
      perTool: Object.fromEntries(this.toolExecutions),
    };
  }

  private rejected(
    toolName: string,
    toolExecutions: number,
    reason: ToolBudgetRejectionReason,
  ): ToolBudgetReservation {
    return {
      allowed: false,
      toolName,
      executedTotal: this.executedTotal,
      toolExecutions,
      reason,
      message: `Research tool budget exhausted for ${toolName}. Use the evidence already collected, state missing information and limitations, and finalize now.`,
    };
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}
