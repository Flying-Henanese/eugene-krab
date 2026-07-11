import { createChannelManager } from './channels/manager.js';
import { createFeishuPlugin } from './channels/feishu/plugin.js';
import {
  createFeishuProcessingCard,
  sendMessageFeishu,
  updateFeishuProcessingCard,
  updateFeishuProcessingCardToEmpty,
  updateFeishuProcessingCardToError,
  type FeishuInboundMessage,
} from './channels/feishu/index.js';
import { createWhatsAppPlugin } from './channels/whatsapp/plugin.js';
import {
  assertOutboundAllowed,
  sendComposing,
  sendMessageWhatsApp,
  type WhatsAppInboundMessage,
} from './channels/whatsapp/index.js';
import { resolveRoute } from './routing/resolve-route.js';
import { resolveSessionStorePath, upsertSessionMeta } from './sessions/store.js';
import {
  loadGatewayConfig,
  resolveFeishuAccount,
  resolveGatewayAgentModel,
  type GatewayConfig,
} from './config.js';
import {
  claimSessionForRun,
  runAgentForMessage,
  isSessionRunning,
  enqueueForSession,
} from './agent-runner.js';
import { cleanMarkdownForWhatsApp } from './utils.js';
import { startCronRunner } from '../cron/runner.js';
import { ensureHeartbeatCronJob } from '../cron/heartbeat-migration.js';
import {
  isBotMentioned,
  recordGroupMessage,
  getAndClearGroupHistory,
  formatGroupHistoryContext,
  noteGroupMember,
  formatGroupMembersList,
} from './group/index.js';
import type { GroupContext } from '../agent/prompts.js';
import { appendFileSync } from 'node:fs';
import { dexterPath } from '../utils/paths.js';

const LOG_PATH = dexterPath('gateway-debug.log');
function debugLog(msg: string) {
  appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
}

export type GatewayService = {
  stop: () => Promise<void>;
  snapshot: () => Record<string, Record<string, { accountId: string; running: boolean; connected?: boolean }>>;
};

