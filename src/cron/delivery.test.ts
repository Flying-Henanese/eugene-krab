import { describe, expect, test } from 'bun:test';
import type { GatewayConfig } from '../gateway/config.js';
import { createCronResultDelivery } from './delivery.js';

const cfg: GatewayConfig = {
  gateway: { accountId: 'default', logLevel: 'silent' },
  channels: {
    whatsapp: { enabled: true, accounts: {}, allowFrom: [] },
    feishu: {
      enabled: true,
      accounts: {},
      processingCard: { enabled: false, text: 'processing' },
    },
  },
  bindings: [],
};

describe('CronResultDelivery', () => {
  test('sends Feishu results to the explicit persisted chat target', async () => {
    const calls: Array<{ chatId: string; body: string }> = [];
    const delivery = createCronResultDelivery({
      loadConfig: () => cfg,
      resolveFeishuAccount: () => ({ accountId: 'acct', enabled: true, appId: 'app', appSecret: 'secret' }),
      sendFeishu: async ({ chatId, body }) => { calls.push({ chatId, body }); },
    });

    await delivery.deliver({ channel: 'feishu', accountId: 'acct', chatId: 'oc_original' }, 'result');

    expect(calls).toEqual([{ chatId: 'oc_original', body: 'result' }]);
  });

  test('fails closed when the Feishu account has no credentials', async () => {
    const delivery = createCronResultDelivery({
      loadConfig: () => cfg,
      resolveFeishuAccount: () => ({ accountId: 'acct', enabled: true }),
      sendFeishu: async () => {},
    });

    await expect(
      delivery.deliver({ channel: 'feishu', accountId: 'acct', chatId: 'oc_original' }, 'result'),
    ).rejects.toThrow('Feishu credentials are missing');
  });

  test('retains WhatsApp allowlist checks for explicit WhatsApp targets', async () => {
    const calls: string[] = [];
    const delivery = createCronResultDelivery({
      assertWhatsAppAllowed: ({ to }) => {
        calls.push(`allowed:${to}`);
        return { toJid: to, recipientE164: to };
      },
      sendWhatsApp: async ({ to, body }) => {
        calls.push(`${to}:${body}`);
        return { messageId: 'msg', toJid: to };
      },
    });

    await delivery.deliver({ channel: 'whatsapp', accountId: 'acct', to: '+15550001111' }, 'result');

    expect(calls).toEqual(['allowed:+15550001111', '+15550001111:result']);
  });
});
