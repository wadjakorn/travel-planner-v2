'use client';

import { gmapsSearchUrl } from '@/lib/gmaps';
import type { Pin } from '@/lib/map-helpers';
import { PreviewPhoto } from './place-preview-card';
import { usePinPhoto } from './use-pin-photo';

// Active-pin popup for an added Google place (TP-0062 follow-up): photo with
// its author attribution, name, details, and the Google Maps link Google
// requires next to its photos. Hover keeps the light tooltip (no image load).
export function PinCard({ pin }: { pin: Pin }) {
  const photo = usePinPhoto(pin.googleId);
  const meta = [pin.category, pin.time].filter(Boolean).join(' · ');
  return (
    <div
      role="dialog"
      aria-label={pin.name ?? `Stop ${pin.idx}`}
      style={{ padding: 12, width: 240, maxWidth: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: '#1d1d1f' }}
    >
      {photo ? <PreviewPhoto key={photo.src} photo={photo} compact /> : null}
      <div style={{ fontSize: 14, fontWeight: 600 }}>{pin.name ?? `Stop ${pin.idx}`}</div>
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
