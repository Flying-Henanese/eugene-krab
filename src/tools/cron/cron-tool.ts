import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { executeCronJob } from '../../cron/executor.js';
import {
  getDefaultCronTaskService,
  type CronTaskExecutor,
  type CronTaskService,
  type CreateCronTaskInput,
  type UpdateCronTaskInput,
} from '../../cron/task-service.js';
import type { CronCallerContext, CronJob, CronSchedule } from '../../cron/types.js';

export const CRON_TOOL_DESCRIPTION = `
Manage scheduled or recurring tasks that run automatically.

Jobs created from Feishu one-on-one chat are owned by that exact Feishu account and chat, run in an isolated agent session, and deliver only to that persisted chat. Never ask the user for an owner or delivery target: the gateway supplies those fields from the inbound route.

## When to Use

- User asks to set a recurring check, alert, or reminder
- User asks to see, modify, pause, resume, run, or cancel scheduled tasks
- User wants a one-time alert at a specific time

## Actions

- **list**: Show only the caller's scheduled jobs
- **add**: Create a new scheduled job
- **update**: Modify an existing job by full ID or an unambiguous short ID
- **remove**: Permanently delete an existing job by full ID or an unambiguous short ID
- **run**: Trigger an existing job immediately, still within the caller's owner scope

## Schedule Types

- **at**: One-shot at an ISO-8601 timestamp
- **every**: Recurring interval in milliseconds; the minimum is 60000 (one minute)
- **cron**: Cron expression with optional IANA timezone. New Feishu jobs default to Asia/Shanghai when omitted.

## Fulfillment and Notification

- **keep** (default): Keep running on schedule
- **once**: Disable only after a real result has been delivered successfully
- **ask**: Legacy/WhatsApp-compatible only; not available for new Feishu tasks
- **always** notification: Send every nonempty scheduled report
- **on_actionable_result** (default): Suppress empty, HEARTBEAT_OK, dismissive, and duplicate results

## A-share Source Policy

For A-share monitoring, set **sourcePolicy** explicitly:

- **tushare_only**: only Tushare A-share tools and financial_calculator; no web search or news inference
- **tushare_plus_news**: the same Tushare tools plus at most one web search and one URL fetch for current Chinese news, policy, or announcements

Use tushare_only unless the user explicitly needs current news, policy, or announcement context. These policies are structural tool restrictions, not merely prompt instructions.

## Message Prompt

The **message** field is the full task instruction received each time the job fires. Do not copy the surrounding chat history into it.

Use \`list\` before modifying a job when the ID is unknown. If a short ID matches more than one job, ask the user for the full ID.
`.trim();

const scheduleSchema = z.union([
  z.object({
    kind: z.enum(['at']),
    at: z.string().describe('ISO-8601 timestamp for one-shot execution'),
  }),
  z.object({
    kind: z.enum(['every']),
    everyMs: z.number().min(60000).describe('Interval in milliseconds (minimum 60000 = 1 minute)'),
    anchorMs: z.number().optional().describe('Optional anchor timestamp in ms'),
  }),
  z.object({
    kind: z.enum(['cron']),
    expr: z.string().describe('Cron expression (5 or 6 fields; minimum one-minute spacing)'),
    tz: z.string().optional().describe('IANA timezone (default: Asia/Shanghai for new Feishu tasks)'),
  }),
]);

const activeHoursSchema = z.object({
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).describe('Start time in HH:MM'),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).describe('End time in HH:MM'),
  timezone: z.string().optional().describe('Optional IANA timezone'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().describe('Optional days, 0=Sun through 6=Sat'),
});

const cronToolSchema = z.object({
  action: z.enum(['list', 'add', 'update', 'remove', 'run']),
  name: z.string().optional().describe('Human-readable job name (required for add)'),
  description: z.string().optional().describe('Optional description'),
  schedule: scheduleSchema.optional().describe('Schedule configuration (required for add)'),
  message: z.string().optional().describe('Agent prompt for the job (required for add)'),
  activeHours: activeHoursSchema.optional().describe('Optional active execution window'),
  model: z.string().optional().describe('Optional model override for job execution'),
  modelProvider: z.string().optional().describe('Optional model provider override'),
  fulfillment: z.enum(['keep', 'once', 'ask']).optional().describe('Fulfillment mode (default: keep)'),
  sourcePolicy: z.enum(['tushare_only', 'tushare_plus_news']).optional(),
  notificationMode: z.enum(['always', 'on_actionable_result']).optional(),
  jobId: z.string().optional().describe('Full job ID or unambiguous short ID'),
  enabled: z.boolean().optional().describe('Enable/disable a job (for update)'),
});

type CronToolOptions = {
  caller?: CronCallerContext;
  taskService?: CronTaskService;
  executeJob?: CronTaskExecutor;
};

