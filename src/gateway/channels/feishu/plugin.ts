import type { FeishuAccountConfig, GatewayConfig } from '../../config.js';
import { listFeishuAccountIds, resolveFeishuAccount } from '../../config.js';
import type { ChannelPlugin } from '../types.js';
import { monitorFeishuChannel, type FeishuInboundMessage } from './index.js';

export function createFeishuPlugin(params: {
  onMessage: (msg: FeishuInboundMessage) => Promise<void>;
}): ChannelPlugin<GatewayConfig, FeishuAccountConfig> {
  return {
    id: 'feishu',
    config: {
      listAccountIds: (cfg) => listFeishuAccountIds(cfg),
      resolveAccount: (cfg, accountId) => resolveFeishuAccount(cfg, accountId),
      isEnabled: (account, cfg) => account.enabled && cfg.channels.feishu.enabled,
      isConfigured: (account) => Boolean(account.appId && account.appSecret),
    },
    gateway: {
      startAccount: async (ctx) => {
        if (!ctx.account.appId || !ctx.account.appSecret) {
          throw new Error('Feishu credentials are missing. Set FEISHU_APP_ID and FEISHU_APP_SECRET.');
        }
        await monitorFeishuChannel({
          accountId: ctx.accountId,
          appId: ctx.account.appId,
          appSecret: ctx.account.appSecret,
          abortSignal: ctx.abortSignal,
          onMessage: params.onMessage,
          onStatus: (status) => {
            ctx.setStatus({
              connected: status.connected,
              lastError: status.lastError ?? null,
            });
          },
        });
      },
    },
    status: {
      defaultRuntime: {
        accountId: 'default',
        running: false,
        connected: false,
        lastError: null,
      },
    },
  };
}
