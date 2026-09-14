import {
  loadGatewayConfig,
  resolveFeishuAccount,
  type FeishuAccountConfig,
  type GatewayConfig,
} from '../gateway/config.js';
import {
  assertOutboundAllowed,
  sendMessageWhatsApp,
} from '../gateway/channels/whatsapp/index.js';
import { sendMessageFeishu, type SendMessageFeishuParams } from '../gateway/channels/feishu/index.js';
import type { CronDeliveryTarget } from './types.js';

export type CronResultDelivery = {
  deliver: (target: CronDeliveryTarget, body: string) => Promise<void>;
};

export type CronResultDeliveryOptions = {
  configPath?: string;
  loadConfig?: (configPath?: string) => GatewayConfig;
  resolveFeishuAccount?: (cfg: GatewayConfig, accountId: string) => FeishuAccountConfig;
  sendFeishu?: (params: SendMessageFeishuParams) => Promise<void>;
  assertWhatsAppAllowed?: typeof assertOutboundAllowed;
  sendWhatsApp?: typeof sendMessageWhatsApp;
};

export function createCronResultDelivery(options: CronResultDeliveryOptions = {}): CronResultDelivery {
  const loadConfig = options.loadConfig ?? loadGatewayConfig;
  const resolveAccount = options.resolveFeishuAccount ?? resolveFeishuAccount;
  const sendFeishu = options.sendFeishu ?? sendMessageFeishu;
  const assertWhatsAppAllowed = options.assertWhatsAppAllowed ?? assertOutboundAllowed;
  const sendWhatsApp = options.sendWhatsApp ?? sendMessageWhatsApp;

  return {
    async deliver(target, body) {
      if (!body.trim()) {
        throw new Error('Cannot deliver an empty cron result');
      }

      if (target.channel === 'feishu') {
        const cfg = loadConfig(options.configPath);
        const account = resolveAccount(cfg, target.accountId);
        if (!account.enabled) {
          throw new Error(`Feishu account ${target.accountId} is disabled`);
        }
        if (!account.appId || !account.appSecret) {
          throw new Error('Feishu credentials are missing. Set FEISHU_APP_ID and FEISHU_APP_SECRET.');
        }
        await sendFeishu({
          appId: account.appId,
          appSecret: account.appSecret,
          chatId: target.chatId,
          body,
        });
        return;
      }

      assertWhatsAppAllowed({ to: target.to, accountId: target.accountId, configPath: options.configPath });
      await sendWhatsApp({ to: target.to, body, accountId: target.accountId, configPath: options.configPath });
    },
  };
}
