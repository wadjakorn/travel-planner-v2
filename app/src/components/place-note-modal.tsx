'use client';

import { useEffect, useRef, useState } from 'react';
import baseStyles from './trip-create-form.module.css';
import signInStyles from '@/app/sign-in/sign-in.module.css';

type Props = {
  placeId: string;
  placeName: string;
  initialNote: string | null;
  action: (fd: FormData) => Promise<void>;
  onClose: () => void;
  onSaved?: () => void;
};

export function PlaceNoteModal({ placeId, placeName, initialNote, action, onClose, onSaved }: Props) {
  const [note, setNote] = useState(initialNote ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.setSelectionRange(taRef.current.value.length, taRef.current.value.length);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set('placeId', placeId);
    fd.set('note', note);
    setSubmitting(true);
    setError(null);
    try {
      await action(fd);
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit note for ${placeName}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: '#1d1d1f' }}>
          Note
        </h2>
        <div style={{ fontSize: 13, color: '#6e6e73', marginBottom: 14 }}>{placeName}</div>

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
            <div style={{ color: '#c8102e', fontSize: 13, padding: '4px 0' }}>{error}</div>
          ) : null}

          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            <button type="button" onClick={onClose} className={baseStyles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={signInStyles.btn}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
