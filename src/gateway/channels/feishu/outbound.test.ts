import { describe, expect, test } from 'bun:test';
import { sendMessageFeishu, type FeishuMessageClient } from './outbound.js';

describe('sendMessageFeishu', () => {
  test('sends rich text post content to the target chat', async () => {
    const createCalls: unknown[] = [];
    const client: FeishuMessageClient = {
      im: {
        v1: {
          message: {
            create: async (payload: unknown) => {
              createCalls.push(payload);
              return {};
            },
          },
        },
      },
    };

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: '**结论**：短期关注业绩修复。',
    }, client);

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toEqual({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: 'oc_chat',
        msg_type: 'post',
        content: JSON.stringify({
          zh_cn: {
            content: [
              [
                { tag: 'text', text: '结论', style: ['bold'] },
                { tag: 'text', text: '：短期关注业绩修复。' },
              ],
            ],
          },
        }),
      },
    });
  });

  test('does not include credentials in serialized message content', async () => {
    const createCalls: Array<{ data: { content: string } }> = [];
    const client: FeishuMessageClient = {
      im: {
        v1: {
          message: {
            create: async (payload) => {
              createCalls.push(payload);
              return {};
            },
          },
        },
      },
    };

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: 'hello',
    }, client);

    expect(createCalls[0].data.content).not.toContain('cli_test');
    expect(createCalls[0].data.content).not.toContain('secret_test');
  });
});
