'use client';

// BookingsView — consolidated travel-wallet: hotels + transport in one
// date-grouped, filterable list. Owns filter state, gap markers, add chooser,
// and per-card delete busy/toast handling. Cards are presentational.

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BookingItem } from '@/lib/bookings-merge';
import { gapNights } from '@/lib/bookings-merge';
import { formatCost, shortDate } from '@/lib/booking-format';
import { useToast } from '@/components/toast';
import { Plus, Trash, Edit, External, Bed, Plane } from '@/components/icons';
import { BookingCardStay } from './booking-card-stay';
import { BookingCardRide } from './booking-card-ride';
import { ConfirmDialog } from './confirm-dialog';
import styles from './bookings-view.module.css';

type Filter = 'all' | 'stay' | 'move';

type Props = {
  tripId: string;
  items: BookingItem[];
  tripName?: string | null;
  removeHotelAction: (formData: FormData) => Promise<void>;
  removeTransportAction: (formData: FormData) => Promise<void>;
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
  removeHotelAction,
  removeTransportAction,
  canEdit = true,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startDelete] = useTransition();
  const [chooser, setChooser] = useState(false);
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

  const total = items.reduce(
    (s, i) => s + (i.kind === 'stay' ? i.hotel.costAmount ?? 0 : i.transport.costAmount ?? 0),
    0,
  );
  const currency =
    hotels.find((h) => h.costCurrency)?.costCurrency ??
    rides.find((r) => r.costCurrency)?.costCurrency ??
    'USD';
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
        router.refresh();
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
      <header className={styles.head}>
        <div className={styles.eyebrow}>Reservations{tripName ? ` · ${tripName}` : ''}</div>
        <div className={styles.headRow}>
          <h1 className={styles.title}>Bookings</h1>
          {total > 0 && (
            <div className={styles.total}>
              <div className={styles.totalK}>Total</div>
              <div className={styles.totalV}>{formatCost(total, currency)}</div>
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
                            <a href={it.hotel.attachmentUrl} target="_blank" rel="noreferrer" className={styles.actionDoc}>
                              <External aria-hidden /> Voucher
                            </a>
                          )}
                          <Link href={`/trip/${tripId}/booking/hotel/${it.hotel.id}/edit`}>
                            <Edit aria-hidden /> Edit
                          </Link>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            disabled={busyId === it.hotel.id}
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
                          </button>
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
                            <a href={it.transport.attachmentUrl} target="_blank" rel="noreferrer" className={styles.actionDoc}>
                              <External aria-hidden /> Ticket PDF
                            </a>
                          )}
                          <Link href={`/trip/${tripId}/booking/transport/${it.transport.id}/edit`}>
                            <Edit aria-hidden /> Edit
                          </Link>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            disabled={busyId === it.transport.id}
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
                          </button>
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
              <Link className={styles.chooserItem} href={`/trip/${tripId}/booking/hotel/new`} role="menuitem">
                <Bed aria-hidden /> Stay
              </Link>
              <Link className={styles.chooserItem} href={`/trip/${tripId}/booking/transport/new`} role="menuitem">
                <Plane aria-hidden /> Transport
              </Link>
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
    </div>
  );
}
