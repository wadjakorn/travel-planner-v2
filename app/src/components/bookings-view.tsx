'use client';

// BookingsView — consolidated travel-wallet: hotels + transport in one
// date-grouped, filterable list. Owns filter state, gap markers, add chooser,
// and per-card delete busy/toast handling. Cards are presentational.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { HotelBooking, TransportBooking } from '@/db/schema';
import type { BookingItem } from '@/lib/bookings-merge';
import { gapNights, bookingsDateRange } from '@/lib/bookings-merge';
import { bookingsEmptyKeys, formatCost, shortDate, type BookingFilter } from '@/lib/booking-format';
import { useToast } from '@/components/toast';
import { useLang, useT, useTp } from '@/components/i18n-provider';
import { localeTag } from '@/lib/week';
import { isNavigationError, logActionFailure } from '@/lib/action-errors';
import type { ActionResult } from '@/lib/action-result';
import { Plus, Trash, Edit, External, Bed, Plane } from '@/components/icons';
import { BookingCardStay } from './booking-card-stay';
import { BookingCardRide } from './booking-card-ride';
import { ConfirmDialog } from './confirm-dialog';
import { Modal } from '@/components/ui';
import { HotelFormClient, type HotelFormHandle } from './hotel-form-client';
import { TransportFormClient, type TransportFormHandle } from './transport-form-client';
import { effectiveCurrency } from '@/lib/trip-currency';
import { PageContainer } from '@/components/ui/page-container';
import { Button, OverlayLink } from '@/components/ui';
import styles from './bookings-view.module.css';

type Filter = BookingFilter;

type Overlay =
  | { mode: 'add'; kind: 'stay' }
  | { mode: 'add'; kind: 'ride' }
  | { mode: 'edit'; kind: 'stay'; hotel: HotelBooking }
  | { mode: 'edit'; kind: 'ride'; transport: TransportBooking }
  | null;

type Props = {
  tripId: string;
  items: BookingItem[];
  tripName?: string | null;
  // Single source of truth for how amounts are labelled across the app.
  tripCurrency: string;
  // Scopes the overlay forms' date pickers to trip ± a few days, same as
  // the standalone routes.
  tripStart?: string | null;
  tripEnd?: string | null;
  removeHotelAction: (formData: FormData) => Promise<void>;
  removeTransportAction: (formData: FormData) => Promise<void>;
  restoreHotelAction: (formData: FormData) => Promise<ActionResult>;
  restoreTransportAction: (formData: FormData) => Promise<ActionResult>;
  addHotelInlineAction: (formData: FormData) => Promise<void>;
  updateHotelInlineAction: (formData: FormData) => Promise<void>;
  addTransportInlineAction: (formData: FormData) => Promise<void>;
  updateTransportInlineAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
};

