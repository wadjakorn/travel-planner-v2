'use client';

// HotelSearchPicker — search-first add-hotel flow. Mirrors PlaceSearchPicker
// but restricted to lodging types and writes to hotel_booking via addAction.

import { useEffect, useRef, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Bed, Plus } from '@/components/icons';
import { fetchPlaceDetails, type PlaceDetails } from '@/lib/place-details';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';
import { adaptSuggestions, type Prediction } from '@/lib/places-adapter';
import { MapsProvider } from './maps-provider';
import { HotelManualForm } from './hotel-manual-form';
import { HotelDatesModal, type HotelDates } from './hotel-dates-modal';
import { HotelPreviewModal } from './hotel-preview-modal';
import { useToast } from '@/components/toast';
import styles from './place-search-picker.module.css';

type Props = {
  tripId: string;
  addAction: (formData: FormData) => Promise<void>;
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export type { HotelDates };

function PickerInner({ tripId, addAction, onClose, onBusyChange }: Props) {
  const placesLib = useMapsLibrary('places');
  const [inputVal, setInputVal] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showManual, setShowManual] = useState(false);
  const [preview, setPreview] = useState<Prediction | null>(null);
  const [datesFor, setDatesFor] = useState<{
    place: PlaceDetails;
    prediction: Prediction;
  } | null>(null);

  const { toast } = useToast();
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!placesLib) return;
    sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
  }, [placesLib]);

  const fetchPredictions = useCallback(
    async (value: string) => {
      if (!placesLib || value.trim().length < 2) {
        setPredictions([]);
        return;
      }
      try {
        const { suggestions } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: value,
            sessionToken: sessionTokenRef.current ?? undefined,
            includedPrimaryTypes: ['lodging'],
          });
        setPredictions(adaptSuggestions(suggestions).slice(0, 8));
      } catch {
        setPredictions([]);
      }
    },
    [placesLib],
  );

  function onInputChange(v: string) {
    setInputVal(v);
    setActiveIdx(-1);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchPredictions(v), 350);
  }

  const submitHotel = useCallback(
    (
      place: PlaceDetails,
      prediction: Prediction,
      dates: HotelDates,
    ) => {
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('name', place.name ?? prediction.structured_formatting.main_text);
      fd.set('address', place.formatted_address ?? '');
      fd.set('lat', String(place.geometry?.location?.lat() ?? ''));
      fd.set('lng', String(place.geometry?.location?.lng() ?? ''));
      fd.set('placeIdExternal', place.place_id ?? prediction.place_id);
      fd.set('checkInDate', dates.checkInDate);
      fd.set('checkInTime', dates.checkInTime);
      fd.set('checkOutDate', dates.checkOutDate);
      fd.set('checkOutTime', dates.checkOutTime);

      if (placesLib)
        sessionTokenRef.current = new placesLib.AutocompleteSessionToken();

      startTransition(async () => {
        try {
          await addAction(fd);
          onClose?.();
          toast({ variant: 'success', title: 'Hotel added' });
        } catch (e) {
          if (e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: string }).digest === 'string' && ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT') || (e as { digest: string }).digest === 'NEXT_NOT_FOUND')) throw e;
          const msg = e instanceof Error ? e.message : '';
          setError(msg || 'Failed to add hotel');
          toast({ variant: 'error', title: "Couldn't save hotel", description: e instanceof Error ? e.message : undefined });
        } finally {
          setPendingId(null);
          setInputVal('');
          setPredictions([]);
        }
      });
    },
    [addAction, placesLib, tripId, onClose],
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
        ]);
        setDatesFor({ place, prediction });
      } catch {
        setError('Could not fetch hotel details. Try another result.');
      } finally {
        setPendingId(null);
      }
    },
    [placesLib],
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

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="text"
          autoFocus
          autoComplete="off"
          value={inputVal}
          placeholder="Search hotels…"
          className={styles.searchInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search hotels"
        />
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {predictions.length > 0 && (
        <ul className={styles.list} role="listbox">
          {predictions.map((p, i) => {
            const adding = pendingId === p.place_id;
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
                  <Bed width={18} height={18} />
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
                  {adding ? (
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
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelLink}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {preview && placesLib ? (
        <HotelPreviewModal
          prediction={preview}
          adding={busy}
          onClose={() => setPreview(null)}
          onConfirm={() => {
            pick(preview);
            setPreview(null);
          }}
        />
      ) : null}

      {datesFor ? (
        <HotelDatesModal
          name={datesFor.place.name ?? datesFor.prediction.structured_formatting.main_text}
          submitting={busy}
          onCancel={() => setDatesFor(null)}
          onConfirm={(dates) => {
            const { place, prediction } = datesFor;
            submitHotel(place, prediction, dates);
            setDatesFor(null);
          }}
        />
      ) : null}

      {showManual ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add hotel manually"
          onClick={() => setShowManual(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 110,
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
            <HotelManualForm
              tripId={tripId}
              action={addAction}
              onSuccess={() => {
                setShowManual(false);
                onClose?.();
              }}
              onCancel={() => setShowManual(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HotelSearchPicker(props: Props) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className={styles.wrap}>
        <div className={styles.error}>
          Google Places API key not configured. Use manual add.
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
