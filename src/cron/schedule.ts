import { Cron } from 'croner';
import type { CronSchedule } from './types.js';

export const MIN_SCHEDULE_INTERVAL_MS = 60_000;
const MIN_REFIRE_GAP_MS = MIN_SCHEDULE_INTERVAL_MS;

/**
 * Compute the next run time for a schedule.
 * Returns undefined if the schedule has expired (one-shot in the past) or is invalid.
 */
export function computeNextRunAtMs(
  schedule: CronSchedule,
  nowMs: number,
  defaultTimezone?: string,
): number | undefined {
  switch (schedule.kind) {
    case 'at': {
      const targetMs = new Date(schedule.at).getTime();
      if (isNaN(targetMs)) return undefined;
      return targetMs > nowMs ? targetMs : undefined;
    }

    case 'every': {
      const anchor = schedule.anchorMs ?? nowMs;
      if (schedule.everyMs < MIN_SCHEDULE_INTERVAL_MS) return undefined;
      const elapsed = nowMs - anchor;
      const periods = Math.ceil(elapsed / schedule.everyMs);
      const next = anchor + periods * schedule.everyMs;
      // If next === nowMs (exactly on the interval), push to next period
      return next <= nowMs ? next + schedule.everyMs : next;
    }

    case 'cron': {
      try {
        const tz = schedule.tz || defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const cron = new Cron(schedule.expr, { timezone: tz });
        const now = new Date(nowMs);
        let next = cron.nextRun(now);

        // Workaround for croner year-rollback edge case:
        // If result is at or before now, try from the next second
        if (next && next.getTime() <= nowMs) {
          const nextSecond = new Date(nowMs + 1000);
          next = cron.nextRun(nextSecond);
        }

        if (!next) return undefined;
        const nextMs = next.getTime();
        // Ensure minimum gap to prevent spin-loops
        return nextMs > nowMs + MIN_REFIRE_GAP_MS ? nextMs : nowMs + MIN_REFIRE_GAP_MS;
      } catch {
        return undefined; // Invalid cron expression
      }
    }
  }
}

/**
 * Validate the schedule at a task-management boundary. The runner also fails
 * closed for malformed persisted schedules, but newly created jobs should get
 * an actionable error before anything is written.
 */
export function validateCronSchedule(
  schedule: CronSchedule,
  nowMs: number,
  defaultTimezone = 'Asia/Shanghai',
): string | undefined {
  if (schedule.kind === 'at') {
    const targetMs = new Date(schedule.at).getTime();
    if (!Number.isFinite(targetMs)) return 'the specified time is not a valid ISO-8601 timestamp';
    if (targetMs <= nowMs) return 'the specified time is in the past';
    return undefined;
  }

  if (schedule.kind === 'every') {
    if (!Number.isFinite(schedule.everyMs) || schedule.everyMs < MIN_SCHEDULE_INTERVAL_MS) {
      return 'every schedules must run no more often than once per minute';
    }
    return undefined;
  }

  try {
    const tz = schedule.tz || defaultTimezone;
    const cron = new Cron(schedule.expr, { timezone: tz });
    let previous = cron.nextRun(new Date(nowMs));
    if (!previous) return 'the cron expression has no future occurrence';
    for (let occurrence = 0; occurrence < 10; occurrence += 1) {
      const next = cron.nextRun(previous);
      if (!next) break;
      if (next.getTime() - previous.getTime() < MIN_SCHEDULE_INTERVAL_MS) {
        return 'cron schedules must run no more often than once per minute';
      }
      previous = next;
    }
  } catch {
    return 'the cron expression or timezone is invalid';
  }

  return undefined;
}

export function normalizeTaskSchedule(schedule: CronSchedule, defaultTimezone = 'Asia/Shanghai'): CronSchedule {
  if (schedule.kind !== 'cron' || schedule.tz) return schedule;
  return { ...schedule, tz: defaultTimezone };
}
