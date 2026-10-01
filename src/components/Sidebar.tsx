import { LogOut, MessageCircle, Plus } from 'lucide-react';
import type { ChatState, ConnectionStatus } from '../types';
import { sortedChats } from '../lib/chatState';
import { Brand } from './Brand';

export function Avatar({ name, id }: { name: string; id: string }) {
  const colors = ['violet', 'blue', 'mint', 'rose', 'amber'];
  const number = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const initials = name.startsWith('+')
    ? name.replace(/\D/g, '').slice(-2)
    : name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('');
  return (
    <span className={`avatar avatar-${colors[number % colors.length]}`} aria-hidden="true">
      {initials.toUpperCase()}
    </span>
  );
}

export function Sidebar({
  state,
  connection,
  idInstance,
  onSelect,
  onNewChat,
  onLogout,
  onReconnect,
}: {
  state: ChatState;
  connection: ConnectionStatus;
  idInstance: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onLogout: () => void;
  onReconnect: () => void;
}) {
  const chats = sortedChats(state);
  return (
    <aside className="sidebar" aria-label="Чаты">
      <div className="sidebar-brand">
        <Brand small />
        <span className="integration-label">GREEN-API</span>
      </div>
      <div className="sidebar-heading">
        <h1>
          Сообщения <span>{chats.length > 0 && chats.length}</span>
        </h1>
        <button
          className="icon-button new-chat-button"
          title="Новый чат"
          aria-label="Новый чат"
          onClick={onNewChat}
        >
          <Plus size={23} />
        </button>
      </div>
      <div className="chat-list">
        {chats.length === 0 ? (
          <div className="no-chats">
            <MessageCircle size={29} strokeWidth={1.5} />
            <h2>Здесь будут твои чаты</h2>
            <p>Начни переписку по номеру телефона.</p>
            <button className="text-button" onClick={onNewChat}>
              Создать первый чат
            </button>
          </div>
        ) : (
          chats.map((chat) => {
            const last = state.messages[chat.id]?.at(-1);
            const hasError = last?.status === 'failed' || last?.status === 'uncertain';
            return (
              <button
                className={`chat-row ${state.activeId === chat.id ? 'selected' : ''}`}
                key={chat.id}
                onClick={() => onSelect(chat.id)}
                aria-current={state.activeId === chat.id ? 'true' : undefined}
              >
                <Avatar name={chat.name} id={chat.id} />
                <span className="chat-row-content">
                  <span className="chat-row-title">
                    <strong>{chat.name}</strong>
                    {last && (
                      <time dateTime={new Date(last.timestamp).toISOString()}>
                        {new Date(last.timestamp).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    )}
                  </span>
                  <span className="chat-row-preview">
                    <span className={hasError ? 'error-text' : ''}>
                      {last
                        ? `${hasError ? 'Не отправлено · ' : last.direction === 'outgoing' ? 'Ты: ' : ''}${last.text}`
                        : 'Пока нет сообщений'}
                    </span>
                    {chat.unread > 0 && (
                      <span className="unread" aria-label={`${chat.unread} непрочитанных`}>
                        {chat.unread > 99 ? '99+' : chat.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
      {connection.kind !== 'connected' && (
        <div className="sidebar-notice" role="status">
          <p>{connection.message}</p>
          {connection.kind === 'paused' && (
            <button className="text-button" onClick={onReconnect}>
              Проверить подключение
            </button>
          )}
        </div>
      )}
      <div className="sidebar-footer">
        <div className="account-icon">Я</div>
        <div className="account-details">
          <strong>Инстанс {idInstance}</strong>
          <span>
            <i className={`status-dot ${connection.kind}`} />
            {connection.kind === 'connected'
              ? 'Подключено к MAX'
              : connection.kind === 'paused'
                ? 'Требуется проверка'
                : connection.kind === 'waiting'
                  ? 'Другая вкладка'
                  : 'Подключаемся…'}
          </span>
        </div>
        <button
          className="icon-button"
          aria-label="Отключиться"
          title="Отключиться"
          onClick={onLogout}
        >
          <LogOut size={19} />
        </button>
      </div>
    </aside>
  );
}
