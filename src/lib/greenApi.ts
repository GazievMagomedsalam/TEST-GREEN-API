import type { Credentials, Notification } from '../types';
import { asRecord, textValue } from './validation';

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public uncertain = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorMessage(status: number, detail: string) {
  if (/custom webhook|webhook url/i.test(detail))
    return 'В кабинете GREEN-API очисти webhookUrl, чтобы получать ответы в этом чате.';
  if (/limit reached/i.test(detail) || status === 469)
    return 'Достигнут лимит проверки номеров. Подожди перед следующей попыткой.';
  if (/starting|not authorized/i.test(detail))
    return 'Инстанс ещё не подключён к MAX. Проверь его состояние в кабинете GREEN-API.';
  if (status === 401 || status === 403)
    return 'Нет доступа. Проверь ключи, состояние инстанса и ограничения аккаунта в GREEN-API.';
  if (status === 429) return 'Слишком много запросов. Повтори попытку чуть позже.';
  if (status === 466) return 'Лимит тарифа исчерпан. Проверь доступные чаты в кабинете GREEN-API.';
  if (status >= 500) return 'GREEN-API временно недоступен. Попробуй позже.';
  if (status === 404) return 'Инстанс не найден. Проверь apiUrl и idInstance.';
  return 'GREEN-API отклонил запрос. Проверь введённые данные и настройки инстанса.';
}

export function createGreenApi(credentials: Credentials) {
  const { apiUrl, idInstance, apiTokenInstance } = credentials;
  const root = `${apiUrl}/waInstance${idInstance}`;

  async function request(
    method: string,
    options: {
      verb?: string;
      body?: unknown;
      suffix?: string;
      signal?: AbortSignal;
      timeout?: number;
    } = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, options.timeout ?? 25_000);
    const isSend = method === 'sendMessage';
    try {
      const response = await fetch(
        `${root}/${method}/${encodeURIComponent(apiTokenInstance)}${options.suffix ?? ''}`,
        {
          method: options.verb ?? 'GET',
          ...(options.body !== undefined && {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options.body),
          }),
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        },
      );
      const raw = await response.text();
      if (!response.ok)
        throw new ApiError(
          errorMessage(response.status, raw),
          response.status,
          isSend && response.status >= 500,
        );
      let data: unknown;
      try {
        data = raw.trim() ? JSON.parse(raw) : null;
      } catch {
        throw new ApiError('Сервис вернул неожиданный ответ. Попробуй позже.', 502, isSend);
      }
      const result = asRecord(data);
      if (result.status === false)
        throw new ApiError(errorMessage(400, textValue(result.reason)), 400);
      return data;
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Запрос отменён', 'AbortError');
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted)
        throw new ApiError('Сервер не ответил вовремя. Проверь соединение.', 0, isSend);
      throw new ApiError(
        'Нет связи с GREEN-API. Проверь интернет, apiUrl и доступ браузера к API (CORS).',
        0,
        isSend,
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  return {
    async getState(signal?: AbortSignal) {
      const data = asRecord(await request('getStateInstance', { signal }));
      if (typeof data.stateInstance !== 'string')
        throw new ApiError('Не удалось узнать состояние инстанса.', 502);
      return data.stateInstance;
    },
    async getSettings(signal?: AbortSignal) {
      return asRecord(await request('getSettings', { signal }));
    },
    async configure(signal?: AbortSignal) {
      const data = asRecord(
        await request('setSettings', {
          verb: 'POST',
          signal,
          body: {
            webhookUrl: '',
            incomingWebhook: 'yes',
            outgoingWebhook: 'yes',
            outgoingMessageWebhook: 'yes',
            outgoingAPIMessageWebhook: 'yes',
            stateWebhook: 'yes',
          },
        }),
      );
      if (data.saveSettings !== true)
        throw new ApiError(
          'Настройки не были сохранены. Попробуй изменить их в кабинете GREEN-API.',
        );
    },
    async checkAccount(phone: string, signal?: AbortSignal) {
      const data = asRecord(
        await request('checkAccount', {
          verb: 'POST',
          body: { phoneNumber: Number(phone) },
          signal,
        }),
      );
      if (data.exist === false)
        throw new ApiError('На этом номере не найден аккаунт MAX. Проверь номер получателя.', 400);
      if (data.exist !== true || typeof data.chatId !== 'string' || !data.chatId)
        throw new ApiError('Сервис не вернул идентификатор чата. Попробуй позже.', 502);
      return data.chatId;
    },
    async sendMessage(chatId: string, message: string, signal?: AbortSignal) {
      if (!message.trim() || message.length > 4000)
        throw new ApiError('Сообщение должно содержать от 1 до 4000 символов.', 400);
      const data = asRecord(
        await request('sendMessage', { verb: 'POST', body: { chatId, message }, signal }),
      );
      if (typeof data.idMessage !== 'string' || !data.idMessage)
        throw new ApiError('Не удалось подтвердить отправку. Проверь переписку в MAX.', 502, true);
      return data.idMessage;
    },
    async receive(signal: AbortSignal): Promise<Notification | null> {
      const data = await request('receiveNotification', {
        suffix: '?receiveTimeout=25',
        signal,
        timeout: 40_000,
      });
      if (data === null) return null;
      const notification = asRecord(data);
      if (
        typeof notification.receiptId !== 'number' ||
        !Number.isSafeInteger(notification.receiptId) ||
        notification.body === undefined
      ) {
        throw new ApiError(
          'Неожиданный формат уведомления. Получение приостановлено, событие осталось в очереди.',
          422,
        );
      }
      return { receiptId: notification.receiptId, body: notification.body };
    },
    async acknowledge(receiptId: number, signal: AbortSignal) {
      const data = asRecord(
        await request('deleteNotification', { verb: 'DELETE', suffix: `/${receiptId}`, signal }),
      );
      if (data.result !== true)
        throw new ApiError(
          'Уведомление уже удалено или очередь используется другим клиентом. Закрой другой клиент и нажми «Проверить».',
          409,
        );
    },
  };
}

export type GreenApi = ReturnType<typeof createGreenApi>;
export const describeError = (error: unknown) =>
  error instanceof Error ? error.message : 'Что-то пошло не так. Попробуй ещё раз.';

export function settingsNeedUpdate(settings: Record<string, unknown>) {
  return (
    Boolean(settings.webhookUrl) ||
    [
      'incomingWebhook',
      'outgoingWebhook',
      'outgoingMessageWebhook',
      'outgoingAPIMessageWebhook',
      'stateWebhook',
    ].some((key) => settings[key] !== 'yes')
  );
}

export function stateDescription(state: string) {
  const descriptions: Record<string, string> = {
    notAuthorized: 'Подключи аккаунт MAX к инстансу в кабинете GREEN-API, затем вернись сюда.',
    starting: 'Инстанс запускается. Подожди немного и проверь подключение ещё раз.',
    sleepMode: 'Инстанс в спящем режиме. Открой MAX на телефоне и проверь подключение.',
    blocked: 'Аккаунт заблокирован. Проверь подробности в кабинете GREEN-API.',
    pendingPassword: 'Введи пароль двухфакторной авторизации в кабинете GREEN-API.',
    suspended: 'На аккаунте есть ограничения. Проверь их в кабинете GREEN-API.',
  };
  return (
    descriptions[state] ?? 'Инстанс не готов к работе. Проверь подключение в кабинете GREEN-API.'
  );
}
