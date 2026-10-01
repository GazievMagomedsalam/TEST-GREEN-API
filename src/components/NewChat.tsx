import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleAlert, LoaderCircle, MessageSquarePlus, X } from 'lucide-react';
import { describeError } from '../lib/greenApi';

export function NewChat({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (phone: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPhone('');
      setError('');
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(phone);
      onClose();
    } catch (error) {
      setError(describeError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="new-chat-dialog"
      aria-labelledby="new-chat-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !busy) onClose();
      }}
    >
      <div className="dialog-top">
        <span className="dialog-icon">
          <MessageSquarePlus size={23} />
        </span>
        <button className="icon-button" aria-label="Закрыть" disabled={busy} onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <h2 id="new-chat-title">Новый чат</h2>
      <p className="muted">Введи номер человека, которому хочешь написать.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          Номер телефона
          <input
            autoFocus
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setError('');
            }}
            placeholder="+7 999 123-45-67"
            required
            disabled={busy}
          />
          <small>Номера России (+7) и Беларуси (+375).</small>
        </label>
        {error && (
          <p className="form-error" role="alert">
            <CircleAlert size={17} />
            {error}
          </p>
        )}
        <button className="button primary full" type="submit" disabled={busy || !phone.trim()}>
          {busy && <LoaderCircle size={18} className="spin" />}
          {busy ? 'Ищем в MAX…' : 'Открыть чат'}
        </button>
      </form>
    </dialog>
  );
}
