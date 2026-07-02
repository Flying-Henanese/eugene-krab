import { describe, expect, test } from 'bun:test';
import { createFeishuMessageDedupe, inspectFeishuTextEvent, parseFeishuTextEvent } from './runtime.js';

describe('parseFeishuTextEvent', () => {
  test('extracts p2p text messages', () => {
    const parsed = parseFeishuTextEvent(
      {
        sender: { sender_id: { open_id: 'ou_sender' }, sender_type: 'user' },
        message: {
          message_id: 'om_message',
          chat_id: 'oc_chat',
          chat_type: 'p2p',
          message_type: 'text',
          content: JSON.stringify({ text: 'hello dexter' }),
          create_time: '1760000000000',
        },
      },
      'default',
    );

    expect(parsed).toEqual({
      id: 'om_message',
      accountId: 'default',
      chatId: 'oc_chat',
      chatType: 'direct',
      senderOpenId: 'ou_sender',
      body: 'hello dexter',
      timestamp: 1760000000000,
    });
  });

  test('ignores group messages', () => {
    const parsed = parseFeishuTextEvent(
      {
        sender: { sender_id: { open_id: 'ou_sender' } },
        message: {
          chat_id: 'oc_group',
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({ text: 'hello' }),
        },
      },
      'default',
    );

    expect(parsed).toBeNull();
  });

  test('reports why unsupported messages are ignored', () => {
    const inspected = inspectFeishuTextEvent(
      {
        sender: { sender_id: { open_id: 'ou_sender' } },
        message: {
          chat_id: 'oc_group',
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({ text: 'hello' }),
        },
      },
      'default',
    );

    expect(inspected).toEqual({
      message: null,
      ignoredReason: 'unsupported chat_type group',
    });
  });

  test('ignores non-text messages', () => {
    const parsed = parseFeishuTextEvent(
      {
        sender: { sender_id: { open_id: 'ou_sender' } },
        message: {
          chat_id: 'oc_chat',
          chat_type: 'p2p',
          message_type: 'image',
          content: '{}',
        },
      },
      'default',
    );

    expect(parsed).toBeNull();
  });

  test('dedupes repeated message ids', () => {
    const dedupe = createFeishuMessageDedupe({ ttlMs: 60_000, now: () => 1_000 });

    expect(dedupe.seen('om_message')).toBe(false);
    expect(dedupe.seen('om_message')).toBe(true);
    expect(dedupe.seen('om_other')).toBe(false);
  });

  test('allows same message id after ttl expires', () => {
    let now = 1_000;
    const dedupe = createFeishuMessageDedupe({ ttlMs: 60_000, now: () => now });

    expect(dedupe.seen('om_message')).toBe(false);
    now = 62_000;
    expect(dedupe.seen('om_message')).toBe(false);
  });
});
