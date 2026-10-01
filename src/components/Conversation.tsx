import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  CircleAlert,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
} from 'lucide-react';
import type { Chat, Message } from '../types';
import { formatPhone } from '../lib/validation';
import { Avatar } from './Sidebar';

const statusLabels = {
  sending: 'Отправляется',
  queued: 'Принято в очередь',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
  uncertain: 'Отправка не подтверждена',
};
function MessageState({ message }: { message: Message }) {
  if (!message.status) return null;
  const icon =
    message.status === 'sending' ? (
      <LoaderCircle className="spin" size={13} />
    ) : message.status === 'queued' ? (
      <Clock3 size={13} />
    ) : message.status === 'read' ? (
      <CheckCheck size={16} />
    ) : message.status === 'delivered' ? (
      <Check size={15} />
    ) : (
      <CircleAlert size={14} />
    );
  return (
    <span
      className={`message-status ${message.status}`}
      aria-label={statusLabels[message.status]}
      title={statusLabels[message.status]}
    >
      {icon}
    </span>
  );
}

function dayLabel(time: number) {
  const date = new Date(time);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
  });
}

export function Conversation({
  chat,
  messages,
  draft,
  onDraft,
  sending,
  disabled,
  onSend,
  onBack,
  onNewChat,
}: {
  chat?: Chat;
  messages: Message[];
  draft: string;
  onDraft: (value: string) => void;
  sending: boolean;
  disabled: boolean;
  onSend: () => Promise<void>;
  onBack: () => void;
  onNewChat: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const previousChat = useRef(chat?.id);
  const previousMessage = useRef<string | undefined>(undefined);
  const [showScroll, setShowScroll] = useState(false);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const changedChat = previousChat.current !== chat?.id;
    const last = messages.at(-1);
    const ownNewMessage = last?.direction === 'outgoing' && last.id !== previousMessage.current;
    if (changedChat || atBottom.current || ownNewMessage) {
      element.scrollTop = element.scrollHeight;
      atBottom.current = true;
      setShowScroll(false);
    }
    previousChat.current = chat?.id;
    previousMessage.current = last?.id;
  }, [chat?.id, messages]);
  useEffect(() => {
    input.current?.focus();
  }, [chat?.id]);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${Math.min(input.current.scrollHeight, 168)}px`;
  }, [draft]);

  const tooLong = draft.length > 4000;
  const canSend = !sending && !disabled && !tooLong && Boolean(draft.trim());
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canSend) void onSend();
  }
  if (!chat)
    return (
      <section className="conversation-empty" aria-label="Переписка">
        <div className="empty-chat-mark">
          <MessageCircle size={54} strokeWidth={1.3} />
        </div>
        <h2>С кем поговорим?</h2>
        <p>Выбери чат слева или начни новую переписку.</p>
        <button className="button primary" onClick={onNewChat}>
          <Plus size={18} />
          Новый чат
        </button>
        <span className="session-hint">Переписка хранится, пока открыта эта вкладка</span>
      </section>
    );
  return (
    <section className="conversation" aria-label={`Переписка с ${chat.name}`}>
      <header className="conversation-header">
        <button className="icon-button mobile-back" aria-label="Назад к чатам" onClick={onBack}>
          <ArrowLeft size={22} />
        </button>
        <Avatar name={chat.name} id={chat.id} />
        <div className="recipient">
          <h2>{chat.name}</h2>
          <span>
            {chat.phone && chat.name !== formatPhone(chat.phone)
              ? formatPhone(chat.phone)
              : 'Личный чат · MAX'}
          </span>
        </div>
      </header>
      <div
        className="message-area"
        ref={scroll}
        onScroll={() => {
          const element = scroll.current!;
          atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
          setShowScroll(!atBottom.current);
        }}
      >
        {messages.length === 0 ? (
          <div className="first-message">
            <span>
              <MessageCircle size={26} strokeWidth={1.6} />
            </span>
            <h3>Можно начинать</h3>
            <p>
              Напиши первое сообщение.
              <br />
              Ответ появится прямо здесь.
            </p>
          </div>
        ) : (
          <div
            className="message-list"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="Сообщения"
          >
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const newDay =
                !previous ||
                new Date(previous.timestamp).toDateString() !==
                  new Date(message.timestamp).toDateString();
              return (
                <div key={message.id} className="message-group">
                  {newDay && (
                    <div className="date-divider">
                      <span>{dayLabel(message.timestamp)}</span>
                    </div>
                  )}
                  <div className={`message-line ${message.direction}`}>
                    <div
                      className={`message-bubble ${message.status === 'failed' || message.status === 'uncertain' ? 'message-problem' : ''}`}
                    >
                      {message.quote && <blockquote>{message.quote}</blockquote>}
                      <p className="message-text">{message.text}</p>
                      <div className="message-meta">
                        <time dateTime={new Date(message.timestamp).toISOString()}>
                          {new Date(message.timestamp).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        <MessageState message={message} />
                      </div>
                      {message.error && (
                        <p className="message-error">
                          <CircleAlert size={14} />
                          {message.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showScroll && (
        <button
          className="scroll-bottom icon-button"
          aria-label="К последним сообщениям"
          onClick={() => {
            scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
          }}
        >
          <ArrowDown size={21} />
        </button>
      )}
      <div className="composer-area">
        <form className={`composer ${tooLong ? 'composer-invalid' : ''}`} onSubmit={submit}>
          <textarea
            ref={input}
            aria-label="Сообщение"
            placeholder="Написать сообщение…"
            value={draft}
            rows={1}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <button
            className="send-button"
            type="submit"
            disabled={!canSend}
            aria-label={sending ? 'Отправляется' : 'Отправить сообщение'}
            title="Отправить"
          >
            {sending ? <LoaderCircle className="spin" size={21} /> : <Send size={21} />}
          </button>
        </form>
        <div className="composer-hint">
          <span>
            {disabled
              ? 'Отправка доступна после восстановления подключения'
              : 'Enter — отправить · Shift + Enter — новая строка'}
          </span>
          <span className={tooLong ? 'error-text' : ''}>
            {draft.length > 0 && `${draft.length} / 4000`}
          </span>
        </div>
      </div>
    </section>
  );
}
