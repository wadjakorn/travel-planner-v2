'use client';

// BookingCardStay — a hotel booking rendered as a key-card: name, nights, then
// a perforated stub with the document data (check-in · confirmation · total).
// Presentational; the parent supplies action controls.

import { useState, type ReactNode } from 'react';
import type { HotelBooking } from '@/db/schema';
import { Check, MapPin } from '@/components/icons';
import { computeNights, formatCost, shortDate } from '@/lib/booking-format';
import { useT, useTp } from '@/components/i18n-provider';
import { gmapsSearchUrl } from '@/lib/gmaps';
import styles from './bookings-view.module.css';

type Props = {
  hotel: HotelBooking;
  itineraryHref?: string | null;
  actions?: ReactNode;
};

export function BookingCardStay({ hotel: h, itineraryHref, actions }: Props) {
  const t = useT();
  const tp = useTp();
  const [open, setOpen] = useState(false);
  const nights = computeNights(h.checkInDate, h.checkOutDate);
  const when = [shortDate(h.checkInDate), shortDate(h.checkOutDate)].filter(Boolean).join(' → ');
  // The address stays off the ticket face: it is the one field long enough to
  // wrap, and wrapping is what made stay tickets taller than ride tickets at
  // every width. It moves into the detail below, in full. The room is short
  // and identifies the booking, so it stays.
  const sub = h.room;
  const total = formatCost(h.costAmount, h.costCurrency ?? 'USD');
  const hasMapTarget = Boolean(h.address) || Boolean(h.placeIdExternal) || (h.lat != null && h.lng != null);
  const mapHref = hasMapTarget
    ? gmapsSearchUrl({ name: h.name, address: h.address, lat: h.lat, lng: h.lng, placeIdExternal: h.placeIdExternal })
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
          <span className={styles.kind}>{t('stay_kind_label')}</span>
          {when && <span className={styles.when}>{when}</span>}
        </div>
        <div className={styles.stayTitle}>{h.name}</div>
        <div className={styles.staySub}>
          {nights > 0 && <span className={styles.nights}>{tp('trip_nights', nights)}</span>}
          {sub && <span>{sub}</span>}
        </div>
      </div>

      <div className={styles.perf} aria-hidden />

      <div className={styles.stub}>
        {h.checkInTime && (
          <div className={styles.field}>
            <span className={styles.fl}>{t('stay_check_in_label')}</span>
            <span className={styles.fv}>{h.checkInTime}</span>
          </div>
        )}
        {h.ref && (
          <div className={styles.field}>
            <span className={styles.fl}>{t('stay_conf_label')}</span>
            <span className={styles.fv}>{h.ref}</span>
          </div>
        )}
        {total && (
          <div className={styles.field}>
            <span className={styles.fl}>{t('booking_total_label')}</span>
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
                  <Check aria-hidden /> {t('booking_on_itinerary')}
                </a>
              )}
              {mapHref && (
                <a className={`${styles.chip} ${styles.chipLink}`} href={mapHref} target="_blank" rel="noreferrer">
                  <MapPin aria-hidden /> {t('booking_show_on_map')}
                </a>
              )}
            </div>
            {(h.address || h.checkOutDate || h.guests != null || h.cancellation) && (
              <dl className={styles.drow}>
                {h.address && (
                  <>
                    <dt>{t('stay_address_label')}</dt>
                    <dd>{h.address}</dd>
                  </>
                )}
                {h.checkOutDate && (
                  <>
                    <dt>{t('stay_check_out_label')}</dt>
                    <dd className={styles.mono}>
                      {[shortDate(h.checkOutDate), h.checkOutTime].filter(Boolean).join(' · ')}
                    </dd>
                  </>
                )}
                {h.guests != null && (
                  <>
                    <dt>{t('stay_guests_label')}</dt>
                    <dd>{h.guests}</dd>
                  </>
                )}
                {h.cancellation && (
                  <>
                    <dt>{t('stay_cancellation_label')}</dt>
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
