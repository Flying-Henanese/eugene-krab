import { loadSessionStore, resolveSessionStorePath, type SessionEntry } from '../gateway/sessions/store.js';
import { executeCronJob, type CronExecutorDependencies, type CronExecutorParams } from './executor.js';
import type { CronJob, CronStore } from './types.js';

/**
 * Compatibility-only heartbeat delivery. It is deliberately separate from
 * target-bound user tasks and considers WhatsApp sessions only; Feishu recency
 * can never become a heartbeat recipient by accident.
 */
export async function executeLegacyHeartbeatJob(
  job: CronJob,
  store: CronStore,
  params: CronExecutorParams,
  dependencies: CronExecutorDependencies,
): Promise<void> {
  await executeLegacyWhatsAppFallback(job, store, params, dependencies);
}

/**
 * Compatibility-only path for version-1 targetless jobs. It preserves the
 * former WhatsApp recency behavior, but deliberately excludes Feishu sessions.
 */
export async function executeLegacyTargetlessJob(
  job: CronJob,
  store: CronStore,
  params: CronExecutorParams,
  dependencies: CronExecutorDependencies,
): Promise<void> {
  await executeLegacyWhatsAppFallback(job, store, params, dependencies);
}

async function executeLegacyWhatsAppFallback(
  job: CronJob,
  store: CronStore,
  params: CronExecutorParams,
  dependencies: CronExecutorDependencies,
): Promise<void> {
  const session = findLatestWhatsAppSession();
  if (!session?.lastTo || !session.lastAccountId) {
    const targetlessJob: CronJob = { ...job, legacy: undefined };
    await executeCronJob(targetlessJob, store, params, dependencies);
    return;
  }

  const targetedJob: CronJob = {
    ...job,
    legacy: undefined,
    deliveryTarget: {
      channel: 'whatsapp',
      accountId: session.lastAccountId,
      to: session.lastTo,
    },
    execution: job.execution ?? { sessionMode: 'isolated', notificationMode: 'on_actionable_result' },
    state: job.state,
  };
  await executeCronJob(targetedJob, store, params, dependencies);
  job.enabled = targetedJob.enabled;
  job.updatedAtMs = targetedJob.updatedAtMs;
}

function findLatestWhatsAppSession(): SessionEntry | null {
  const store = loadSessionStore(resolveSessionStorePath('default'));
  const entries = Object.values(store).filter(
    (entry) => entry.lastChannel === 'whatsapp' && entry.lastTo && entry.lastAccountId,
  );
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries[0] ?? null;
}
