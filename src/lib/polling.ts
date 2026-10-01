import type { ConnectionStatus, Notification } from '../types';
import { ApiError, describeError } from './greenApi';

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Остановлено', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Остановлено', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function receiveLoop(options: {
  receive: (signal: AbortSignal) => Promise<Notification | null>;
  acknowledge: (id: number, signal: AbortSignal) => Promise<void>;
  process: (body: unknown) => void;
  onStatus: (status: ConnectionStatus) => void;
  signal: AbortSignal;
  wait?: typeof delay;
}) {
  const { signal, onStatus } = options;
  const wait = options.wait ?? delay;
  let failures = 0;
  let pending: Notification | null = null;
  while (!signal.aborted) {
    try {
      // Если DELETE не прошёл, повторяем только подтверждение, сохранив обработанное событие.
      if (!pending) {
        const notification = await options.receive(signal);
        if (signal.aborted) return;
        if (notification) {
          options.process(notification.body);
          pending = notification;
        }
      }
      if (pending) {
        await options.acknowledge(pending.receiptId, signal);
        pending = null;
      }
      if (signal.aborted) return;
      failures = 0;
      onStatus({ kind: 'connected', message: 'Подключено' });
      // Снижает частоту запросов при разборе накопившейся очереди.
      await wait(600, signal);
    } catch (error) {
      if (signal.aborted) return;
      if (
        !(error instanceof ApiError) ||
        (error.status >= 400 && error.status < 500 && error.status !== 429)
      ) {
        onStatus({ kind: 'paused', message: describeError(error) });
        return;
      }
      failures += 1;
      onStatus({ kind: 'reconnecting', message: `${describeError(error)} Восстанавливаем связь…` });
      try {
        await wait(Math.min(1000 * 2 ** (failures - 1), 30_000), signal);
      } catch {
        return;
      }
    }
  }
}
