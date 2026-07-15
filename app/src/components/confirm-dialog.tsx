'use client';

// Shared confirmation dialog for destructive actions. Cancel is the prominent,
// default (focused) action; the destructive confirm is de-emphasized so the
// safe choice is the obvious one. Escape or a backdrop click cancels. Used by
// trip deletion and booking removal so they look and behave identically.

import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    cancelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 text-foreground shadow-[var(--shadow-md)]"
      >
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {message && <p className="mt-1 text-sm text-muted">{message}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          {/* Destructive action, intentionally de-emphasized. */}
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-full px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {confirmLabel}
          </button>
          {/* Prominent, default (focused) action. */}
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
