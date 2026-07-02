import * as Lark from '@larksuiteoapi/node-sdk';

export async function sendMessageFeishu(params: {
  appId: string;
  appSecret: string;
  chatId: string;
  body: string;
}): Promise<void> {
  const client = new Lark.Client({
    appId: params.appId,
    appSecret: params.appSecret,
  });

  await client.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: params.chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: params.body }),
    },
  });
}
