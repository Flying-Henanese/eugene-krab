import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCronStore, saveCronStore } from './store.js';
import type { CronJob } from './types.js';

function tempStorePath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'eugene-krab-cron-store-'));
  return { dir, path: join(dir, 'jobs.json') };
}

function job(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    name: 'Check',
    enabled: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    schedule: { kind: 'every', everyMs: 60_000, anchorMs: 1 },
    payload: { message: 'check it' },
    fulfillment: 'keep',
    owner: { channel: 'feishu', accountId: 'default', chatId: 'oc_chat' },
    deliveryTarget: { channel: 'feishu', accountId: 'default', chatId: 'oc_chat' },
    execution: { sessionMode: 'isolated', notificationMode: 'on_actionable_result' },
    state: { nextRunAtMs: 60_001, consecutiveErrors: 0, scheduleErrorCount: 0 },
    ...overrides,
  };
}

describe('cron store', () => {
  test('writes and reads version 2 Feishu jobs without secrets or history', () => {
    const { dir, path } = tempStorePath();
    try {
      saveCronStore({ version: 2, jobs: [job()] }, path);
      const loaded = loadCronStore(path);

      expect(loaded.version).toBe(2);
      expect(loaded.jobs[0]?.deliveryTarget).toEqual({
        channel: 'feishu',
        accountId: 'default',
        chatId: 'oc_chat',
      });
      expect(JSON.stringify(loaded)).not.toContain('secret');
      expect(JSON.stringify(loaded)).not.toContain('chat history');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('normalizes a version 1 targetless job as explicit legacy data', () => {
    const { dir, path } = tempStorePath();
    try {
      writeFileSync(path, JSON.stringify({
        version: 1,
        jobs: [job({ owner: undefined, deliveryTarget: undefined, execution: undefined })],
      }));

      const loaded = loadCronStore(path);

      expect(loaded.version).toBe(2);
      expect(loaded.jobs[0]?.owner).toBeUndefined();
      expect(loaded.jobs[0]?.deliveryTarget).toBeUndefined();
      expect(loaded.jobs[0]?.legacy).toEqual({ kind: 'targetless' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails explicitly for malformed or future store data', () => {
    const { dir, path } = tempStorePath();
    try {
      writeFileSync(path, '{not-json');
      expect(() => loadCronStore(path)).toThrow('invalid JSON');

      writeFileSync(path, JSON.stringify({ version: 2 }));
      expect(() => loadCronStore(path)).toThrow('missing or invalid jobs array');

      writeFileSync(path, JSON.stringify({ version: 99, jobs: [] }));
      expect(() => loadCronStore(path)).toThrow('unsupported store version 99');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects incomplete version 2 ownership records', () => {
    const { dir, path } = tempStorePath();
    try {
      writeFileSync(path, JSON.stringify({
        version: 2,
        jobs: [job({ deliveryTarget: undefined })],
      }));

      expect(() => loadCronStore(path)).toThrow('incomplete owner, deliveryTarget, or execution');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not carry unknown persisted fields into the runtime job shape', () => {
    const { dir, path } = tempStorePath();
    try {
      writeFileSync(path, JSON.stringify({
        version: 2,
        jobs: [{ ...job(), unexpectedCredential: 'not-for-persistence' }],
      }));

      const loaded = loadCronStore(path);

      expect(JSON.stringify(loaded)).not.toContain('unexpectedCredential');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects an owner and delivery target from different conversations', () => {
    const { dir, path } = tempStorePath();
    try {
      writeFileSync(path, JSON.stringify({
        version: 2,
        jobs: [job({
          deliveryTarget: { channel: 'feishu', accountId: 'default', chatId: 'other-chat' },
        })],
      }));

      expect(() => loadCronStore(path)).toThrow('invalid owner, deliveryTarget, or execution');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
