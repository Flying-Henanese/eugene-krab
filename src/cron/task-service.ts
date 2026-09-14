import { randomBytes } from 'node:crypto';
import { computeNextRunAtMs, normalizeTaskSchedule, validateCronSchedule } from './schedule.js';
import { loadCronStore, saveCronStore } from './store.js';
import type {
  AShareSourcePolicy,
  CronCallerContext,
  CronDeliveryTarget,
  CronExecutionPolicy,
  CronJob,
  CronNotificationMode,
  CronOwner,
  CronSchedule,
  CronStore,
  FulfillmentMode,
} from './types.js';

const DEFAULT_MAX_ACTIVE_JOBS_PER_OWNER = 20;
const DEFAULT_TASK_TIMEZONE = 'Asia/Shanghai';
const LEGACY_TASK_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export type CronStoreAdapter = {
  load: () => CronStore;
  save: (store: CronStore) => void;
};

export type CronTaskExecutor = (job: CronJob, store: CronStore) => Promise<void>;

export type CronMutationSerializer = <T>(operation: () => T | Promise<T>) => Promise<T>;

export type CreateCronTaskInput = {
  name: string;
  description?: string;
  schedule: CronSchedule;
  message: string;
  model?: string;
  modelProvider?: string;
  fulfillment?: FulfillmentMode;
  activeHours?: CronJob['activeHours'];
  sourcePolicy?: AShareSourcePolicy;
  notificationMode?: CronNotificationMode;
};

export type UpdateCronTaskInput = {
  name?: string;
  description?: string;
  schedule?: CronSchedule;
  message?: string;
  model?: string;
  modelProvider?: string;
  fulfillment?: FulfillmentMode;
  activeHours?: CronJob['activeHours'];
  enabled?: boolean;
  sourcePolicy?: AShareSourcePolicy;
  notificationMode?: CronNotificationMode;
};

export type CronTaskServiceOptions = {
  store?: CronStoreAdapter;
  now?: () => number;
  idGenerator?: () => string;
  maxActiveJobsPerOwner?: number;
  defaultTimezone?: string;
  executeJob?: CronTaskExecutor;
  sourceCapabilities?: CronSourceCapabilities;
  mutationSerializer?: CronMutationSerializer;
};

export type CronSourceCapabilities = {
  hasTushareToken: () => boolean;
  hasWebSearchProvider: () => boolean;
};

export class CronTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronTaskError';
  }
}

const defaultStore: CronStoreAdapter = {
  load: () => loadCronStore(),
  save: (store) => saveCronStore(store),
};

let defaultService: CronTaskService | undefined;

export function getDefaultCronTaskService(): CronTaskService {
  defaultService ??= new CronTaskService();
  return defaultService;
}

/**
 * Owns cron task lifecycle rules. Callers provide only trusted gateway context;
 * model-generated tool arguments never select an owner or delivery target.
 */
export class CronTaskService {
  private readonly store: CronStoreAdapter;
  private readonly now: () => number;
  private readonly idGenerator: () => string;
  private readonly maxActiveJobsPerOwner: number;
  private readonly defaultTimezone: string;
  private readonly executeJob?: CronTaskExecutor;
  private readonly sourceCapabilities: CronSourceCapabilities;
  private readonly mutationSerializer: CronMutationSerializer;

  constructor(options: CronTaskServiceOptions = {}) {
    this.store = options.store ?? defaultStore;
    this.now = options.now ?? (() => Date.now());
    this.idGenerator = options.idGenerator ?? (() => randomBytes(8).toString('hex'));
    this.maxActiveJobsPerOwner = options.maxActiveJobsPerOwner ?? DEFAULT_MAX_ACTIVE_JOBS_PER_OWNER;
    this.defaultTimezone = options.defaultTimezone ?? DEFAULT_TASK_TIMEZONE;
    this.executeJob = options.executeJob;
    this.sourceCapabilities = options.sourceCapabilities ?? {
      hasTushareToken: () => Boolean(process.env.TUSHARE_TOKEN),
      hasWebSearchProvider: hasConfiguredWebSearchProvider,
    };
    this.mutationSerializer = options.mutationSerializer ?? createMutationSerializer();

    if (!Number.isInteger(this.maxActiveJobsPerOwner) || this.maxActiveJobsPerOwner <= 0) {
      throw new RangeError('maxActiveJobsPerOwner must be a positive integer');
    }
  }

