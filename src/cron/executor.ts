import { appendFileSync } from 'node:fs';
import { runAgentForMessage, type AgentRunRequest } from '../gateway/agent-runner.js';
import {
  loadGatewayConfig,
  resolveGatewayAgentModel,
} from '../gateway/config.js';
import {
  evaluateSuppression,
  HEARTBEAT_OK_TOKEN,
  type SuppressionState,
} from '../gateway/heartbeat/suppression.js';
import { cleanMarkdownForWhatsApp } from '../gateway/utils.js';
import { dexterPath } from '../utils/paths.js';
import { computeNextRunAtMs } from './schedule.js';
import { createCronResultDelivery, type CronResultDelivery } from './delivery.js';
import { saveCronStore } from './store.js';
import type { ActiveHours, AShareSourcePolicy, CronJob, CronStore } from './types.js';

const LOG_PATH = dexterPath('gateway-debug.log');

function debugLog(msg: string): void {
  appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
}

const BACKOFF_SCHEDULE_MS = [
  30_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
];

const MAX_AT_RETRIES = 3;
const FEISHU_TASK_TIMEZONE = 'Asia/Shanghai';
const LEGACY_ACTIVE_HOURS_TIMEZONE = 'America/New_York';

export const TUSHARE_ONLY_TOOLS = [
  'a_share_analysis',
  'market_sentiment_analysis',
  'technical_analysis',
  'financial_calculator',
] as const;

export const TUSHARE_PLUS_NEWS_TOOLS = [
  ...TUSHARE_ONLY_TOOLS,
  'web_search',
  'web_fetch',
] as const;

type Clock = () => number;
type ModelResolution = { model: string; modelProvider: string };

export type CronExecutorDependencies = {
  now?: Clock;
  runAgent?: (request: AgentRunRequest) => Promise<string>;
  delivery?: CronResultDelivery;
  saveStore?: (store: CronStore) => void;
  resolveModel?: (job: CronJob, configPath?: string) => ModelResolution;
  suppressionStates?: Map<string, SuppressionState>;
};

export type CronExecutorParams = {
  configPath?: string;
};

const defaultSuppressionStates = new Map<string, SuppressionState>();

/**
 * Execute a target-bound job. The target and channel are read from persisted
 * state; only explicitly marked legacy records may enter the compatibility
 * path that consults WhatsApp session recency.
 */