export function createCronTool(options: CronToolOptions = {}): DynamicStructuredTool {
  const taskService = options.taskService ?? getDefaultCronTaskService();
  const executeJob = options.executeJob ?? ((job, store) => executeCronJob(job, store, {}));

  return new DynamicStructuredTool({
    name: 'cron',
    description: 'Create, list, update, remove, or run owner-scoped scheduled jobs.',
    schema: cronToolSchema,
    func: async (input) => {
      try {
        switch (input.action) {
          case 'list': {
            const jobs = await taskService.listForOwner(options.caller);
            return jobs.length === 0 ? 'No scheduled jobs.' : jobs.map(formatJobSummary).join('\n\n');
          }

          case 'add': {
            if (!input.name) return 'Error: name is required for add.';
            if (!input.schedule) return 'Error: schedule is required for add.';
            if (!input.message) return 'Error: message is required for add.';

            const job = await taskService.create({
              name: input.name,
              ...(input.description !== undefined ? { description: input.description } : {}),
              schedule: input.schedule as CronSchedule,
              message: input.message,
              ...(input.activeHours !== undefined ? { activeHours: input.activeHours } : {}),
              ...(input.model !== undefined ? { model: input.model } : {}),
              ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
              ...(input.fulfillment !== undefined ? { fulfillment: input.fulfillment } : {}),
              ...(input.sourcePolicy !== undefined ? { sourcePolicy: input.sourcePolicy } : {}),
              ...(input.notificationMode !== undefined ? { notificationMode: input.notificationMode } : {}),
            } satisfies CreateCronTaskInput, options.caller);

            return `Created job "${job.name}" (id: ${job.id}, fulfillment: ${job.fulfillment}, source: ${job.execution?.sourcePolicy ?? 'unrestricted'}, notifications: ${job.execution?.notificationMode ?? 'legacy'}). Next run: ${formatNextRun(job)}`;
          }

          case 'update': {
            if (!input.jobId) return 'Error: jobId is required for update.';
            const job = await taskService.updateForOwner(options.caller, input.jobId, {
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.schedule !== undefined ? { schedule: input.schedule as CronSchedule } : {}),
              ...(input.message !== undefined ? { message: input.message } : {}),
              ...(input.activeHours !== undefined ? { activeHours: input.activeHours } : {}),
              ...(input.model !== undefined ? { model: input.model } : {}),
              ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
              ...(input.fulfillment !== undefined ? { fulfillment: input.fulfillment } : {}),
              ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
              ...(input.sourcePolicy !== undefined ? { sourcePolicy: input.sourcePolicy } : {}),
              ...(input.notificationMode !== undefined ? { notificationMode: input.notificationMode } : {}),
            } satisfies UpdateCronTaskInput);
            return `Updated job "${job.name}" (id: ${job.id}).`;
          }

          case 'remove': {
            if (!input.jobId) return 'Error: jobId is required for remove.';
            const job = await taskService.removeForOwner(options.caller, input.jobId);
            return `Removed job "${job.name}" (id: ${job.id}).`;
          }

          case 'run': {
            if (!input.jobId) return 'Error: jobId is required for run.';
            const job = await taskService.runForOwner(options.caller, input.jobId, executeJob);
            return `Job "${job.name}" executed. Status: ${job.state.lastRunStatus ?? 'unknown'}`;
          }

          default:
            return 'Unknown action. Use list, add, update, remove, or run.';
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    },
  });
}

export const cronTool = createCronTool();

function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case 'at':
      return `one-shot at ${schedule.at}`;
    case 'every': {
      const secs = Math.round(schedule.everyMs / 1000);
      if (secs >= 3600) return `every ${Math.round(secs / 3600)}h`;
      return `every ${Math.round(secs / 60)}m`;
    }
    case 'cron':
      return `${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ''}`;
  }
}

export function formatJobSummary(job: CronJob): string {
  const status = job.enabled ? 'enabled' : 'DISABLED';
  const lines = [
    `**${job.name}** (${shortJobId(job.id)}) [${status}]`,
    `  Schedule: ${formatSchedule(job.schedule)}`,
    `  Source: ${job.execution?.sourcePolicy ?? 'unrestricted'}`,
    `  Notifications: ${job.execution?.notificationMode ?? 'legacy'}`,
    `  Fulfillment: ${job.fulfillment}`,
    `  Next run: ${formatNextRun(job)}`,
    `  Last run: ${job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : 'never'} (${job.state.lastRunStatus ?? 'never'})`,
  ];
  if (job.state.consecutiveErrors > 0) lines.push(`  Errors: ${job.state.consecutiveErrors} consecutive`);
  if (job.state.lastError) lines.push(`  Last error: ${job.state.lastError}`);
  if (job.description) lines.push(`  Description: ${job.description}`);
  return lines.join('\n');
}

function shortJobId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatNextRun(job: CronJob): string {
  return job.state.nextRunAtMs === undefined ? 'none' : new Date(job.state.nextRunAtMs).toISOString();
}
