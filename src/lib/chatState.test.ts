import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatReducer, emptyChatState } from './chatState';
import { parseNotification } from './notifications';
import type { ChatEvent } from './notifications';

const incoming = (chatId = '100', idMessage = '1', typeMessage = 'textMessage') => ({
  typeWebhook: 'incomingMessageReceived',
  idMessage,
  timestamp: 1_700_000_000,
  senderData: { chatId, chatType: 'user', senderName: 'Саша' },
  messageData:
    typeMessage === 'textMessage'
      ? { typeMessage, textMessageData: { textMessage: 'Привет' } }
      : { typeMessage, extendedTextMessageData: { text: 'https://example.com', stanzaId: '10' } },
});
const event = (value: unknown) => ({ type: 'event' as const, event: parseNotification(value) });

test('дубликаты подавляются внутри чата, одинаковые id разных чатов сохраняются', () => {
  let state = chatReducer(emptyChatState(), event(incoming()));
  state = chatReducer(state, event(incoming()));
  state = chatReducer(state, event(incoming('200')));
  assert.equal(state.messages['100'].length, 1);
  assert.equal(state.messages['200'].length, 1);
  assert.equal(state.chats[0].unread, 1);
  state = chatReducer(state, { type: 'select', id: '100' });
  state = chatReducer(state, event(incoming('100', '2')));
  assert.equal(state.chats[0].unread, 0);
});

test('текст, ссылка и цитата разбираются без номера телефона', () => {
  for (const kind of ['textMessage', 'extendedTextMessage', 'quotedMessage']) {
    const parsed = parseNotification(incoming('100', '1', kind));
    assert.equal(parsed.kind, 'message');
    if (parsed.kind === 'message') {
      assert.equal(parsed.message.chatId, '100');
      assert.equal(parsed.phone, undefined);
      assert.ok(parsed.message.text);
    }
  }
});

test('повреждённый текст не подтверждается как успешно обработанный', () => {
  const broken = incoming();
  broken.messageData.textMessageData = undefined;
  assert.throws(() => parseNotification(broken), /разобрать/);
  assert.throws(() => parseNotification(null), /тип события/);
  assert.equal(
    parseNotification({ ...incoming(), messageData: { typeMessage: 'imageMessage' } }).kind,
    'ignored',
  );
});

test('статус до ответа sendMessage и эхо API объединяются с локальным сообщением', () => {
  let state = chatReducer(emptyChatState(), {
    type: 'send',
    message: {
      id: 'local',
      chatId: '100',
      direction: 'outgoing',
      text: 'Привет',
      timestamp: 1_700_000_000_000,
      status: 'sending',
    },
  });
  const status: ChatEvent = { kind: 'status', chatId: '100', idMessage: '10', status: 'read' };
  state = chatReducer(state, { type: 'event', event: status });
  state = chatReducer(
    state,
    event({ ...incoming('100', '10'), typeWebhook: 'outgoingAPIMessageReceived' }),
  );
  state = chatReducer(state, { type: 'sent', chatId: '100', localId: 'local', serverId: '10' });
  assert.equal(state.messages['100'].length, 1);
  assert.equal(state.messages['100'][0].status, 'read');
  state = chatReducer(state, { type: 'event', event: { ...status, status: 'delivered' } });
  assert.equal(state.messages['100'][0].status, 'read');
  assert.deepEqual(state.pendingStatuses, {});
});

test('failed и noAccount превращаются в видимую ошибку отправки', () => {
  for (const status of ['failed', 'noAccount']) {
    const parsed = parseNotification({
      typeWebhook: 'outgoingMessageStatus',
      chatId: '100',
      idMessage: '10',
      status,
    });
    assert.equal(parsed.kind, 'status');
    if (parsed.kind === 'status') {
      assert.equal(parsed.status, 'failed');
      assert.ok(parsed.error);
    }
  }
});