export async function executeCronJob(
  job: CronJob,
  store: CronStore,
  params: CronExecutorParams = {},
  dependencies: CronExecutorDependencies = {},
): Promise<void> {
  const now = dependencies.now ?? (() => Date.now());
  const saveStore = dependencies.saveStore ?? saveCronStore;
  const startedAt = now();

  if (!isWithinActiveHours(job.activeHours, startedAt, activeHoursTimezoneForJob(job))) {
    debugLog(`[cron] job ${job.id}: outside active hours, skipping`);
    scheduleNextRun(job, store, { now, saveStore });
    return;
  }

  if (!job.deliveryTarget) {
    if (job.legacy?.kind === 'heartbeat' || job.legacy?.kind === 'targetless') {
      const { executeLegacyHeartbeatJob, executeLegacyTargetlessJob } = await import('./legacy-heartbeat.js');
      const executeLegacyJob = job.legacy.kind === 'heartbeat'
        ? executeLegacyHeartbeatJob
        : executeLegacyTargetlessJob;
      await executeLegacyJob(job, store, params, dependencies);
      return;
    }
    await handleJobError(job, store, new Error('Job has no explicit delivery target; rebind the legacy task before execution.'), startedAt, { now, saveStore });
    return;
  }

  debugLog(`[cron] executing job "${job.name}" (${job.id})`);

  const resolveModel = dependencies.resolveModel ?? ((currentJob, configPath) => {
    const cfg = loadGatewayConfig(configPath);
    return resolveGatewayAgentModel(cfg, {
      model: currentJob.payload.model,
      modelProvider: currentJob.payload.modelProvider,
    });
  });
  const { model, modelProvider } = resolveModel(job, params.configPath);
  const policy = sourcePolicyConfig(job.execution?.sourcePolicy);
  const notificationMode = job.execution?.notificationMode ?? 'on_actionable_result';
  const query = buildCronQuery(job, notificationMode, policy);
  const runAgent = dependencies.runAgent ?? runAgentForMessage;

  let answer: string;
  try {
    answer = await runAgent({
      sessionKey: `cron:${job.id}`,
      query,
      model,
      modelProvider,
      maxIterations: 6,
      isolatedSession: true,
      channel: job.deliveryTarget.channel,
      ...(policy
        ? {
            toolAllowlist: [...policy.toolAllowlist],
            toolExecutionBudget: policy.toolExecutionBudget,
            reserveFinalIteration: true,
          }
        : {}),
    });
  } catch (error) {
    await handleJobError(job, store, error, startedAt, { now, saveStore, configPath: params.configPath, delivery: dependencies.delivery });
    return;
  }

  if (/^Error:\s*/i.test(answer.trim())) {
    await handleJobError(job, store, new Error(answer.trim().replace(/^Error:\s*/i, '')), startedAt, {
      now,
      saveStore,
      configPath: params.configPath,
      delivery: dependencies.delivery,
    });
    return;
  }

  const durationMs = Math.max(0, now() - startedAt);
  job.state.lastRunAtMs = startedAt;
  job.state.lastDurationMs = durationMs;
  job.state.consecutiveErrors = 0;
  job.state.lastError = undefined;

  const suppressionState = getSuppressionState(job.id, dependencies.suppressionStates ?? defaultSuppressionStates);
  const suppressionResult = notificationMode === 'on_actionable_result'
    ? evaluateSuppression(answer, suppressionState, now())
    : {
        shouldSuppress: !answer.trim(),
        cleanedText: answer.trim(),
        reason: !answer.trim() ? 'empty' as const : 'none' as const,
      };

  if (suppressionResult.shouldSuppress) {
    job.state.lastRunStatus = 'suppressed';
    job.state.lastSuppressionReason = suppressionResult.reason;
    debugLog(`[cron] job ${job.id}: suppressed (${suppressionResult.reason})`);
    scheduleAfterResult(job, store, { now, saveStore, suppressed: true });
    return;
  }

  const body = job.deliveryTarget.channel === 'whatsapp'
    ? cleanMarkdownForWhatsApp(suppressionResult.cleanedText)
    : suppressionResult.cleanedText;
  const delivery = dependencies.delivery ?? createCronResultDelivery({ configPath: params.configPath });

  try {
    await delivery.deliver(job.deliveryTarget, body);
  } catch (error) {
    await handleJobError(job, store, error, startedAt, { now, saveStore, configPath: params.configPath, delivery });
    return;
  }

  job.state.lastRunStatus = 'ok';
  job.state.lastSuppressionReason = undefined;
  job.state.consecutiveErrors = 0;
  if (notificationMode === 'on_actionable_result') {
    suppressionState.lastMessageText = suppressionResult.cleanedText;
    suppressionState.lastMessageAt = now();
  }
  debugLog(`[cron] job ${job.id}: delivered to ${formatTarget(job)}`);

  if (job.fulfillment === 'once') {
    job.enabled = false;
    job.state.nextRunAtMs = undefined;
    job.updatedAtMs = now();
    saveStore(store);
    debugLog(`[cron] job ${job.id}: auto-disabled (fulfillment=once)`);
    return;
  }

  scheduleAfterResult(job, store, { now, saveStore, suppressed: false });
}

export function buildCronQuery(
  job: CronJob,
  notificationMode: 'always' | 'on_actionable_result',
  policy?: ReturnType<typeof sourcePolicyConfig>,
): string {
  let query = `[CRON JOB: ${job.name}]\n\n${job.payload.message}`;
  if (job.fulfillment === 'ask') {
    query += '\n\nIf you find something noteworthy, also ask the user if they want to continue monitoring this.';
  }
  if (policy) query += `\n\n${policy.prompt}`;

  if (notificationMode === 'always') {
    query += '\n\n## Notification instructions\n- This is a scheduled report, not an alert-only monitor. Return a concise nonempty report on every successful run.\n- Do not return HEARTBEAT_OK just because there is no exceptional event; summarize the requested scheduled check.\n- Keep the report focused and suitable for the delivery channel.';
  } else {
    query += `\n\n## Notification instructions\n- If the condition has NOT been met, respond with exactly: ${HEARTBEAT_OK_TOKEN}\n- Do NOT send a status update or progress report — the user only wants to hear when the condition IS met\n- Do NOT say things like "no action needed", "still below target", "not yet" — just respond ${HEARTBEAT_OK_TOKEN}\n- Only respond with a real message when there is something actionable to report\n- Keep alerts brief and focused — lead with the key finding`;
  }
  return query;
}

