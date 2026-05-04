'use client';

// PlaceSearchPicker — search-first add-place flow. Type, pick a Google
// Places result, row inserted via addPlaceAction. Falls back to manual
// form when no API key (or via "Add details manually" link).

import { useEffect, useRef, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Bed, Fork, Transit, MapPin, Plus } from '@/components/icons';
import styles from './place-search-picker.module.css';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type Kind = 'hotel' | 'food' | 'sight' | 'transit';

type Props = {
  dayId: string;
  tripId: string;
  addAction: (formData: FormData) => Promise<void>;
  variant?: 'page' | 'inline';
  minChars?: number;
};

type Prediction = google.maps.places.AutocompletePrediction;

function kindFromTypes(types: readonly string[] | undefined): Kind {
  if (!types) return 'sight';
  if (types.includes('lodging')) return 'hotel';
  if (
    types.includes('restaurant') ||
    types.includes('cafe') ||
    types.includes('bar') ||
    types.includes('bakery') ||
    types.includes('meal_takeaway') ||
    types.includes('meal_delivery') ||
    types.includes('food')
  )
    return 'food';
  if (
    types.includes('transit_station') ||
    types.includes('subway_station') ||
    types.includes('train_station') ||
    types.includes('bus_station') ||
    types.includes('airport') ||
    types.includes('light_rail_station')
  )
    return 'transit';
  return 'sight';
}

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === 'hotel') return <Bed width={18} height={18} />;
  if (kind === 'food') return <Fork width={18} height={18} />;
  if (kind === 'transit') return <Transit width={18} height={18} />;
  return <MapPin width={18} height={18} />;
}

