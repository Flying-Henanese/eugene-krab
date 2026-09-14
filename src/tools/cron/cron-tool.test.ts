import { describe, expect, test } from 'bun:test';
import { CronTaskService } from '../../cron/task-service.js';
import type { CronStore } from '../../cron/types.js';
import { createCronTool } from './cron-tool.js';

const caller = {
  channel: 'feishu' as const,
  accountId: 'acct',
  chatId: 'oc_chat',
  agentId: 'default',
};

function serviceWithStore() {
  let store: CronStore = { version: 2, jobs: [] };
  const service = new CronTaskService({
    store: {
      load: () => store,
      save: (next) => { store = structuredClone(next); },
    },
    now: () => 10_000,
    idGenerator: () => 'abcdef01',
  });
  return { service, read: () => store };
}

describe('context-bound cron tool', () => {
  test('does not accept model-supplied owner or delivery fields', async () => {
    const memory = serviceWithStore();
    const tool = createCronTool({ caller, taskService: memory.service });

    const result = await tool.invoke({
      action: 'add',
      name: 'A-share monitor',
      schedule: { kind: 'every', everyMs: 60_000 },
      message: 'Check the market',
      owner: { channel: 'feishu', accountId: 'attacker', chatId: 'other' },
      deliveryTarget: { channel: 'feishu', accountId: 'attacker', chatId: 'other' },
    } as never);

    expect(String(result)).toContain('Created job');
    expect(memory.read().jobs[0]?.owner).toEqual({ channel: 'feishu', accountId: 'acct', chatId: 'oc_chat' });
    expect(memory.read().jobs[0]?.deliveryTarget).toEqual({ channel: 'feishu', accountId: 'acct', chatId: 'oc_chat' });
  });

  test('lists only the caller scope in a compact Feishu-readable form', async () => {
    const memory = serviceWithStore();
    await memory.service.create({
      name: 'mine',
      schedule: { kind: 'every', everyMs: 60_000 },
      message: 'mine',
    }, caller);
    await memory.service.create({
      name: 'other',
      schedule: { kind: 'every', everyMs: 60_000 },
      message: 'other',
    }, { ...caller, chatId: 'other-chat' });

    const result = await createCronTool({ caller, taskService: memory.service }).invoke({ action: 'list' });

    expect(String(result)).toContain('mine');
    expect(String(result)).not.toContain('other');
    expect(String(result)).toContain('Source: unrestricted');
    expect(String(result)).toContain('Notifications: on_actionable_result');
  });
});