export function sourcePolicyConfig(policy?: AShareSourcePolicy): {
  toolAllowlist: readonly string[];
  toolExecutionBudget: { maxTotalExecutions: number; perTool?: Record<string, number> };
  prompt: string;
} | undefined {
  if (!policy) return undefined;
  if (policy === 'tushare_only') {
    return {
      toolAllowlist: TUSHARE_ONLY_TOOLS,
      toolExecutionBudget: { maxTotalExecutions: 4 },
      prompt: '## Data source policy\n- Use only the bound Tushare A-share tools and financial_calculator.\n- Do not search the web, fetch URLs, browse, or use generic market-data tools; those tools are unavailable for this run.\n- Omit current-news, policy, and company-event explanations rather than inferring them. If such context matters, state that news was not queried.\n- Treat the persisted task prompt as the only business context; do not rely on the originating Feishu conversation.',
    };
  }
  return {
    toolAllowlist: TUSHARE_PLUS_NEWS_TOOLS,
    toolExecutionBudget: { maxTotalExecutions: 6, perTool: { web_search: 1, web_fetch: 1 } },
    prompt: '## Data source policy\n- Use the bound Tushare A-share tools for structured data.\n- You may make at most one web_search for the most material current Chinese news, policy, or announcement query, and at most one web_fetch to verify one returned URL.\n- Name source limitations when the single search cannot establish a claim; do not imply broader news coverage than the evidence supports.\n- Treat the persisted task prompt as the only business context; do not rely on the originating Feishu conversation.',
  };
}

function getSuppressionState(
  jobId: string,
  states: Map<string, SuppressionState>,
): SuppressionState {
  let state = states.get(jobId);
  if (!state) {
    state = { lastMessageText: null, lastMessageAt: null };
    states.set(jobId, state);
  }
  return state;
}

function isWithinActiveHours(
  activeHours: ActiveHours | undefined,
  nowMs: number,
  defaultTimezone: string,
): boolean {
  if (!activeHours) return true;

  const tz = activeHours.timezone ?? defaultTimezone;
  const now = new Date(nowMs);
  const allowedDays = activeHours.daysOfWeek ?? [1, 2, 3, 4, 5];
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  if (!allowedDays.includes(dayMap[dayFormatter.format(now)] ?? now.getDay())) return false;

  const currentTime = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return currentTime >= activeHours.start && currentTime <= activeHours.end;
}

function scheduleAfterResult(
  job: CronJob,
  store: CronStore,
  params: { now: Clock; saveStore: (store: CronStore) => void; suppressed: boolean },
): void {
  const nowMs = params.now();
  const nextRun = computeNextRunAtMs(job.schedule, nowMs, scheduleTimezoneForJob(job));
  if (nextRun === undefined) {
    if (params.suppressed && job.fulfillment === 'once') {
      // A one-shot condition was checked but did not produce an alert. Keep it
      // enabled and visible for an explicit user update instead of claiming it
      // was fulfilled or silently disabling it after a suppressed result.
      job.state.nextRunAtMs = undefined;
      job.state.lastError = 'One-shot check produced no actionable result; task remains enabled for explicit review.';
    } else {
      job.enabled = false;
      job.state.nextRunAtMs = undefined;
    }
  } else {
    job.state.nextRunAtMs = nextRun;
  }
  job.state.scheduleErrorCount = 0;
  job.updatedAtMs = nowMs;
  params.saveStore(store);
}

function scheduleNextRun(
  job: CronJob,
  store: CronStore,
  params: { now: Clock; saveStore: (store: CronStore) => void },
): void {
  const nextRun = computeNextRunAtMs(job.schedule, params.now(), scheduleTimezoneForJob(job));
  if (nextRun === undefined) {
    job.enabled = false;
    job.state.nextRunAtMs = undefined;
  } else {
    job.state.nextRunAtMs = nextRun;
  }
  job.state.scheduleErrorCount = 0;
  job.updatedAtMs = params.now();
  params.saveStore(store);
}

