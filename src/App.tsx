import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { CircleAlert, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { Credentials } from './types';
import { createGreenApi } from './lib/greenApi';
import { useChat } from './hooks/useChat';
import { Connect } from './components/Connect';
import { Sidebar } from './components/Sidebar';
import { Conversation } from './components/Conversation';
import { NewChat } from './components/NewChat';

function Messenger({ credentials, onLogout }: { credentials: Credentials; onLogout: () => void }) {
  const api = useMemo(() => createGreenApi(credentials), [credentials]);
  const chat = useChat(api, credentials);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const active = chat.state.chats.find((item) => item.id === chat.state.activeId);
  const messages = active ? (chat.state.messages[active.id] ?? []) : [];
  const draft = active ? (drafts[active.id] ?? '') : '';
  const disabled = chat.connection.kind !== 'connected' || Boolean(chat.instanceIssue);
  const connectionError =
    chat.instanceIssue || (chat.connection.kind !== 'connected' ? chat.connection.message : '');

  // Браузерный инструмент открывает только форму, без отправки сообщений.
  useEffect(() => {
    type ToolContext = {
      registerTool: (
        tool: Record<string, unknown>,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'start_new_chat',
            title: 'Открыть форму нового чата',
            description:
              'Открывает форму ввода номера в MAX. Не создаёт чат и не отправляет сообщения.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              if (
                !input ||
                typeof input !== 'object' ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error('Параметры не требуются.');
              flushSync(() => setNewChatOpen(true));
              return { opened: true };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Отсутствие поддержки не влияет на обычный чат. */
    }
    return () => controller.abort();
  }, []);

  async function send() {
    if (!active || disabled) return;
    const chatId = active.id;
    const text = drafts[chatId] ?? '';
    const sent = await chat.send(chatId, text);
    // Не стираем новый черновик, который пользователь успел написать за время запроса.
    if (sent)
      setDrafts((previous) =>
        previous[chatId] === text ? { ...previous, [chatId]: '' } : previous,
      );
  }
  function logout() {
    if (
      (chat.state.chats.length || Object.values(drafts).some(Boolean)) &&
      !window.confirm(
        'Отключиться? Переписка и черновики этой вкладки будут очищены. Сообщения в MAX останутся.',
      )
    )
      return;
    onLogout();
  }
  return (
    <main className={`messenger ${active ? 'has-active-chat' : ''}`}>
      <Sidebar
        state={chat.state}
        connection={chat.connection}
        idInstance={credentials.idInstance}
        onSelect={chat.select}
        onNewChat={() => setNewChatOpen(true)}
        onLogout={logout}
        onReconnect={chat.reconnect}
      />
      <div className="conversation-container">
        {connectionError && (
          <div className={`connection-banner ${chat.connection.kind}`} role="status">
            {chat.connection.kind === 'paused' || chat.instanceIssue ? (
              <CircleAlert size={18} />
            ) : (
              <LoaderCircle className="spin" size={18} />
            )}
            <span>{connectionError}</span>
            {(chat.connection.kind === 'paused' || chat.instanceIssue) && (
              <button className="text-button" onClick={chat.reconnect}>
                <RefreshCw size={16} />
                Проверить
              </button>
            )}
          </div>
        )}
        {chat.notice && (
          <div className="connection-banner" role="alert">
            <CircleAlert size={18} />
            <span>{chat.notice}</span>
            <button
              className="icon-button"
              aria-label="Закрыть уведомление"
              onClick={chat.dismissNotice}
            >
              <X size={17} />
            </button>
          </div>
        )}
        <Conversation
          chat={active}
          messages={messages}
          draft={draft}
          onDraft={(value) => {
            if (active) setDrafts((previous) => ({ ...previous, [active.id]: value }));
          }}
          sending={active ? chat.sendingChats.has(active.id) : false}
          disabled={disabled}
          onSend={send}
          onBack={() => chat.select(null)}
          onNewChat={() => setNewChatOpen(true)}
        />
      </div>
      <NewChat open={newChatOpen} onClose={() => setNewChatOpen(false)} onCreate={chat.openChat} />
    </main>
  );
}

export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  return credentials ? (
    <Messenger credentials={credentials} onLogout={() => setCredentials(null)} />
  ) : (
    <Connect onConnect={setCredentials} />
  );
}
