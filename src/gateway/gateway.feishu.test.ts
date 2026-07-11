import { describe, expect, test } from 'bun:test';
import { handleFeishuInbound } from './gateway.js';
import type { GatewayConfig } from './config.js';
import type { FeishuInboundMessage } from './channels/feishu/index.js';

type Dependencies = NonNullable<Parameters<typeof handleFeishuInbound>[2]>;

const cfg: GatewayConfig = {
  gateway: { accountId: 'default', logLevel: 'silent' },
  channels: {
    whatsapp: { enabled: false, accounts: {}, allowFrom: [] },
    feishu: {
      enabled: true,
      accounts: {},
      processingCard: { enabled: true, text: '正在分析中，请稍候…' },
    },
  },
  bindings: [],
};

const inbound: FeishuInboundMessage = {
  id: 'om_inbound',
  accountId: 'default',
  chatId: 'oc_chat',
  chatType: 'direct',
  body: '分析这家公司',
};

function createDependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    debugLog: () => {},
    recordSessionMeta: params => ({
      sessionKey: params.sessionKey,
      createdAt: 1,
      updatedAt: 1,
      lastChannel: params.channel,
      lastTo: params.to,
      lastAccountId: params.accountId,
      lastAgentId: params.agentId,
    }),
    resolveAccount: (_config, accountId) => ({
      accountId,
      enabled: true,
      appId: 'cli_test',
      appSecret: 'secret_test',
    }),
    claimSessionForRun: () => true,
    enqueueForSession: () => {},
    runAgentForMessage: async () => '最终回答',
    createProcessingCard: async () => 'om_processing',
    updateProcessingCard: async () => {},
    updateProcessingCardToEmpty: async () => {},
    updateProcessingCardToError: async () => {},
    sendMessage: async () => {},
    ...overrides,
  };
}

describe('Feishu processing card lifecycle', () => {
  test('does not create another card while the session is busy', async () => {
    let enqueued = 0;
    let created = 0;
    let ran = 0;
    await handleFeishuInbound(cfg, inbound, createDependencies({
      claimSessionForRun: () => false,
      enqueueForSession: () => { enqueued += 1; },
      createProcessingCard: async () => { created += 1; return 'om_processing'; },
      runAgentForMessage: async () => { ran += 1; return 'answer'; },
    }));

    expect(enqueued).toBe(1);
    expect(created).toBe(0);
    expect(ran).toBe(0);
  });

  test('falls back to a standalone answer when card creation fails', async () => {
    let sent = 0;
    await handleFeishuInbound(cfg, inbound, createDependencies({
      createProcessingCard: async () => { throw new Error('create failed'); },
      sendMessage: async params => {
        sent += 1;
        expect(params.body).toBe('最终回答');
      },
    }));

    expect(sent).toBe(1);
  });

  test('falls back to a standalone answer when final card update fails', async () => {
    let sent = 0;
    await handleFeishuInbound(cfg, inbound, createDependencies({
      updateProcessingCard: async () => { throw new Error('update failed'); },
      sendMessage: async () => { sent += 1; },
    }));

    expect(sent).toBe(1);
  });

  test('passes the chat id when updating a processing card so continuations can be sent', async () => {
    let updateChatId = '';
    await handleFeishuInbound(cfg, inbound, createDependencies({
      updateProcessingCard: async params => { updateChatId = params.chatId; },
    }));
    expect(updateChatId).toBe('oc_chat');
  });

  test('terminates the card for empty answers and agent failures', async () => {
    let emptyUpdates = 0;
    await handleFeishuInbound(cfg, inbound, createDependencies({
      runAgentForMessage: async () => '   ',
      updateProcessingCardToEmpty: async () => { emptyUpdates += 1; },
    }));
    expect(emptyUpdates).toBe(1);

    let errorUpdates = 0;
    await handleFeishuInbound(cfg, inbound, createDependencies({
      runAgentForMessage: async () => { throw new Error('agent failed'); },
      updateProcessingCardToError: async () => { errorUpdates += 1; },
    }));
    expect(errorUpdates).toBe(1);
  });
});
