import * as Lark from '@larksuiteoapi/node-sdk';
import type { FeishuInboundMessage, FeishuMessageEvent } from './types.js';

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseFeishuTextEvent(
  event: FeishuMessageEvent,
  accountId: string,
): FeishuInboundMessage | null {
  return inspectFeishuTextEvent(event, accountId).message;
}

export function inspectFeishuTextEvent(
  event: FeishuMessageEvent,
  accountId: string,
): { message: FeishuInboundMessage | null; ignoredReason?: string } {
  const message = event.message;
  if (!message) return { message: null, ignoredReason: 'missing message payload' };
  if (message.chat_type !== 'p2p') {
    return { message: null, ignoredReason: `unsupported chat_type ${message.chat_type ?? 'unknown'}` };
  }
  if (message.message_type !== 'text') {
    return { message: null, ignoredReason: `unsupported message_type ${message.message_type ?? 'unknown'}` };
  }
  if (!message.chat_id) return { message: null, ignoredReason: 'missing chat_id' };
  if (!message.content) return { message: null, ignoredReason: 'missing content' };

  let content: unknown;
  try {
    content = JSON.parse(message.content);
  } catch {
    return { message: null, ignoredReason: 'invalid text content json' };
  }

  const text = typeof content === 'object' && content !== null && 'text' in content
    ? (content as { text?: unknown }).text
    : undefined;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { message: null, ignoredReason: 'missing text content' };
  }

  return {
    message: {
      id: message.message_id,
      accountId,
      chatId: message.chat_id,
      chatType: 'direct',
      senderOpenId: event.sender?.sender_id?.open_id,
      body: text,
      timestamp: parseTimestamp(message.create_time),
    },
  };
}

function unwrapFeishuEvent(data: FeishuMessageEvent | { event?: FeishuMessageEvent }): FeishuMessageEvent {
  return 'event' in data && data.event ? data.event : (data as FeishuMessageEvent);
}

export function createFeishuMessageDedupe(params: {
  ttlMs: number;
  now?: () => number;
}): { seen: (messageId: string | undefined) => boolean } {
  const seenAt = new Map<string, number>();
  const now = params.now ?? (() => Date.now());

  return {
    seen: (messageId) => {
      if (!messageId) return false;
      const current = now();
      for (const [id, timestamp] of seenAt) {
        if (current - timestamp >= params.ttlMs) {
          seenAt.delete(id);
        }
      }
      if (seenAt.has(messageId)) {
        return true;
      }
      seenAt.set(messageId, current);
      return false;
    },
  };
}

export async function monitorFeishuChannel(params: {
  accountId: string;
  appId: string;
  appSecret: string;
  abortSignal: AbortSignal;
  onMessage: (msg: FeishuInboundMessage) => Promise<void>;
  onStatus?: (status: { connected: boolean; lastError?: string | null }) => void;
}): Promise<void> {
  const dedupe = createFeishuMessageDedupe({ ttlMs: 10 * 60 * 1000 });
  const wsClient = new Lark.WSClient({
    appId: params.appId,
    appSecret: params.appSecret,
  });
  const dispatcher = new Lark.EventDispatcher({}).register({
    'im.message.message_read_v1': async () => {},
    'im.message.receive_v1': async (data: FeishuMessageEvent | { event?: FeishuMessageEvent }) => {
      const event = unwrapFeishuEvent(data);
      const chatType = event.message?.chat_type ?? 'unknown';
      const messageType = event.message?.message_type ?? 'unknown';
      console.log(`[feishu] received im.message.receive_v1 chat_type=${chatType} message_type=${messageType}`);
      const inspected = inspectFeishuTextEvent(event, params.accountId);
      if (!inspected.message) {
        console.log(`[feishu] ignored message: ${inspected.ignoredReason ?? 'unknown reason'}`);
        return;
      }
      if (dedupe.seen(inspected.message.id)) {
        console.log(`[feishu] ignored duplicate message_id=${inspected.message.id ?? 'unknown'}`);
        return;
      }
      await params.onMessage(inspected.message);
    },
  });

  params.onStatus?.({ connected: true, lastError: null });
  await wsClient.start({ eventDispatcher: dispatcher });

  await new Promise<void>((resolve) => {
    if (params.abortSignal.aborted) {
      resolve();
      return;
    }
    params.abortSignal.addEventListener('abort', () => resolve(), { once: true });
  });

  wsClient.close();
  params.onStatus?.({ connected: false, lastError: null });
}
