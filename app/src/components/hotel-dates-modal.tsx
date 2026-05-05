'use client';

import { useEffect, useState } from 'react';

export type HotelDates = {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
};

export function HotelDatesModal({
  name,
  submitting,
  initial,
  onCancel,
  onConfirm,
}: {
  name: string;
  submitting: boolean;
  initial?: Partial<HotelDates>;
  onCancel: () => void;
  onConfirm: (dates: HotelDates) => void;
}) {
  const [ci, setCi] = useState(initial?.checkInDate ?? '');
  const [ct, setCt] = useState(initial?.checkInTime ?? '15:00');
  const [co, setCo] = useState(initial?.checkOutDate ?? '');
  const [cot, setCot] = useState(initial?.checkOutTime ?? '11:00');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ci || !co) {
      setErr('Pick check-in and check-out dates.');
      return;
    }
    if (co < ci) {
      setErr('Check-out must be on or after check-in.');
      return;
    }
    setErr(null);
    onConfirm({ checkInDate: ci, checkInTime: ct, checkOutDate: co, checkOutTime: cot });
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #d2d2d7',
    fontSize: 14,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stay dates"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 460,
          width: '100%',
          padding: 24,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
          Stay dates
        </h2>
        <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 4 }}>{name}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div>
            <div style={labelStyle}>Check-in date</div>
            <input type="date" required value={ci} onChange={(e) => setCi(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Check-in time</div>
            <input type="time" value={ct} onChange={(e) => setCt(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Check-out date</div>
            <input type="date" required value={co} onChange={(e) => setCo(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Check-out time</div>
            <input type="time" value={cot} onChange={(e) => setCot(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {err ? (
          <div style={{ color: '#c8102e', fontSize: 13, marginTop: 10 }}>{err}</div>
        ) : null}

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
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#1d1d1f',
              color: '#fff',
              fontSize: 14,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? 'Adding…' : 'Add hotel'}
          </button>
        </div>
      </form>
    </div>
  );
}
