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
          if (place.user_ratings_total != null) fd.set('reviews', String(place.user_ratings_total));

          // Refresh session token after successful pick
          if (placesLib) sessionTokenRef.current = new placesLib.AutocompleteSessionToken();

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
            }
          });
        },
      );
    },
    [placesLib, dayId, addAction],
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
                  onClick={() => pick(p)}
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
