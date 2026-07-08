'use client';

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { fetchPlaceDetails } from '@/lib/place-details';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';
import { adaptSuggestions, type Prediction } from '@/lib/places-adapter';
import { MapsProvider } from './maps-provider';
import styles from './place-autocomplete.module.css';

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
  // Override the visible input's submitted name / id / placeholder so the
  // component can be reused outside the place-add form (e.g. trip create).
  inputName?: string;
  inputId?: string;
  placeholder?: string;
};

// ─── Inner component — requires APIProvider context ───────────────────────────

function AutocompleteInner({
  defaultName,
  defaultAddress,
  defaultLat,
  defaultLng,
  defaultPlaceIdExternal,
  onSelect,
  inputClassName,
  inputName = 'name',
  inputId,
  placeholder = 'Senso-ji Temple',
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
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Initialise session token once library loads
  useEffect(() => {
    if (!placesLib) return;
    sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
  }, [placesLib]);

  // Cancel any pending debounced fetch on unmount so it can't fire after the
  // component is gone.
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

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
      if (!placesLib || value.trim().length < 2) {
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
        const place = await fetchPlaceDetails(
          placesLib,
          prediction.place_id,
          [
            'name',
            'formatted_address',
            'geometry',
            'place_id',
            'formatted_phone_number',
            'website',
            'opening_hours',
          ],
          prediction.placePrediction,
        );

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
        name={inputName}
        id={inputId}
        type="text"
        required
        autoComplete="off"
        value={inputVal}
        placeholder={placeholder}
        className={inputClassName}
        onChange={(e) => {
          const v = e.target.value;
          setInputVal(v);
          setActiveIdx(-1);
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          // Below the min length there's nothing to fetch — drop stale results
          // right away instead of leaving them up until the debounce fires.
          if (v.trim().length < 2) {
            setPredictions([]);
            setIsOpen(false);
            return;
          }
          debounceRef.current = window.setTimeout(() => fetchPredictions(v), 350);
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
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <input
        name={props.inputName ?? 'name'}
        id={props.inputId}
        type="text"
        required
        defaultValue={props.defaultName ?? ''}
        placeholder={props.placeholder ?? 'Senso-ji Temple'}
        className={props.inputClassName}
        autoComplete="off"
      />
    );
  }

  return (
    <MapsProvider>
      <AutocompleteInner {...props} />
    </MapsProvider>
  );
}
