'use client';

// HotelSearchPicker — search-first add-hotel flow. Mirrors PlaceSearchPicker
// (lodging results ranked first) and writes to hotel_booking via addAction.

import { useEffect, useMemo, useRef, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import { Bed, Plus } from '@/components/icons';
import type { Located, PlaceSuggestion } from '@/lib/places/types';
import { ensureCoords } from '@/lib/places/client';
import { hotelFormFrom } from '@/lib/places/pick';
import { extractGmapsUrl } from '@/lib/places/gmaps-link';
import { usePlaceSearch } from './use-place-search';
import { SearchAttribution } from './search-attribution';
import { HotelManualForm } from './hotel-manual-form';
import { HotelDatesModal, type HotelDates } from './hotel-dates-modal';
import { HotelPreviewModal } from './hotel-preview-modal';
import { useToast } from '@/components/toast';
import styles from './place-search-picker.module.css';

type Props = {
  tripId: string;
  addAction: (formData: FormData) => Promise<void>;
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export type { HotelDates };

export function HotelSearchPicker({ tripId, addAction, onClose, onBusyChange }: Props) {
  const { query, results, linkError, onQueryChange, reset, clearResults, takeSession } = usePlaceSearch({ limit: 8 });
  const ordered = useMemo(
    () => [...results].sort((a, b) => Number(b.kind === 'hotel') - Number(a.kind === 'hotel')),
    [results],
  );
  const [activeIdx, setActiveIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showManual, setShowManual] = useState(false);
  const [preview, setPreview] = useState<PlaceSuggestion | null>(null);
  const [datesFor, setDatesFor] = useState<Located | null>(null);
  const [resolving, setResolving] = useState(false);
  // Bumped on every pick; a resolve is stale if it moved.
  const pickSeq = useRef(0);

  const { toast } = useToast();

  function onInputChange(v: string) {
    onQueryChange(v);
    setActiveIdx(-1);
  }

  const submitHotel = useCallback(
    (s: Located, dates: HotelDates) => {
      const fd = new FormData();
      fd.set('tripId', tripId);
      for (const [k, v] of Object.entries(hotelFormFrom(s))) fd.set(k, v);
      fd.set('checkInDate', dates.checkInDate);
      fd.set('checkInTime', dates.checkInTime);
      fd.set('checkOutDate', dates.checkOutDate);
      fd.set('checkOutTime', dates.checkOutTime);

      startTransition(async () => {
        try {
          await addAction(fd);
          onClose?.();
          toast({ variant: 'success', title: 'Hotel added' });
        } catch (e) {
          if (e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: string }).digest === 'string' && ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT') || (e as { digest: string }).digest === 'NEXT_NOT_FOUND')) throw e;
          const msg = e instanceof Error ? e.message : '';
          setError(msg || 'Failed to add hotel');
          toast({ variant: 'error', title: "Couldn't save hotel", description: e instanceof Error ? e.message : undefined });
        } finally {
          reset();
        }
      });
    },
    [addAction, reset, tripId, onClose, toast],
  );

  const pick = async (s: PlaceSuggestion) => {
    const tok = takeSession(); // before the first await: ends the session synchronously
    const seq = ++pickSeq.current;
    setError(null);
    setResolving(true);
    try {
      const c = await ensureCoords(s, tok);
      if (seq !== pickSeq.current) return;
      if (!c) {
        setError("Couldn't load that place. Try another result.");
        return;
      }
      setDatesFor(c);
    } catch {
      if (seq === pickSeq.current) setError("Couldn't load that place. Try another result.");
    } finally {
      if (seq === pickSeq.current) setResolving(false);
    }
  };

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (ordered.length === 0) return;
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
      setActiveIdx(-1);
      clearResults();
    }
  }

  const busy = isPending || resolving;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="text"
          autoFocus
          autoComplete="off"
          value={query}
          placeholder="Search hotels or paste a Google Maps link…"
          className={styles.searchInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search hotels"
          disabled={busy}
        />
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {ordered.length > 0 && (
        <ul className={styles.list} role="listbox">
          {ordered.map((p, i) => {
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={i === activeIdx}
                className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => !busy && setPreview(p)}
              >
                <span className={styles.itemIcon}>
                  <Bed width={18} height={18} />
                </span>
                <div className={styles.itemBody}>
                  <div className={styles.itemMain}>{p.name}</div>
                  {p.secondary && (
                    <div className={styles.itemSecondary}>{p.secondary}</div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Add ${p.name}`}
                  className={styles.addBtn}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(p);
                  }}
                >
                  <Plus width={16} height={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {ordered.length > 0 && <SearchAttribution results={results} />}

      {linkError && <div className={styles.error}>Couldn&apos;t read this Google Maps link — try searching the name, or add it manually.</div>}
      {query.trim().length >= 2 && !extractGmapsUrl(query) && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`}
          target="_blank"
          rel="noreferrer noopener"
          className={styles.manualLink}
        >
          Find on Google Maps ↗
        </a>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className={styles.manualLink}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Manual Add
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelLink}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {preview ? (
        <HotelPreviewModal
          prediction={preview}
          adding={busy}
          onClose={() => setPreview(null)}
          onConfirm={() => {
            pick(preview);
            setPreview(null);
          }}
        />
      ) : null}

      {datesFor ? (
        <HotelDatesModal
          name={datesFor.name}
          submitting={busy}
          onCancel={() => setDatesFor(null)}
          onConfirm={(dates) => {
            submitHotel(datesFor, dates);
            setDatesFor(null);
          }}
        />
      ) : null}

      {showManual ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add hotel manually"
          onClick={() => setShowManual(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 560,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
              padding: 24,
            }}
          >
            <HotelManualForm
              tripId={tripId}
              action={addAction}
              onSuccess={() => {
                setShowManual(false);
                onClose?.();
              }}
              onCancel={() => setShowManual(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