  create(input: CreateCronTaskInput, caller?: CronCallerContext): Promise<CronJob> {
    return this.mutate(() => {
      if (caller) validateCaller(caller);
      this.validateInputText(input.name, 'name');
      this.validateInputText(input.message, 'message');
      if (input.activeHours) validateActiveHours(input.activeHours);
      const owner = caller ? ownerFromCaller(caller) : undefined;
      const deliveryTarget = caller ? targetFromCaller(caller) : undefined;
      const sourcePolicy = resolveSourcePolicy(input.sourcePolicy, input.message, caller);
      const useFeishuDefaults = caller?.channel === 'feishu';
      const schedule = this.prepareSchedule(
        input.schedule,
        useFeishuDefaults ? this.defaultTimezone : LEGACY_TASK_TIMEZONE,
        useFeishuDefaults,
      );

      if (!caller && (sourcePolicy || input.notificationMode)) {
        throw new CronTaskError('sourcePolicy and notificationMode require an explicit gateway caller context');
      }
      if (caller?.channel === 'feishu' && input.fulfillment === 'ask') {
        throw new CronTaskError('fulfillment=ask is not available for Feishu tasks in this release');
      }

      if (sourcePolicy) validateSourcePolicy(sourcePolicy, this.sourceCapabilities);

      const store = structuredClone(this.store.load());
      if (owner && countActiveJobs(store, owner) >= this.maxActiveJobsPerOwner) {
        throw new CronTaskError(`owner has reached the maximum of ${this.maxActiveJobsPerOwner} enabled tasks`);
      }

      const now = this.now();
      const nextRunAtMs = computeNextRunAtMs(
        schedule,
        now,
        useFeishuDefaults ? this.defaultTimezone : LEGACY_TASK_TIMEZONE,
      );
      if (nextRunAtMs === undefined) {
        throw new CronTaskError('the schedule has no valid future run');
      }

      const job: CronJob = {
        id: this.idGenerator(),
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        enabled: true,
        createdAtMs: now,
        updatedAtMs: now,
        schedule,
        payload: {
          message: input.message,
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
        },
        fulfillment: input.fulfillment ?? 'keep',
        ...(input.activeHours !== undefined ? { activeHours: input.activeHours } : {}),
        ...(owner && deliveryTarget
          ? {
              owner,
              deliveryTarget,
              execution: {
                sessionMode: 'isolated',
                ...(sourcePolicy ? { sourcePolicy } : {}),
                notificationMode: input.notificationMode ?? 'on_actionable_result',
              },
            }
          : { legacy: { kind: 'targetless' as const } }),
        state: {
          nextRunAtMs,
          consecutiveErrors: 0,
          scheduleErrorCount: 0,
        },
      };

      store.jobs.push(job);
      this.store.save(store);
      return job;
    });
  }

  listForOwner(caller?: CronCallerContext): Promise<CronJob[]> {
    return this.mutate(() => {
      if (caller) validateCaller(caller);
      const owner = caller ? ownerFromCaller(caller) : undefined;
      return structuredClone(this.store.load()).jobs
        .filter((job) => ownerMatches(job, owner))
        .sort(compareJobsByNextRun)
        .map((job) => job);
    });
  }

