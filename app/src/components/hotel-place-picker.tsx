'use client';

// HotelPlacePicker — one place search box for a hotel/lodging. Mirrors
// TransportPlacePicker's interaction (debounced autocomplete, keyboard nav,
// click-away) but is hotel-shaped: a pick
// collapses to a name + address chip (not an airport code). Reports the full
// selection (name, address, lat/lng, placeId) up to the parent form, which owns
// submission via hidden inputs. Typing is still allowed — the parent keeps a
// plain-text name fallback for manual entry.

import { useMemo, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PlaceSuggestion } from '@/lib/places/types';
import { ensureCoords } from '@/lib/places/client';
import { hotelSelectionFrom, type HotelSelection } from '@/lib/places/pick';
import { usePlaceSearch } from './use-place-search';
import { SearchAttribution } from './search-attribution';
import { useTopmostOverlay } from '@/components/ui';
import { Search, Close, Bed } from '@/components/icons';
import styles from './hotel-form.module.css';

export type { HotelSelection } from '@/lib/places/pick';

type Props = {
  placeholder?: string;
  initial?: { name?: string | null; address?: string | null } | null;
  onChange: (sel: HotelSelection | null) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function HotelPlacePicker({ placeholder, initial, onChange, onBusyChange }: Props) {
  const listId = useId();
  const { query, results, onQueryChange, reset, takeSession } = usePlaceSearch({ limit: 6 });
  const ordered = useMemo(
    () => [...results].sort((a, b) => Number(b.kind === 'hotel') - Number(a.kind === 'hotel')),
    [results],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every pick and clear; a resolve is stale if it moved.
  const pickSeq = useRef(0);
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

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Unmounting mid-pick (e.g. a host toggling to manual entry) must not leave
  // the host's Save disabled, and a late resolve must not call onChange.
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    const seqRef = pickSeq;
    return () => {
      seqRef.current++;
      onBusyChangeRef.current?.(false);
    };
  }, []);

  const pick = useCallback(
    async (s: PlaceSuggestion) => {
      if (busy) return;
      const tok = takeSession(); // before the first await: ends the session synchronously
      const seq = ++pickSeq.current;
      setError(null);
      setBusy(true);
      try {
        const sel = await hotelSelectionFrom(s, (x) => ensureCoords(x, tok));
        if (seq !== pickSeq.current) return;
        if (!sel) {
          setError("Couldn't load that place. Try another result.");
          return;
        }
        setSelected(sel);
        reset();
        setIsOpen(false);
        setActiveIdx(-1);
        onChange(sel);
      } catch {
        if (seq === pickSeq.current) setError("Couldn't load that place. Try another result.");
      } finally {
        if (seq === pickSeq.current) setBusy(false);
      }
    },
    [busy, onChange, reset, takeSession],
  );

  function clear() {
    pickSeq.current++;
    setBusy(false);
    setSelected(null);
    onChange(null);
    reset();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || ordered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      pick(ordered[activeIdx]);
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
        disabled={busy}
        placeholder={placeholder ?? 'Search hotels or paste a Google Maps link…'}
        onChange={(e) => {
          const v = e.target.value;
          onQueryChange(v);
          setActiveIdx(-1);
          setIsOpen(v.trim().length >= 2);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (ordered.length > 0) setIsOpen(true); }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
      />
      {error && <div role="alert" style={{ fontSize: 12, color: '#b3261e', padding: '4px 2px' }}>{error}</div>}
      {isOpen && ordered.length > 0 && (
        <ul id={listId} className={styles.dropdown} role="listbox">
          {ordered.map((p, i) => (
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
          <li role="presentation"><SearchAttribution results={results} /></li>
        </ul>
      )}
    </div>
  );
}
