'use client';

// PlaceSearchPicker — search-first add-place flow. Type, pick a result from
// /api/places, row inserted via addPlaceAction. "Manual Add" opens the
// manual form.

import { useEffect, useId, useMemo, useRef, useState, useCallback, useTransition, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { Bed, Fork, Transit, MapPin, Plus } from '@/components/icons';
import type { Kind, PlaceDetail, PlaceSuggestion } from '@/lib/places/types';
import { ensureCoords, resolvePlace } from '@/lib/places/client';
import { createCoordsResolver, toMapPreviewData } from '@/lib/map-preview';
import { useMapPreview } from './map-preview-context';
import { extractGmapsUrl } from '@/lib/places/gmaps-link';
import { placeFormFrom } from '@/lib/places/pick';
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
  /** "Day 3": shown on the map preview's Add button (inline variant). */
  dayLabel?: string;
  minChars?: number;
  onBusyChange?: (busy: boolean) => void;
};

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === 'hotel') return <Bed width={18} height={18} />;
  if (kind === 'food') return <Fork width={18} height={18} />;
  if (kind === 'transit') return <Transit width={18} height={18} />;
  return <MapPin width={18} height={18} />;
}

const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;

export function PlaceSearchPicker({ dayId, tripId, addAction, variant = 'page', dayLabel, minChars = 2, onBusyChange }: Props) {
  const router = useRouter();

  const { query, results, linkError, onQueryChange, reset, clearResults, takeSession } = usePlaceSearch({ minChars, limit: 8 });
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [modalPlace, setModalPlace] = useState<PlaceSuggestion | null>(null);
  const { toast } = useToast();
  const [showManual, setShowManual] = useState(false);
  // Bumped on every pick; a resolve is stale if it moved.
  const pickSeq = useRef(0);

  // Trip-map preview (TP-0062, inline variant only). The context owns the
  // state; this picker's preview is the one it published (ownerId).
  const isInline = variant === 'inline';
  const ownerId = useId();
  const { preview: mapPreview, begin, setPreview, clearPreview, setFullMap } = useMapPreview();
  const previewId = isInline && mapPreview?.ownerId === ownerId ? mapPreview.id : null;
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // Coords for Google suggestions: one Essentials call per place, no session
  // token (the add's Enterprise call keeps it), cached across queries.
  const resolveCoords = useMemo(() => createCoordsResolver((s) => ensureCoords(s, null, 'preview')), []);
  const exitPreview = useCallback(() => clearPreview(ownerId), [clearPreview, ownerId]);

  function onInputChange(v: string) {
    onQueryChange(v);
    setActiveIdx(-1);
    exitPreview(); // new search
  }

  const submitPlace = useCallback(
    (place: PlaceDetail) => {
      const fd = new FormData();
      fd.set('dayId', dayId);
      for (const [k, v] of Object.entries(placeFormFrom(place))) fd.set(k, v);

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
          setModalPlace(null);
          exitPreview(); // added (or failed): the numbered pin takes over
        }
      });
    },
    [addAction, dayId, exitPreview, reset, router, toast],
  );

  const busyRef = useRef(false);

  // Resolves to whether the add started (the map popup resets "Adding…" on false).
  const pick = useCallback(
    async (s: PlaceSuggestion): Promise<boolean> => {
      if (busyRef.current) return false;
      const tok = takeSession(); // before the first await: ends the session synchronously
      const seq = ++pickSeq.current;
      setPendingId(s.id);
      setError(null);
      const fail = () => {
        setError("Couldn't load that place. Try another result.");
        setPendingId(null);
        // The aside (and this error line) is hidden in mobile full-map mode.
        toast({ variant: 'error', title: "Couldn't add place", description: 'Try another result.' });
      };
      try {
        const place = await resolvePlace(s, { session: tok, fields: 'full' });
        if (seq !== pickSeq.current) return false;
        if (!place) {
          fail();
          return false;
        }
        submitPlace(place); // clears pendingId in its transition's finally
        return true;
      } catch {
        if (seq === pickSeq.current) fail();
        return false;
      }
    },
    [submitPlace, takeSession, toast],
  );

  const showOnMap = useCallback(
    async (s: PlaceSuggestion, openMap: boolean) => {
      const token = begin();
      setResolvingId(s.id);
      setError(null);
      const l = await resolveCoords(s);
      setResolvingId((cur) => (cur === s.id ? null : cur));
      if (!l) {
        setError("Couldn't show that place on the map.");
        if (!openMap) setModalPlace(s); // desktop fallback: the old preview
        return;
      }
      const shown = setPreview(
        { ...toMapPreviewData(l), ownerId, dayLabel: dayLabel ?? 'day', onAdd: () => pick(s), onClose: exitPreview },
        token,
      );
      if (shown && openMap) setFullMap(true);
    },
    [begin, dayLabel, exitPreview, ownerId, pick, resolveCoords, setFullMap, setPreview],
  );

  // Row click / Enter: preview on the desktop map, else the modal.
  function activateRow(p: PlaceSuggestion) {
    if (busyRef.current) return;
    if (isInline && isDesktop()) void showOnMap(p, false);
    else setModalPlace(p);
  }

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
      activateRow(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setActiveIdx(-1);
      clearResults();
      exitPreview();
    }
  }

  const busy = isPending || pendingId !== null;

  useEffect(() => {
    busyRef.current = busy;
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Esc exits the preview wherever focus is (map, popup, page).
  useEffect(() => {
    if (!previewId) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') exitPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewId, exitPreview]);

  // Collapsed day / left the itinerary: the popup's Add target is gone.
  useEffect(() => exitPreview, [exitPreview]);

  // Mobile: lift the input to the top of the scroll pane so the results open
  // above the fold, clear of the fixed List/Map pill. The spacer gives the pane
  // room to scroll when the picker sits near the end of the itinerary.
  const boxRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const hasResults = results.length > 0;
  const lifted = isInline && (focused || hasResults);
  // Re-lifts when results arrive: the on-screen keyboard can cancel the first scroll.
  useEffect(() => {
    if (!lifted || !window.matchMedia('(max-width: 767.98px)').matches) return;
    boxRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [lifted, hasResults]);

  return (
    <div className={`${styles.wrap} ${isInline ? styles.wrapInline : ''}`}>
      <div ref={boxRef} className={styles.searchBox}>
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
            placeholder="Search places or paste a Google Maps link…"
            className={styles.searchInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Search places"
            disabled={busy}
          />
        </div>
  
        {results.length > 0 && (
          <ul className={styles.list} role="listbox">
            {results.map((p, i) => {
              const isPending = pendingId === p.id;
              return (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''} ${previewId === p.id ? styles.itemPreviewed : ''}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => activateRow(p)}
                >
                  <span className={styles.itemIcon}>
                    {resolvingId === p.id ? (
                      <span className={`${styles.spinner} ${styles.spinnerDark}`} aria-hidden />
                    ) : (
                      <KindIcon kind={p.kind} />
                    )}
                  </span>
                  <div className={styles.itemBody}>
                    <div className={styles.itemMain}>{p.name}</div>
                    {p.secondary && (
                      <div className={styles.itemSecondary}>{p.secondary}</div>
                    )}
                    {previewId === p.id && <span className="sr-only">Shown on map</span>}
                  </div>
                  {isInline && (
                    <button
                      type="button"
                      aria-label={`View ${p.name} on map`}
                      className={styles.mapBtn}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void showOnMap(p, true);
                      }}
                    >
                      {resolvingId === p.id ? (
                        <span className={`${styles.spinner} ${styles.spinnerDark}`} aria-hidden />
                      ) : (
                        <MapPin width={16} height={16} />
                      )}
                    </button>
                  )}
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
            <li role="presentation"><SearchAttribution results={results} /></li>
          </ul>
        )}
      </div>

      {lifted && <div className={styles.liftSpacer} aria-hidden />}

      {error && <div className={styles.error}>{error}</div>}

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

      {modalPlace ? (
        <PlacePreviewModal
          prediction={modalPlace}
          adding={busy}
          onClose={() => setModalPlace(null)}
          onConfirm={() => void pick(modalPlace)}
        />
      ) : null}
    </div>
  );
}
