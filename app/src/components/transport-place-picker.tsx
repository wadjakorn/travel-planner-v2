'use client';

// TransportPlacePicker — one Google Places search box for a transport endpoint.
// Typing a code (LAX) or a name both resolve. On select it collapses to an
// editable code chip and reports the full selection (incl. utcOffsetMinutes,
// used for timezone-aware arrival) up to the parent form. Must render inside
// a MapsProvider. Holds no hidden form fields — the parent owns submission.

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { fetchPlaceDetails } from '@/lib/place-details';
import { adaptSuggestions, type Prediction } from '@/lib/places-adapter';
import { deriveCode } from '@/lib/transport-compute';
import { Search, Close } from '@/components/icons';
import styles from './transport-form.module.css';

export type PlaceSelection = {
  name: string;
  code: string | null;
  secondary: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  utcOffsetMinutes: number | null;
};

type Props = {
  placeholder?: string;
  initial?: { name?: string | null; code?: string | null } | null;
  onChange: (sel: PlaceSelection | null) => void;
};

export function TransportPlacePicker({ placeholder, initial, onChange }: Props) {
  const placesLib = useMapsLibrary('places');
  const listId = useId();
  const [inputVal, setInputVal] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [selected, setSelected] = useState<PlaceSelection | null>(
    initial?.name
      ? {
          name: initial.name,
          code: initial.code ?? deriveCode(initial.name),
          secondary: null,
          lat: null,
          lng: null,
          placeId: null,
          utcOffsetMinutes: null,
        }
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
          ['name', 'geometry', 'place_id', 'utc_offset_minutes'],
          prediction.placePrediction,
        );
        const name = place.name ?? prediction.structured_formatting.main_text;
        const sel: PlaceSelection = {
          name,
          code: deriveCode(name),
          secondary: prediction.structured_formatting.secondary_text ?? null,
          lat: place.geometry?.location?.lat() ?? null,
          lng: place.geometry?.location?.lng() ?? null,
          placeId: place.place_id ?? prediction.place_id,
          utcOffsetMinutes: place.utc_offset_minutes ?? null,
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

  function setCode(code: string) {
    setSelected((prev) => {
      if (!prev) return prev;
      const next = { ...prev, code: code.trim() ? code.trim().toUpperCase() : null };
      onChange(next);
      return next;
    });
  }

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
      <div className={styles.chip}>
        <input
          className={styles.codeEdit}
          value={selected.code ?? ''}
          onChange={(e) => setCode(e.target.value)}
          placeholder="—"
          maxLength={5}
          aria-label="Station or airport code"
        />
        <span className={styles.chipName}>{selected.secondary ?? selected.name}</span>
        <button type="button" className={styles.chipRm} onClick={clear} aria-label="Clear selection">
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
        placeholder={placeholder ?? 'Type a code or place name'}
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
