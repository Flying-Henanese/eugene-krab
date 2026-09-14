import { describe, expect, test } from 'bun:test';
import { startCronRunner, type CronTimerAdapter } from './runner.js';
import type { CronJob, CronStore } from './types.js';

function job(id: string, nextRunAtMs: number, schedule: CronJob['schedule'] = { kind: 'every', everyMs: 60_000, anchorMs: 0 }): CronJob {
  return {
    id,
    name: id,
    enabled: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    schedule,
    payload: { message: 'check' },
    fulfillment: 'keep',
    owner: { channel: 'feishu', accountId: 'acct', chatId: 'chat' },
    deliveryTarget: { channel: 'feishu', accountId: 'acct', chatId: 'chat' },
    execution: { sessionMode: 'isolated', notificationMode: 'always' },
    state: { nextRunAtMs, consecutiveErrors: 0, scheduleErrorCount: 0 },
  };
}

function fakeTimer() {
  const timers: Array<{ callback: () => void; delayMs: number; handle: { unref?: () => void } }> = [];
  const timer: CronTimerAdapter = {
    setTimeout: (callback, delayMs) => {
      const handle = { unref: () => {} };
      timers.push({ callback, delayMs, handle });
      return handle;
    },
    clearTimeout: (handle) => {
      const index = timers.findIndex((timer) => timer.handle === handle);
      if (index >= 0) timers.splice(index, 1);
    },
  };
  return {
    timer,
    timers,
    async fireNext() {
      const next = timers.shift();
      if (next) await next.callback();
    },
  };
}

describe('cron runner', () => {
  test('skips overdue periodic misfires but runs a missed one-shot after restart', async () => {
    const at = job('at', 1, { kind: 'at', at: '2026-09-13T23:59:00.000Z' });
    const periodic = job('periodic', 1);
    let store: CronStore = { version: 2, jobs: [at, periodic] };
    const fake = fakeTimer();
    const executed: string[] = [];
    const now = Date.parse('2026-09-14T00:00:00.000Z');

    startCronRunner({
      now: () => now,
      timer: fake.timer,
      store: {
        load: () => store,
        save: (next) => { store = next; },
      },
      executeJob: async (current) => {
        executed.push(current.id);
        current.enabled = false;
        current.state.nextRunAtMs = undefined;
      },
    });

    expect(store.jobs.find((current) => current.id === 'periodic')?.state.nextRunAtMs).toBeGreaterThan(now);
    expect(fake.timers[0]?.delayMs).toBe(0);
    await fake.fireNext();
    expect(executed).toEqual(['at']);
  });

  test('executes due jobs serially in deterministic order and re-arms', async () => {
    let store: CronStore = { version: 2, jobs: [job('b', 100), job('a', 100)] };
    const fake = fakeTimer();
    const executed: string[] = [];
    let now = 0;

    startCronRunner({
      now: () => now,
      timer: fake.timer,
      store: {
        load: () => store,
        save: (next) => { store = next; },
      },
      executeJob: async (current) => {
        executed.push(current.id);
        current.enabled = false;
        current.state.nextRunAtMs = undefined;
      },
    });

    now = 100;
    await fake.fireNext();
    expect(executed).toEqual(['a', 'b']);
    expect(fake.timers).toHaveLength(1);
  });

  test('stop clears the armed timer and prevents later jobs from starting', async () => {
    const fake = fakeTimer();
    let store: CronStore = { version: 2, jobs: [job('one', 1)] };
    let executed = 0;
    const runner = startCronRunner({
      now: () => 1,
      timer: fake.timer,
      store: { load: () => store, save: (next) => { store = next; } },
      executeJob: async () => { executed += 1; },
    });

    runner.stop();
    await fake.fireNext();
    expect(executed).toBe(0);
    expect(fake.timers).toHaveLength(0);
  });
});
