'use client';

// PlaceSearchPicker — search-first add-place flow. Type, pick a Google
// Places result, row inserted via addPlaceAction. Falls back to manual
// form when no API key (or via "Add details manually" link).

import { useEffect, useRef, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Bed, Fork, Transit, MapPin, Plus } from '@/components/icons';
import { fetchPlaceDetails, type PlaceDetails } from '@/lib/place-details';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';
import { MapsProvider } from './maps-provider';
import {
  adaptSuggestions,
  kindFromTypes,
  type Kind,
  type Prediction,
} from '@/lib/places-adapter';
import { PlaceManualForm } from './place-manual-form';
import { PlacePreviewModal } from './place-preview-modal';
import styles from './place-search-picker.module.css';

type Props = {
  dayId: string;
  tripId: string;
  addAction: (formData: FormData) => Promise<void>;
  variant?: 'page' | 'inline';
  minChars?: number;
  onBusyChange?: (busy: boolean) => void;
};

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === 'hotel') return <Bed width={18} height={18} />;
  if (kind === 'food') return <Fork width={18} height={18} />;
  if (kind === 'transit') return <Transit width={18} height={18} />;
  return <MapPin width={18} height={18} />;
}

function PickerInner({ dayId, tripId, addAction, variant = 'page', minChars = 2, onBusyChange }: Props) {
  const placesLib = useMapsLibrary('places');
  const router = useRouter();

  const [inputVal, setInputVal] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Prediction | null>(null);
  const { toast } = useToast();
  const [showManual, setShowManual] = useState(false);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!placesLib) return;
    sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
  }, [placesLib]);

  const fetchPredictions = useCallback(
    async (value: string) => {
      if (!placesLib || value.trim().length < minChars) {
        setPredictions([]);
        return;
      }
      try {
        const { suggestions } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: value,
            sessionToken: sessionTokenRef.current ?? undefined,
          });
        setPredictions(adaptSuggestions(suggestions).slice(0, 8));
      } catch {
        setPredictions([]);
      }
    },
    [placesLib, minChars],
  );

  function onInputChange(v: string) {
    setInputVal(v);
    setActiveIdx(-1);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchPredictions(v), 350);
  }

  const submitPlace = useCallback(
    (place: PlaceDetails, prediction: Prediction) => {
      const fd = new FormData();
      fd.set('dayId', dayId);
      fd.set('kind', kindFromTypes(place.types ?? undefined));
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
          toast({ variant: 'success', title: 'Place added' });
        } catch (e) {
          if (e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: unknown }).digest === 'string' && ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT') || (e as { digest: string }).digest === 'NEXT_NOT_FOUND')) throw e;
          const msg = e instanceof Error ? e.message : '';
          setError(msg || 'Failed to add place');
          toast({ variant: 'error', title: "Couldn't add place", description: e instanceof Error ? e.message : undefined });
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
    async (prediction: Prediction) => {
      if (!placesLib) return;
      setPendingId(prediction.place_id);
      setError(null);
      try {
        const place = await fetchPlaceDetails(placesLib, prediction.place_id, [
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
        ]);
        submitPlace(place, prediction);
      } catch {
        setPendingId(null);
        setError('Could not fetch place details. Try another result.');
      }
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

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

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
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className={styles.manualLink}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Manual Add
        </button>
        {!isInline && (
          <Link href={`/trip/${tripId}`} className={styles.cancelLink}>
            Cancel
          </Link>
        )}
      </div>

      {showManual ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add place manually"
          onClick={() => setShowManual(false)}
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
              maxWidth: 560,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
              padding: 24,
            }}
          >
            <PlaceManualForm
              dayId={dayId}
              tripId={tripId}
              action={addAction}
              variant="modal"
              onSuccess={() => setShowManual(false)}
              onCancel={() => setShowManual(false)}
            />
          </div>
        </div>
      ) : null}

      {preview && placesLib ? (
        <PlacePreviewModal
          prediction={preview}
          placesLib={placesLib}
          adding={busy}
          onClose={() => setPreview(null)}
          onAdd={(place) => submitPlace(place, preview)}
        />
      ) : null}
    </div>
  );
}

export function PlaceSearchPicker(props: Props) {
  if (!GOOGLE_MAPS_API_KEY) {
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
    <MapsProvider>
      <PickerInner {...props} />
    </MapsProvider>
  );
}
