'use client';

// TransportPlacePicker — one place search box for a transport endpoint.
// Typing a code (LAX) or a name both resolve. On select it collapses to an
// editable code chip and reports the full selection (incl. utcOffsetMinutes,
// used for timezone-aware arrival) up to the parent form. Needs no map
// provider. Holds no hidden form fields — the parent owns submission.

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PlaceSuggestion } from '@/lib/places/types';
import { usePlaceSearch } from './use-place-search';
import { SearchAttribution } from './search-attribution';
import { utcOffsetMinutes } from '@/lib/places/utc-offset';
import { deriveCode } from '@/lib/transport-compute';
import { useTopmostOverlay } from '@/components/ui';
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
  const listId = useId();
  const { query, results, onQueryChange, reset } = usePlaceSearch({ limit: 6 });
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
      const sel: PlaceSelection = {
        name: s.name,
        code: deriveCode(s.name),
        secondary: s.secondary,
        lat: s.lat,
        lng: s.lng,
        placeId: s.id,
        utcOffsetMinutes: s.timeZone ? utcOffsetMinutes(s.timeZone) : null,
      };
      setSelected(sel);
      reset();
      setIsOpen(false);
      setActiveIdx(-1);
      onChange(sel);
    },
    [onChange, reset],
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
        value={query}
        placeholder={placeholder ?? 'Type a code or place name'}
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
