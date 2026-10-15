'use client';

// HotelSearchPicker — search-first add-hotel flow. Mirrors PlaceSearchPicker
// and writes to hotel_booking via addAction.

import { useEffect, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import { Bed, Plus } from '@/components/icons';
import type { PlaceSuggestion } from '@/lib/places/types';
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
  const { query, results, onQueryChange, reset } = usePlaceSearch({ limit: 8 });
  const [activeIdx, setActiveIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showManual, setShowManual] = useState(false);
  const [preview, setPreview] = useState<PlaceSuggestion | null>(null);
  const [datesFor, setDatesFor] = useState<PlaceSuggestion | null>(null);

  const { toast } = useToast();

  function onInputChange(v: string) {
    onQueryChange(v);
    setActiveIdx(-1);
  }

  const submitHotel = useCallback(
    (s: PlaceSuggestion, dates: HotelDates) => {
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('name', s.name);
      fd.set('address', s.address ?? '');
      fd.set('lat', String(s.lat));
      fd.set('lng', String(s.lng));
      fd.set('placeIdExternal', s.id);
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

  const pick = (s: PlaceSuggestion) => {
    setError(null);
    setDatesFor(s);
  };

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
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
      setActiveIdx(-1);
      reset();
    }
  }

  const busy = isPending;
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
          placeholder="Search hotels…"
          className={styles.searchInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search hotels"
        />
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {results.length > 0 && (
        <ul className={styles.list} role="listbox">
          {results.map((p, i) => {
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
      {results.length > 0 && <SearchAttribution />}

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
