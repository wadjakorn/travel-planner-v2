'use client';

// BookingsView — consolidated travel-wallet: hotels + transport in one
// date-grouped, filterable list. Owns filter state, gap markers, add chooser,
// and per-card delete busy/toast handling. Cards are presentational.

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { HotelBooking, TransportBooking } from '@/db/schema';
import type { BookingItem } from '@/lib/bookings-merge';
import { gapNights } from '@/lib/bookings-merge';
import { formatCost, shortDate } from '@/lib/booking-format';
import { useToast } from '@/components/toast';
import { Plus, Trash, Edit, External, Bed, Plane } from '@/components/icons';
import { BookingCardStay } from './booking-card-stay';
import { BookingCardRide } from './booking-card-ride';
import { ConfirmDialog } from './confirm-dialog';
import { Modal } from '@/components/ui';
import { HotelFormClient, type HotelFormHandle } from './hotel-form-client';
import { TransportFormClient, type TransportFormHandle } from './transport-form-client';
import { effectiveCurrency } from '@/lib/trip-currency';
import { PageContainer } from '@/components/ui/page-container';
import { Button } from '@/components/ui';
import styles from './bookings-view.module.css';

type Filter = 'all' | 'stay' | 'move';

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
  addHotelInlineAction: (formData: FormData) => Promise<void>;
  updateHotelInlineAction: (formData: FormData) => Promise<void>;
  addTransportInlineAction: (formData: FormData) => Promise<void>;
  updateTransportInlineAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
};

function primaryDate(it: BookingItem): string | null {
  return it.date;
}

