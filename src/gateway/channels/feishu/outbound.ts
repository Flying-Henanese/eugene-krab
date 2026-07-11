import * as Lark from '@larksuiteoapi/node-sdk';
import { formatFeishuAnswerCards, formatFeishuTableCards } from './card-format.js';
import { formatFeishuPostContent } from './post-format.js';

export type SendMessageFeishuParams = {
  appId: string;
  appSecret: string;
  chatId: string;
  body: string;
};

type FeishuMessagePayload =
  | {
      params: { receive_id_type: 'chat_id' };
      data: { receive_id: string; msg_type: 'post'; content: string };
    }
  | {
      params: { receive_id_type: 'chat_id' };
      data: { receive_id: string; msg_type: 'interactive'; content: string };
    };

type FeishuMessagePatchPayload = {
  path: { message_id: string };
  data: { content: string };
};

export type FeishuMessageResponse = {
  code?: number;
  data?: { message_id?: string };
};

export type FeishuMessageClient = {
  im: {
    v1: {
      message: {
        create(payload: FeishuMessagePayload): Promise<FeishuMessageResponse>;
        patch(payload: FeishuMessagePatchPayload): Promise<FeishuMessageResponse>;
      };
    };
  };
};

export function createFeishuClient(params: Pick<SendMessageFeishuParams, 'appId' | 'appSecret'>): FeishuMessageClient {
  return new Lark.Client({
    appId: params.appId,
    appSecret: params.appSecret,
  }) as FeishuMessageClient;
}

export async function sendMessageFeishu(
  params: SendMessageFeishuParams,
  client: FeishuMessageClient = createFeishuClient(params),
): Promise<void> {
  const tableCards = formatFeishuTableCards(params.body);
  const answerCards = tableCards ?? formatFeishuAnswerCards(params.body);
  if (tableCards || answerCards.length > 1) {
    let sentCards = 0;
    try {
      for (const card of answerCards) {
        await client.im.v1.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: params.chatId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
          },
        });
        sentCards += 1;
      }
      return;
    } catch (error) {
      if (sentCards > 0) throw error;
      // Fall through to the post path so the user still receives the answer.
    }
  }

  await client.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: params.chatId,
      msg_type: 'post',
      content: JSON.stringify(formatFeishuPostContent(params.body)),
    },
  });
}
