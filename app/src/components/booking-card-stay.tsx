'use client';

// BookingCardStay — a hotel booking rendered as a key-card: name, nights, then
// a perforated stub with the document data (check-in · confirmation · total).
// Presentational; the parent supplies action controls.

import { useState, type ReactNode } from 'react';
import type { HotelBooking } from '@/db/schema';
import { Check, MapPin } from '@/components/icons';
import { computeNights, nightsLabel, formatCost, shortDate } from '@/lib/booking-format';
import styles from './bookings-view.module.css';

type Props = {
  hotel: HotelBooking;
  itineraryHref?: string | null;
  actions?: ReactNode;
};

export function BookingCardStay({ hotel: h, itineraryHref, actions }: Props) {
  const [open, setOpen] = useState(false);
  const nights = computeNights(h.checkInDate, h.checkOutDate);
  const when = [shortDate(h.checkInDate), shortDate(h.checkOutDate)].filter(Boolean).join(' → ');
  const sub = [h.address, h.room].filter(Boolean).join(' · ');
  const total = formatCost(h.costAmount, h.costCurrency ?? 'USD');
  const mapHref = h.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, ${h.address}`)}`
    : null;

  return (
    <article
      id={h.id}
      className={`${styles.ticket} ${styles.stay}`}
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
          <span className={styles.kind}>Stay</span>
          {when && <span className={styles.when}>{when}</span>}
        </div>
        <div className={styles.stayTitle}>{h.name}</div>
        <div className={styles.staySub}>
          {nights > 0 && <span className={styles.nights}>{nightsLabel(nights)}</span>}
          {sub && <span>{sub}</span>}
        </div>
      </div>

      <div className={styles.perf} aria-hidden />

      <div className={styles.stub}>
        {h.checkInTime && (
          <div className={styles.field}>
            <span className={styles.fl}>Check-in</span>
            <span className={styles.fv}>{h.checkInTime}</span>
          </div>
        )}
        {h.ref && (
          <div className={styles.field}>
            <span className={styles.fl}>Conf.</span>
            <span className={styles.fv}>{h.ref}</span>
          </div>
        )}
        {total && (
          <div className={styles.field}>
            <span className={styles.fl}>Total</span>
            <span className={styles.fv}>{total}</span>
          </div>
        )}
        <span className={styles.spacer} />
        <span className={styles.chev} aria-hidden>▾</span>
      </div>

      <div className={styles.detail}>
        <div className={styles.detailInner}>
          <div className={styles.detailBody}>
            <div className={styles.chips}>
              {itineraryHref && (
                <a className={`${styles.chip} ${styles.chipOn}`} href={itineraryHref}>
                  <Check aria-hidden /> On itinerary
                </a>
              )}
              {mapHref && (
                <a className={`${styles.chip} ${styles.chipLink}`} href={mapHref} target="_blank" rel="noreferrer">
                  <MapPin aria-hidden /> Show on map
                </a>
              )}
            </div>
            {(h.checkOutDate || h.guests != null || h.cancellation) && (
              <dl className={styles.drow}>
                {h.checkOutDate && (
                  <>
                    <dt>Check-out</dt>
                    <dd className={styles.mono}>
                      {[shortDate(h.checkOutDate), h.checkOutTime].filter(Boolean).join(' · ')}
                    </dd>
                  </>
                )}
                {h.guests != null && (
                  <>
                    <dt>Guests</dt>
                    <dd>{h.guests}</dd>
                  </>
                )}
                {h.cancellation && (
                  <>
                    <dt>Cancellation</dt>
                    <dd>{h.cancellation}</dd>
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
