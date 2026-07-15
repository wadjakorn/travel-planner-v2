'use client';

// BookingCardRide — a transport booking rendered as a boarding-pass card:
// route (from → to), departure time, then a perforated stub with the document
// data (seat · ref · fare). Presentational; the parent supplies action controls.

import { useState, type ReactNode } from 'react';
import type { TransportBooking } from '@/db/schema';
import { Plane, Train, Car, Boat, Check, MapPin } from '@/components/icons';
import { formatCost, shortDate } from '@/lib/booking-format';
import styles from './bookings-view.module.css';

const TYPE_LABEL: Record<TransportBooking['type'], string> = {
  flight: 'Flight',
  train: 'Train',
  car: 'Car rental',
  ferry: 'Ferry',
};

function TypeIcon({ type }: { type: TransportBooking['type'] }) {
  if (type === 'train') return <Train />;
  if (type === 'car') return <Car />;
  if (type === 'ferry') return <Boat />;
  return <Plane />;
}

type Props = {
  transport: TransportBooking;
  itineraryHref?: string | null;
  actions?: ReactNode;
};

export function BookingCardRide({ transport: t, itineraryHref, actions }: Props) {
  const [open, setOpen] = useState(false);
  const kindLabel = `${TYPE_LABEL[t.type]}${t.ref ? ` · ${t.ref}` : ''}`;
  const when = [shortDate(t.fromDate), t.fromTime].filter(Boolean).join(' · ');
  const hasRoute = Boolean(t.fromCode || t.toCode || t.fromName || t.toName);
  const durLine = [t.duration, t.provider].filter(Boolean).join(' · ');
  const fare = formatCost(t.costAmount, t.costCurrency ?? 'USD');

  return (
    <article
      id={t.id}
      className={`${styles.ticket} ${styles.move}`}
      aria-expanded={open}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
    >
      <span className={styles.accent} aria-hidden />
      <div className={styles.top}>
        <div className={styles.kindRow}>
          <span className={styles.kind}>{kindLabel}</span>
          {when && <span className={styles.when}>{when}</span>}
        </div>

        {hasRoute ? (
          <div className={styles.bp}>
            <div className={styles.bpEnd}>
              {t.fromCode ? (
                <>
                  <div className={styles.bpCode}>{t.fromCode}</div>
                  {t.fromName && <div className={styles.bpPlace}>{t.fromName}</div>}
                </>
              ) : (
                <div className={styles.bpName}>{t.fromName || '—'}</div>
              )}
            </div>
            <div className={styles.bpMid}>
              <span className={styles.bpGlyph} aria-hidden>
                <TypeIcon type={t.type} />
              </span>
              <span className={styles.bpTrack} aria-hidden />
              {durLine && <span className={styles.bpDur}>{durLine}</span>}
            </div>
            <div className={`${styles.bpEnd} ${styles.bpRight}`}>
              {t.toCode ? (
                <>
                  <div className={styles.bpCode}>{t.toCode}</div>
                  {t.toName && <div className={styles.bpPlace}>{t.toName}</div>}
                </>
              ) : (
                <div className={styles.bpName}>{t.toName || '—'}</div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.rideTitle}>{t.title}</div>
        )}
      </div>

      <div className={styles.perf} aria-hidden />

      <div className={styles.stub}>
        {t.seats && (
          <div className={styles.field}>
            <span className={styles.fl}>{t.type === 'car' ? 'Vehicle' : 'Seat'}</span>
            <span className={styles.fv}>{t.seats}</span>
          </div>
        )}
        {t.ref && (
          <div className={styles.field}>
            <span className={styles.fl}>Booking ref</span>
            <span className={styles.fv}>{t.ref}</span>
          </div>
        )}
        {fare && (
          <div className={styles.field}>
            <span className={styles.fl}>Fare</span>
            <span className={styles.fv}>{fare}</span>
          </div>
        )}
        <span className={styles.spacer} />
        <span className={styles.chev} aria-hidden>▾</span>
      </div>

      <div className={styles.detail}>
        <div className={styles.detailInner}>
          <div className={styles.detailBody}>
            {itineraryHref && (
              <div className={styles.chips}>
                <a className={`${styles.chip} ${styles.chipOn}`} href={itineraryHref}>
                  <Check aria-hidden /> On itinerary
                </a>
                <a className={`${styles.chip} ${styles.chipLink}`} href={itineraryHref}>
                  <MapPin aria-hidden /> Show on map
                </a>
              </div>
            )}
            {(t.bag || t.toTerminal || t.fromTerminal) && (
              <dl className={styles.drow}>
                {t.bag && (
                  <>
                    <dt>Baggage</dt>
                    <dd>{t.bag}</dd>
                  </>
                )}
                {t.fromTerminal && (
                  <>
                    <dt>Departs</dt>
                    <dd className={styles.mono}>{t.fromTerminal}</dd>
                  </>
                )}
                {t.toTerminal && (
                  <>
                    <dt>Arrives</dt>
                    <dd className={styles.mono}>{t.toTerminal}</dd>
                  </>
                )}
              </dl>
            )}
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>
        </div>
      </div>
    </article>
  );
}
