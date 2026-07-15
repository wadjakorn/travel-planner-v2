'use client';

// Trip delete trigger with a confirmation step. A single click no longer
// deletes: it opens a dialog where Cancel is the prominent/default action and
// the destructive Delete is de-emphasized, so an accidental click can't destroy
// a trip. Escape or a backdrop click cancels. Deletion itself still runs the
// server action passed from the (server-component) TripCard.

import { useEffect, useRef, useState } from 'react';
import { Trash } from '@/components/icons';

type Props = {
  tripId: string;
  title: string;
  onDelete: (formData: FormData) => Promise<void>;
};

export function TripDeleteButton({ tripId, title, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    // Focus the safe default (Cancel) when the dialog opens.
    cancelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Delete trip"
        aria-label="Delete trip"
        aria-haspopup="dialog"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-zinc-600 backdrop-blur transition-colors hover:bg-white hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash width={14} height={14} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete trip"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 text-foreground shadow-[var(--shadow-md)]"
          >
            <h2 className="text-base font-semibold tracking-tight">
              Delete this trip?
            </h2>
            <p className="mt-1 text-sm text-muted">
              “{title}” will be removed from your trips.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              {/* Destructive action, intentionally de-emphasized. */}
              <form action={onDelete}>
                <input type="hidden" name="tripId" value={tripId} />
                <button
                  type="submit"
                  className="rounded-full px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Delete
                </button>
              </form>
              {/* Prominent, default (focused) action. */}
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
