'use client';

import { useEffect, useRef, useState } from 'react';
import baseStyles from './trip-create-form.module.css';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import { Modal } from '@/components/ui';
import { ConfirmDialog } from './confirm-dialog';

type Props = {
  placeId: string;
  placeName: string;
  initialNote: string | null;
  action: (fd: FormData) => Promise<void>;
  onClose: () => void;
};

export function PlaceNoteModal({ placeId, placeName, initialNote, action, onClose }: Props) {
  const [note, setNote] = useState(initialNote ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.setSelectionRange(taRef.current.value.length, taRef.current.value.length);
  }, []);

  // Escape and the scrim go through here, same as the booking and expense
  // forms: an edited note is not thrown away without asking.
  function requestClose() {
    if (note !== (initialNote ?? '')) setConfirmDiscard(true);
    else onClose();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set('placeId', placeId);
    fd.set('note', note);
    setSubmitting(true);
    setError(null);
    try {
      await action(fd);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <Modal open onRequestClose={requestClose} title={`Edit note for ${placeName}`} size="sm">
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: 'var(--foreground)' }}>
          Note
        </h2>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>{placeName}</div>

        <form onSubmit={onSubmit} className={baseStyles.form}>
          <div className={baseStyles.field}>
            <textarea
              ref={taRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Add a short note…"
              className={baseStyles.input}
              style={{ resize: 'vertical', minHeight: 96, fontFamily: 'inherit' }}
            />
          </div>

          {error ? (
            <div style={{ color: 'var(--danger)', fontSize: 13, padding: '4px 0' }}>{error}</div>
          ) : null}

          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            <button type="button" onClick={requestClose} className={baseStyles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={signInStyles.btn}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="Your edits to this note will be lost."
        confirmLabel="Discard"
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </Modal>
  );
}
