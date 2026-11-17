import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

/* eslint-disable react-refresh/only-export-components */

/**
 * Polished, accessible notifications.
 *
 * PRIVACY INVARIANT: toasts carry short, fixed action/status strings supplied by
 * call sites (e.g. "Copied sanitized text"). They must never include prompt text,
 * detected values, or placeholders derived from them.
 */
export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showToast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4200;

const KIND_STYLES: Record<ToastKind, { chip: string; icon: ReactNode; label: string }> = {
  info: {
    chip: 'border-line bg-surface text-ink',
    icon: <Info aria-hidden="true" className="h-4 w-4 text-info" />,
    label: 'Notice',
  },
  success: {
    chip: 'border-line bg-surface text-ink',
    icon: <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />,
    label: 'Success',
  },
  error: {
    chip: 'border-line bg-surface text-ink',
    icon: <XCircle aria-hidden="true" className="h-4 w-4 text-danger" />,
    label: 'Error',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((kind: ToastKind, message: string): void => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
  }, []);

  return (
    <ToastContext.Provider value={useMemo(() => ({ showToast }), [showToast])}>
      {children}
      {/* polite live region: announces notifications without interrupting */}
      <div
        role="status"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [render, setRender] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setRender(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id]);

  if (!render) return null;
  const style = KIND_STYLES[toast.kind];

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-pop ${style.chip}`}
      role="status"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {style.icon}
      </span>
      <span className="sr-only">{style.label}:</span>
      <p className="min-w-0 flex-1 text-sm leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-sm p-0.5 text-ink-faint transition-colors hover:text-ink"
        aria-label={`Dismiss notification: ${toast.message}`}
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
