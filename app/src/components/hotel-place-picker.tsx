'use client';

// HotelPlacePicker — one place search box for a hotel/lodging. Mirrors
// TransportPlacePicker's interaction (debounced autocomplete, keyboard nav,
// click-away) but is hotel-shaped: a pick
// collapses to a name + address chip (not an airport code). Reports the full
// selection (name, address, lat/lng, placeId) up to the parent form, which owns
// submission via hidden inputs. Typing is still allowed — the parent keeps a
// plain-text name fallback for manual entry.

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PlaceSuggestion } from '@/lib/places/types';
import { usePlaceSearch } from './use-place-search';
import { SearchAttribution } from './search-attribution';
import { useTopmostOverlay } from '@/components/ui';
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
  const listId = useId();
  const { query, results, onQueryChange, reset } = usePlaceSearch({ limit: 6 });
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [selected, setSelected] = useState<HotelSelection | null>(
    initial?.name
      ? { name: initial.name, address: initial.address ?? null, lat: null, lng: null, placeId: null }
      : null,
  );

  const wrapRef = useRef<HTMLDivElement>(null);

  // Claim the top of Modal's shared overlay stack while the dropdown is
  // open, so a Modal host's Escape handler (document, capture phase — runs
  // before this input's own onKeyDown) no-ops and lets Escape close just
  // the dropdown instead of the whole overlay.
  useTopmostOverlay(isOpen);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = useCallback(
    (s: PlaceSuggestion) => {
      const sel: HotelSelection = { name: s.name, address: s.address ?? s.secondary, lat: s.lat, lng: s.lng, placeId: s.id };
      setSelected(sel);
      reset();
      setIsOpen(false);
      setActiveIdx(-1);
      onChange(sel);
    },
    [onChange, reset],
  );

  function clear() {
    setSelected(null);
    onChange(null);
    reset();
  }

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
      pick(results[activeIdx]);
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
        value={query}
        placeholder={placeholder ?? 'Search hotels…'}
        onChange={(e) => {
          const v = e.target.value;
          onQueryChange(v);
          setActiveIdx(-1);
          setIsOpen(v.trim().length >= 2);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
      />
      {isOpen && results.length > 0 && (
        <ul id={listId} className={styles.dropdown} role="listbox">
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                className={`${styles.option} ${i === activeIdx ? styles.optionActive : ''}`}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              >
                <span className={styles.optionMain}>{p.name}</span>
                {p.secondary && (
                  <span className={styles.optionSub}>{p.secondary}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {isOpen && results.length > 0 && <SearchAttribution />}
    </div>
  );
}
