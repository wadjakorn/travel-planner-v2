'use client';

import { useState } from 'react';
import type { MapPreview } from '@/lib/map-preview';
import { PlacePreviewCard } from './place-preview-card';
import { PreviewPin } from './map-pin';

// The search-preview pin: an unnumbered dashed drop with a `+` so it never
// reads as a trip stop (map-pin.tsx). Purely visual; clicks on it do nothing.
export function PreviewMarker({ name }: { name: string }) {
  return <PreviewPin name={name} />;
}

// Popup body for the preview pin (both renderers). "Adding…" is local: a
// successful add clears the preview; a failed start (onAdd → false) resets it.
// Mount with key={preview.id} so it resets per previewed place.
export function PreviewPopupBody({ preview, near }: { preview: MapPreview; near?: string | null }) {
  const [adding, setAdding] = useState(false);
  return (
    <div role="dialog" aria-label={`Preview: ${preview.name}`} style={{ fontFamily: 'var(--font-sans)' }}>
      <PlacePreviewCard
        compact
        name={preview.name}
        address={preview.address}
        near={near}
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
