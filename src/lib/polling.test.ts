import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiveLoop, delay } from './polling';
import { ApiError } from './greenApi';
import type { ConnectionStatus } from '../types';

test('receive → process → delete выполняются последовательно; сбой DELETE не дублирует обработку', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  let attempts = 0;
  await receiveLoop({
    signal: controller.signal,
    async receive() {
      calls.push('receive');
      return { receiptId: 25, body: {} };
    },
    process() {
      calls.push('process');
    },
    async acknowledge(id) {
      assert.equal(id, 25);
      calls.push('delete');
      attempts++;
      if (attempts === 1) throw new ApiError('Сбой сети');
      controller.abort();
    },
    onStatus() {},
    wait: async () => {},
  });
  assert.deepEqual(calls, ['receive', 'process', 'delete', 'delete']);
});

test('ошибка обработки сохраняет событие в очереди', async () => {
  const statuses: ConnectionStatus[] = [];
  let deleted = false;
  await receiveLoop({
    signal: new AbortController().signal,
    async receive() {
      return { receiptId: 25, body: null };
    },
    process() {
      throw new Error('Неизвестный формат');
    },
    async acknowledge() {
      deleted = true;
    },
    onStatus: (status) => statuses.push(status),
    wait: async () => {},
  });
  assert.equal(deleted, false);
  assert.equal(statuses.at(-1)?.kind, 'paused');
});

test('пустая очередь не вызывает DELETE; отмена завершает цикл', async () => {
  const controller = new AbortController();
  let deletes = 0;
  await receiveLoop({
    signal: controller.signal,
    async receive() {
      return null;
    },
    process() {},
    async acknowledge() {
      deletes++;
    },
    onStatus() {},
    wait: async () => {
      controller.abort();
    },
  });
  assert.equal(deletes, 0);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(delay(10_000, cancelled.signal), { name: 'AbortError' });
});

test('401 приостанавливает получение, 429 повторяется с задержкой', async () => {
  let calls = 0;
  const waits: number[] = [];
  let lastStatus: ConnectionStatus | undefined;
  await receiveLoop({
    signal: new AbortController().signal,
    async receive() {
      calls++;
      throw new ApiError('Ошибка', calls === 1 ? 429 : 401);
    },
    process() {},
    async acknowledge() {},
    onStatus(status) {
      lastStatus = status;
    },
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
  assert.equal(lastStatus?.kind, 'paused');
});