  updateForOwner(
    caller: CronCallerContext | undefined,
    jobId: string,
    input: UpdateCronTaskInput,
  ): Promise<CronJob> {
    return this.mutate(() => {
      if (caller) validateCaller(caller);
      const store = structuredClone(this.store.load());
      const job = this.findOwnedJob(store, caller, jobId);
      const owner = caller ? ownerFromCaller(caller) : undefined;

      if (input.name !== undefined) this.validateInputText(input.name, 'name');
      if (input.message !== undefined) this.validateInputText(input.message, 'message');
      if (input.activeHours !== undefined) validateActiveHours(input.activeHours);
      if (caller?.channel === 'feishu' && input.fulfillment === 'ask') {
        throw new CronTaskError('fulfillment=ask is not available for Feishu tasks in this release');
      }

      if (input.sourcePolicy !== undefined) {
        if (!job.execution) {
          throw new CronTaskError('legacy targetless jobs require an explicit rebind before source policies can be changed');
        }
        validateSourcePolicy(input.sourcePolicy);
        job.execution.sourcePolicy = input.sourcePolicy;
      }
      if (input.notificationMode !== undefined) {
        if (!job.execution) {
          throw new CronTaskError('legacy targetless jobs require an explicit rebind before notification mode can be changed');
        }
        job.execution.notificationMode = input.notificationMode;
      }

      if (owner && input.enabled === true && !job.enabled && countActiveJobs(store, owner, job.id) >= this.maxActiveJobsPerOwner) {
        throw new CronTaskError(`owner has reached the maximum of ${this.maxActiveJobsPerOwner} enabled tasks`);
      }

      if (input.name !== undefined) job.name = input.name;
      if (input.description !== undefined) job.description = input.description;
      if (input.message !== undefined) job.payload.message = input.message;
      if (input.model !== undefined) job.payload.model = input.model;
      if (input.modelProvider !== undefined) job.payload.modelProvider = input.modelProvider;
      if (input.fulfillment !== undefined) job.fulfillment = input.fulfillment;
      if (input.activeHours !== undefined) job.activeHours = input.activeHours;

      if (input.schedule !== undefined) {
        const useFeishuDefaults = job.owner?.channel === 'feishu';
        job.schedule = this.prepareSchedule(
          input.schedule,
          useFeishuDefaults ? this.defaultTimezone : LEGACY_TASK_TIMEZONE,
          useFeishuDefaults,
        );
      }

      if (input.enabled !== undefined) {
        job.enabled = input.enabled;
      }

      const now = this.now();
      if (job.enabled) {
        const nextRunAtMs = computeNextRunAtMs(job.schedule, now, scheduleTimezoneForJob(job, this.defaultTimezone));
        if (nextRunAtMs === undefined) {
          throw new CronTaskError('the schedule has no valid future run');
        }
        job.state.nextRunAtMs = nextRunAtMs;
      } else {
        job.state.nextRunAtMs = undefined;
      }
      if (input.enabled === true) {
        job.state.consecutiveErrors = 0;
        job.state.scheduleErrorCount = 0;
      }
      job.updatedAtMs = now;
      this.store.save(store);
      return job;
    });
  }

  removeForOwner(caller: CronCallerContext | undefined, jobId: string): Promise<CronJob> {
    return this.mutate(() => {
      if (caller) validateCaller(caller);
      const store = structuredClone(this.store.load());
      const job = this.findOwnedJob(store, caller, jobId);
      const index = store.jobs.indexOf(job);
      store.jobs.splice(index, 1);
      this.store.save(store);
      return job;
    });
  }

  runForOwner(
    caller: CronCallerContext | undefined,
    jobId: string,
    executeJobOverride?: CronTaskExecutor,
  ): Promise<CronJob> {
    return this.mutate(async () => {
      if (caller) validateCaller(caller);
      const store = structuredClone(this.store.load());
      const job = this.findOwnedJob(store, caller, jobId);
      const executeJob = executeJobOverride ?? this.executeJob;
      if (!executeJob) {
        throw new CronTaskError('cron execution is unavailable');
      }
      await executeJob(job, store);
      this.store.save(store);
      return job;
    });
  }

  private prepareSchedule(
    schedule: CronSchedule,
    timezone: string,
    normalizeTimezone: boolean,
  ): CronSchedule {
    const normalized = normalizeTimezone ? normalizeTaskSchedule(schedule, timezone) : schedule;
    const problem = validateCronSchedule(normalized, this.now(), timezone);
    if (problem) throw new CronTaskError(problem);
    return normalized;
  }

  private findOwnedJob(store: CronStore, caller: CronCallerContext | undefined, jobId: string): CronJob {
    const owner = caller ? ownerFromCaller(caller) : undefined;
    const jobs = store.jobs.filter((job) => ownerMatches(job, owner));
    const exact = jobs.find((job) => job.id === jobId);
    if (exact) return exact;

    const matches = jobs.filter((job) => job.id.startsWith(jobId));
    if (matches.length > 1) {
      throw new CronTaskError(`job ID prefix "${jobId}" is ambiguous; use the full ID`);
    }
    if (matches.length === 1) return matches[0]!;
    throw new CronTaskError(`job ${jobId} not found`);
  }

  private validateInputText(value: string, field: string): void {
    if (!value.trim()) throw new CronTaskError(`${field} must not be empty`);
  }

  private mutate<T>(operation: () => T | Promise<T>): Promise<T> {
    return this.mutationSerializer(operation);
  }
}

function ownerFromCaller(caller: CronCallerContext): CronOwner {
  if (caller.channel === 'feishu') {
    return { channel: 'feishu', accountId: caller.accountId, chatId: caller.chatId };
  }
  return { channel: 'whatsapp', accountId: caller.accountId, to: caller.to };
}

