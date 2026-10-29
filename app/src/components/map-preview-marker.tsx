'use client';

import { useState } from 'react';
import type { MapPreview } from '@/lib/map-preview';
import { PlacePreviewCard } from './place-preview-card';
import { PreviewPin } from './map-pin';
import { usePopupDismiss } from './use-popup-dismiss';

// The search-preview pin: an unnumbered dashed drop with a `+` so it never
// reads as a trip stop (map-pin.tsx). Purely visual; clicks on it do nothing.
export function PreviewMarker({ name }: { name: string }) {
  return <PreviewPin name={name} />;
}

// Popup body for the preview pin (both renderers). "Adding…" is local: a
// successful add clears the preview; a failed start (onAdd → false) resets it.
// Mount with key={preview.id} so it resets per previewed place. A labelled
// group with Esc + focus return, like PinCard (usePopupDismiss).
export function PreviewPopupBody({ preview, near }: { preview: MapPreview; near?: string | null }) {
  const [adding, setAdding] = useState(false);
  const { ref, onKeyDown, close } = usePopupDismiss(preview.onClose);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Preview: ${preview.name}`}
      onKeyDown={onKeyDown}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <PlacePreviewCard
        compact
        name={preview.name}
        address={preview.address}
        near={near}
        gmapsUrl={preview.gmapsUrl}
        photo={preview.photo}
        addLabel={`Add to ${preview.dayLabel}`}
        adding={adding}
        onClose={close}
        onAdd={async () => {
          setAdding(true);
          const ok = await preview.onAdd();
          if (!ok) setAdding(false);
        }}
      />
    </div>
  );
}
