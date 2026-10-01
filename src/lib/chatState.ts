import type { Chat, ChatState, Message, MessageStatus } from '../types';
import type { ChatEvent } from './notifications';
import { formatPhone } from './validation';

export const emptyChatState = (): ChatState => ({
  chats: [],
  messages: {},
  activeId: null,
  pendingStatuses: {},
});
export type ChatAction =
  | { type: 'open'; chat: Chat }
  | { type: 'select'; id: string | null }
  | { type: 'event'; event: ChatEvent }
  | { type: 'send'; message: Message }
  | { type: 'sent'; chatId: string; localId: string; serverId: string }
  | {
      type: 'send-error';
      chatId: string;
      localId: string;
      status: 'failed' | 'uncertain';
      error: string;
    };

const messageKey = (chatId: string, id: string) => JSON.stringify([chatId, id]);
function nextStatus(current: MessageStatus | undefined, next: MessageStatus): MessageStatus {
  if (current === 'read') return current;
  if (current === 'delivered' && next !== 'read') return current;
  if (current === 'failed' && (next === 'queued' || next === 'sending')) return current;
  return next;
}
const byTime = (a: Message, b: Message) => a.timestamp - b.timestamp;

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === 'select')
    return {
      ...state,
      activeId: action.id,
      chats: state.chats.map((chat) => (chat.id === action.id ? { ...chat, unread: 0 } : chat)),
    };
  if (action.type === 'open') {
    const exists = state.chats.some((chat) => chat.id === action.chat.id);
    return {
      ...state,
      activeId: action.chat.id,
      chats: exists
        ? state.chats.map((chat) =>
            chat.id === action.chat.id
              ? { ...chat, phone: action.chat.phone ?? chat.phone, unread: 0 }
              : chat,
          )
        : [...state.chats, action.chat],
    };
  }
  if (action.type === 'send')
    return {
      ...state,
      messages: {
        ...state.messages,
        [action.message.chatId]: [...(state.messages[action.message.chatId] ?? []), action.message],
      },
    };
  if (action.type === 'sent') {
    const messages = state.messages[action.chatId] ?? [];
    const local = messages.find((message) => message.id === action.localId);
    if (!local) return state;
    const echoed = messages.find((message) => message.serverId === action.serverId);
    const pendingKey = messageKey(action.chatId, action.serverId);
    const pending = state.pendingStatuses[pendingKey];
    const updated: Message = {
      ...local,
      serverId: action.serverId,
      status: nextStatus(echoed?.status, pending?.status ?? 'queued'),
      error: pending?.error,
    };
    const pendingStatuses = { ...state.pendingStatuses };
    delete pendingStatuses[pendingKey];
    return {
      ...state,
      pendingStatuses,
      messages: {
        ...state.messages,
        [action.chatId]: [
          ...messages.filter(
            (message) => message.id !== action.localId && message.serverId !== action.serverId,
          ),
          updated,
        ].sort(byTime),
      },
    };
  }
  if (action.type === 'send-error')
    return {
      ...state,
      messages: {
        ...state.messages,
        [action.chatId]: (state.messages[action.chatId] ?? []).map((message) =>
          message.id === action.localId
            ? { ...message, status: action.status, error: action.error }
            : message,
        ),
      },
    };
  const event = action.event;
  if (event.kind === 'status') {
    const messages = state.messages[event.chatId] ?? [];
    if (!messages.some((message) => message.serverId === event.idMessage)) {
      const key = messageKey(event.chatId, event.idMessage);
      const pending = state.pendingStatuses[key];
      // Ограничиваем накопление статусов от старой переписки.
      const entries = Object.entries(state.pendingStatuses).slice(-999);
      return {
        ...state,
        pendingStatuses: {
          ...Object.fromEntries(entries),
          [key]: { status: nextStatus(pending?.status, event.status), error: event.error },
        },
      };
    }
    return {
      ...state,
      messages: {
        ...state.messages,
        [event.chatId]: messages.map((message) =>
          message.serverId === event.idMessage
            ? { ...message, status: nextStatus(message.status, event.status), error: event.error }
            : message,
        ),
      },
    };
  }
  if (event.kind !== 'message') return state;
  const message = event.message;
  const messages = state.messages[message.chatId] ?? [];
  if (messages.some((item) => item.serverId === message.serverId)) return state;
  const existingChat = state.chats.find((chat) => chat.id === message.chatId);
  const unread = message.direction === 'incoming' && state.activeId !== message.chatId ? 1 : 0;
  const key = messageKey(message.chatId, message.serverId!);
  const pendingStatuses = { ...state.pendingStatuses };
  const pending = pendingStatuses[key];
  delete pendingStatuses[key];
  const chat: Chat = existingChat
    ? {
        ...existingChat,
        name: event.name || existingChat.name,
        unread: existingChat.unread + unread,
      }
    : {
        id: message.chatId,
        name: event.name || (event.phone ? formatPhone(event.phone) : `Чат ${message.chatId}`),
        phone: event.phone,
        unread,
        createdAt: message.timestamp,
      };
  return {
    ...state,
    pendingStatuses,
    chats: existingChat
      ? state.chats.map((item) => (item.id === chat.id ? chat : item))
      : [...state.chats, chat],
    messages: {
      ...state.messages,
      [message.chatId]: [...messages, pending ? { ...message, ...pending } : message].sort(byTime),
    },
  };
}

export function sortedChats(state: ChatState) {
  return [...state.chats].sort(
    (a, b) =>
      (state.messages[b.id]?.at(-1)?.timestamp ?? b.createdAt) -
      (state.messages[a.id]?.at(-1)?.timestamp ?? a.createdAt),
  );
}