/** "Sat, Jul 12" from an ISO date. */
function dayHeading(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', {
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
  addHotelInlineAction,
  updateHotelInlineAction,
  addTransportInlineAction,
  updateTransportInlineAction,
  canEdit = true,
}: Props) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [chooser, setChooser] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const formHandleRef = useRef<HotelFormHandle | TransportFormHandle | null>(null);

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
  const gaps = useMemo(() => new Set(gapNights(hotels)), [hotels]);

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
  const dates = items.map(primaryDate).filter(Boolean) as string[];
  const range =
    dates.length > 0
      ? `${shortDate(dates[0])}${dates.length > 1 ? `–${shortDate(dates[dates.length - 1])}` : ''}`
      : null;

  const visible = filter === 'all' ? items : items.filter((i) => (filter === 'stay' ? i.kind === 'stay' : i.kind === 'ride'));

  // Runs the actual removal after the user confirms in the dialog.
  function runDelete(action: (fd: FormData) => Promise<void>, id: string) {
    const fd = new FormData();
    fd.set('bookingId', id);
    setBusyId(id);
    setPendingDelete(null);
    startDelete(async () => {
      try {
        await action(fd);
        toast({ variant: 'success', title: 'Booking removed' });
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          'digest' in err &&
          typeof (err as { digest: string }).digest === 'string' &&
          ((err as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
            (err as { digest: string }).digest === 'NEXT_NOT_FOUND')
        )
          throw err;
        toast({
          variant: 'error',
          title: "Couldn't remove booking",
          description: err instanceof Error ? err.message : undefined,
        });
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

  function itineraryHref(dayIdx: number | null | undefined): string | null {
    return dayIdx != null ? `/trip/${tripId}?day=${dayIdx}` : null;
  }

  const stayCount = hotels.length;
  const rideCount = rides.length;

  return (
    <div className={styles.wrap}>
      <PageContainer>
      <header className={styles.head}>
        <div className={styles.eyebrow}>Reservations{tripName ? ` · ${tripName}` : ''}</div>
        <div className={styles.headRow}>
          <h1 className={styles.title}>Bookings</h1>
          {total > 0 && (
            <div className={styles.total}>
              <div className={styles.totalK}>Total</div>
              <div className={styles.totalV}>{formatCost(total, currency)}</div>
              {otherCurrencyCount > 0 && (
                <div className={styles.totalNote}>
                  +{otherCurrencyCount} in another currency
                </div>
              )}
            </div>
          )}
        </div>
        <div className={styles.headSub}>
          {stayCount} {stayCount === 1 ? 'stay' : 'stays'} · {rideCount} {rideCount === 1 ? 'ride' : 'rides'}
          {range && <> · {range}</>} &nbsp;·&nbsp;{' '}
          <Link className={styles.headLink} href={`/trip/${tripId}`}>
            See on itinerary →
          </Link>
        </div>
      </header>

      <div className={styles.filter} role="tablist" aria-label="Filter bookings">
        <button
          className={styles.filterBtn}
          role="tab"
          aria-selected={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={styles.filterBtn}
          role="tab"
          aria-selected={filter === 'stay'}
          onClick={() => setFilter('stay')}
        >
          <span className={`${styles.tick} ${styles.tickStay}`} />
          Stays
        </button>
        <button
          className={styles.filterBtn}
          role="tab"
          aria-selected={filter === 'move'}
          onClick={() => setFilter('move')}
        >
          <span className={`${styles.tick} ${styles.tickMove}`} />
          Transport
        </button>
      </div>

      <div className={styles.list}>
        {visible.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Nothing here yet</div>
            <p>Add a stay or a ride — it lands here and, once dated, shows on your itinerary and map.</p>
          </div>
        )}

        {groups.map((g, gi) => {
          const gapForDate = filter === 'all' && g.date && gaps.has(g.date);
          return (
            <div key={g.date ?? `undated-${gi}`}>
              <div className={styles.dateH}>
                <span className={styles.d}>
                  <b>{g.date ? dayHeading(g.date) : 'Undated'}</b>
                </span>
                <span className={styles.rule} />
              </div>

              {gapForDate && (
                <div className={styles.gapNote}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 17h.01" />
                  </svg>
                  No stay booked for the night of {shortDate(g.date)}
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
                                <External aria-hidden /> Voucher
                              </a>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className={styles.actionBtn}
                            onClick={() => setOverlay({ mode: 'edit', kind: 'stay', hotel: it.hotel })}
                          >
                            <Edit aria-hidden /> Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`${styles.actionBtn} ${styles.actionDanger}`}
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
                            <Trash aria-hidden /> Delete
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
                                <External aria-hidden /> Ticket PDF
                              </a>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className={styles.actionBtn}
                            onClick={() => setOverlay({ mode: 'edit', kind: 'ride', transport: it.transport })}
                          >
                            <Edit aria-hidden /> Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`${styles.actionBtn} ${styles.actionDanger}`}
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
                            <Trash aria-hidden /> Delete
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

      {canEdit && (
        <div className={styles.addBar}>
          {chooser && (
            <div className={styles.chooser} role="menu">
              <button
                type="button"
                className={styles.chooserItem}
                role="menuitem"
                onClick={() => {
                  setChooser(false);
                  setOverlay({ mode: 'add', kind: 'stay' });
                }}
              >
                <Bed aria-hidden /> Stay
              </button>
              <button
                type="button"
                className={styles.chooserItem}
                role="menuitem"
                onClick={() => {
                  setChooser(false);
                  setOverlay({ mode: 'add', kind: 'ride' });
                }}
              >
                <Plane aria-hidden /> Transport
              </button>
            </div>
          )}
          <button
            className={styles.add}
            type="button"
            aria-haspopup="menu"
            aria-expanded={chooser}
            onClick={() => setChooser((v) => !v)}
          >
            <Plus aria-hidden />
            Add booking
          </button>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === 'ride' ? 'Remove this ride?' : 'Remove this stay?'}
        message={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed from your bookings.`
            : undefined
        }
        confirmLabel="Remove"
        busy={busyId !== null}
        onConfirm={() => {
          if (pendingDelete) runDelete(pendingDelete.action, pendingDelete.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <Modal
        open={overlay !== null}
        onRequestClose={requestCloseOverlay}
        title={
          overlay?.kind === 'stay'
            ? overlay.mode === 'edit'
              ? 'Edit hotel'
              : 'Add hotel'
            : overlay?.mode === 'edit'
              ? 'Edit transport'
              : 'Add transport'
        }
      >
        {overlay?.kind === 'stay' && (
          <HotelFormClient
            key={overlay.mode === 'edit' ? overlay.hotel.id : 'add-stay'}
            ref={formHandleRef as React.Ref<HotelFormHandle>}
            mode={overlay.mode}
            action={overlay.mode === 'edit' ? updateHotelInlineAction : addHotelInlineAction}
            deleteAction={overlay.mode === 'edit' ? removeHotelAction : undefined}
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
            deleteAction={overlay.mode === 'edit' ? removeTransportAction : undefined}
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