function validateCaller(caller: CronCallerContext): void {
  if (!caller.agentId.trim() || !caller.accountId.trim()) {
    throw new CronTaskError('caller context must include a non-empty agentId and accountId');
  }
  if (caller.channel === 'feishu' && !caller.chatId.trim()) {
    throw new CronTaskError('Feishu caller context must include a non-empty chatId');
  }
  if (caller.channel === 'whatsapp' && !caller.to.trim()) {
    throw new CronTaskError('WhatsApp caller context must include a non-empty recipient');
  }
}

function targetFromCaller(caller: CronCallerContext): CronDeliveryTarget {
  if (caller.channel === 'feishu') {
    return { channel: 'feishu', accountId: caller.accountId, chatId: caller.chatId };
  }
  return { channel: 'whatsapp', accountId: caller.accountId, to: caller.to };
}

function ownerMatches(job: CronJob, owner: CronOwner | undefined): boolean {
  if (!owner) return job.owner === undefined && job.deliveryTarget === undefined;
  if (!job.owner) return false;
  if (job.owner.channel !== owner.channel || job.owner.accountId !== owner.accountId) return false;
  return owner.channel === 'feishu'
    ? job.owner.channel === 'feishu' && job.owner.chatId === owner.chatId
    : job.owner.channel === 'whatsapp' && job.owner.to === owner.to;
}

function countActiveJobs(store: CronStore, owner: CronOwner, excludeId?: string): number {
  return store.jobs.filter((job) =>
    job.enabled &&
    job.id !== excludeId &&
    ownerMatches(job, owner),
  ).length;
}

function compareJobsByNextRun(a: CronJob, b: CronJob): number {
  const aNext = a.state.nextRunAtMs ?? Number.POSITIVE_INFINITY;
  const bNext = b.state.nextRunAtMs ?? Number.POSITIVE_INFINITY;
  return aNext - bNext || a.id.localeCompare(b.id);
}

function createMutationSerializer(): CronMutationSerializer {
  let tail: Promise<void> = Promise.resolve();
  return <T>(operation: () => T | Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

function validateActiveHours(activeHours: NonNullable<CronJob['activeHours']>): void {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(activeHours.start) || !timePattern.test(activeHours.end)) {
    throw new CronTaskError('active hours must use HH:MM values');
  }
  if (activeHours.daysOfWeek && activeHours.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new CronTaskError('active hours daysOfWeek must contain integers from 0 to 6');
  }
  if (activeHours.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: activeHours.timezone }).format();
    } catch {
      throw new CronTaskError('active hours timezone must be a valid IANA timezone');
    }
  }
}

function scheduleTimezoneForJob(job: CronJob, feishuTimezone: string): string {
  return job.owner?.channel === 'feishu' ? feishuTimezone : LEGACY_TASK_TIMEZONE;
}

function resolveSourcePolicy(
  explicit: AShareSourcePolicy | undefined,
  message: string,
  caller: CronCallerContext | undefined,
): AShareSourcePolicy | undefined {
  if (explicit || !caller || !looksLikeAShareMonitoring(message)) return explicit;
  return /新闻|政策|公告|消息|news|policy|announcement|current context/i.test(message)
    ? 'tushare_plus_news'
    : 'tushare_only';
}

function looksLikeAShareMonitoring(message: string): boolean {
  return /A[- ]?股|A[- ]?share|Tushare|沪深|上证|深证|创业板|科创板|涨跌停|市场宽度|中国股|股票|个股|(?<!\d)\d{6}(?:\.(?:SH|SZ|BJ))?(?!\d)/i.test(message);
}

export function validateSourcePolicy(
  policy: AShareSourcePolicy,
  capabilities: CronSourceCapabilities = {
    hasTushareToken: () => Boolean(process.env.TUSHARE_TOKEN),
    hasWebSearchProvider: hasConfiguredWebSearchProvider,
  },
): void {
  if (!capabilities.hasTushareToken()) {
    throw new CronTaskError(`${policy} requires TUSHARE_TOKEN to be configured`);
  }
  if (policy === 'tushare_plus_news' && !capabilities.hasWebSearchProvider()) {
    throw new CronTaskError('tushare_plus_news requires at least one configured web-search provider');
  }
}

export function hasConfiguredWebSearchProvider(): boolean {
  return Boolean(
    process.env.EXASEARCH_API_KEY ||
    process.env.PERPLEXITY_API_KEY ||
    process.env.TAVILY_API_KEY ||
    process.env.LANGSEARCH_API_KEY,
  );
}
