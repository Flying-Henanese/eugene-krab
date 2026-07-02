export type FeishuInboundMessage = {
  id?: string;
  accountId: string;
  chatId: string;
  chatType: 'direct';
  senderOpenId?: string;
  body: string;
  timestamp?: number;
};

export type FeishuMessageEvent = {
  sender?: {
    sender_id?: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type?: string;
  };
  message?: {
    message_id?: string;
    chat_id?: string;
    chat_type?: string;
    message_type?: string;
    content?: string;
    create_time?: string;
  };
};
