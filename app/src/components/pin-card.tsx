'use client';

import { Close } from '@/components/icons';
import { gmapsSearchUrl } from '@/lib/gmaps';
import type { Pin } from '@/lib/map-helpers';
import { PreviewPhoto } from './place-preview-card';
import { usePinPhoto } from './use-pin-photo';

// Active-pin popup (TP-0062 follow-up): photo with its author attribution
// (Google places only), name, details, and the Google Maps link Google
// requires next to its photos. Hover keeps the light tooltip (no image load).
// ✕ closes it — the only way out on touch, where the card covers its pin.
export function PinCard({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const photo = usePinPhoto(pin.googleId);
  const meta = [pin.category, pin.time].filter(Boolean).join(' · ');
  return (
    <div
      role="dialog"
      aria-label={pin.name ?? `Stop ${pin.idx}`}
      style={{ padding: 12, width: 240, maxWidth: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: '#1d1d1f' }}
    >
      {photo ? <PreviewPhoto key={photo.name} photo={photo} compact /> : null}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{pin.name ?? `Stop ${pin.idx}`}</div>
        {/* 16px icon, 32px tap target; the negative margin keeps the row height. */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ background: 'none', border: 'none', padding: 8, margin: -8, cursor: 'pointer', color: '#6e6e73', lineHeight: 0 }}
        >
          <Close width={16} height={16} />
        </button>
      </div>
      {meta ? <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2 }}>{meta}</div> : null}
      <a
        href={gmapsSearchUrl({ name: pin.name ?? '', address: null, lat: pin.lat, lng: pin.lng, placeIdExternal: pin.googleId ?? null })}
        target="_blank"
        rel="noreferrer noopener"
        style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#0f766e' }}
      >
        View on Google Maps ↗
      </a>
    </div>
  );
}
