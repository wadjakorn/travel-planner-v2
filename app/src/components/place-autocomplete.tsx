'use client';

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { resolvePlace } from '@/lib/places/client';
import type { PlaceSuggestion } from '@/lib/places/types';
import { usePlaceSearch } from './use-place-search';
import { SearchAttribution } from './search-attribution';
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
  placeholder = 'Senso-ji Temple',
}: Props) {
  const { results, onQueryChange, reset } = usePlaceSearch({ limit: 6 });
  const [inputVal, setInputVal] = useState(defaultName ?? '');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  // Hidden field state
  const [address, setAddress] = useState(defaultAddress ?? '');
  const [lat, setLat] = useState<number | ''>(defaultLat ?? '');
  const [lng, setLng] = useState<number | ''>(defaultLng ?? '');
  const [placeIdExternal, setPlaceIdExternal] = useState(defaultPlaceIdExternal ?? '');

  const wrapRef = useRef<HTMLDivElement>(null);

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
      const place = await resolvePlace(s);
      const name = place.name;
      const addr = place.address;
      const latVal = place.lat;
      const lngVal = place.lng;
      const pid = place.id;
      const phone = place.phone;
      const website = place.website;
      const hours = place.hours;

      setInputVal(name);
      setAddress(addr ?? '');
      setLat(latVal);
      setLng(lngVal);
      setPlaceIdExternal(pid);
      reset();
      setIsOpen(false);
      setActiveIdx(-1);

      onSelect?.({ name, address: addr, lat: latVal, lng: lngVal, placeIdExternal: pid, phone, website, hours });
    },
    [onSelect, reset],
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
        </ul>
      )}
      {isOpen && results.length > 0 && <SearchAttribution />}
    </div>
  );
}
