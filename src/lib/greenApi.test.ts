import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGreenApi, ApiError, settingsNeedUpdate } from './greenApi';
import { normalizePhone, validateCredentials } from './validation';

const credentials = {
  apiUrl: 'https://3100.api.green-api.com',
  idInstance: '3100000000',
  apiTokenInstance: 'test-token',
};
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('нормализация телефона и проверка адреса не допускают отправку ключа чужому хосту', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67'), '79991234567');
  assert.equal(normalizePhone('+375 29 123-45-67'), '375291234567');
  for (const invalid of ['+1 212 555 0000', '123', '+7abc9991234567'])
    assert.throws(() => normalizePhone(invalid));
  for (const apiUrl of [
    'https://example.com',
    'http://3100.api.green-api.com',
    'https://3100.api.green-api.com.evil.test',
    'https://3100.api.green-api.com/?secret=test',
  ])
    assert.throws(() => validateCredentials({ ...credentials, apiUrl }));
  assert.equal(
    validateCredentials({ ...credentials, apiUrl: `${credentials.apiUrl}/v3/` }).apiUrl,
    credentials.apiUrl,
  );
});

test('checkAccount передаёт числовой номер и использует канонический chatId', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), `${credentials.apiUrl}/waInstance3100000000/checkAccount/test-token`);
    assert.equal(options?.method, 'POST');
    assert.deepEqual(JSON.parse(String(options?.body)), { phoneNumber: 79991234567 });
    return Response.json({ exist: true, chatId: '12345678', fromCache: true });
  };
  assert.equal(await createGreenApi(credentials).checkAccount('79991234567'), '12345678');
});

test('отправка, receiveTimeout и DELETE используют контракт MAX', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(`${options?.method} ${String(url).split('/').at(-2)}`);
    if (String(url).includes('/sendMessage/')) {
      assert.deepEqual(JSON.parse(String(options?.body)), { chatId: '123', message: 'Привет 😃' });
      return Response.json({ idMessage: '456' });
    }
    if (String(url).includes('/receiveNotification/')) {
      assert.ok(String(url).endsWith('?receiveTimeout=25'));
      return new Response('');
    }
    assert.equal(options?.method, 'DELETE');
    assert.ok(String(url).endsWith('/test-token/77'));
    return Response.json({ result: true });
  };
  const api = createGreenApi(credentials);
  assert.equal(await api.sendMessage('123', 'Привет 😃'), '456');
  assert.equal(await api.receive(new AbortController().signal), null);
  await api.acknowledge(77, new AbortController().signal);
  assert.equal(calls.length, 3);
});

test('таймаут/сетевая ошибка отправки считаются неопределённым результатом и не повторяются автоматически', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError('Network error with test-token');
  };
  await assert.rejects(createGreenApi(credentials).sendMessage('123', 'Привет'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.uncertain, true);
    assert.equal(error.message.includes('test-token'), false);
    return true;
  });
  assert.equal(calls, 1);
});

test('HTTP 200 без idMessage не считается успешной отправкой', async () => {
  globalThis.fetch = async () => Response.json({ unexpected: true });
  await assert.rejects(
    createGreenApi(credentials).sendMessage('123', 'Привет'),
    (error) => error instanceof ApiError && error.uncertain,
  );
});

test('невалидный текст не отправляется, webhook-настройки проверяются без мутаций', async () => {
  globalThis.fetch = async () => {
    throw new Error('Запрос не должен выполняться');
  };
  await assert.rejects(createGreenApi(credentials).sendMessage('123', '   '));
  await assert.rejects(createGreenApi(credentials).sendMessage('123', 'a'.repeat(4001)));
  const settings = {
    webhookUrl: '',
    incomingWebhook: 'yes',
    outgoingWebhook: 'yes',
    outgoingMessageWebhook: 'yes',
    outgoingAPIMessageWebhook: 'yes',
    stateWebhook: 'yes',
  };
  assert.equal(settingsNeedUpdate(settings), false);
  assert.equal(settingsNeedUpdate({ ...settings, webhookUrl: 'https://example.com' }), true);
});
