import type { CronCallerContext } from '../cron/types.js';

/** Immutable trusted context for tools created during one Agent run. */
export type ToolRuntimeContext = Readonly<{
  scheduledTaskCaller?: CronCallerContext;
}>;
