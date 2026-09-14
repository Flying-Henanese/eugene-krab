import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { dexterPath } from '../utils/paths.js';
import type {
  ActiveHours,
  CronDeliveryTarget,
  CronExecutionPolicy,
  CronJob,
  CronJobState,
  CronPayload,
  CronOwner,
  CronSchedule,
  CronStore,
  FulfillmentMode,
} from './types.js';

const CRON_STORE_PATH = dexterPath('cron', 'jobs.json');

const EMPTY_STORE: CronStore = { version: 2, jobs: [] };

export class CronStoreError extends Error {
  constructor(message: string) {
    super(`Cron store error: ${message}`);
    this.name = 'CronStoreError';
  }
}

export function getCronStorePath(): string {
  return CRON_STORE_PATH;
}

export function loadCronStore(path: string = CRON_STORE_PATH): CronStore {
  if (!existsSync(path)) {
    return { ...EMPTY_STORE, jobs: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'invalid JSON' : 'file could not be read';
    throw new CronStoreError(`${detail} at ${path}`);
  }

  if (!isRecord(parsed)) {
    throw new CronStoreError(`root value must be an object at ${path}`);
  }
  if (!Array.isArray(parsed.jobs)) {
    throw new CronStoreError(`missing or invalid jobs array at ${path}`);
  }

  if (parsed.version === 1) {
    return {
      version: 2,
      jobs: parsed.jobs.map((job, index) => validateJob(job, index, true)),
    };
  }
  if (parsed.version !== 2) {
    throw new CronStoreError(`unsupported store version ${String(parsed.version)}`);
  }

  return {
    version: 2,
    jobs: parsed.jobs.map((job, index) => validateJob(job, index, false)),
  };
}

export function saveCronStore(store: CronStore, path: string = CRON_STORE_PATH): void {
  if (store.version !== 2) {
    throw new CronStoreError('only version 2 stores can be written');
  }
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const data = JSON.stringify(store, null, 2);
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;

  try {
    writeFileSync(tmp, data, 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    // Clean up temp file on failure
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateJob(value: unknown, index: number, legacyVersion: boolean): CronJob {
  if (!isRecord(value)) {
    throw new CronStoreError(`job ${index} must be an object`);
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    !isFiniteNumber(value.createdAtMs) ||
    !isFiniteNumber(value.updatedAtMs) ||
    !isSchedule(value.schedule) ||
    !isPayload(value.payload) ||
    !isFulfillment(value.fulfillment) ||
    !isJobState(value.state)
  ) {
    throw new CronStoreError(`job ${index} has invalid required fields`);
  }

  if (value.description !== undefined && typeof value.description !== 'string') {
    throw new CronStoreError(`job ${index} has an invalid description`);
  }
  if (value.activeHours !== undefined && !isActiveHours(value.activeHours)) {
    throw new CronStoreError(`job ${index} has invalid active hours`);
  }
  if (value.legacy !== undefined && !isRecord(value.legacy)) {
    throw new CronStoreError(`job ${index} has invalid legacy metadata`);
  }
  if (isRecord(value.legacy) && value.legacy.kind !== 'heartbeat' && value.legacy.kind !== 'targetless') {
    throw new CronStoreError(`job ${index} has unknown legacy kind`);
  }

  const hasOwner = value.owner !== undefined;
  const hasTarget = value.deliveryTarget !== undefined;
  const hasExecution = value.execution !== undefined;
  if (hasOwner || hasTarget || hasExecution) {
    if (!hasOwner || !hasTarget || !hasExecution) {
      throw new CronStoreError(`job ${index} has incomplete owner, deliveryTarget, or execution fields`);
    }
    if (
      !isOwner(value.owner) ||
      !isDeliveryTarget(value.deliveryTarget) ||
      !isExecution(value.execution) ||
      !ownerMatchesDeliveryTarget(value.owner, value.deliveryTarget)
    ) {
      throw new CronStoreError(`job ${index} has invalid owner, deliveryTarget, or execution fields`);
    }
  } else if (!legacyVersion && value.legacy === undefined) {
    // Version 2 deliberately permits targetless compatibility records, but only
    // as explicit legacy records. New records must use the task service, which
    // writes all three fields; an unmarked targetless record is therefore
    // considered malformed rather than silently executable.
    throw new CronStoreError(`job ${index} is targetless and missing legacy metadata`);
  }

  const normalized: CronJob = {
    id: value.id,
    name: value.name,
    enabled: value.enabled,
    createdAtMs: value.createdAtMs,
    updatedAtMs: value.updatedAtMs,
    schedule: value.schedule as CronSchedule,
    payload: value.payload as CronPayload,
    fulfillment: value.fulfillment as FulfillmentMode,
    state: value.state as CronJobState,
  };
  if (value.description !== undefined) normalized.description = value.description;
  if (value.activeHours !== undefined) normalized.activeHours = value.activeHours as ActiveHours;
  if (isOwner(value.owner)) normalized.owner = value.owner;
  if (isDeliveryTarget(value.deliveryTarget)) normalized.deliveryTarget = value.deliveryTarget;
  if (isExecution(value.execution)) normalized.execution = value.execution;
  if (isRecord(value.legacy)) normalized.legacy = { kind: value.legacy.kind as 'heartbeat' | 'targetless' };
  if (legacyVersion && normalized.owner === undefined && normalized.deliveryTarget === undefined && normalized.execution === undefined) {
    normalized.legacy ??= { kind: normalized.name === 'Heartbeat' ? 'heartbeat' : 'targetless' };
  }
  return normalized;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSchedule(value: unknown): value is CronSchedule {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'at') return typeof value.at === 'string';
  if (value.kind === 'every') {
    return isFiniteNumber(value.everyMs) &&
      (value.anchorMs === undefined || isFiniteNumber(value.anchorMs));
  }
  if (value.kind === 'cron') {
    return typeof value.expr === 'string' && (value.tz === undefined || typeof value.tz === 'string');
  }
  return false;
}

function isPayload(value: unknown): boolean {
  if (!isRecord(value) || typeof value.message !== 'string') return false;
  return (value.model === undefined || typeof value.model === 'string') &&
    (value.modelProvider === undefined || typeof value.modelProvider === 'string');
}

function isFulfillment(value: unknown): value is FulfillmentMode {
  return value === 'keep' || value === 'once' || value === 'ask';
}

function isJobState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.nextRunAtMs === undefined || isFiniteNumber(value.nextRunAtMs)) &&
    (value.lastRunAtMs === undefined || isFiniteNumber(value.lastRunAtMs)) &&
    (value.lastRunStatus === undefined || value.lastRunStatus === 'ok' || value.lastRunStatus === 'error' || value.lastRunStatus === 'suppressed') &&
    (value.lastError === undefined || typeof value.lastError === 'string') &&
    (value.lastSuppressionReason === undefined || typeof value.lastSuppressionReason === 'string') &&
    (value.lastErrorNoticeAtMs === undefined || isFiniteNumber(value.lastErrorNoticeAtMs)) &&
    (value.lastDurationMs === undefined || isFiniteNumber(value.lastDurationMs)) &&
    isFiniteNumber(value.consecutiveErrors) &&
    isFiniteNumber(value.scheduleErrorCount);
}

function isOwner(value: unknown): value is CronOwner {
  if (!isRecord(value) || typeof value.channel !== 'string' || typeof value.accountId !== 'string') return false;
  if (value.channel === 'feishu') return typeof value.chatId === 'string';
  if (value.channel === 'whatsapp') return typeof value.to === 'string';
  return false;
}

function isDeliveryTarget(value: unknown): value is CronDeliveryTarget {
  return isOwner(value);
}

function ownerMatchesDeliveryTarget(owner: CronOwner, target: CronDeliveryTarget): boolean {
  if (owner.channel !== target.channel || owner.accountId !== target.accountId) return false;
  return target.channel === 'feishu'
    ? owner.channel === 'feishu' && owner.chatId === target.chatId
    : owner.channel === 'whatsapp' && owner.to === target.to;
}

function isExecution(value: unknown): value is CronExecutionPolicy {
  if (!isRecord(value) || value.sessionMode !== 'isolated') return false;
  if (value.notificationMode !== 'always' && value.notificationMode !== 'on_actionable_result') return false;
  return value.sourcePolicy === undefined ||
    value.sourcePolicy === 'tushare_only' ||
    value.sourcePolicy === 'tushare_plus_news';
}

function isActiveHours(value: unknown): value is ActiveHours {
  if (!isRecord(value) || typeof value.start !== 'string' || typeof value.end !== 'string') return false;
  return (value.timezone === undefined || typeof value.timezone === 'string') &&
    (value.daysOfWeek === undefined || (
      Array.isArray(value.daysOfWeek) &&
      value.daysOfWeek.every((day) => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6)
    ));
}
