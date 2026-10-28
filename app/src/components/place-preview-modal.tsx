'use client';

import { useEffect } from 'react';
import type { PlaceSuggestion } from '@/lib/places/types';
import { gmapsSearchUrl } from '@/lib/gmaps';
import { PlacePreviewCard } from './place-preview-card';

// Renders from the autocomplete suggestion only — no details fetch; that
// happens at add-time (parent's pick/submit path).
export function PlacePreviewModal({
  prediction,
  adding,
  onClose,
  onConfirm,
}: {
  prediction: PlaceSuggestion;
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

  const name = prediction.name;
  const address = prediction.secondary;

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
        <PlacePreviewCard
          name={name}
          address={address}
          gmapsUrl={gmapsSearchUrl({ name: prediction.name, address: prediction.secondary, lat: prediction.lat, lng: prediction.lng, placeIdExternal: prediction.id })}
          adding={adding}
          onClose={onClose}
          onAdd={onConfirm}
        />
      </div>
    </div>
  );
}
