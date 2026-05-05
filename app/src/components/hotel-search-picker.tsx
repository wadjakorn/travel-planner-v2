'use client';

// HotelSearchPicker — search-first add-hotel flow. Mirrors PlaceSearchPicker
// but restricted to lodging types and writes to hotel_booking via addAction.

import { useEffect, useRef, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Bed, Plus } from '@/components/icons';
import { fetchPlaceDetails, type PlaceDetails } from '@/lib/place-details';
import { HotelManualForm } from './hotel-manual-form';
import styles from './place-search-picker.module.css';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type Props = {
  tripId: string;
  addAction: (formData: FormData) => Promise<void>;
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

type Prediction = {
  place_id: string;
  structured_formatting: { main_text: string; secondary_text?: string };
  types?: string[];
};

function adaptSuggestions(s: google.maps.places.AutocompleteSuggestion[]): Prediction[] {
  const out: Prediction[] = [];
  for (const sug of s) {
    const p = sug.placePrediction;
    if (!p) continue;
    out.push({
      place_id: p.placeId,
      structured_formatting: {
        main_text: p.mainText?.text ?? p.text.text,
        secondary_text: p.secondaryText?.text,
      },
      types: p.types,
    });
  }
  return out;
}

export type HotelDates = {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
};

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
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          setError(msg || 'Failed to add hotel');
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
          placesLib={placesLib}
          adding={busy}
          onClose={() => setPreview(null)}
          onAdd={(place) => {
            setDatesFor({ place, prediction: preview });
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

export function HotelDatesModal({
  name,
  submitting,
  initial,
  onCancel,
  onConfirm,
}: {
  name: string;
  submitting: boolean;
  initial?: Partial<HotelDates>;
  onCancel: () => void;
  onConfirm: (dates: HotelDates) => void;
}) {
  const [ci, setCi] = useState(initial?.checkInDate ?? '');
  const [ct, setCt] = useState(initial?.checkInTime ?? '15:00');
  const [co, setCo] = useState(initial?.checkOutDate ?? '');
  const [cot, setCot] = useState(initial?.checkOutTime ?? '11:00');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ci || !co) {
      setErr('Pick check-in and check-out dates.');
      return;
    }
    if (co < ci) {
      setErr('Check-out must be on or after check-in.');
      return;
    }
    setErr(null);
    onConfirm({ checkInDate: ci, checkInTime: ct, checkOutDate: co, checkOutTime: cot });
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #d2d2d7',
    fontSize: 14,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stay dates"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 460,
          width: '100%',
          padding: 24,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
          Stay dates
        </h2>
        <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 4 }}>{name}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div>
            <div style={labelStyle}>Check-in date</div>
            <input type="date" required value={ci} onChange={(e) => setCi(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Check-in time</div>
            <input type="time" value={ct} onChange={(e) => setCt(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Check-out date</div>
            <input type="date" required value={co} onChange={(e) => setCo(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Check-out time</div>
            <input type="time" value={cot} onChange={(e) => setCot(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {err ? (
          <div style={{ color: '#c8102e', fontSize: 13, marginTop: 10 }}>{err}</div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#1d1d1f',
              color: '#fff',
              fontSize: 14,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? 'Adding…' : 'Add hotel'}
          </button>
        </div>
      </form>
    </div>
  );
}

function HotelPreviewModal({
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

export function HotelSearchPicker(props: Props) {
  if (!API_KEY) {
    return (
      <div className={styles.wrap}>
        <div className={styles.error}>
          Google Places API key not configured. Use manual add.
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
