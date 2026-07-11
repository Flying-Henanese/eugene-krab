import { describe, expect, test } from 'bun:test';
import { sendMessageFeishu, type FeishuMessageClient } from './outbound.js';

function createMockClient(createCalls: unknown[]): FeishuMessageClient {
  return {
    im: {
      v1: {
        message: {
          create: async (payload: unknown) => {
            createCalls.push(payload);
            return {};
          },
          patch: async () => ({}),
        },
      },
    },
  };
}

describe('sendMessageFeishu', () => {
  test('sends rich text post content when the answer has no table', async () => {
    const createCalls: unknown[] = [];
    const client = createMockClient(createCalls);

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

  test('sends interactive card content when the answer has a markdown table', async () => {
    const createCalls: Array<{ data: { msg_type: string; content: string } }> = [];
    const client = createMockClient(createCalls) as FeishuMessageClient;

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: [
        '## 股价概览',
        '| 指标 | 数据 |',
        '|---|---|',
        '| 最新收盘 | 374.51 元 |',
      ].join('\n'),
    }, client);

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].data.msg_type).toBe('interactive');
    const card = JSON.parse(createCalls[0].data.content);
    expect(card.elements).toContainEqual({
      tag: 'column_set',
      flex_mode: 'none',
      background_style: 'grey',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: '**指标**' } }],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: '**数据**' } }],
        },
      ],
    });
  });

  test('falls back to post content if interactive card send fails', async () => {
    const createCalls: Array<{ data: { msg_type: string; content: string } }> = [];
    const client: FeishuMessageClient = {
      im: {
        v1: {
          message: {
            create: async (payload) => {
              createCalls.push(payload);
              if (createCalls.length === 1) {
                throw new Error('interactive card rejected');
              }
              return {};
            },
            patch: async () => ({}),
          },
        },
      },
    };

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: [
        '| 指标 | 数据 |',
        '|---|---|',
        '| 最新收盘 | 374.51 元 |',
      ].join('\n'),
    }, client);

    expect(createCalls).toHaveLength(2);
    expect(createCalls[0].data.msg_type).toBe('interactive');
    expect(createCalls[1].data.msg_type).toBe('post');
  });

  test('does not include credentials in serialized message content', async () => {
    const createCalls: Array<{ data: { content: string } }> = [];
    const client = createMockClient(createCalls) as FeishuMessageClient;

    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: 'hello',
    }, client);

    expect(createCalls[0].data.content).not.toContain('cli_test');
    expect(createCalls[0].data.content).not.toContain('secret_test');
  });

  test('sends long prose as multiple interactive cards', async () => {
    const createCalls: Array<{ data: { msg_type: string; content: string } }> = [];
    await sendMessageFeishu({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      body: '很长的回答。'.repeat(20_000),
    }, createMockClient(createCalls));

    expect(createCalls.length).toBeGreaterThan(1);
    expect(createCalls.every(call => call.data.msg_type === 'interactive')).toBe(true);
    expect(createCalls.every(call => new TextEncoder().encode(call.data.content).byteLength <= 28 * 1024)).toBe(true);
  });
});
