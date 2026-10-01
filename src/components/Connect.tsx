import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  CircleAlert,
  MessageCircle,
} from 'lucide-react';
import type { Credentials } from '../types';
import {
  createGreenApi,
  describeError,
  settingsNeedUpdate,
  stateDescription,
} from '../lib/greenApi';
import { validateCredentials } from '../lib/validation';
import { Brand } from './Brand';

type Props = { onConnect: (credentials: Credentials) => void };
export function Connect({ onConnect }: Props) {
  const [form, setForm] = useState<Credentials>({
    idInstance: '',
    apiTokenInstance: '',
    apiUrl: '',
  });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState<Credentials | null>(null);
  const [saved, setSaved] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function connect(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const credentials = validateCredentials(setup ?? form);
      const api = createGreenApi(credentials);
      const [state, settings] = await Promise.all([
        api.getState(controller.signal),
        api.getSettings(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (settings.typeInstance !== 'v3')
        throw new Error(
          'Этот инстанс не относится к MAX. Выбери инстанс MAX в кабинете GREEN-API.',
        );
      if (state !== 'authorized') throw new Error(stateDescription(state));
      if (settingsNeedUpdate(settings)) {
        setSetup(credentials);
        return;
      }
      onConnect(credentials);
    } catch (error) {
      if (!controller.signal.aborted) setError(describeError(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function configure() {
    if (!setup || busy) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await createGreenApi(setup).configure(controller.signal);
      if (!controller.signal.aborted) setSaved(true);
    } catch (error) {
      if (!controller.signal.aborted) setError(describeError(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const update = (key: keyof Credentials, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setError('');
  };
  return (
    <main className="connect-page">
      <header className="connect-top">
        <Brand />
        <a
          className="quiet-link"
          href="https://console.greenapi.com/"
          target="_blank"
          rel="noreferrer"
        >
          Перейти в кабинет GREEN-API <ExternalLink size={15} />
        </a>
      </header>
      <section className="connect-content">
        <div className="connection-card">
          <div className="connect-symbol">
            <MessageCircle size={32} strokeWidth={1.8} />
          </div>
          <span className="eyebrow">MAX · GREEN-API</span>
          <h1>
            {setup ? (saved ? 'Почти готово' : 'Включим получение ответов') : 'Подключиться к MAX'}
          </h1>
          <p className="connect-description">
            {setup
              ? saved
                ? 'Настройки сохранены. Инстанс перезапускается — это может занять до пяти минут.'
                : 'Нужно настроить уведомления, чтобы ответы и статусы сообщений появлялись здесь.'
              : 'Введите данные инстанса GREEN-API,\nчтобы начать переписку.'}
          </p>
          {setup ? (
            <div className="setup-content">
              {!saved && (
                <div className="setup-note">
                  <CircleAlert size={19} />
                  <p>
                    Включим уведомления и очистим <code>webhookUrl</code>. Если инстанс подключён к
                    другому сервису, тот перестанет получать вебхуки. Изменение настроек
                    перезапустит инстанс.
                  </p>
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  <CircleAlert size={17} />
                  {error}
                </p>
              )}
              <button
                className="button primary full"
                disabled={busy}
                onClick={() => void (saved ? connect() : configure())}
              >
                {busy && <LoaderCircle className="spin" size={18} />}
                {saved ? 'Проверить подключение' : 'Настроить уведомления'}
              </button>
              {!saved && (
                <button
                  className="button subtle full"
                  disabled={busy}
                  onClick={() => void connect()}
                >
                  Я настроил в кабинете — проверить
                </button>
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setSetup(null);
                  setSaved(false);
                  setError('');
                }}
              >
                Вернуться к данным подключения
              </button>
            </div>
          ) : (
            <form className="connect-form" onSubmit={(event) => void connect(event)}>
              <label className="field">
                ID инстанса <span>ID Instance</span>
                <input
                  name="idInstance"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Например, 3100000000"
                  value={form.idInstance}
                  onChange={(event) => update('idInstance', event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                Ключ доступа <span>API TokenInstance</span>
                <div className="password-field">
                  <input
                    name="apiTokenInstance"
                    type={visible ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Ключ из кабинета GREEN-API"
                    value={form.apiTokenInstance}
                    onChange={(event) => update('apiTokenInstance', event.target.value)}
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>
              <label className="field">
                Адрес сервера <span>API Url</span>
                <input
                  name="apiUrl"
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://3100.api.green-api.com"
                  value={form.apiUrl}
                  onChange={(event) => update('apiUrl', event.target.value)}
                  required
                  disabled={busy}
                />
                <small>Все три значения есть в карточке инстанса MAX.</small>
              </label>
              {error && (
                <p className="form-error" role="alert">
                  <CircleAlert size={17} />
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy} type="submit">
                {busy ? <LoaderCircle className="spin" size={19} /> : <KeyRound size={18} />}
                {busy ? 'Подключаемся…' : 'Подключиться'}
              </button>
              <div className="privacy-note">
                <ShieldCheck size={17} />
                <span>Ключ остаётся в памяти этой вкладки.</span>
              </div>
            </form>
          )}
        </div>
      </section>
      <footer className="connect-footer">
        <span>Неофициальный клиент MAX</span>
      </footer>
    </main>
  );
}
