import * as Lark from '@larksuiteoapi/node-sdk';
import { formatFeishuPostContent } from './post-format.js';

export type SendMessageFeishuParams = {
  appId: string;
  appSecret: string;
  chatId: string;
  body: string;
};

export type FeishuMessageClient = {
  im: {
    v1: {
      message: {
        create(payload: {
          params: { receive_id_type: 'chat_id' };
          data: { receive_id: string; msg_type: 'post'; content: string };
        }): Promise<unknown>;
      };
    };
  };
};

function createFeishuClient(params: SendMessageFeishuParams): FeishuMessageClient {
  return new Lark.Client({
    appId: params.appId,
    appSecret: params.appSecret,
  }) as FeishuMessageClient;
}

export async function sendMessageFeishu(
  params: SendMessageFeishuParams,
  client: FeishuMessageClient = createFeishuClient(params),
): Promise<void> {
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
