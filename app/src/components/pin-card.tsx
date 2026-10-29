'use client';

import { Close } from '@/components/icons';
import { gmapsSearchUrl } from '@/lib/gmaps';
import type { Pin } from '@/lib/map-helpers';
import { PreviewPhoto, PreviewPhotoLoading } from './place-preview-card';
import { usePinPhoto } from './use-pin-photo';
import { usePopupDismiss } from './use-popup-dismiss';
import styles from './pin-card.module.css';

function pinMeta(pin: Pin): string {
  return [pin.category, pin.time].filter(Boolean).join(' · ');
}

// Active-pin popup (TP-0062 follow-up): photo with its author attribution
// (Google places only), name, details, and the Google Maps link Google
// requires next to its photos. Hover keeps the light tooltip (no image load).
// ✕ closes it — the only way out on touch, where the card covers its pin.
// A labelled group, not a dialog: it opens on every row press / pin tap
// without taking focus, so keyboard list navigation is never interrupted.
// Esc closes it and returns focus to the map region (usePopupDismiss).
export function PinCard({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const photo = usePinPhoto(pin.googleId);
  const meta = pinMeta(pin);
  const { ref, onKeyDown, close } = usePopupDismiss(onClose);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={pin.name ?? `Stop ${pin.idx}`}
      onKeyDown={onKeyDown}
      className={styles.card}
    >
      {photo === undefined ? (
        <PreviewPhotoLoading compact />
      ) : photo ? (
        <PreviewPhoto key={photo.name} photo={photo} compact />
      ) : null}
      <div className={styles.head}>
        <div className={styles.title}>{pin.name ?? `Stop ${pin.idx}`}</div>
        <button type="button" aria-label="Close" onClick={close} className={styles.close}>
          <Close width={16} height={16} />
        </button>
      </div>
      {meta ? <div className={styles.meta}>{meta}</div> : null}
      <a
        href={gmapsSearchUrl({ name: pin.name ?? '', address: null, lat: pin.lat, lng: pin.lng, placeIdExternal: pin.googleId ?? null })}
        target="_blank"
        rel="noreferrer noopener"
        className={styles.link}
      >
        View on Google Maps ↗
      </a>
    </div>
  );
}

// Hover tooltip (both renderers): name + category · time, no image load.
export function PinTooltip({ pin }: { pin: Pin }) {
  const meta = pinMeta(pin);
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{pin.name ?? `Stop ${pin.idx}`}</div>
      {meta ? <div className={styles.meta}>{meta}</div> : null}
    </div>
  );
}
