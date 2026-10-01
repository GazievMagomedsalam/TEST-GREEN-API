import type { Message, MessageStatus } from '../types';
import { asRecord, textValue } from './validation';

export type ChatEvent =
  | { kind: 'message'; message: Message; name: string; phone?: string }
  | { kind: 'status'; chatId: string; idMessage: string; status: MessageStatus; error?: string }
  | { kind: 'state'; state: string }
  | { kind: 'notice'; message: string }
  | { kind: 'ignored' };

export function parseNotification(value: unknown): ChatEvent {
  const body = asRecord(value);
  const type = textValue(body.typeWebhook);
  if (!type) throw new Error('В уведомлении отсутствует тип события. Оно осталось в очереди.');
  if (type === 'stateInstanceChanged')
    return { kind: 'state', state: textValue(body.stateInstance) };
  if (type === 'outgoingMessageStatus') {
    const chatId = textValue(body.chatId);
    const idMessage = textValue(body.idMessage);
    if (!chatId || !idMessage)
      throw new Error('В статусе сообщения отсутствует идентификатор. Событие осталось в очереди.');
    const status = textValue(body.status);
    if (status === 'delivered' || status === 'read')
      return { kind: 'status', chatId, idMessage, status };
    if (['failed', 'noAccount', 'notInGroup'].includes(status))
      return {
        kind: 'status',
        chatId,
        idMessage,
        status: 'failed',
        error:
          status === 'noAccount'
            ? 'Аккаунт MAX не найден.'
            : status === 'notInGroup'
              ? 'Нет доступа к чату.'
              : 'MAX не доставил сообщение. Проверь аккаунт получателя и ограничения в GREEN-API.',
      };
    return { kind: 'ignored' };
  }
  if (type === 'quotaExceeded')
    return { kind: 'notice', message: 'Проверь ограничения тарифа в кабинете GREEN-API.' };
  if (
    !['incomingMessageReceived', 'outgoingMessageReceived', 'outgoingAPIMessageReceived'].includes(
      type,
    )
  )
    return { kind: 'ignored' };
  const sender = asRecord(body.senderData);
  const chatId = textValue(sender.chatId);
  const serverId = textValue(body.idMessage);
  // Группы и вложения вне объёма тестового, но не должны блокировать очередь.
  if (sender.chatType === 'group' || chatId.startsWith('-')) return { kind: 'ignored' };
  const data = asRecord(body.messageData);
  const messageType = textValue(data.typeMessage);
  if (!['textMessage', 'extendedTextMessage', 'quotedMessage'].includes(messageType))
    return { kind: 'ignored' };
  const payload =
    messageType === 'textMessage'
      ? asRecord(data.textMessageData)
      : asRecord(data.extendedTextMessageData);
  const text = messageType === 'textMessage' ? payload.textMessage : payload.text;
  if (!chatId || !serverId || typeof text !== 'string')
    throw new Error('Не удалось разобрать текстовое сообщение. Оно осталось в очереди.');
  const phone = sender.senderPhoneNumber
    ? String(sender.senderPhoneNumber).replace(/\D/g, '')
    : undefined;
  return {
    kind: 'message',
    name:
      textValue(sender.senderContactName) ||
      textValue(sender.chatName) ||
      textValue(sender.senderName),
    phone,
    message: {
      id: serverId,
      serverId,
      chatId,
      text,
      direction: type === 'incomingMessageReceived' ? 'incoming' : 'outgoing',
      timestamp:
        typeof body.timestamp === 'number' && Number.isFinite(body.timestamp)
          ? body.timestamp * 1000
          : Date.now(),
      ...(type !== 'incomingMessageReceived' && { status: 'queued' as const }),
      quote:
        textValue(asRecord(data.quotedMessage).textMessage) ||
        (messageType === 'quotedMessage' ? 'Ответ на сообщение' : undefined),
    },
  };
}
