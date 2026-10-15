'use client';

// PlaceSearchPicker — search-first add-place flow. Type, pick a result from
// /api/places, row inserted via addPlaceAction. "Manual Add" opens the
// manual form.

import { useEffect, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { Bed, Fork, Transit, MapPin, Plus } from '@/components/icons';
import type { Kind, PlaceDetail, PlaceSuggestion } from '@/lib/places/types';
import { resolvePlace } from '@/lib/places/client';
import { usePlaceSearch } from './use-place-search';
import { SearchAttribution } from './search-attribution';
import { PlaceManualForm } from './place-manual-form';
import { PlacePreviewModal } from './place-preview-modal';
import styles from './place-search-picker.module.css';

type Props = {
  dayId: string;
  tripId: string;
  addAction: (formData: FormData) => Promise<void>;
  variant?: 'page' | 'inline';
  minChars?: number;
  onBusyChange?: (busy: boolean) => void;
};

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === 'hotel') return <Bed width={18} height={18} />;
  if (kind === 'food') return <Fork width={18} height={18} />;
  if (kind === 'transit') return <Transit width={18} height={18} />;
  return <MapPin width={18} height={18} />;
}

export function PlaceSearchPicker({ dayId, tripId, addAction, variant = 'page', minChars = 2, onBusyChange }: Props) {
  const router = useRouter();

  const { query, results, onQueryChange, reset, clearResults } = usePlaceSearch({ minChars, limit: 8 });
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PlaceSuggestion | null>(null);
  const { toast } = useToast();
  const [showManual, setShowManual] = useState(false);

  function onInputChange(v: string) {
    onQueryChange(v);
    setActiveIdx(-1);
  }

  const submitPlace = useCallback(
    (place: PlaceDetail) => {
      const fd = new FormData();
      fd.set('dayId', dayId);
      fd.set('kind', place.kind);
      fd.set('name', place.name);
      fd.set('address', place.address ?? '');
      fd.set('lat', String(place.lat));
      fd.set('lng', String(place.lng));
      fd.set('placeIdExternal', place.id);
      fd.set('phone', place.phone ?? '');
      fd.set('website', place.website ?? '');
      fd.set('hours', place.hours ?? '');

      startTransition(async () => {
        try {
          await addAction(fd);
          router.refresh();
          toast({ variant: 'success', title: 'Place added' });
        } catch (e) {
          if (e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: unknown }).digest === 'string' && ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT') || (e as { digest: string }).digest === 'NEXT_NOT_FOUND')) throw e;
          const msg = e instanceof Error ? e.message : '';
          setError(msg || 'Failed to add place');
          toast({ variant: 'error', title: "Couldn't add place", description: e instanceof Error ? e.message : undefined });
        } finally {
          reset();
          setActiveIdx(-1);
          setPendingId(null);
          setPreview(null);
        }
      });
    },
    [addAction, dayId, reset, router, toast],
  );

  const pick = useCallback(
    async (s: PlaceSuggestion) => {
      setPendingId(s.id);
      setError(null);
      submitPlace(await resolvePlace(s));
    },
    [submitPlace],
  );

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
      clearResults();
    }
  }

  const busy = isPending || pendingId !== null;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const isInline = variant === 'inline';

  return (
    <div className={`${styles.wrap} ${isInline ? styles.wrapInline : ''}`}>
      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="text"
          autoFocus={!isInline}
          autoComplete="off"
          value={query}
          placeholder="Search places, restaurants, attractions…"
          className={styles.searchInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search places"
          disabled={busy}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {results.length > 0 && (
        <ul className={styles.list} role="listbox">
          {results.map((p, i) => {
            const isPending = pendingId === p.id;
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
                  <KindIcon kind={p.kind} />
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
                  {isPending ? (
                    <span className={styles.spinner} aria-hidden />
                  ) : (
                    <Plus width={16} height={16} />
                  )}
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
        {!isInline && (
          <Link href={`/trip/${tripId}`} className={styles.cancelLink}>
            Cancel
          </Link>
        )}
      </div>

      {showManual ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add place manually"
          onClick={() => setShowManual(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 100,
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
            <PlaceManualForm
              dayId={dayId}
              tripId={tripId}
              action={addAction}
              variant="modal"
              onSuccess={() => setShowManual(false)}
              onCancel={() => setShowManual(false)}
            />
          </div>
        </div>
      ) : null}

      {preview ? (
        <PlacePreviewModal
          prediction={preview}
          adding={busy}
          onClose={() => setPreview(null)}
          onConfirm={() => pick(preview)}
        />
      ) : null}
    </div>
  );
}
