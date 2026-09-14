import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentRunRequest } from '../gateway/agent-runner.js';
import type { CronResultDelivery } from './delivery.js';
import { executeCronJob, sourcePolicyConfig } from './executor.js';
import type { CronJob, CronStore } from './types.js';

function job(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    name: 'Monitor',
    enabled: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    schedule: { kind: 'every', everyMs: 60_000, anchorMs: 0 },
    payload: { message: 'check the market' },
    fulfillment: 'keep',
    owner: { channel: 'feishu', accountId: 'acct', chatId: 'oc_chat' },
    deliveryTarget: { channel: 'feishu', accountId: 'acct', chatId: 'oc_chat' },
    execution: { sessionMode: 'isolated', notificationMode: 'on_actionable_result' },
    state: { nextRunAtMs: 1, consecutiveErrors: 0, scheduleErrorCount: 0 },
    ...overrides,
  };
}

function store(jobToRun: CronJob): CronStore {
  return { version: 2, jobs: [jobToRun] };
}

function deliverySpy(calls: Array<{ target: unknown; body: string }>, fail = false): CronResultDelivery {
  return {
    deliver: async (target, body) => {
      calls.push({ target, body });
      if (fail) throw new Error('send failed');
    },
  };
}

describe('executeCronJob', () => {
  test('runs in an isolated Feishu session with the Tushare-only capability set', async () => {
    const current = job({
      execution: {
        sessionMode: 'isolated',
        sourcePolicy: 'tushare_only',
        notificationMode: 'always',
      },
    });
    const requests: AgentRunRequest[] = [];
    const calls: Array<{ target: unknown; body: string }> = [];

    await executeCronJob(current, store(current), {}, {
      now: () => 10_000,
      runAgent: async (request) => {
        requests.push(request);
        return 'scheduled report';
      },
      delivery: deliverySpy(calls),
      saveStore: () => {},
      resolveModel: () => ({ model: 'gpt-5.5', modelProvider: 'openai' }),
    });

    expect(requests[0]).toMatchObject({
      sessionKey: 'cron:job-1',
      isolatedSession: true,
      channel: 'feishu',
      toolAllowlist: ['a_share_analysis', 'market_sentiment_analysis', 'technical_analysis', 'financial_calculator'],
      toolExecutionBudget: { maxTotalExecutions: 4 },
      reserveFinalIteration: true,
    });
    expect(requests[0]?.query).toContain('news was not queried');
    expect(requests[0]?.query).not.toContain('If the condition has NOT been met');
    expect(calls).toEqual([{
      target: { channel: 'feishu', accountId: 'acct', chatId: 'oc_chat' },
      body: 'scheduled report',
    }]);
    expect(current.state.lastRunStatus).toBe('ok');
  });

  test('limits plus-news policy to one search and one fetch', () => {
    expect(sourcePolicyConfig('tushare_plus_news')).toEqual({
      toolAllowlist: ['a_share_analysis', 'market_sentiment_analysis', 'technical_analysis', 'financial_calculator', 'web_search', 'web_fetch'],
      toolExecutionBudget: { maxTotalExecutions: 6, perTool: { web_search: 1, web_fetch: 1 } },
      prompt: expect.stringContaining('at most one web_search'),
    });
  });

  test('suppresses HEARTBEAT_OK without delivery and keeps a once task pending', async () => {
    const current = job({
      fulfillment: 'once',
      schedule: { kind: 'at', at: '2026-09-14T00:00:01.000Z' },
      execution: { sessionMode: 'isolated', notificationMode: 'on_actionable_result' },
    });
    const calls: Array<{ target: unknown; body: string }> = [];
    const saved: CronStore[] = [];

    await executeCronJob(current, store(current), {}, {
      now: () => Date.parse('2026-09-14T00:00:02.000Z'),
      runAgent: async () => 'HEARTBEAT_OK',
      delivery: deliverySpy(calls),
      saveStore: (next) => saved.push(structuredClone(next)),
    });

    expect(calls).toHaveLength(0);
    expect(current.enabled).toBe(true);
    expect(current.state.lastRunStatus).toBe('suppressed');
    expect(current.state.lastSuppressionReason).toBe('ok-token');
    expect(current.state.lastError).toContain('remains enabled');
    expect(saved).toHaveLength(1);
  });

  test('does not mark a once task successful when delivery fails', async () => {
    const current = job({ fulfillment: 'once' });
    const saved: CronStore[] = [];

    await executeCronJob(current, store(current), {}, {
      now: () => 10_000,
      runAgent: async () => 'actionable result',
      delivery: deliverySpy([], true),
      saveStore: (next) => saved.push(structuredClone(next)),
    });

    expect(current.enabled).toBe(true);
    expect(current.state.lastRunStatus).toBe('error');
    expect(current.state.consecutiveErrors).toBe(1);
    expect(current.state.lastError).toBe('send failed');
    expect(saved).toHaveLength(1);
  });

  test('does not persist or log raw provider payloads as task errors', async () => {
    const current = job({ fulfillment: 'once' });

    await executeCronJob(current, store(current), {}, {
      now: () => 10_000,
      runAgent: async () => { throw new Error('prompt=private chat history messages: hidden'); },
      delivery: deliverySpy([]),
      saveStore: () => {},
    });

    expect(current.state.lastError).toBe('Scheduled task failed; diagnostic details were withheld from persisted state.');
  });

  test('treats an error-shaped agent answer as a failed run', async () => {
    const current = job();
    const calls: Array<{ target: unknown; body: string }> = [];

    await executeCronJob(current, store(current), {}, {
      now: () => 10_000,
      runAgent: async () => 'Error: provider unavailable',
      delivery: deliverySpy(calls),
      saveStore: () => {},
    });

    expect(calls).toHaveLength(0);
    expect(current.state.lastRunStatus).toBe('error');
    expect(current.state.consecutiveErrors).toBe(1);
    expect(current.state.lastError).toBe('provider unavailable');
  });

  test('auto-disables once only after confirmed delivery', async () => {
    const current = job({ fulfillment: 'once' });
    await executeCronJob(current, store(current), {}, {
      now: () => 10_000,
      runAgent: async () => 'actionable result',
      delivery: deliverySpy([]),
      saveStore: () => {},
    });

    expect(current.enabled).toBe(false);
    expect(current.state.lastRunStatus).toBe('ok');
    expect(current.state.nextRunAtMs).toBeUndefined();
  });

  test('documents that a process restart may repeat the first alert', async () => {
    const current = job();
    const calls: Array<{ target: unknown; body: string }> = [];
    const run = (suppressionStates: Map<string, { lastMessageText: string | null; lastMessageAt: number | null }>) =>
      executeCronJob(current, store(current), {}, {
        now: () => 10_000,
        runAgent: async () => 'same alert',
        delivery: deliverySpy(calls),
        saveStore: () => {},
        suppressionStates,
      });

    await run(new Map());
    await run(new Map());

    expect(calls).toHaveLength(2);
  });

  test('skips execution outside the configured active window', async () => {
    const current = job({
      activeHours: {
        start: '09:00',
        end: '15:00',
        timezone: 'Asia/Shanghai',
        daysOfWeek: [1, 2, 3, 4, 5],
      },
    });
    let ran = false;
    const calls: Array<{ target: unknown; body: string }> = [];

    await executeCronJob(current, store(current), {}, {
      // 2026-09-14 is Monday, 16:00 in Shanghai.
      now: () => Date.parse('2026-09-14T08:00:00.000Z'),
      runAgent: async () => { ran = true; return 'unexpected'; },
      delivery: deliverySpy(calls),
      saveStore: () => {},
    });

    expect(ran).toBe(false);
    expect(calls).toHaveLength(0);
    expect(current.state.lastRunStatus).toBeUndefined();
  });

  test('sends one terminal notice after a one-shot exhausts retries', async () => {
    const current = job({ schedule: { kind: 'at', at: '2026-09-15T00:00:00.000Z' } });
    const calls: Array<{ target: unknown; body: string }> = [];
    const dependencies = {
      now: () => 10_000,
      runAgent: async () => { throw new Error('provider failed'); },
      delivery: deliverySpy(calls),
      saveStore: () => {},
    };

    await executeCronJob(current, store(current), {}, dependencies);
    await executeCronJob(current, store(current), {}, dependencies);
    await executeCronJob(current, store(current), {}, dependencies);

    expect(current.enabled).toBe(false);
    expect(current.state.lastRunStatus).toBe('error');
    expect(current.state.lastErrorNoticeAtMs).toBe(10_000);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toContain('failed after 3 attempts');
  });

  test('fails closed for a targetless legacy job instead of consulting session recency', async () => {
    const current = job({
      owner: undefined,
      deliveryTarget: undefined,
      execution: undefined,
      legacy: { kind: 'targetless' },
    });
    let ran = false;

    await executeCronJob(current, store(current), {}, {
      now: () => 10_000,
      runAgent: async () => { ran = true; return 'unexpected'; },
      saveStore: () => {},
    });

    expect(ran).toBe(false);
    expect(current.state.lastRunStatus).toBe('error');
    expect(current.state.lastError).toContain('explicit delivery target');
  });

  test('keeps targetless legacy compatibility WhatsApp-only even with a newer Feishu session', async () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), 'eugene-krab-legacy-sessions-'));
    const previousSessionsDir = process.env.DEXTER_SESSIONS_DIR;
    process.env.DEXTER_SESSIONS_DIR = sessionsDir;
    mkdirSync(join(sessionsDir, 'default'), { recursive: true });
    writeFileSync(join(sessionsDir, 'default', 'sessions.json'), JSON.stringify({
      feishu: {
        sessionKey: 'feishu:recent',
        createdAt: 1,
        updatedAt: 30,
        lastChannel: 'feishu',
        lastTo: 'oc_newer',
        lastAccountId: 'feishu-account',
      },
      whatsapp: {
        sessionKey: 'whatsapp:older',
        createdAt: 1,
        updatedAt: 20,
        lastChannel: 'whatsapp',
        lastTo: '+15550001111',
        lastAccountId: 'whatsapp-account',
      },
    }));

    const current = job({
      owner: undefined,
      deliveryTarget: undefined,
      execution: undefined,
      legacy: { kind: 'targetless' },
    });
    const calls: Array<{ target: unknown; body: string }> = [];
    try {
      await executeCronJob(current, store(current), {}, {
        now: () => 10_000,
        runAgent: async () => 'legacy alert',
        delivery: deliverySpy(calls),
        saveStore: () => {},
      });
    } finally {
      if (previousSessionsDir === undefined) delete process.env.DEXTER_SESSIONS_DIR;
      else process.env.DEXTER_SESSIONS_DIR = previousSessionsDir;
      rmSync(sessionsDir, { recursive: true, force: true });
    }

    expect(calls).toEqual([{
      target: { channel: 'whatsapp', accountId: 'whatsapp-account', to: '+15550001111' },
      body: 'legacy alert',
    }]);
  });

  test('keeps the global heartbeat compatibility path WhatsApp-only', async () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), 'eugene-krab-heartbeat-sessions-'));
    const previousSessionsDir = process.env.DEXTER_SESSIONS_DIR;
    process.env.DEXTER_SESSIONS_DIR = sessionsDir;
    mkdirSync(join(sessionsDir, 'default'), { recursive: true });
    writeFileSync(join(sessionsDir, 'default', 'sessions.json'), JSON.stringify({
      feishu: {
        sessionKey: 'feishu:recent',
        createdAt: 1,
        updatedAt: 30,
        lastChannel: 'feishu',
        lastTo: 'oc_newer',
        lastAccountId: 'feishu-account',
      },
      whatsapp: {
        sessionKey: 'whatsapp:older',
        createdAt: 1,
        updatedAt: 20,
        lastChannel: 'whatsapp',
        lastTo: '+15550001111',
        lastAccountId: 'whatsapp-account',
      },
    }));

    const current = job({
      owner: undefined,
      deliveryTarget: undefined,
      execution: undefined,
      legacy: { kind: 'heartbeat' },
    });
    const calls: Array<{ target: unknown; body: string }> = [];
    try {
      await executeCronJob(current, store(current), {}, {
        now: () => 10_000,
        runAgent: async () => 'alert',
        delivery: deliverySpy(calls),
        saveStore: () => {},
      });
    } finally {
      if (previousSessionsDir === undefined) delete process.env.DEXTER_SESSIONS_DIR;
      else process.env.DEXTER_SESSIONS_DIR = previousSessionsDir;
      rmSync(sessionsDir, { recursive: true, force: true });
    }

    expect(calls).toEqual([{
      target: { channel: 'whatsapp', accountId: 'whatsapp-account', to: '+15550001111' },
      body: 'alert',
    }]);
    expect(current.state.lastRunStatus).toBe('ok');
  });
});
