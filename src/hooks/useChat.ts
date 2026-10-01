import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatState, ConnectionStatus, Credentials } from '../types';
import { chatReducer, emptyChatState, type ChatAction } from '../lib/chatState';
import { ApiError, describeError, stateDescription, type GreenApi } from '../lib/greenApi';
import { parseNotification } from '../lib/notifications';
import { receiveLoop } from '../lib/polling';
import { formatPhone, normalizePhone } from '../lib/validation';

export function useChat(api: GreenApi, credentials: Credentials) {
  const stateRef = useRef<ChatState>(emptyChatState());
  const [state, setState] = useState(stateRef.current);
  const [connection, setConnection] = useState<ConnectionStatus>({
    kind: 'connecting',
    message: 'Подключаемся…',
  });
  const [instanceIssue, setInstanceIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [sendingChats, setSendingChats] = useState<Set<string>>(new Set());
  const sendingRef = useRef(new Set<string>());
  const requests = useRef(new Set<AbortController>());

  const apply = useCallback((action: ChatAction) => {
    stateRef.current = chatReducer(stateRef.current, action);
    setState(stateRef.current);
  }, []);

  useEffect(
    () => () => {
      requests.current.forEach((controller) => controller.abort());
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const process = (body: unknown) => {
      const event = parseNotification(body);
      if (event.kind === 'state')
        setInstanceIssue(event.state === 'authorized' ? '' : stateDescription(event.state));
      if (event.kind === 'notice') setNotice(event.message);
      // Сначала записываем в состояние, только после этого подтверждаем событие.
      apply({ type: 'event', event });
    };
    async function run() {
      if (signal.aborted) return;
      setConnection({ kind: 'connecting', message: 'Проверяем подключение…' });
      try {
        const instanceState = await api.getState(signal);
        if (signal.aborted) return;
        if (instanceState !== 'authorized') {
          setInstanceIssue(stateDescription(instanceState));
          setConnection({ kind: 'paused', message: stateDescription(instanceState) });
          return;
        }
        setInstanceIssue('');
        setConnection({ kind: 'connected', message: 'Подключено' });
        await receiveLoop({
          receive: api.receive,
          acknowledge: api.acknowledge,
          process,
          onStatus: setConnection,
          signal,
        });
      } catch (error) {
        if (!signal.aborted) setConnection({ kind: 'paused', message: describeError(error) });
      }
    }
    if (navigator.locks) {
      setConnection({
        kind: 'waiting',
        message: 'Ожидаем доступ к очереди. Если чат открыт в другой вкладке, закрой её.',
      });
      void navigator.locks
        .request(`max-chat:${credentials.apiUrl}:${credentials.idInstance}`, { signal }, run)
        .catch((error) => {
          if (!signal.aborted) setConnection({ kind: 'paused', message: describeError(error) });
        });
    } else void run();
    return () => controller.abort();
  }, [api, apply, credentials.apiUrl, credentials.idInstance, retry]);

  const openChat = async (value: string) => {
    const phone = normalizePhone(value);
    const existing = stateRef.current.chats.find((chat) => chat.phone === phone);
    if (existing) {
      apply({ type: 'select', id: existing.id });
      return;
    }
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const id = await api.checkAccount(phone, controller.signal);
      if (!controller.signal.aborted)
        apply({
          type: 'open',
          chat: { id, phone, name: formatPhone(phone), unread: 0, createdAt: Date.now() },
        });
    } finally {
      requests.current.delete(controller);
    }
  };

  const send = async (chatId: string, text: string) => {
    if (sendingRef.current.has(chatId) || !text.trim() || text.length > 4000) return false;
    const localId = crypto.randomUUID();
    const controller = new AbortController();
    requests.current.add(controller);
    sendingRef.current.add(chatId);
    setSendingChats(new Set(sendingRef.current));
    apply({
      type: 'send',
      message: {
        id: localId,
        chatId,
        text,
        direction: 'outgoing',
        timestamp: Date.now(),
        status: 'sending',
      },
    });
    try {
      const serverId = await api.sendMessage(chatId, text, controller.signal);
      if (controller.signal.aborted) return false;
      apply({ type: 'sent', chatId, localId, serverId });
      return true;
    } catch (error) {
      if (!controller.signal.aborted)
        apply({
          type: 'send-error',
          chatId,
          localId,
          status: error instanceof ApiError && error.uncertain ? 'uncertain' : 'failed',
          error:
            error instanceof ApiError && error.uncertain
              ? 'Не удалось подтвердить отправку. Проверь MAX перед повтором: сообщение могло уйти.'
              : describeError(error),
        });
      return false;
    } finally {
      requests.current.delete(controller);
      sendingRef.current.delete(chatId);
      if (!controller.signal.aborted) setSendingChats(new Set(sendingRef.current));
    }
  };

  return {
    state,
    connection,
    instanceIssue,
    notice,
    sendingChats,
    openChat,
    send,
    select: (id: string | null) => apply({ type: 'select', id }),
    reconnect: () => setRetry((value) => value + 1),
    dismissNotice: () => setNotice(''),
  };
}
