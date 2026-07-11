import {
  createFeishuClient,
  type FeishuMessageClient,
  type FeishuMessageResponse,
} from './outbound.js';
import {
  formatFeishuAnswerCard,
  formatFeishuAnswerCards,
  formatFeishuTextCard,
  type FeishuInteractiveCard,
} from './card-format.js';
import { DEFAULT_FEISHU_PROCESSING_TEXT } from '../../config.js';

export const FEISHU_PROCESSING_ERROR_TEXT = '⚠️ 分析失败，请稍后重试。';
export const FEISHU_PROCESSING_EMPTY_TEXT = '暂时没有生成有效回复，请重新发送问题。';

export type FeishuProcessingCardClient = FeishuMessageClient;

type FeishuCredentials = {
  appId: string;
  appSecret: string;
};

export type CreateFeishuProcessingCardParams = FeishuCredentials & {
  chatId: string;
  text: string;
};

export type UpdateFeishuProcessingCardParams = FeishuCredentials & {
  messageId: string;
  chatId: string;
  body: string;
};

type PatchFeishuProcessingCardParams = FeishuCredentials & {
  messageId: string;
};

export function formatFeishuProcessingCard(text: string): FeishuInteractiveCard {
  return formatFeishuTextCard(`⏳ ${text.trim() || DEFAULT_FEISHU_PROCESSING_TEXT}`);
}

export function formatFeishuFinalCard(body: string): FeishuInteractiveCard {
  return formatFeishuAnswerCard(body);
}

export function formatFeishuErrorCard(text: string): FeishuInteractiveCard {
  return formatFeishuTextCard(text);
}

export async function createFeishuProcessingCard(
  params: CreateFeishuProcessingCardParams,
  client: FeishuProcessingCardClient = createProcessingClient(params),
): Promise<string> {
  const response = await client.im.v1.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: params.chatId,
      msg_type: 'interactive',
      content: JSON.stringify(formatFeishuProcessingCard(params.text)),
    },
  });
  assertSuccessfulResponse(response, 'create');

  const messageId = response.data?.message_id?.trim();
  if (!messageId) {
    throw new Error('Feishu processing card create response did not include a message_id.');
  }
  return messageId;
}

export async function updateFeishuProcessingCard(
  params: UpdateFeishuProcessingCardParams,
  client: FeishuProcessingCardClient = createProcessingClient(params),
): Promise<void> {
  const cards = formatFeishuAnswerCards(params.body);
  await patchCard(params, cards[0], client);
  for (const card of cards.slice(1)) {
    const response = await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: params.chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });
    assertSuccessfulResponse(response, 'create');
  }
}

export async function updateFeishuProcessingCardToError(
  params: PatchFeishuProcessingCardParams,
  client: FeishuProcessingCardClient = createProcessingClient(params),
): Promise<void> {
  await patchCard(params, formatFeishuErrorCard(FEISHU_PROCESSING_ERROR_TEXT), client);
}

export async function updateFeishuProcessingCardToEmpty(
  params: PatchFeishuProcessingCardParams,
  client: FeishuProcessingCardClient = createProcessingClient(params),
): Promise<void> {
  await patchCard(params, formatFeishuErrorCard(FEISHU_PROCESSING_EMPTY_TEXT), client);
}

async function patchCard(
  params: PatchFeishuProcessingCardParams,
  card: FeishuInteractiveCard,
  client: FeishuProcessingCardClient,
): Promise<void> {
  const response = await client.im.v1.message.patch({
    path: { message_id: params.messageId },
    data: { content: JSON.stringify(card) },
  });
  assertSuccessfulResponse(response, 'update');
}

function assertSuccessfulResponse(response: FeishuMessageResponse, operation: 'create' | 'update'): void {
  if (typeof response.code === 'number' && response.code !== 0) {
    throw new Error(`Feishu processing card ${operation} failed with code ${response.code}.`);
  }
}

function createProcessingClient(params: FeishuCredentials): FeishuProcessingCardClient {
  return createFeishuClient(params);
}
