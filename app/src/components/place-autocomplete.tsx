'use client';

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { resolvePlace } from '@/lib/places/client';
import { googlePickJson } from '@/lib/places/pick';
import type { PlaceDetail, PlaceSuggestion } from '@/lib/places/types';
import { usePlaceSearch } from './use-place-search';
import type { LatLng } from '@/lib/places/bias';
import { SearchAttribution } from './search-attribution';
import { useT } from '@/components/i18n-provider';
import styles from './place-autocomplete.module.css';

type Selection = {
  name: string;
  address: string | null;
  secondary: string | null;
  lat: number | null;
  lng: number | null;
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
  // false: a pick only fills name/address (no details call, no coords) - e.g. trip create.
  resolve?: boolean;
  // Name of a visible input in the same form that a successful pick
  // overwrites with the picked address (e.g. "address" on the edit page).
  // A string so a server component can pass it.
  fillAddressInput?: string;
  near?: LatLng | null;
};

export function PlaceAutocomplete({
  defaultName,
  defaultAddress,
  defaultLat,
  defaultLng,
  defaultPlaceIdExternal,
  onSelect,
  inputClassName,
  inputName = 'name',
  inputId,
  placeholder,
  resolve = true,
  fillAddressInput,
  near,
}: Props) {
  const t = useT();
  const { results, onQueryChange, reset, takeSession } = usePlaceSearch({ limit: 6, near });
  const [inputVal, setInputVal] = useState(defaultName ?? '');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden field state
  const [address, setAddress] = useState(defaultAddress ?? '');
  const [lat, setLat] = useState<number | ''>(defaultLat ?? '');
  const [lng, setLng] = useState<number | ''>(defaultLng ?? '');
  const [placeIdExternal, setPlaceIdExternal] = useState(defaultPlaceIdExternal ?? '');
  // Only a fresh pick in this session claims Google data; a page load never does.
  const [googlePick, setGooglePick] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped on every pick and every keystroke; a resolve is stale if it moved.
  const pickSeq = useRef(0);

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

  const pickPrediction = useCallback(
    async (s: PlaceSuggestion) => {
      const tok = takeSession(); // before the first await: ends the session synchronously
      const seq = ++pickSeq.current;
      setError(null);

      if (!resolve) {
        // Destination pick: name/address only, no details call, no coords.
        setInputVal(s.name);
        setAddress(s.address ?? s.secondary ?? '');
        setLat(s.lat ?? '');
        setLng(s.lng ?? '');
        setPlaceIdExternal(s.id);
        setGooglePick('');
        reset();
        setIsOpen(false);
        setActiveIdx(-1);
        onSelect?.({
          name: s.name, address: s.address, secondary: s.secondary, lat: s.lat, lng: s.lng,
          placeIdExternal: s.id, phone: null, website: null, hours: null,
        });
        return;
      }

      let place: PlaceDetail | null = null;
      try {
        place = await resolvePlace(s, { session: tok, fields: 'basic' });
      } catch {
        place = null;
      }
      if (seq !== pickSeq.current) return;
      if (!place) {
        // Keep the typed text, but drop the previous pick's structured fields so
        // they are not saved against the new name.
        setAddress('');
        setLat('');
        setLng('');
        setPlaceIdExternal('');
        setGooglePick('');
        setIsOpen(false);
        setActiveIdx(-1);
        setError(t('place_load_error'));
        return;
      }
      const { name, secondary, address: addr, lat: latVal, lng: lngVal, id: pid, phone, website, hours } = place;

      setInputVal(name);
      setAddress(addr ?? '');
      setLat(latVal);
      setLng(lngVal);
      setPlaceIdExternal(pid);
      setGooglePick(googlePickJson(place, 'basic') ?? '');
      if (fillAddressInput) {
        const el = inputRef.current?.form?.elements.namedItem(fillAddressInput);
        if (el instanceof HTMLInputElement) el.value = addr ?? '';
      }
      reset();
      setIsOpen(false);
      setActiveIdx(-1);

      onSelect?.({ name, address: addr, secondary, lat: latVal, lng: lngVal, placeIdExternal: pid, phone, website, hours });
    },
    [fillAddressInput, onSelect, reset, resolve, takeSession, t],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      pickPrediction(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <input
        ref={inputRef}
        name={inputName}
        id={inputId}
        type="text"
        required
        autoComplete="off"
        value={inputVal}
        placeholder={placeholder ?? t('place_search_placeholder')}
        className={inputClassName}
        onChange={(e) => {
          const v = e.target.value;
          pickSeq.current++;
          setError(null);
          setInputVal(v);
          setActiveIdx(-1);
          onQueryChange(v);
          setIsOpen(v.trim().length >= 2);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        // aria-expanded/-controls/-activedescendant belong to combobox; on a
        // bare text input they are ignored, which left the dropdown's state
        // unannounced.
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="pac-dropdown"
        aria-activedescendant={
          isOpen && activeIdx >= 0 ? `pac-option-${activeIdx}` : undefined
        }
      />

      {/* Hidden structured fields. The visible address input in
          place-form.tsx is the authoritative `name="address"` field;
          it stays manually editable while we contribute the geocoded
          extras here. */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <input type="hidden" name="placeIdExternal" value={placeIdExternal} />
      <input type="hidden" name="autoAddress" value={address} />
      <input type="hidden" name="googlePick" value={googlePick} />

      {error && <div role="alert" style={{ fontSize: 12, color: '#b3261e', marginTop: 4 }}>{error}</div>}

      {isOpen && results.length > 0 && (
        <ul id="pac-dropdown" role="listbox" className={styles.dropdown}>
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`pac-option-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pickPrediction(p); }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={styles.itemMain}>{p.name}</span>
              {p.secondary && (
                <span className={styles.itemSecondary}>{p.secondary}</span>
              )}
            </li>
          ))}
          <li role="presentation"><SearchAttribution results={results} /></li>
        </ul>
      )}
    </div>
  );
}
