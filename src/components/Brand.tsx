import { MessageCircle } from 'lucide-react';
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-icon">
        <MessageCircle size={small ? 21 : 26} strokeWidth={2.4} />
      </span>
      <span className="brand-word">
        MAX<span className="brand-caption">чат</span>
      </span>
    </div>
  );
}
