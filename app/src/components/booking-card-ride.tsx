'use client';

// BookingCardRide — a transport booking rendered as a boarding-pass card:
// route (from → to), departure time, then a perforated stub with the document
// data (seat · ref · fare). Presentational; the parent supplies action controls.

import { useState, type ReactNode } from 'react';
import type { TransportBooking } from '@/db/schema';
import { Plane, Train, Car, Boat, Check, MapPin } from '@/components/icons';
import { formatCost, shortDate } from '@/lib/booking-format';
import { useLang, useT } from '@/components/i18n-provider';
import { localeTag } from '@/lib/week';
import type { MessageKey } from '@/lib/i18n-client';
import styles from './bookings-view.module.css';

// The itinerary row says "Car"; a booking card says "Car rental".
const TYPE_LABEL: Record<TransportBooking['type'], MessageKey> = {
  flight: 'ride_type_flight',
  train: 'ride_type_train',
  car: 'ride_type_car_rental',
  ferry: 'ride_type_ferry',
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

export function BookingCardRide({ transport: b, itineraryHref, actions }: Props) {
  const t = useT();
  const locale = localeTag(useLang());
  const [open, setOpen] = useState(false);
  const kindLabel = `${t(TYPE_LABEL[b.type])}${b.ref ? ` · ${b.ref}` : ''}`;
  const when = [shortDate(b.fromDate, locale), b.fromTime].filter(Boolean).join(' · ');
  const hasRoute = Boolean(b.fromCode || b.toCode || b.fromName || b.toName);
  const durLine = [b.duration, b.provider].filter(Boolean).join(' · ');
  const fare = formatCost(b.costAmount, b.costCurrency ?? 'USD', locale);

  return (
    <article
      id={b.id}
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
              {b.fromCode ? (
                <>
                  <div className={styles.bpCode}>{b.fromCode}</div>
                  {b.fromName && <div className={styles.bpPlace}>{b.fromName}</div>}
                </>
              ) : (
                <div className={styles.bpName}>{b.fromName || '—'}</div>
              )}
            </div>
            <div className={styles.bpMid}>
              <span className={styles.bpGlyph} aria-hidden>
                <TypeIcon type={b.type} />
              </span>
              <span className={styles.bpTrack} aria-hidden />
              {durLine && <span className={styles.bpDur}>{durLine}</span>}
            </div>
            <div className={`${styles.bpEnd} ${styles.bpRight}`}>
              {b.toCode ? (
                <>
                  <div className={styles.bpCode}>{b.toCode}</div>
                  {b.toName && <div className={styles.bpPlace}>{b.toName}</div>}
                </>
              ) : (
                <div className={styles.bpName}>{b.toName || '—'}</div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.rideTitle}>{b.title}</div>
        )}
      </div>

      <div className={styles.perf} aria-hidden />

      <div className={styles.stub}>
        {b.seats && (
          <div className={styles.field}>
            <span className={styles.fl}>{b.type === 'car' ? t('ride_vehicle_label') : t('ride_seat_label')}</span>
            <span className={styles.fv}>{b.seats}</span>
          </div>
        )}
        {b.ref && (
          <div className={styles.field}>
            <span className={styles.fl}>{t('booking_ref_label')}</span>
            <span className={styles.fv}>{b.ref}</span>
          </div>
        )}
        {fare && (
          <div className={styles.field}>
            <span className={styles.fl}>{t('ride_fare_label')}</span>
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
                  <Check aria-hidden /> {t('booking_on_itinerary')}
                </a>
                <a className={`${styles.chip} ${styles.chipLink}`} href={itineraryHref}>
                  <MapPin aria-hidden /> {t('booking_show_on_map')}
                </a>
              </div>
            )}
            {(b.bag || b.toTerminal || b.fromTerminal) && (
              <dl className={styles.drow}>
                {b.bag && (
                  <>
                    <dt>{t('ride_baggage_label')}</dt>
                    <dd>{b.bag}</dd>
                  </>
                )}
                {b.fromTerminal && (
                  <>
                    <dt>{t('ride_departs_label')}</dt>
                    <dd className={styles.mono}>{b.fromTerminal}</dd>
                  </>
                )}
                {b.toTerminal && (
                  <>
                    <dt>{t('ride_arrives_label')}</dt>
                    <dd className={styles.mono}>{b.toTerminal}</dd>
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
