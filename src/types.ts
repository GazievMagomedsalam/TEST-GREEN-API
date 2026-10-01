export type Credentials = { apiUrl: string; idInstance: string; apiTokenInstance: string };
export type MessageStatus = 'sending' | 'queued' | 'delivered' | 'read' | 'failed' | 'uncertain';

export type Message = {
  id: string;
  serverId?: string;
  chatId: string;
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
  status?: MessageStatus;
  error?: string;
  quote?: string;
};

export type Chat = {
  id: string;
  name: string;
  phone?: string;
  unread: number;
  createdAt: number;
};

export type ChatState = {
  chats: Chat[];
  messages: Record<string, Message[]>;
  activeId: string | null;
  // Статус иногда приходит раньше ответа sendMessage.
  pendingStatuses: Record<string, { status: MessageStatus; error?: string }>;
};

export type ConnectionStatus = {
  kind: 'connecting' | 'connected' | 'reconnecting' | 'paused' | 'waiting';
  message: string;
};

export type Notification = { receiptId: number; body: unknown };
