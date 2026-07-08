'use client';

import { useEffect } from 'react';
import { type Prediction } from '@/lib/places-adapter';

// Renders from the free autocomplete suggestion only — no Place Details fetch.
// The paid Details call is deferred to add-time (parent's pick path), so
// abandoned previews cost nothing.
export function HotelPreviewModal({
  prediction,
  adding,
  onClose,
  onConfirm,
}: {
  prediction: Prediction;
  adding: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = prediction.structured_formatting.main_text;
  const address = prediction.structured_formatting.secondary_text;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
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
          maxWidth: 520,
          width: '100%',
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ padding: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
            {name}
          </h2>
          {address ? (
            <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 4 }}>{address}</div>
          ) : null}

          <p style={{ fontSize: 13, color: '#86868b', marginTop: 12, lineHeight: 1.5 }}>
            Full details load once you add this hotel.
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                name,
              )}&query_place_id=${prediction.place_id}`}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #d2d2d7',
                background: '#fff',
                color: '#1d1d1f',
                fontSize: 14,
                cursor: 'pointer',
                textDecoration: 'none',
                marginRight: 'auto',
              }}
            >
              View on Google Maps
            </a>
            <button
              type="button"
              onClick={onClose}
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
              Close
            </button>
            <button
              type="button"
              disabled={adding}
              onClick={onConfirm}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#1d1d1f',
                color: '#fff',
                fontSize: 14,
                cursor: adding ? 'not-allowed' : 'pointer',
                opacity: adding ? 0.5 : 1,
              }}
            >
              {adding ? 'Adding…' : 'Add hotel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
