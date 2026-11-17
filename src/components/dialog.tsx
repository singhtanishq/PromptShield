import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './ui';

/**
 * Accessible modal dialog: portal rendering, focus trap, Escape to close,
 * focus restoration, aria-modal labelling, and background scroll lock.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);
    // Move focus into the dialog (title close button if present, else panel).
    window.requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select',
      );
      (target ?? panelRef.current)?.focus();
    });
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown, true);
      if (
        previouslyFocused.current instanceof HTMLElement &&
        document.contains(previouslyFocused.current)
      ) {
        previouslyFocused.current.focus();
      }
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-[rgb(var(--c-bg-subtle))]/80 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[85vh] w-full ${width} flex-col overflow-hidden rounded-xl
          border border-line bg-surface shadow-overlay outline-none`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {description !== undefined && (
              <p className="mt-0.5 text-2xs leading-snug text-ink-faint">{description}</p>
            )}
          </div>
          <IconButton label="Close dialog" size="sm" onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="scroll-slim flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {actions !== undefined && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-4 py-3">
            {actions}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation dialog helper wrapper. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      actions={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`h-9 rounded-md px-3 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-danger hover:brightness-95' : 'bg-accent hover:bg-accent-strong'
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-muted">{body}</div>
    </Dialog>
  );
}