function PickerInner({ dayId, tripId, addAction, variant = 'page', minChars = 2 }: Props) {
  const placesLib = useMapsLibrary('places');
  const router = useRouter();

  const [inputVal, setInputVal] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Prediction | null>(null);

  const svcRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const detailDivRef = useRef<HTMLDivElement | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!placesLib) return;
    svcRef.current = new placesLib.AutocompleteService();
    sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    const div = document.createElement('div');
    document.body.appendChild(div);
    detailDivRef.current = div;
    return () => {
      div.remove();
    };
  }, [placesLib]);

  const fetchPredictions = useCallback((value: string) => {
    if (!svcRef.current || value.trim().length < minChars) {
      setPredictions([]);
      return;
    }
    svcRef.current.getPlacePredictions(
      { input: value, sessionToken: sessionTokenRef.current ?? undefined },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results.slice(0, 8));
        } else {
          setPredictions([]);
        }
      },
    );
  }, [minChars]);

  function onInputChange(v: string) {
    setInputVal(v);
    setActiveIdx(-1);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchPredictions(v), 180);
  }

  const submitPlace = useCallback(
    (place: google.maps.places.PlaceResult, prediction: Prediction) => {
      const fd = new FormData();
      fd.set('dayId', dayId);
      fd.set('kind', kindFromTypes(place.types));
      fd.set('name', place.name ?? prediction.structured_formatting.main_text);
      fd.set('address', place.formatted_address ?? '');
      fd.set('lat', String(place.geometry?.location?.lat() ?? ''));
      fd.set('lng', String(place.geometry?.location?.lng() ?? ''));
      fd.set('placeIdExternal', place.place_id ?? prediction.place_id);
      fd.set('phone', place.formatted_phone_number ?? '');
      fd.set('website', place.website ?? '');
      fd.set('hours', place.opening_hours?.weekday_text?.join('; ') ?? '');
      if (place.rating != null) fd.set('rating', String(place.rating));
      if (place.user_ratings_total != null)
        fd.set('reviews', String(place.user_ratings_total));

      if (placesLib)
        sessionTokenRef.current = new placesLib.AutocompleteSessionToken();

      startTransition(async () => {
        try {
          await addAction(fd);
          router.refresh();
        } catch (e) {
          const digest = (e as { digest?: string } | null)?.digest ?? '';
          const msg = e instanceof Error ? e.message : '';
          const isRedirect =
            digest.startsWith('NEXT_REDIRECT') || msg.includes('NEXT_REDIRECT');
          if (!isRedirect) {
            setError(msg || 'Failed to add place');
          }
        } finally {
          setInputVal('');
          setPredictions([]);
          setActiveIdx(-1);
          setPendingId(null);
          setPreview(null);
        }
      });
    },
    [addAction, dayId, placesLib, router],
  );

  const pick = useCallback(
    (prediction: Prediction) => {
      if (!placesLib || !detailDivRef.current) return;
      setPendingId(prediction.place_id);
      setError(null);
      const detailSvc = new placesLib.PlacesService(detailDivRef.current);
      detailSvc.getDetails(
        {
          placeId: prediction.place_id,
          fields: [
            'name',
            'formatted_address',
            'geometry',
            'place_id',
            'formatted_phone_number',
            'website',
            'opening_hours',
            'rating',
            'user_ratings_total',
            'types',
          ],
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        (place, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            setPendingId(null);
            setError('Could not fetch place details. Try another result.');
            return;
          }
          submitPlace(place, prediction);
        },
      );
    },
    [placesLib, submitPlace],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (predictions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      pick(predictions[activeIdx]);
    } else if (e.key === 'Escape') {
      setActiveIdx(-1);
      setPredictions([]);
    }
  }

  const busy = isPending || pendingId !== null;

  const isInline = variant === 'inline';

  return (
    <div className={`${styles.wrap} ${isInline ? styles.wrapInline : ''}`}>
      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="text"
          autoFocus={!isInline}
          autoComplete="off"
          value={inputVal}
          placeholder="Search places, restaurants, attractions…"
          className={styles.searchInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search places"
          disabled={busy}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {predictions.length > 0 && (
        <ul className={styles.list} role="listbox">
          {predictions.map((p, i) => {
            const kind = kindFromTypes(p.types as readonly string[] | undefined);
            const isPending = pendingId === p.place_id;
            return (
              <li
                key={p.place_id}
                role="option"
                aria-selected={i === activeIdx}
                className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => !busy && setPreview(p)}
              >
                <span className={styles.itemIcon}>
                  <KindIcon kind={kind} />
                </span>
                <div className={styles.itemBody}>
                  <div className={styles.itemMain}>{p.structured_formatting.main_text}</div>
                  {p.structured_formatting.secondary_text && (
                    <div className={styles.itemSecondary}>{p.structured_formatting.secondary_text}</div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Add ${p.structured_formatting.main_text}`}
                  className={styles.addBtn}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(p);
                  }}
                >
                  {isPending ? (
                    <span className={styles.spinner} aria-hidden />
                  ) : (
                    <Plus width={16} height={16} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.footer}>
        <Link href={`/trip/${tripId}/day/${dayId}/place/new?manual=1`} className={styles.manualLink}>
          Add details manually instead
        </Link>
        {!isInline && (
          <Link href={`/trip/${tripId}`} className={styles.cancelLink}>
            Cancel
          </Link>
        )}
      </div>

      {preview && placesLib && detailDivRef.current ? (
        <PlacePreviewModal
          prediction={preview}
          placesLib={placesLib}
          containerEl={detailDivRef.current}
          sessionToken={sessionTokenRef.current}
          adding={busy}
          onClose={() => setPreview(null)}
          onAdd={(place) => submitPlace(place, preview)}
        />
      ) : null}
    </div>
  );
}

function PlacePreviewModal({
  prediction,
  placesLib,
  containerEl,
  sessionToken,
  adding,
  onClose,
  onAdd,
}: {
  prediction: Prediction;
  placesLib: google.maps.PlacesLibrary;
  containerEl: HTMLDivElement;
  sessionToken: google.maps.places.AutocompleteSessionToken | null;
  adding: boolean;
  onClose: () => void;
  onAdd: (place: google.maps.places.PlaceResult) => void;
}) {
  const [place, setPlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    const svc = new placesLib.PlacesService(containerEl);
    svc.getDetails(
      {
        placeId: prediction.place_id,
        fields: [
          'name',
          'formatted_address',
          'geometry',
          'place_id',
          'formatted_phone_number',
          'website',
          'opening_hours',
          'rating',
          'user_ratings_total',
          'types',
          'photos',
          'url',
          'price_level',
          'editorial_summary',
        ],
        sessionToken: sessionToken ?? undefined,
      },
      (p, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !p) {
          setLoadErr('Could not fetch place details.');
          return;
        }
        setPlace(p);
      },
    );
  }, [prediction.place_id, placesLib, containerEl, sessionToken]);

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
            alt=""
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

          {place?.opening_hours?.weekday_text ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 4 }}>
                HOURS
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, color: '#1d1d1f' }}>
                {place.opening_hours.weekday_text.map((line, i) => (
                  <li key={i} style={{ padding: '2px 0' }}>{line}</li>
                ))}
              </ul>
            </div>
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
              {adding ? 'Adding…' : 'Add to day'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlaceSearchPicker(props: Props) {
  if (!API_KEY) {
    return (
      <div className={styles.wrap}>
        <div className={styles.error}>
          Google Places API key not configured. Use the manual form.
        </div>
        <div className={styles.footer}>
          <Link
            href={`/trip/${props.tripId}/day/${props.dayId}/place/new?manual=1`}
            className={styles.manualLink}
          >
            Add details manually
          </Link>
          <Link href={`/trip/${props.tripId}`} className={styles.cancelLink}>
            Cancel
          </Link>
        </div>
      </div>
    );
  }
  return (
    <APIProvider apiKey={API_KEY}>
      <PickerInner {...props} />
    </APIProvider>
  );
}
