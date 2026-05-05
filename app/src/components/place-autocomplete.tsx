'use client';

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { fetchPlaceDetails } from '@/lib/place-details';
import styles from './place-autocomplete.module.css';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type Selection = {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  placeIdExternal: string;
  phone: string | null;
  website: string | null;
  hours: string | null;
};

type Props = {
  defaultName?: string | null;
  defaultAddress?: string | null;
  defaultLat?: number | null;
  defaultLng?: number | null;
  defaultPlaceIdExternal?: string | null;
  onSelect?: (selection: Selection) => void;
  inputClassName?: string;
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

// ─── Inner component — requires APIProvider context ───────────────────────────

function AutocompleteInner({
  defaultName,
  defaultAddress,
  defaultLat,
  defaultLng,
  defaultPlaceIdExternal,
  onSelect,
  inputClassName,
}: Props) {
  const placesLib = useMapsLibrary('places');

  const [inputVal, setInputVal] = useState(defaultName ?? '');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  // Hidden field state
  const [address, setAddress] = useState(defaultAddress ?? '');
  const [lat, setLat] = useState<number | ''>(defaultLat ?? '');
  const [lng, setLng] = useState<number | ''>(defaultLng ?? '');
  const [placeIdExternal, setPlaceIdExternal] = useState(defaultPlaceIdExternal ?? '');

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Initialise session token once library loads
  useEffect(() => {
    if (!placesLib) return;
    sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
  }, [placesLib]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchPredictions = useCallback(
    async (value: string) => {
      if (!placesLib || !value.trim()) {
        setPredictions([]);
        setIsOpen(false);
        return;
      }
      try {
        const { suggestions } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: value,
            sessionToken: sessionTokenRef.current ?? undefined,
          });
        const adapted = adaptSuggestions(suggestions).slice(0, 6);
        if (adapted.length > 0) {
          setPredictions(adapted);
          setIsOpen(true);
        } else {
          setPredictions([]);
          setIsOpen(false);
        }
      } catch {
        setPredictions([]);
        setIsOpen(false);
      }
    },
    [placesLib],
  );

  const pickPrediction = useCallback(
    async (prediction: Prediction) => {
      if (!placesLib) return;
      try {
        const place = await fetchPlaceDetails(placesLib, prediction.place_id, [
          'name',
          'formatted_address',
          'geometry',
          'place_id',
          'formatted_phone_number',
          'website',
          'opening_hours',
        ]);

        const name = place.name ?? prediction.structured_formatting.main_text;
        const addr = place.formatted_address ?? null;
        const latVal = place.geometry?.location?.lat() ?? 0;
        const lngVal = place.geometry?.location?.lng() ?? 0;
        const pid = place.place_id ?? prediction.place_id;
        const phone = place.formatted_phone_number ?? null;
        const website = place.website ?? null;
        const hours = place.opening_hours?.weekday_text?.join('; ') ?? null;

        setInputVal(name);
        setAddress(addr ?? '');
        setLat(latVal);
        setLng(lngVal);
        setPlaceIdExternal(pid);
        setPredictions([]);
        setIsOpen(false);
        setActiveIdx(-1);

        // Refresh session token after selection
        sessionTokenRef.current = new placesLib.AutocompleteSessionToken();

        onSelect?.({ name, address: addr, lat: latVal, lng: lngVal, placeIdExternal: pid, phone, website, hours });
      } catch {
        // ignore — selection silently fails like the old getDetails error path
      }
    },
    [placesLib, onSelect],
  );

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
      pickPrediction(predictions[activeIdx]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <input
        name="name"
        type="text"
        required
        autoComplete="off"
        value={inputVal}
        placeholder="Senso-ji Temple"
        className={inputClassName}
        onChange={(e) => {
          setInputVal(e.target.value);
          fetchPredictions(e.target.value);
          setActiveIdx(-1);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (predictions.length > 0) setIsOpen(true); }}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="pac-dropdown"
      />

      {/* Hidden structured fields. The visible address input in
          place-form.tsx is the authoritative `name="address"` field;
          it stays manually editable while we contribute the geocoded
          extras here. */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <input type="hidden" name="placeIdExternal" value={placeIdExternal} />
      <input type="hidden" name="autoAddress" value={address} />

      {isOpen && predictions.length > 0 && (
        <ul id="pac-dropdown" role="listbox" className={styles.dropdown}>
          {predictions.map((p, i) => (
            <li
              key={p.place_id}
              role="option"
              aria-selected={i === activeIdx}
              className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pickPrediction(p); }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={styles.itemMain}>{p.structured_formatting.main_text}</span>
              {p.structured_formatting.secondary_text && (
                <span className={styles.itemSecondary}>{p.structured_formatting.secondary_text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Public component — conditionally wraps APIProvider ───────────────────────

export function PlaceAutocomplete(props: Props) {
  // No key → plain input, no hidden fields
  if (!API_KEY) {
    return (
      <input
        name="name"
        type="text"
        required
        defaultValue={props.defaultName ?? ''}
        placeholder="Senso-ji Temple"
        className={props.inputClassName}
        autoComplete="off"
      />
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <AutocompleteInner {...props} />
    </APIProvider>
  );
}
