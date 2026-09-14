import { afterEach, describe, expect, test } from 'bun:test';
import type { CronCallerContext, CronJob, CronStore } from './types.js';
import { CronTaskService } from './task-service.js';

const callerA: CronCallerContext = {
  channel: 'feishu',
  accountId: 'account-a',
  chatId: 'chat-a',
  agentId: 'default',
};

const callerB: CronCallerContext = {
  channel: 'feishu',
  accountId: 'account-a',
  chatId: 'chat-b',
  agentId: 'default',
};

const callerSameChatOtherAccount: CronCallerContext = {
  channel: 'feishu',
  accountId: 'account-b',
  chatId: 'chat-a',
  agentId: 'default',
};

const originalTushare = process.env.TUSHARE_TOKEN;
const originalTavily = process.env.TAVILY_API_KEY;

afterEach(() => {
  if (originalTushare === undefined) delete process.env.TUSHARE_TOKEN;
  else process.env.TUSHARE_TOKEN = originalTushare;
  if (originalTavily === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = originalTavily;
});

function memoryAdapter(initial: CronStore = { version: 2, jobs: [] }) {
  let store = initial;
  return {
    adapter: {
      load: () => store,
      save: (next: CronStore) => { store = structuredClone(next); },
    },
    read: () => store,
  };
}

function input(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    schedule: { kind: 'every' as const, everyMs: 60_000, anchorMs: 1_000 },
    message: `check ${name}`,
    ...extra,
  };
}

describe('CronTaskService', () => {
  test('creates a Feishu-owned isolated Tushare task and scopes list results', async () => {
    process.env.TUSHARE_TOKEN = 'test-tushare';
    const memory = memoryAdapter();
    const service = new CronTaskService({
      store: memory.adapter,
      now: () => 10_000,
      idGenerator: () => 'job-a',
    });

    const created = await service.create(input('market', { sourcePolicy: 'tushare_only' }), callerA);

    expect(created.owner).toEqual({ channel: 'feishu', accountId: 'account-a', chatId: 'chat-a' });
    expect(created.deliveryTarget).toEqual({ channel: 'feishu', accountId: 'account-a', chatId: 'chat-a' });
    expect(created.execution).toEqual({
      sessionMode: 'isolated',
      sourcePolicy: 'tushare_only',
      notificationMode: 'on_actionable_result',
    });
    expect(await service.listForOwner(callerA)).toHaveLength(1);
    expect(await service.listForOwner(callerB)).toHaveLength(0);
    expect(await service.listForOwner(callerSameChatOtherAccount)).toHaveLength(0);
    expect(JSON.stringify(memory.read())).not.toContain('test-tushare');
  });

  test('defaults recognized A-share monitoring to Tushare-only unless news is requested', async () => {
    process.env.TUSHARE_TOKEN = 'test-tushare';
    process.env.TAVILY_API_KEY = 'test-tavily';
    const service = new CronTaskService({
      store: memoryAdapter().adapter,
      idGenerator: (() => {
        let next = 0;
        return () => `job-${++next}`;
      })(),
    });

    const tushareOnly = await service.create(input('A股宽度', { message: '检查A股市场宽度，异常才提醒' }), callerA);
    const plusNews = await service.create(input('A股新闻', { message: '检查A股并补充当前政策新闻' }), callerA);

    expect(tushareOnly.execution?.sourcePolicy).toBe('tushare_only');
    expect(plusNews.execution?.sourcePolicy).toBe('tushare_plus_news');
  });

  test('does not create a targetless task from absent caller context', async () => {
    const memory = memoryAdapter();
    const service = new CronTaskService({ store: memory.adapter, idGenerator: () => 'legacy' });

    const created = await service.create(input('local'));

    expect(created.owner).toBeUndefined();
    expect(created.deliveryTarget).toBeUndefined();
    expect(created.execution).toBeUndefined();
    expect(created.legacy).toEqual({ kind: 'targetless' });
  });

  test('rejects source policies without the required providers', async () => {
    delete process.env.TUSHARE_TOKEN;
    delete process.env.TAVILY_API_KEY;
    const service = new CronTaskService({ store: memoryAdapter().adapter });

    await expect(service.create(input('market', { sourcePolicy: 'tushare_only' }), callerA)).rejects.toThrow('TUSHARE_TOKEN');

    process.env.TUSHARE_TOKEN = 'test-tushare';
    await expect(service.create(input('market', { sourcePolicy: 'tushare_plus_news' }), callerA)).rejects.toThrow('web-search provider');
  });

  test('rejects ask fulfillment for new Feishu tasks', async () => {
    const service = new CronTaskService({ store: memoryAdapter().adapter });

    await expect(service.create(input('ask me', { fulfillment: 'ask' }), callerA)).rejects.toThrow('not available for Feishu');
  });

  test('enforces owner checks, short-id ambiguity, and quota capacity', async () => {
    const memory = memoryAdapter();
    let id = 0;
    const service = new CronTaskService({
      store: memory.adapter,
      maxActiveJobsPerOwner: 2,
      idGenerator: () => ['abcdef01', 'abcdef02', 'third'][id++] ?? `extra-${id}`,
    });

    const first = await service.create(input('first'), callerA);
    const second = await service.create(input('second'), callerA);
    await expect(service.create(input('third'), callerA)).rejects.toThrow('maximum of 2 enabled tasks');
    await expect(service.updateForOwner(callerB, first.id, { enabled: false })).rejects.toThrow('not found');
    await expect(service.updateForOwner(callerA, 'abcdef', { enabled: false })).rejects.toThrow('ambiguous');

    await service.updateForOwner(callerA, first.id, { enabled: false });
    const third = await service.create(input('third'), callerA);
    expect(third.id).toBe('third');
    expect(second.id).toBe('abcdef02');
  });

  test('serializes concurrent creates so no job is lost', async () => {
    let nextId = 0;
    const memory = memoryAdapter();
    const service = new CronTaskService({
      store: memory.adapter,
      idGenerator: () => `job-${++nextId}`,
    });

    await Promise.all(
      Array.from({ length: 8 }, (_, index) => service.create(input(`job-${index}`), callerA)),
    );

    expect(memory.read().jobs).toHaveLength(8);
    expect(new Set(memory.read().jobs.map((job) => job.id)).size).toBe(8);
  });

  test('supports exact owner-scoped run and remove seams', async () => {
    const memory = memoryAdapter();
    let executed: CronJob | undefined;
    const service = new CronTaskService({
      store: memory.adapter,
      idGenerator: () => 'run-me',
      executeJob: async (job) => { executed = job; },
    });

    const created = await service.create(input('run me'), callerA);
    const ran = await service.runForOwner(callerA, created.id);

    expect(executed?.id).toBe(created.id);
    expect(ran.id).toBe(created.id);
    await expect(service.removeForOwner(callerB, created.id)).rejects.toThrow('not found');
  });
});
