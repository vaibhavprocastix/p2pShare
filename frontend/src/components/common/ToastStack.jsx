import { useSession } from '../../context/SessionContext.jsx';

export default function ToastStack() {
  const { toasts } = useSession();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="assertive">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.type ? ' toast--' + t.type : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
