'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './segment-mode-picker.module.css';

type Mode = 'drive' | 'walk' | 'transit' | 'mixed';

type Props = {
  dayId: string;
  defaultMode: 'drive' | 'walk' | 'transit' | null;
  setDayDefaultModeAction: (formData: FormData) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
};

export function DayModePicker({
  dayId,
  defaultMode,
  setDayDefaultModeAction,
  onBusyChange,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    onBusyChange?.(isPending);
  }, [isPending, onBusyChange]);
  const value: Mode = defaultMode ?? 'mixed';
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);

  function commit(next: Mode) {
    const fd = new FormData();
    fd.set('dayId', dayId);
    fd.set('mode', next);
    startTransition(async () => {
      try {
        await setDayDefaultModeAction(fd);
        router.refresh();
      } catch {
        // ignore
      }
    });
  }

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Mode;
    if (!next || next === value) return;
    if (next === 'mixed') {
      commit(next);
      return;
    }
    setPendingMode(next);
  }

  return (
    <>
      <select
        className={styles.picker}
        value={value}
        onChange={onChange}
        disabled={isPending}
        aria-label="Day default travel mode"
        title="Override travel mode for all segments in this day"
      >
        <option value="mixed">Mixed</option>
        <option value="drive">All Drive</option>
        <option value="walk">All Walk</option>
        <option value="transit">All Transit</option>
      </select>

      {pendingMode ? (
        <ConfirmModal
          title="Override day mode?"
          message={`Override every segment in this day to "${pendingMode}"? This replaces individual settings.`}
          confirmLabel="Override"
          onCancel={() => setPendingMode(null)}
          onConfirm={() => {
            const m = pendingMode;
            setPendingMode(null);
            commit(m);
          }}
        />
      ) : null}
    </>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 200,
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
          maxWidth: 420,
          width: '100%',
          padding: 20,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: '#424245', marginTop: 8, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #d2d2d7',
              background: '#fff',
              color: '#1d1d1f',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#1d1d1f',
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
