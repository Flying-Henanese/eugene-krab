import { describe, expect, test } from 'bun:test';
import {
  createFeishuProcessingCard,
  formatFeishuErrorCard,
  formatFeishuFinalCard,
  formatFeishuProcessingCard,
  updateFeishuProcessingCard,
  type FeishuProcessingCardClient,
} from './processing-card.js';

function createMockClient(params: {
  createResponse?: { code?: number; data?: { message_id?: string } };
  patchResponse?: { code?: number };
  createCalls?: unknown[];
  patchCalls?: unknown[];
} = {}): FeishuProcessingCardClient {
  return {
    im: {
      v1: {
        message: {
          create: async payload => {
            params.createCalls?.push(payload);
            return params.createResponse ?? { code: 0, data: { message_id: 'om_processing' } };
          },
          patch: async payload => {
            params.patchCalls?.push(payload);
            return params.patchResponse ?? { code: 0 };
          },
        },
      },
    },
  };
}

describe('Feishu processing cards', () => {
  test('formats default, custom, final, and error cards as updateable cards', () => {
    expect(formatFeishuProcessingCard('正在分析中，请稍候…').elements[0]).toEqual({
      tag: 'div',
      text: { tag: 'lark_md', content: '⏳ 正在分析中，请稍候…' },
    });
    expect(formatFeishuProcessingCard('正在整理财报…').elements[0]).toEqual({
      tag: 'div',
      text: { tag: 'lark_md', content: '⏳ 正在整理财报…' },
    });
    expect(formatFeishuFinalCard('**结论**：保持关注。').config.update_multi).toBe(true);
    expect(formatFeishuErrorCard('⚠️ 分析失败，请稍后重试。').config.update_multi).toBe(true);
  });

  test('creates an interactive card and returns its message id without serializing credentials', async () => {
    const createCalls: Array<{ data: { msg_type: string; content: string } }> = [];
    const client = createMockClient({ createCalls });

    const messageId = await createFeishuProcessingCard({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      text: '正在分析中，请稍候…',
    }, client);

    expect(messageId).toBe('om_processing');
    expect(createCalls[0].data.msg_type).toBe('interactive');
    expect(createCalls[0].data.content).not.toContain('cli_test');
    expect(createCalls[0].data.content).not.toContain('secret_test');
  });

  test('rejects non-zero API codes and missing message ids', async () => {
    await expect(createFeishuProcessingCard({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      text: '处理中',
    }, createMockClient({ createResponse: { code: 999 } }))).rejects.toThrow('code 999');

    await expect(createFeishuProcessingCard({
      appId: 'cli_test',
      appSecret: 'secret_test',
      chatId: 'oc_chat',
      text: '处理中',
    }, createMockClient({ createResponse: { code: 0, data: {} } }))).rejects.toThrow('message_id');
  });

  test('patches the original message with an updateable final card', async () => {
    const patchCalls: Array<{ path: { message_id: string }; data: { content: string } }> = [];
    await updateFeishuProcessingCard({
      appId: 'cli_test',
      appSecret: 'secret_test',
      messageId: 'om_processing',
      body: '| 指标 | 数值 |\n|---|---|\n| PE | 22.5 |',
    }, createMockClient({ patchCalls }));

    expect(patchCalls[0].path.message_id).toBe('om_processing');
    const card = JSON.parse(patchCalls[0].data.content);
    expect(card.config).toEqual({ wide_screen_mode: true, update_multi: true });
    expect(card.elements.some((element: { tag: string }) => element.tag === 'column_set')).toBe(true);
  });

  test('rejects non-zero update API codes', async () => {
    await expect(updateFeishuProcessingCard({
      appId: 'cli_test',
      appSecret: 'secret_test',
      messageId: 'om_processing',
      body: 'answer',
    }, createMockClient({ patchResponse: { code: 321 } }))).rejects.toThrow('code 321');
  });
});
