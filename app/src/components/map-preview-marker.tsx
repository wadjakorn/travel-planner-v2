'use client';

import { useState } from 'react';
import type { MapPreview } from '@/lib/map-preview';
import { PlacePreviewCard } from './place-preview-card';

// The search-preview pin: unnumbered and ringed so it never reads as a trip
// stop. Purely visual; clicks on it do nothing.
export function PreviewMarker({ name }: { name: string }) {
  return (
    <div
      role="img"
      aria-label={`Preview: ${name}`}
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: 'rgba(15,118,110,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'tp-preview-pulse 1.6s ease-out infinite',
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#0f766e',
          border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      />
    </div>
  );
}

// Popup body for the preview pin (both renderers). "Adding…" is local: a
// successful add clears the preview; a failed start (onAdd → false) resets it.
// Mount with key={preview.id} so it resets per previewed place.
export function PreviewPopupBody({ preview }: { preview: MapPreview }) {
  const [adding, setAdding] = useState(false);
  return (
    <div role="dialog" aria-label={`Preview: ${preview.name}`} style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <PlacePreviewCard
        compact
        name={preview.name}
        address={preview.address}
        gmapsUrl={preview.gmapsUrl}
        photo={preview.photo}
        addLabel={`Add to ${preview.dayLabel}`}
        adding={adding}
        onClose={preview.onClose}
        onAdd={async () => {
          setAdding(true);
          const ok = await preview.onAdd();
          if (!ok) setAdding(false);
        }}
      />
    </div>
  );
}
