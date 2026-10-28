'use client';

import type { MapPreviewPhoto } from '@/lib/map-preview';
import { useState } from 'react';
import { Close } from '@/components/icons';
import { usePhotoUri } from './use-photo-uri';

// The place preview body, shared by PlacePreviewModal (search-result tap) and
// the trip map's preview popup (compact). Renders from suggestion-level data
// only; full details load at add-time.
export function PlacePreviewCard({
  name,
  address,
  gmapsUrl,
  photo,
  addLabel,
  adding,
  onClose,
  onAdd,
  compact,
}: {
  name: string;
  address: string | null;
  gmapsUrl: string;
  photo?: MapPreviewPhoto | null;
  addLabel?: string;
  adding: boolean;
  onClose: () => void;
  onAdd: () => void;
  compact?: boolean;
}) {
  const btn = {
    padding: compact ? '8px 12px' : '10px 16px',
    borderRadius: 10,
    border: '1px solid #d2d2d7',
    background: '#fff',
    color: '#1d1d1f',
    fontSize: compact ? 13 : 14,
    cursor: 'pointer',
  } as const;
  const addBtn = {
    ...btn,
    border: 'none',
    background: '#1d1d1f',
    color: '#fff',
    cursor: adding ? 'not-allowed' : 'pointer',
    opacity: adding ? 0.5 : 1,
  } as const;

  return (
    <div style={{ padding: compact ? 12 : 20, width: compact ? 260 : undefined, maxWidth: '100%' }}>
      {photo ? <PreviewPhoto key={photo.name} photo={photo} compact={compact} /> : null}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <h2 style={{ fontSize: compact ? 15 : 20, fontWeight: 600, margin: 0, color: '#1d1d1f', flex: 1 }}>
          {name}
        </h2>
        {compact ? (
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#6e6e73', lineHeight: 0 }}
          >
            <Close width={16} height={16} />
          </button>
        ) : null}
      </div>
      {address ? (
        <div style={{ fontSize: compact ? 12 : 13, color: '#6e6e73', marginTop: 4 }}>{address}</div>
      ) : null}

      <p style={{ fontSize: compact ? 12 : 13, color: '#86868b', marginTop: compact ? 8 : 12, lineHeight: 1.5 }}>
        Full details load once you add this place to your day.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: compact ? 12 : 20,
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          flexDirection: compact ? 'column' : undefined,
        }}
      >
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{ ...btn, textDecoration: 'none', marginRight: compact ? undefined : 'auto', textAlign: 'center' }}
        >
          View on Google Maps
        </a>
        {compact ? null : (
          <button type="button" onClick={onClose} style={btn}>
            Close
          </button>
        )}
        <button type="button" disabled={adding} onClick={onAdd} style={addBtn}>
          {adding ? 'Adding…' : addLabel ?? 'Add to day'}
        </button>
      </div>
    </div>
  );
}

// Google requires the photo's author attribution next to the image, and a
// "Google Maps" attribution for Places content (the trip map may be MapLibre).
// The box keeps its height while the URL resolves (no jump); a failure (budget
// spent, expired ref) hides the whole figure.
export function PreviewPhoto({ photo, compact }: { photo: MapPreviewPhoto; compact?: boolean }) {
  const uri = usePhotoUri(photo.name);
  const [broken, setBroken] = useState(false);
  if (uri === null || broken) return null;
  const box = { display: 'block', width: '100%', height: compact ? 120 : 160, borderRadius: 10, background: '#f2f2f7' } as const;
  return (
    <figure style={{ margin: `0 0 ${compact ? 8 : 12}px` }}>
      {uri ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived Google URL; next/image would re-proxy and cache it
        <img src={uri} alt="" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover' }} />
      ) : (
        <div aria-hidden style={box} />
      )}
      <figcaption style={{ fontSize: 11, color: '#86868b', marginTop: 4 }}>
        {photo.attributions.length > 0 ? (
          <>
            Photo:{' '}
            {photo.attributions.map((a, i) => (
              <span key={i}>
                {i > 0 ? ', ' : null}
                {a.uri ? (
                  <a href={a.uri} target="_blank" rel="noreferrer noopener" style={{ color: 'inherit' }}>
                    {a.name}
                  </a>
                ) : (
                  a.name
                )}
              </span>
            ))}
            {' · '}
          </>
        ) : null}
        Google Maps
      </figcaption>
    </figure>
  );
}
