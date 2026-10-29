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
import { ensureCoords } from '@/lib/places/client';
import { transportSelectionFrom, type PlaceSelection } from '@/lib/places/pick';
import { deriveCode } from '@/lib/transport-compute';
import type { LatLng } from '@/lib/places/bias';
import { useTopmostOverlay } from '@/components/ui';
import { Search, Close } from '@/components/icons';
import { useT } from '@/components/i18n-provider';
import styles from './transport-form.module.css';

export type { PlaceSelection } from '@/lib/places/pick';

type Props = {
  placeholder?: string;
  initial?: { name?: string | null; code?: string | null } | null;
  onChange: (sel: PlaceSelection | null) => void;
  onBusyChange?: (busy: boolean) => void;
  near?: LatLng | null;
};

export function TransportPlacePicker({ placeholder, initial, onChange, onBusyChange, near }: Props) {
  const t = useT();
  const listId = useId();
  const { query, results, onQueryChange, reset, takeSession } = usePlaceSearch({ limit: 6, near });
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every pick and clear; a resolve is stale if it moved.
  const pickSeq = useRef(0);
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
        const sel = await transportSelectionFrom(s, (x) => ensureCoords(x, tok));
        if (seq !== pickSeq.current) return;
        if (!sel) {
          setError(t('place_load_error'));
          return;
        }
        setSelected(sel);
        reset();
        setIsOpen(false);
        setActiveIdx(-1);
        onChange(sel);
      } catch {
        if (seq === pickSeq.current) setError(t('place_load_error'));
      } finally {
        if (seq === pickSeq.current) setBusy(false);
      }
    },
    [busy, onChange, reset, takeSession, t],
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
    pickSeq.current++;
    setBusy(false);
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
          aria-label={t('ride_code_aria')}
        />
        <span className={styles.chipName}>{selected.secondary ?? selected.name}</span>
        <button type="button" className={styles.chipRm} onClick={clear} aria-label={t('ride_clear_aria')}>
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
        placeholder={placeholder ?? t('ride_code_placeholder_generic')}
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
      {error && <div role="alert" style={{ fontSize: 12, color: '#b3261e', padding: '4px 2px' }}>{error}</div>}
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
          <li role="presentation"><SearchAttribution results={results} /></li>
        </ul>
      )}
    </div>
  );
}