async function handleJobError(
  job: CronJob,
  store: CronStore,
  error: unknown,
  startedAt: number,
  params: {
    now: Clock;
    saveStore: (store: CronStore) => void;
    configPath?: string;
    delivery?: CronResultDelivery;
  },
): Promise<void> {
  const errorMsg = safeCronErrorMessage(error);
  job.state.lastRunAtMs = startedAt;
  job.state.lastDurationMs = Math.max(0, params.now() - startedAt);
  job.state.lastRunStatus = 'error';
  job.state.lastSuppressionReason = undefined;
  job.state.lastError = errorMsg;
  job.state.consecutiveErrors += 1;

  debugLog(`[cron] job ${job.id}: error #${job.state.consecutiveErrors}: ${errorMsg}`);
  const nowMs = params.now();

  if (job.schedule.kind === 'at') {
    if (job.state.consecutiveErrors >= MAX_AT_RETRIES) {
      job.enabled = false;
      job.state.nextRunAtMs = undefined;
      debugLog(`[cron] job ${job.id}: disabled after ${MAX_AT_RETRIES} retries (at job)`);
      if (job.deliveryTarget && job.state.lastErrorNoticeAtMs === undefined) {
        const delivery = params.delivery ?? createCronResultDelivery({ configPath: params.configPath });
        try {
          const body = `Scheduled task "${job.name}" failed after ${MAX_AT_RETRIES} attempts. Please check the gateway logs.`;
          await delivery.deliver(job.deliveryTarget, body);
          job.state.lastErrorNoticeAtMs = nowMs;
          debugLog(`[cron] job ${job.id}: terminal error notice delivered`);
        } catch (noticeError) {
          const noticeMessage = safeCronErrorMessage(noticeError);
          debugLog(`[cron] job ${job.id}: terminal error notice failed: ${noticeMessage}`);
        }
      }
    } else {
      job.state.nextRunAtMs = nowMs + errorBackoffMs(job.state.consecutiveErrors);
    }
  } else {
    const normalNext = computeNextRunAtMs(job.schedule, nowMs, scheduleTimezoneForJob(job));
    const backoff = nowMs + errorBackoffMs(job.state.consecutiveErrors);
    job.state.nextRunAtMs = normalNext ? Math.max(normalNext, backoff) : backoff;
  }

  job.updatedAtMs = nowMs;
  params.saveStore(store);
}

function errorBackoffMs(consecutiveErrors: number): number {
  const index = Math.min(consecutiveErrors - 1, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[Math.max(0, index)]!;
}

function formatTarget(job: CronJob): string {
  if (!job.deliveryTarget) return 'no target';
  return job.deliveryTarget.channel === 'feishu'
    ? `Feishu:${job.deliveryTarget.chatId}`
    : `WhatsApp:${job.deliveryTarget.to}`;
}

function scheduleTimezoneForJob(job: CronJob): string | undefined {
  return job.owner?.channel === 'feishu' || job.deliveryTarget?.channel === 'feishu'
    ? FEISHU_TASK_TIMEZONE
    : undefined;
}

function activeHoursTimezoneForJob(job: CronJob): string {
  return job.owner?.channel === 'feishu' || job.deliveryTarget?.channel === 'feishu'
    ? FEISHU_TASK_TIMEZONE
    : LEGACY_ACTIVE_HOURS_TIMEZONE;
}

function redactSensitiveText(text: string): string {
  const secrets = [
    process.env.FEISHU_APP_ID,
    process.env.FEISHU_APP_SECRET,
    process.env.TUSHARE_TOKEN,
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.XAI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.MOONSHOT_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    process.env.GLM_API_KEY,
    process.env.OLLAMA_CLOUD_API_KEY,
    process.env.TAVILY_API_KEY,
    process.env.EXASEARCH_API_KEY,
    process.env.PERPLEXITY_API_KEY,
    process.env.LANGSEARCH_API_KEY,
    process.env.X_BEARER_TOKEN,
    process.env.LANGSMITH_API_KEY,
  ].filter((value): value is string => Boolean(value));

  return secrets.reduce((redacted, secret) => redacted.replaceAll(secret, '[REDACTED]'), text);
}

function safeCronErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = redactSensitiveText(raw).replace(/\s+/g, ' ').trim();
  if (
    !message ||
    message.length > 240 ||
    /api[_ -]?key|access[_ -]?token|authorization|bearer|secret|token\s*[:=]|key\s*[:=]|prompt|chat history|messages?\s*[:=]|content\s*[:=]/i.test(message)
  ) {
    return 'Scheduled task failed; diagnostic details were withheld from persisted state.';
  }
  return message;
}
