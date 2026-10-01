import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, StrictMode } from 'react';

// Настоящие компоненты и HTTP-клиент, сеть подменена на границе fetch.
test('подключение → создание чата → отправка → ответ → ошибка → черновики → выход', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  const window = dom.window;
  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.confirm = () => true;
  const { createRoot } = await import('react-dom/client');
  const { default: App } = await import('../src/App');
  const root = createRoot(window.document.getElementById('root')!);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const queue: { receiptId: number; body: unknown }[] = [];
  let failedSend = false;
  let nextChatId = '100';
  let notify: (() => void) | undefined;
  let webTool: Record<string, unknown> | undefined;
  Object.defineProperty(window.document, 'modelContext', {
    value: {
      registerTool(tool: Record<string, unknown>) {
        webTool = tool;
      },
    },
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = url.split('/')[4];
    calls.push(method);
    if (method === 'getStateInstance') return Response.json({ stateInstance: 'authorized' });
    if (method === 'getSettings')
      return Response.json({
        typeInstance: 'v3',
        webhookUrl: '',
        incomingWebhook: 'yes',
        outgoingWebhook: 'yes',
        outgoingMessageWebhook: 'yes',
        outgoingAPIMessageWebhook: 'yes',
        stateWebhook: 'yes',
      });
    if (method === 'checkAccount') return Response.json({ exist: true, chatId: nextChatId });
    if (method === 'sendMessage') {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        chatId: '100',
        message: failedSend ? 'Текст останется' : 'Привет!',
      });
      return failedSend
        ? Response.json({ error: 'forbidden' }, { status: 403 })
        : Response.json({ idMessage: '10' });
    }
    if (method === 'receiveNotification') {
      if (queue.length) return Response.json(queue[0]);
      return new Promise<Response>((resolve, reject) => {
        const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener('abort', abort, { once: true });
        notify = () => {
          init?.signal?.removeEventListener('abort', abort);
          resolve(Response.json(queue[0] ?? null));
        };
      });
    }
    if (method === 'deleteNotification') {
      queue.shift();
      return Response.json({ result: true });
    }
    throw new Error(`Неожиданный метод ${method}`);
  };
  const doc = window.document;
  const button = (label: string) => {
    const found = [...doc.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
    );
    assert.ok(found, `Нет кнопки ${label}`);
    return found;
  };
  async function click(label: string) {
    await act(async () => button(label).click());
  }
  async function fill(selector: string, value: string) {
    const input = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    assert.ok(input, selector);
    const prototype =
      input.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }
  async function submit(selector: string) {
    await act(async () => {
      doc
        .querySelector(selector)!
        .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
  }
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    );
    await fill('[name="idInstance"]', '3100000000');
    await fill('[name="apiTokenInstance"]', 'fake-test-token');
    await fill('[name="apiUrl"]', 'https://3100.api.green-api.com');
    await submit('.connect-form');
    assert.ok(doc.querySelector('.messenger'));
    assert.equal(calls.includes('setSettings'), false, 'Настройки не меняются при каждом входе');
    assert.ok(webTool);
    assert.equal(webTool.name, 'start_new_chat');
    await act(async () => {
      (webTool!.execute as (input: unknown) => unknown)({});
    });
    assert.equal(doc.querySelector<HTMLDialogElement>('dialog')?.open, true);
    assert.throws(() => (webTool!.execute as (input: unknown) => unknown)({ phone: 'bad' }));
    await fill('input[type="tel"]', '+7 999 123-45-67');
    await submit('dialog form');
    assert.equal(doc.querySelector<HTMLDialogElement>('dialog')?.open, false);
    assert.ok(doc.querySelector('.conversation'));
    await fill('textarea', 'Привет!');
    await submit('.composer');
    assert.equal(doc.querySelector<HTMLTextAreaElement>('textarea')!.value, '');
    assert.equal(doc.querySelectorAll('.message-line.outgoing').length, 1);
    const incoming = {
      typeWebhook: 'incomingMessageReceived',
      idMessage: '11',
      timestamp: Math.floor(Date.now() / 1000),
      senderData: { chatId: '100', senderName: 'Саша', chatType: 'user' },
      messageData: {
        typeMessage: 'extendedTextMessage',
        extendedTextMessageData: { text: 'Ответ со ссылкой https://example.com' },
      },
    };
    await act(async () => {
      queue.push({ receiptId: 1, body: incoming });
      notify?.();
    });
    assert.equal(doc.querySelectorAll('.message-line.incoming').length, 1);
    assert.ok(doc.querySelector('.conversation')?.textContent?.includes('Ответ со ссылкой'));
    failedSend = true;
    await fill('textarea', 'Текст останется');
    await submit('.composer');
    assert.equal(doc.querySelector<HTMLTextAreaElement>('textarea')!.value, 'Текст останется');
    assert.ok(doc.querySelector('.message-error'));
    await click('Новый чат');
    nextChatId = '200';
    await fill('input[type="tel"]', '+7 999 765-43-21');
    await submit('dialog form');
    assert.equal(doc.querySelector<HTMLTextAreaElement>('textarea')!.value, '');
    await fill('textarea', 'Черновик другого чата');
    await act(async () => {
      (doc.querySelectorAll('.chat-row')[1] as HTMLButtonElement).click();
    });
    assert.equal(doc.querySelector<HTMLTextAreaElement>('textarea')!.value, 'Текст останется');
    await fill('textarea', 'x'.repeat(4001));
    assert.equal(button('Отправить сообщение').disabled, true);
    assert.equal(window.localStorage.length, 0);
    assert.equal(window.sessionStorage.length, 0);
    await click('Отключиться');
    assert.ok(doc.querySelector('.connect-form'));
    assert.equal(doc.querySelector<HTMLInputElement>('[name="apiTokenInstance"]')!.value, '');
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