function elide(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

async function handleInbound(cfg: GatewayConfig, inbound: WhatsAppInboundMessage): Promise<void> {
  const bodyPreview = elide(inbound.body.replace(/\n/g, ' '), 50);
  const isGroup = inbound.chatType === 'group';
  console.log(`Inbound message ${inbound.from} (${inbound.chatType}, ${inbound.body.length} chars): "${bodyPreview}"`);
  debugLog(`[gateway] handleInbound from=${inbound.from} isGroup=${isGroup} body="${inbound.body.slice(0, 30)}..."`);

  // --- Group-specific: track member, check mention gating ---
  if (isGroup) {
    noteGroupMember(inbound.chatId, inbound.senderId, inbound.senderName);

    const mentioned = isBotMentioned({
      mentionedJids: inbound.mentionedJids,
      selfJid: inbound.selfJid,
      selfLid: inbound.selfLid,
      selfE164: inbound.selfE164,
      body: inbound.body,
    });
    debugLog(`[gateway] group mention check: mentioned=${mentioned}`);

    if (!mentioned) {
      // Buffer the message for future context but don't reply
      recordGroupMessage(inbound.chatId, {
        senderName: inbound.senderName ?? inbound.senderId,
        senderId: inbound.senderId,
        body: inbound.body,
        timestamp: inbound.timestamp ?? Date.now(),
      });
      debugLog(`[gateway] group message buffered (no mention), skipping reply`);
      return;
    }
  }

  // --- Routing: use chatId for groups (group JID), senderId for DMs ---
  const peerId = isGroup ? inbound.chatId : inbound.senderId;
  const route = resolveRoute({
    cfg,
    channel: 'whatsapp',
    accountId: inbound.accountId,
    peer: { kind: inbound.chatType, id: peerId },
  });

  const storePath = resolveSessionStorePath(route.agentId);
  upsertSessionMeta({
    storePath,
    sessionKey: route.sessionKey,
    channel: 'whatsapp',
    to: inbound.from,
    accountId: route.accountId,
    agentId: route.agentId,
  });

  // Start typing indicator loop to keep it alive during long agent runs
  const TYPING_INTERVAL_MS = 5000; // Refresh every 5 seconds
  let typingTimer: ReturnType<typeof setInterval> | undefined;

  const startTypingLoop = async () => {
    // For groups, use inbound.sendComposing directly (bypasses outbound strict checks)
    if (isGroup) {
      await inbound.sendComposing();
      typingTimer = setInterval(() => { void inbound.sendComposing(); }, TYPING_INTERVAL_MS);
    } else {
      await sendComposing({ to: inbound.replyToJid, accountId: inbound.accountId });
      typingTimer = setInterval(() => {
        void sendComposing({ to: inbound.replyToJid, accountId: inbound.accountId });
      }, TYPING_INTERVAL_MS);
    }
  };

  const stopTypingLoop = () => {
    if (typingTimer) {
      clearInterval(typingTimer);
      typingTimer = undefined;
    }
  };

  try {
    // Defense-in-depth: verify outbound destination is allowed before any messaging
    // For groups, use chatId (the group JID); for DMs, use replyToJid
    const outboundTarget = isGroup ? inbound.chatId : inbound.replyToJid;
    try {
      assertOutboundAllowed({ to: outboundTarget, accountId: inbound.accountId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLog(`[gateway] outbound BLOCKED: ${msg}`);
      console.log(msg);
      return;
    }

    await startTypingLoop();

    // --- Build query: for groups, include buffered history context ---
    let query = inbound.body;
    let groupContext: GroupContext | undefined;

    if (isGroup) {
      const history = getAndClearGroupHistory(inbound.chatId);
      query = formatGroupHistoryContext({
        history,
        currentSenderName: inbound.senderName ?? inbound.senderId,
        currentSenderId: inbound.senderId,
        currentBody: inbound.body,
      });
      debugLog(`[gateway] group query with ${history.length} history entries`);

      const membersList = formatGroupMembersList({
        groupId: inbound.chatId,
        participants: inbound.groupParticipants,
      });
      groupContext = {
        groupName: inbound.groupSubject,
        membersList: membersList || undefined,
        activationMode: 'mention',
      };
    }

    console.log(`Processing message with agent...`);
    const { model, modelProvider } = resolveGatewayAgentModel(cfg);

    // If agent is already running for this session, enqueue for mid-run injection
    if (isSessionRunning(route.sessionKey)) {
      debugLog(`[gateway] agent busy for session=${route.sessionKey}, enqueueing`);
      enqueueForSession(route.sessionKey, model, query);
      return;
    }

    debugLog(`[gateway] running agent for session=${route.sessionKey}`);
    const startedAt = Date.now();
    const answer = await runAgentForMessage({
      sessionKey: route.sessionKey,
      query,
      model,
      modelProvider,
      channel: 'whatsapp',
      groupContext,
    });
    const durationMs = Date.now() - startedAt;
    debugLog(`[gateway] agent answer length=${answer.length}`);

    // Stop typing loop before sending reply
    stopTypingLoop();

    if (answer.trim()) {
      const cleanedAnswer = cleanMarkdownForWhatsApp(answer).trim();

      if (isGroup) {
        // For groups, use inbound.reply() directly (bypasses outbound strict E.164 checks)
        debugLog(`[gateway] sending group reply to ${inbound.chatId}`);
        await inbound.reply(cleanedAnswer);
      } else {
        debugLog(`[gateway] sending reply to ${inbound.replyToJid}`);
        await sendMessageWhatsApp({
          to: inbound.replyToJid,
          body: cleanedAnswer,
          accountId: inbound.accountId,
        });
      }
      console.log(`Sent reply (${answer.length} chars, ${durationMs}ms)`);
      debugLog(`[gateway] reply sent`);
    } else {
      console.log(`Agent returned empty response (${durationMs}ms)`);
      debugLog(`[gateway] empty answer, not sending`);
    }
  } catch (err) {
    stopTypingLoop();
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Error: ${msg}`);
    debugLog(`[gateway] ERROR: ${msg}`);
  }
}

type FeishuInboundDependencies = {
  debugLog: (message: string) => void;
  recordSessionMeta: typeof upsertSessionMeta;
  resolveAccount: typeof resolveFeishuAccount;
  claimSessionForRun: typeof claimSessionForRun;
  enqueueForSession: typeof enqueueForSession;
  runAgentForMessage: typeof runAgentForMessage;
  createProcessingCard: typeof createFeishuProcessingCard;
  updateProcessingCard: typeof updateFeishuProcessingCard;
  updateProcessingCardToEmpty: typeof updateFeishuProcessingCardToEmpty;
  updateProcessingCardToError: typeof updateFeishuProcessingCardToError;
  sendMessage: typeof sendMessageFeishu;
};

const defaultFeishuInboundDependencies: FeishuInboundDependencies = {
  debugLog,
  recordSessionMeta: upsertSessionMeta,
  resolveAccount: resolveFeishuAccount,
  claimSessionForRun,
  enqueueForSession,
  runAgentForMessage,
  createProcessingCard: createFeishuProcessingCard,
  updateProcessingCard: updateFeishuProcessingCard,
  updateProcessingCardToEmpty: updateFeishuProcessingCardToEmpty,
  updateProcessingCardToError: updateFeishuProcessingCardToError,
  sendMessage: sendMessageFeishu,
};

export async function handleFeishuInbound(
  cfg: GatewayConfig,
  inbound: FeishuInboundMessage,
  dependencies: FeishuInboundDependencies = defaultFeishuInboundDependencies,
): Promise<void> {
  const bodyPreview = elide(inbound.body.replace(/\n/g, ' '), 50);
  console.log(`Inbound Feishu message ${inbound.chatId} (${inbound.body.length} chars): "${bodyPreview}"`);
  dependencies.debugLog(`[gateway] handleFeishuInbound chatId=${inbound.chatId} body="${inbound.body.slice(0, 30)}..."`);

  const route = resolveRoute({
    cfg,
    channel: 'feishu',
    accountId: inbound.accountId,
    peer: { kind: 'direct', id: inbound.chatId },
  });

  const storePath = resolveSessionStorePath(route.agentId);
  dependencies.recordSessionMeta({
    storePath,
    sessionKey: route.sessionKey,
    channel: 'feishu',
    to: inbound.chatId,
    accountId: route.accountId,
    agentId: route.agentId,
  });

  const account = dependencies.resolveAccount(cfg, route.accountId);
  let processingMessageId: string | null = null;

  try {
    const { model, modelProvider } = resolveGatewayAgentModel(cfg);

    if (!dependencies.claimSessionForRun(route.sessionKey, model)) {
      dependencies.debugLog(`[gateway] agent busy for feishu session=${route.sessionKey}, enqueueing`);
      dependencies.enqueueForSession(route.sessionKey, model, inbound.body);
      return;
    }

    if (
      cfg.channels.feishu.processingCard.enabled &&
      account.appId &&
      account.appSecret
    ) {
      try {
        processingMessageId = await dependencies.createProcessingCard({
          appId: account.appId,
          appSecret: account.appSecret,
          chatId: inbound.chatId,
          text: cfg.channels.feishu.processingCard.text,
        });
        dependencies.debugLog(`[gateway] feishu processing card created`);
      } catch {
        dependencies.debugLog(`[gateway] feishu processing card create failed; continuing without it`);
      }
    }

    dependencies.debugLog(`[gateway] running feishu agent for session=${route.sessionKey}`);
    const startedAt = Date.now();
    const answer = await dependencies.runAgentForMessage({
      sessionKey: route.sessionKey,
      query: inbound.body,
      model,
      modelProvider,
      channel: 'feishu',
    });
    const durationMs = Date.now() - startedAt;

    if (answer.trim()) {
      if (!account.appId || !account.appSecret) {
        throw new Error('Feishu credentials are missing. Set FEISHU_APP_ID and FEISHU_APP_SECRET.');
      }

      if (processingMessageId) {
        try {
          await dependencies.updateProcessingCard({
            appId: account.appId,
            appSecret: account.appSecret,
            messageId: processingMessageId,
            chatId: inbound.chatId,
            body: answer.trim(),
          });
          console.log(`Updated Feishu reply card (${answer.length} chars, ${durationMs}ms)`);
          dependencies.debugLog(`[gateway] feishu processing card updated with reply`);
          return;
        } catch {
          dependencies.debugLog(`[gateway] feishu processing card update failed; sending standalone reply`);
        }
      }

      await dependencies.sendMessage({
        appId: account.appId,
        appSecret: account.appSecret,
        chatId: inbound.chatId,
        body: answer.trim(),
      });
      console.log(`Sent Feishu reply (${answer.length} chars, ${durationMs}ms)`);
      dependencies.debugLog(`[gateway] feishu reply sent`);
    } else {
      console.log(`Agent returned empty Feishu response (${durationMs}ms)`);
      if (processingMessageId && account.appId && account.appSecret) {
        try {
          await dependencies.updateProcessingCardToEmpty({
            appId: account.appId,
            appSecret: account.appSecret,
            messageId: processingMessageId,
          });
          dependencies.debugLog(`[gateway] empty feishu answer updated on processing card`);
        } catch {
          dependencies.debugLog(`[gateway] failed to terminate empty feishu processing card`);
        }
      } else {
        dependencies.debugLog(`[gateway] empty feishu answer, not sending`);
      }
    }
  } catch (err) {
    if (processingMessageId && account.appId && account.appSecret) {
      try {
        await dependencies.updateProcessingCardToError({
          appId: account.appId,
          appSecret: account.appSecret,
          messageId: processingMessageId,
        });
        dependencies.debugLog(`[gateway] failed feishu run terminated processing card`);
      } catch {
        dependencies.debugLog(`[gateway] failed to terminate errored feishu processing card`);
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Error: ${msg}`);
    dependencies.debugLog(`[gateway] FEISHU ERROR: ${msg}`);
  }
}

export async function startGateway(params: { configPath?: string } = {}): Promise<GatewayService> {
  const cfg = loadGatewayConfig(params.configPath);
  const whatsappPlugin = createWhatsAppPlugin({
    loadConfig: () => loadGatewayConfig(params.configPath),
    onMessage: async (inbound) => {
      const current = loadGatewayConfig(params.configPath);
      await handleInbound(current, inbound);
    },
  });
  const whatsappManager = createChannelManager({
    plugin: whatsappPlugin,
    loadConfig: () => loadGatewayConfig(params.configPath),
  });
  const feishuPlugin = createFeishuPlugin({
    onMessage: async (inbound) => {
      const current = loadGatewayConfig(params.configPath);
      await handleFeishuInbound(current, inbound);
    },
  });
  const feishuManager = createChannelManager({
    plugin: feishuPlugin,
    loadConfig: () => loadGatewayConfig(params.configPath),
  });
  await whatsappManager.startAll();
  await feishuManager.startAll();

  ensureHeartbeatCronJob(params.configPath);
  const cron = startCronRunner({ configPath: params.configPath });

  return {
    stop: async () => {
      cron.stop();
      await whatsappManager.stopAll();
      await feishuManager.stopAll();
    },
    snapshot: () => ({
      whatsapp: whatsappManager.getSnapshot(),
      feishu: feishuManager.getSnapshot(),
    }),
  };
}
