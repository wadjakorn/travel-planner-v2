'use client';

// HotelPlacePicker — one Google Places search box for a hotel/lodging. Mirrors
// TransportPlacePicker's interaction (debounced autocomplete, keyboard nav,
// click-away) but is hotel-shaped: results are lodging-scoped and a pick
// collapses to a name + address chip (not an airport code). Reports the full
// selection (name, address, lat/lng, placeId) up to the parent form, which owns
// submission via hidden inputs. Must render inside a MapsProvider. Typing is
// still allowed — the parent keeps a plain-text name fallback when no API key
// or the user prefers manual entry.

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { fetchPlaceDetails } from '@/lib/place-details';
import { adaptSuggestions, type Prediction } from '@/lib/places-adapter';
import { Search, Close, Bed } from '@/components/icons';
import styles from './hotel-form.module.css';

export type HotelSelection = {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

type Props = {
  placeholder?: string;
  initial?: { name?: string | null; address?: string | null } | null;
  onChange: (sel: HotelSelection | null) => void;
};

export function HotelPlacePicker({ placeholder, initial, onChange }: Props) {
  const placesLib = useMapsLibrary('places');
  const listId = useId();
  const [inputVal, setInputVal] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [selected, setSelected] = useState<HotelSelection | null>(
    initial?.name
      ? { name: initial.name, address: initial.address ?? null, lat: null, lng: null, placeId: null }
      : null,
  );

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (placesLib) sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
  }, [placesLib]);

  useEffect(() => () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchPredictions = useCallback(
    async (value: string) => {
      if (!placesLib || value.trim().length < 2) {
        setPredictions([]);
        setIsOpen(false);
        return;
      }
      try {
        const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          sessionToken: sessionTokenRef.current ?? undefined,
          includedPrimaryTypes: ['lodging'],
        });
        const adapted = adaptSuggestions(suggestions).slice(0, 6);
        setPredictions(adapted);
        setIsOpen(adapted.length > 0);
      } catch {
        setPredictions([]);
        setIsOpen(false);
      }
    },
    [placesLib],
  );

  const pick = useCallback(
    async (prediction: Prediction) => {
      if (!placesLib) return;
      try {
        const place = await fetchPlaceDetails(
          placesLib,
          prediction.place_id,
          ['name', 'formatted_address', 'geometry', 'place_id'],
          prediction.placePrediction,
        );
        const sel: HotelSelection = {
          name: place.name ?? prediction.structured_formatting.main_text,
          address:
            place.formatted_address ?? prediction.structured_formatting.secondary_text ?? null,
          lat: place.geometry?.location?.lat() ?? null,
          lng: place.geometry?.location?.lng() ?? null,
          placeId: place.place_id ?? prediction.place_id,
        };
        setSelected(sel);
        setPredictions([]);
        setIsOpen(false);
        setActiveIdx(-1);
        setInputVal('');
        sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        onChange(sel);
      } catch {
        /* selection silently fails, matching place-autocomplete */
      }
    },
    [placesLib, onChange],
  );

  function clear() {
    setSelected(null);
    onChange(null);
    setInputVal('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || predictions.length === 0) return;
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
      setIsOpen(false);
      setActiveIdx(-1);
    }
  }

  if (selected) {
    return (
      <div className={styles.hotelChip}>
        <span className={styles.hotelChipIco} aria-hidden>
          <Bed width={17} height={17} />
        </span>
        <span className={styles.hotelChipBody}>
          <span className={styles.hotelChipName}>{selected.name}</span>
          {selected.address && <span className={styles.hotelChipAddr}>{selected.address}</span>}
        </span>
        <button type="button" className={styles.chipRm} onClick={clear} aria-label="Clear hotel">
          <Close width={15} height={15} />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={styles.pickerWrap}>
      <span className={styles.pickerPin} aria-hidden>
        <Search width={17} height={17} />
      </span>
      <input
        className={styles.pickerInput}
        type="text"
        autoComplete="off"
        value={inputVal}
        placeholder={placeholder ?? 'Search hotels…'}
        onChange={(e) => {
          const v = e.target.value;
          setInputVal(v);
          setActiveIdx(-1);
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          if (v.trim().length < 2) {
            setPredictions([]);
            setIsOpen(false);
            return;
          }
          debounceRef.current = window.setTimeout(() => fetchPredictions(v), 350);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (predictions.length > 0) setIsOpen(true); }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
      />
      {isOpen && (
        <ul id={listId} className={styles.dropdown} role="listbox">
          {predictions.map((p, i) => (
            <li key={p.place_id}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                className={`${styles.option} ${i === activeIdx ? styles.optionActive : ''}`}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              >
                <span className={styles.optionMain}>{p.structured_formatting.main_text}</span>
                {p.structured_formatting.secondary_text && (
                  <span className={styles.optionSub}>{p.structured_formatting.secondary_text}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
