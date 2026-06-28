'use client';

import { useEffect, useState } from 'react';
import { fetchPlaceDetails, type PlaceDetails } from '@/lib/place-details';
import { type Prediction } from '@/lib/places-adapter';

export function HotelPreviewModal({
  prediction,
  placesLib,
  adding,
  onClose,
  onAdd,
}: {
  prediction: Prediction;
  placesLib: google.maps.PlacesLibrary;
  adding: boolean;
  onClose: () => void;
  onAdd: (place: PlaceDetails) => void;
}) {
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaceDetails(placesLib, prediction.place_id, [
      'name',
      'formatted_address',
      'geometry',
      'place_id',
      'formatted_phone_number',
      'website',
      'rating',
      'user_ratings_total',
      'photos',
      'url',
      'price_level',
      'editorial_summary',
    ])
      .then((p) => {
        if (!cancelled) setPlace(p);
      })
      .catch(() => {
        if (!cancelled) setLoadErr('Could not fetch hotel details.');
      });
    return () => {
      cancelled = true;
    };
  }, [prediction.place_id, placesLib]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const photoUrl =
    place?.photos && place.photos.length > 0
      ? place.photos[0].getUrl({ maxWidth: 800, maxHeight: 400 })
      : null;
  const summary = (place as { editorial_summary?: { overview?: string } } | null)
    ?.editorial_summary?.overview;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={prediction.structured_formatting.main_text}
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
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`Photo of ${prediction.structured_formatting.main_text}`}
            style={{
              width: '100%',
              height: 200,
              objectFit: 'cover',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
          />
        ) : null}
        <div style={{ padding: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
            {place?.name ?? prediction.structured_formatting.main_text}
          </h2>
          {place?.formatted_address ? (
            <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 4 }}>
              {place.formatted_address}
            </div>
          ) : null}
          {place?.rating != null ? (
            <div style={{ fontSize: 13, color: '#1d1d1f', marginTop: 8 }}>
              ★ {place.rating}
              {place.user_ratings_total
                ? ` · ${place.user_ratings_total.toLocaleString()} reviews`
                : ''}
            </div>
          ) : null}
          {summary ? (
            <p style={{ fontSize: 14, color: '#424245', marginTop: 12, lineHeight: 1.5 }}>
              {summary}
            </p>
          ) : null}
          {place?.formatted_phone_number ? (
            <div style={{ fontSize: 13, marginTop: 12, color: '#1d1d1f' }}>
              {place.formatted_phone_number}
            </div>
          ) : null}
          {place?.website ? (
            <a
              href={place.website}
              target="_blank"
              rel="noreferrer noopener"
              style={{ fontSize: 13, color: '#0070f3', display: 'inline-block', marginTop: 6 }}
            >
              Website
            </a>
          ) : null}
          {loadErr ? (
            <div style={{ fontSize: 13, color: '#c53030', marginTop: 12 }}>{loadErr}</div>
          ) : !place ? (
            <div style={{ fontSize: 13, color: '#86868b', marginTop: 12 }}>Loading…</div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <a
              href={
                place?.url ??
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  place?.name ?? prediction.structured_formatting.main_text,
                )}&query_place_id=${prediction.place_id}`
              }
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
              disabled={!place || adding}
              onClick={() => place && onAdd(place)}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#1d1d1f',
                color: '#fff',
                fontSize: 14,
                cursor: place && !adding ? 'pointer' : 'not-allowed',
                opacity: place && !adding ? 1 : 0.5,
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
