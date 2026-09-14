import { appendFileSync } from 'node:fs';
import { dexterPath } from '../utils/paths.js';
import { computeNextRunAtMs } from './schedule.js';
import { executeCronJob, type CronExecutorParams } from './executor.js';
import { loadCronStore, saveCronStore } from './store.js';
import type { CronJob, CronStore } from './types.js';
import type { CronStoreAdapter } from './task-service.js';

const LOG_PATH = dexterPath('gateway-debug.log');
const MAX_TIMER_DELAY_MS = 60_000;
const FEISHU_TASK_TIMEZONE = 'Asia/Shanghai';

function debugLog(msg: string): void {
  appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
}

type TimerHandle = { unref?: () => void };

export type CronTimerAdapter = {
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

export type CronRunnerDependencies = {
  store?: CronStoreAdapter;
  now?: () => number;
  timer?: CronTimerAdapter;
  executeJob?: (job: CronJob, store: CronStore, params: CronExecutorParams) => Promise<void>;
};

export type CronRunner = {
  stop: () => void;
};

const defaultStore: CronStoreAdapter = {
  load: () => loadCronStore(),
  save: (store) => saveCronStore(store),
};

const defaultTimer: CronTimerAdapter = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Start the process-local cron scheduler. Jobs are re-read at every tick and
 * due jobs execute serially in next-run/id order.
 */
export function startCronRunner(
  params: { configPath?: string } & CronRunnerDependencies,
): CronRunner {
  const storeAdapter = params.store ?? defaultStore;
  const now = params.now ?? (() => Date.now());
  const timerAdapter = params.timer ?? defaultTimer;
  const executeJob = params.executeJob ?? ((job, store, executorParams) => executeCronJob(job, store, executorParams, {
    now,
    saveStore: (nextStore) => saveExecutedJob(storeAdapter, nextStore, job.id),
  }));
  let stopped = false;
  let timer: TimerHandle | undefined;
  let running = false;

  function safeLoad(): CronStore {
    try {
      return storeAdapter.load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog(`[cron] store load failed closed: ${message}`);
      return { version: 2, jobs: [] };
    }
  }

  function safeSave(store: CronStore): void {
    try {
      storeAdapter.save(store);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog(`[cron] store save failed: ${message}`);
    }
  }

  function prepareStartup(store: CronStore, nowMs: number): boolean {
    let changed = false;
    for (const job of store.jobs) {
      if (!job.enabled) continue;

      if (job.schedule.kind === 'at') {
        const targetMs = new Date(job.schedule.at).getTime();
        if (!Number.isFinite(targetMs)) {
          job.enabled = false;
          job.state.nextRunAtMs = undefined;
          changed = true;
        } else if (targetMs <= nowMs) {
          // Proposed first-release misfire policy: run a missed one-shot once
          // when the gateway comes back, then let the executor decide outcome.
          job.state.nextRunAtMs = nowMs;
          changed = true;
        } else if (job.state.nextRunAtMs === undefined) {
          job.state.nextRunAtMs = computeNextRunAtMs(job.schedule, nowMs, scheduleTimezoneForJob(job));
          changed = true;
        }
        continue;
      }

      if (job.state.nextRunAtMs === undefined || job.state.nextRunAtMs <= nowMs) {
        // Periodic misfires are skipped; schedule the next normal future run.
        const next = computeNextRunAtMs(job.schedule, nowMs, scheduleTimezoneForJob(job));
        if (job.state.nextRunAtMs !== next) {
          job.state.nextRunAtMs = next;
          changed = true;
        }
      }
    }
    return changed;
  }

  async function tick(): Promise<void> {
    if (stopped || running) return;
    running = true;
    try {
      const store = safeLoad();
      const nowMs = now();
      const dueJobs = store.jobs
        .filter((job) => job.enabled && job.state.nextRunAtMs !== undefined && job.state.nextRunAtMs <= nowMs)
        .sort((a, b) => (a.state.nextRunAtMs! - b.state.nextRunAtMs!) || a.id.localeCompare(b.id));

      for (const job of dueJobs) {
        if (stopped) break;
        try {
          const liveStore = safeLoad();
          const liveJob = liveStore.jobs.find((candidate) => candidate.id === job.id);
          if (
            !liveJob ||
            !liveJob.enabled ||
            liveJob.state.nextRunAtMs === undefined ||
            liveJob.state.nextRunAtMs > nowMs
          ) {
            continue;
          }
          await executeJob(liveJob, liveStore, { configPath: params.configPath });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          debugLog(`[cron] job ${job.id} unhandled error: ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog(`[cron] tick ERROR: ${message}`);
    } finally {
      running = false;
      scheduleNext();
    }
  }

  function scheduleNext(): void {
    if (stopped) return;
    if (timer) timerAdapter.clearTimeout(timer);

    const store = safeLoad();
    const nowMs = now();
    let earliest = Number.POSITIVE_INFINITY;
    for (const job of store.jobs) {
      if (job.enabled && job.state.nextRunAtMs !== undefined) {
        earliest = Math.min(earliest, job.state.nextRunAtMs);
      }
    }

    const delayMs = earliest === Number.POSITIVE_INFINITY
      ? MAX_TIMER_DELAY_MS
      : Math.min(Math.max(0, earliest - nowMs), MAX_TIMER_DELAY_MS);
    timer = timerAdapter.setTimeout(() => { void tick(); }, delayMs);
    timer.unref?.();
  }

  const startupStore = safeLoad();
  if (prepareStartup(startupStore, now())) safeSave(startupStore);
  debugLog(`[cron] runner started (${startupStore.jobs.filter((job) => job.enabled).length} enabled jobs)`);
  scheduleNext();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) {
        timerAdapter.clearTimeout(timer);
        timer = undefined;
      }
      debugLog('[cron] runner stopped');
    },
  };
}

function scheduleTimezoneForJob(job: CronJob): string | undefined {
  return job.owner?.channel === 'feishu' || job.deliveryTarget?.channel === 'feishu'
    ? FEISHU_TASK_TIMEZONE
    : undefined;
}

function saveExecutedJob(storeAdapter: CronStoreAdapter, nextStore: CronStore, jobId: string): void {
  const latestStore = storeAdapter.load();
  const updatedJob = nextStore.jobs.find((job) => job.id === jobId);
  if (!updatedJob) return;

  const index = latestStore.jobs.findIndex((job) => job.id === jobId);
  if (index >= 0) {
    latestStore.jobs[index] = updatedJob;
    storeAdapter.save(latestStore);
  }
}