/** "Sat, Jul 12" from an ISO date; `locale` is localeTag(lang). */
function dayHeading(iso: string, locale: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function BookingsView({
  tripId,
  items,
  tripName,
  tripCurrency,
  tripStart,
  tripEnd,
  removeHotelAction,
  removeTransportAction,
  restoreHotelAction,
  restoreTransportAction,
  addHotelInlineAction,
  updateHotelInlineAction,
  addTransportInlineAction,
  updateTransportInlineAction,
  canEdit = true,
}: Props) {
  const { toast } = useToast();
  const t = useT();
  const locale = localeTag(useLang());
  const tp = useTp();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [chooser, setChooser] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const formHandleRef = useRef<HotelFormHandle | TransportFormHandle | null>(null);
  const addRef = useRef<HTMLDetailsElement>(null);

  // A native <details> closes on neither Escape nor an outside click, and on
  // desktop the open chooser would otherwise sit over the list indefinitely.
  // Focus leaving it (Tab past Transport) closes it too, or it would cover
  // the filter tabs the focus lands on next.
  useEffect(() => {
    if (!chooser) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setChooser(false);
      addRef.current?.querySelector('summary')?.focus();
    }
    function onOutside(e: Event) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setChooser(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [chooser]);

  function closeOverlay() {
    setOverlay(null);
  }

  // Every close path — Escape, backdrop click — goes through the active
  // form's own dirty check, not straight to closeOverlay.
  function requestCloseOverlay() {
    if (formHandleRef.current) formHandleRef.current.requestClose(closeOverlay);
    else closeOverlay();
  }
  // Booking pending confirmation for removal (null = dialog closed).
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    kind: 'stay' | 'ride';
    action: (fd: FormData) => Promise<void>;
  } | null>(null);

  const hotels = useMemo(() => items.filter((i) => i.kind === 'stay').map((i) => i.hotel), [items]);
  const rides = useMemo(() => items.filter((i) => i.kind === 'ride').map((i) => i.transport), [items]);
  const gaps = useMemo(
    () => gapNights(hotels, tripStart, tripEnd),
    [hotels, tripStart, tripEnd],
  );
  const gapSet = useMemo(() => new Set(gaps), [gaps]);

  // Same rule as the budget page: one trip, one currency, no conversion. A
  // booking in another currency is left out of the total and counted instead —
  // summing THB into a ฿-labelled figure alongside ¥ rows produces a number
  // that is wrong in a way nobody can see.
  const costs = items.map((i) => (i.kind === 'stay' ? i.hotel : i.transport));
  const total = costs.reduce(
    (s, b) =>
      effectiveCurrency(b.costCurrency, tripCurrency) === tripCurrency
        ? s + (b.costAmount ?? 0)
        : s,
    0,
  );
  const otherCurrencyCount = costs.filter(
    (b) =>
      b.costAmount != null &&
      effectiveCurrency(b.costCurrency, tripCurrency) !== tripCurrency,
  ).length;
  const currency = tripCurrency;
  // Spans to the last check-out / arrival, not the last check-in — a single
  // five-night stay used to report itself as one day.
  const span = bookingsDateRange(items);
  const range = span
    ? span.end === span.start
      ? shortDate(span.start, locale)
      : `${shortDate(span.start, locale)}–${shortDate(span.end, locale)}`
    : null;

  const visible = filter === 'all' ? items : items.filter((i) => (filter === 'stay' ? i.kind === 'stay' : i.kind === 'ride'));

  // After an Undo, focus lands on the restored card instead of dropping to
  // <body> with the dismissed toast. The card only exists once the
  // revalidated list commits, so the move waits for the next `items`.
  const focusAfterRestore = useRef<string | null>(null);
  useEffect(() => {
    const id = focusAfterRestore.current;
    if (!id) return;
    focusAfterRestore.current = null;
    document.getElementById(id)?.focus();
  }, [items]);

  // "Undo" on the delete toast: the server clears deletedAt (10-minute window)
  // and revalidates, so the booking repaints in place.
  function undoDelete(kind: 'stay' | 'ride', id: string) {
    const fd = new FormData();
    fd.set('bookingId', id);
    startDelete(async () => {
      try {
        const result = await (kind === 'stay' ? restoreHotelAction : restoreTransportAction)(fd);
        if (result.ok) {
          focusAfterRestore.current = id;
          toast({ variant: 'success', title: t('booking_restored_toast') });
        } else {
          toast({ variant: 'error', title: t('booking_restore_error'), description: result.message });
        }
      } catch (err) {
        if (isNavigationError(err)) throw err;
        logActionFailure('restore booking', err);
        toast({ variant: 'error', title: t('booking_restore_error'), description: t('err_try_again_body') });
      }
    });
  }

  function toastDeleted(kind: 'stay' | 'ride', id: string) {
    toast({
      variant: 'success',
      title: t('booking_deleted_toast'),
      action: { label: t('undo'), onAction: () => undoDelete(kind, id) },
    });
  }

  // Delete from the edit overlay: the form confirms, closes on success and
  // rethrows failures itself; this only adds the same Undo toast as the list.
  async function deleteStayFromOverlay(fd: FormData) {
    await removeHotelAction(fd);
    toastDeleted('stay', String(fd.get('bookingId')));
  }
  async function deleteRideFromOverlay(fd: FormData) {
    await removeTransportAction(fd);
    toastDeleted('ride', String(fd.get('bookingId')));
  }

  // Runs the actual removal after the user confirms in the dialog.
  function runDelete(kind: 'stay' | 'ride', action: (fd: FormData) => Promise<void>, id: string) {
    const fd = new FormData();
    fd.set('bookingId', id);
    setBusyId(id);
    setPendingDelete(null);
    startDelete(async () => {
      try {
        await action(fd);
        toastDeleted(kind, id);
      } catch (err) {
        if (isNavigationError(err)) throw err;
        logActionFailure('delete booking', err);
        toast({ variant: 'error', title: t('booking_delete_error'), description: t('err_try_again_body') });
      } finally {
        setBusyId(null);
      }
    });
  }

  // Build the ordered render sequence: date header → gap notes for that date →
  // items on that date. Undated items fall under a trailing "Undated" group.
  const groups: { date: string | null; items: BookingItem[] }[] = [];
  for (const it of visible) {
    const last = groups[groups.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else groups.push({ date: it.date, items: [it] });
  }

  // A gap night usually has no booking of its own — that is what makes it a
  // gap — so it would have no group to be announced in. Give it an empty one
  // and re-sort, undated last.
  if (filter === 'all') {
    for (const night of gaps) {
      if (!groups.some((g) => g.date === night)) groups.push({ date: night, items: [] });
    }
    groups.sort((a, b) => {
      const ak = a.date ?? '￿';
      const bk = b.date ?? '￿';
      return ak === bk ? 0 : ak < bk ? -1 : 1;
    });
  }

  function itineraryHref(dayIdx: number | null | undefined): string | null {
    return dayIdx != null ? `/trip/${tripId}?day=${dayIdx}` : null;
  }

  const stayCount = hotels.length;
  const rideCount = rides.length;

  // Hoisted: the kind/mode comparisons are string literals, which the i18n
  // guard would flag inside a title attribute.
  const deleteTitle =
    pendingDelete?.kind === 'ride' ? t('ride_delete_confirm_title') : t('stay_delete_confirm_title');
  const overlayTitle =
    overlay?.kind === 'stay'
      ? overlay.mode === 'edit'
        ? t('stay_edit_title')
        : t('stay_add_title')
      : overlay?.mode === 'edit'
        ? t('ride_edit_title')
        : t('ride_add_title');

  return (
    <div className={styles.wrap}>
      <PageContainer className={styles.column}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>
          {tripName ? t('booking_eyebrow_trip', { trip: tripName }) : t('booking_eyebrow')}
        </div>
        <div className={styles.headRow}>
          <h1 className={styles.title}>{t('bookings')}</h1>
          {/* Below 768px this wrapper is display: contents and the
              <details> is a fixed pill over the bottom nav; from 768px up
              it stacks "Add booking" under the Total. */}
          <div className={styles.headActions}>
            {total > 0 && (
              <div className={styles.total}>
                <div className={styles.totalK}>{t('booking_total_label')}</div>
                <div className={styles.totalV}>{formatCost(total, currency, locale)}</div>
                {otherCurrencyCount > 0 && (
                  <div className={styles.totalNote}>
                    {t('booking_other_currency', { n: otherCurrencyCount })}
                  </div>
                )}
              </div>
            )}
            {/* <details> rather than a JS-toggled popover: without scripting the
                disclosure still opens, so the two links inside it are the no-JS
                route to the add forms. */}
            {canEdit && (
              <details
                ref={addRef}
                className={styles.addBar}
                open={chooser}
                onToggle={(e) => setChooser(e.currentTarget.open)}
              >
                <summary className={styles.add}>
                  <Plus aria-hidden />
                  {t('booking_add')}
                </summary>
                <div className={styles.chooser}>
                  <OverlayLink
                    className={styles.chooserItem}
                    href={`/trip/${tripId}/booking/hotel/new`}
                    onOpen={() => {
                      setChooser(false);
                      setOverlay({ mode: 'add', kind: 'stay' });
                    }}
                  >
                    <Bed aria-hidden /> {t('stay_kind_label')}
                  </OverlayLink>
                  <OverlayLink
                    className={styles.chooserItem}
                    href={`/trip/${tripId}/booking/transport/new`}
                    onOpen={() => {
                      setChooser(false);
                      setOverlay({ mode: 'add', kind: 'ride' });
                    }}
                  >
                    <Plane aria-hidden /> {t('transport')}
                  </OverlayLink>
                </div>
              </details>
            )}
          </div>
        </div>
        <div className={styles.headSub}>
          {tp('booking_stays', stayCount)} · {tp('booking_rides', rideCount)}
          {range && <> · {range}</>} &nbsp;·&nbsp;{' '}
          <Link className={styles.headLink} href={`/trip/${tripId}`}>
            {t('booking_see_on_itinerary')}
          </Link>
        </div>
      </header>

      <div className={styles.filter} role="tablist" aria-label={t('booking_filter_aria')}>
        <button
          className={styles.filterBtn}
          role="tab"
          aria-selected={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          {t('booking_filter_all')}
        </button>
        <button
          className={styles.filterBtn}
          role="tab"
          aria-selected={filter === 'stay'}
          onClick={() => setFilter('stay')}
        >
          <span className={`${styles.tick} ${styles.tickStay}`} />
          {t('hotels')}
        </button>
        <button
          className={styles.filterBtn}
          role="tab"
          aria-selected={filter === 'move'}
          onClick={() => setFilter('move')}
        >
          <span className={`${styles.tick} ${styles.tickMove}`} />
          {t('transport')}
        </button>
      </div>

      <div className={styles.list}>
        {visible.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>{t(bookingsEmptyKeys(filter).title)}</div>
            <p>{t(bookingsEmptyKeys(filter).body)}</p>
          </div>
        )}

        {groups.map((g, gi) => {
          const gapForDate = filter === 'all' && g.date && gapSet.has(g.date);
          return (
            <div key={g.date ?? `undated-${gi}`}>
              <div className={styles.dateH}>
                <span className={styles.d}>
                  <b>{g.date ? dayHeading(g.date, locale) : t('booking_undated')}</b>
                </span>
                <span className={styles.rule} />
              </div>

              {/* Above the day's tickets: the gap is a fact about the night,
                  not about any one booking. */}
              {gapForDate && (
                <div className={styles.gapNote}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 17h.01" />
                  </svg>
                  {t('booking_gap_night', { date: shortDate(g.date, locale) })}
                </div>
              )}

              {g.items.map((it) =>
                it.kind === 'stay' ? (
                  <BookingCardStay
                    key={it.hotel.id}
                    hotel={it.hotel}
                    itineraryHref={itineraryHref(it.hotel.dayIdx)}
                    actions={
                      canEdit ? (
                        <>
                          {it.hotel.attachmentUrl && (
                            <Button asChild variant="secondary" size="sm" className={`${styles.actionBtn} ${styles.actionDoc}`}>
                              <a href={it.hotel.attachmentUrl} target="_blank" rel="noreferrer">
                                <External aria-hidden /> {t('booking_voucher')}
                              </a>
                            </Button>
                          )}
                          <Button asChild variant="secondary" size="sm" className={styles.actionBtn}>
                            <OverlayLink
                              href={`/trip/${tripId}/booking/hotel/${it.hotel.id}/edit`}
                              onOpen={() => setOverlay({ mode: 'edit', kind: 'stay', hotel: it.hotel })}
                            >
                              <Edit aria-hidden /> {t('booking_edit')}
                            </OverlayLink>
                          </Button>
                          <Button
                            type="button"
                            variant="dangerQuiet"
                            size="sm"
                            className={styles.actionBtn}
                            loading={isDeleting && busyId === it.hotel.id}
                            onClick={() =>
                              setPendingDelete({
                                id: it.hotel.id,
                                name: it.hotel.name,
                                kind: 'stay',
                                action: removeHotelAction,
                              })
                            }
                          >
                            <Trash aria-hidden /> {t('delete')}
                          </Button>
                        </>
                      ) : undefined
                    }
                  />
                ) : (
                  <BookingCardRide
                    key={it.transport.id}
                    transport={it.transport}
                    itineraryHref={itineraryHref(it.transport.dayIdx)}
                    actions={
                      canEdit ? (
                        <>
                          {it.transport.attachmentUrl && (
                            <Button asChild variant="secondary" size="sm" className={`${styles.actionBtn} ${styles.actionDoc}`}>
                              <a href={it.transport.attachmentUrl} target="_blank" rel="noreferrer">
                                <External aria-hidden /> {t('booking_ticket_pdf')}
                              </a>
                            </Button>
                          )}
                          <Button asChild variant="secondary" size="sm" className={styles.actionBtn}>
                            <OverlayLink
                              href={`/trip/${tripId}/booking/transport/${it.transport.id}/edit`}
                              onOpen={() =>
                                setOverlay({ mode: 'edit', kind: 'ride', transport: it.transport })
                              }
                            >
                              <Edit aria-hidden /> {t('booking_edit')}
                            </OverlayLink>
                          </Button>
                          <Button
                            type="button"
                            variant="dangerQuiet"
                            size="sm"
                            className={styles.actionBtn}
                            loading={isDeleting && busyId === it.transport.id}
                            onClick={() =>
                              setPendingDelete({
                                id: it.transport.id,
                                name: it.transport.title,
                                kind: 'ride',
                                action: removeTransportAction,
                              })
                            }
                          >
                            <Trash aria-hidden /> {t('delete')}
                          </Button>
                        </>
                      ) : undefined
                    }
                  />
                ),
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={deleteTitle}
        message={
          pendingDelete
            ? t('booking_delete_confirm_body', { name: pendingDelete.name })
            : undefined
        }
        confirmLabel={t('delete')}
        busy={busyId !== null}
        onConfirm={() => {
          if (pendingDelete) runDelete(pendingDelete.kind, pendingDelete.action, pendingDelete.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <Modal
        open={overlay !== null}
        onRequestClose={requestCloseOverlay}
        title={overlayTitle}
      >
        {overlay?.kind === 'stay' && (
          <HotelFormClient
            key={overlay.mode === 'edit' ? overlay.hotel.id : 'add-stay'}
            ref={formHandleRef as React.Ref<HotelFormHandle>}
            mode={overlay.mode}
            action={overlay.mode === 'edit' ? updateHotelInlineAction : addHotelInlineAction}
            deleteAction={overlay.mode === 'edit' ? deleteStayFromOverlay : undefined}
            hidden={overlay.mode === 'edit' ? { bookingId: overlay.hotel.id } : { tripId }}
            initial={overlay.mode === 'edit' ? overlay.hotel : undefined}
            tripCurrency={tripCurrency}
            tripStart={tripStart}
            tripEnd={tripEnd}
            onDone={closeOverlay}
            onCancel={closeOverlay}
          />
        )}
        {overlay?.kind === 'ride' && (
          <TransportFormClient
            key={overlay.mode === 'edit' ? overlay.transport.id : 'add-ride'}
            ref={formHandleRef as React.Ref<TransportFormHandle>}
            mode={overlay.mode}
            action={overlay.mode === 'edit' ? updateTransportInlineAction : addTransportInlineAction}
            deleteAction={overlay.mode === 'edit' ? deleteRideFromOverlay : undefined}
            hidden={overlay.mode === 'edit' ? { bookingId: overlay.transport.id } : { tripId }}
            initial={overlay.mode === 'edit' ? overlay.transport : { type: 'flight' }}
            tripCurrency={tripCurrency}
            tripStart={tripStart}
            tripEnd={tripEnd}
            onDone={closeOverlay}
            onCancel={closeOverlay}
          />
        )}
      </Modal>
      </PageContainer>
    </div>
  );
}
