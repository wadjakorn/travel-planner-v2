'use client';

// A transport booking shown on the itinerary for the day it departs. Links to
// its card on the Bookings page. Rendered by DaysAccordion above the day's
// places — the ride is how you arrive/leave that day.

import Link from 'next/link';
import type { DisplayRide } from '@/lib/day-augment';
import { Plane, Train, Car, Boat } from '@/components/icons';
import styles from './itinerary-ride-row.module.css';

const TYPE_LABEL: Record<DisplayRide['type'], string> = {
  flight: 'Flight',
  train: 'Train',
  car: 'Car',
  ferry: 'Ferry',
};

function RideIcon({ type }: { type: DisplayRide['type'] }) {
  if (type === 'train') return <Train />;
  if (type === 'car') return <Car />;
  if (type === 'ferry') return <Boat />;
  return <Plane />;
}

export function ItineraryRideRow({ ride, tripId }: { ride: DisplayRide; tripId: string }) {
  return (
    <Link href={`/trip/${tripId}/bookings#${ride.id}`} className={styles.row}>
      <span className={styles.ico} aria-hidden>
        <RideIcon type={ride.type} />
      </span>
      <span className={styles.body}>
        <span className={styles.route}>
          <b>{ride.fromLabel ?? '—'}</b>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <b>{ride.toLabel ?? '—'}</b>
        </span>
        <span className={styles.kind}>{TYPE_LABEL[ride.type]}</span>
      </span>
      <span className={styles.meta}>
        {ride.time && <span className={styles.time}>{ride.time}</span>}
        {ride.overnight && <span className={styles.overnight}>+1d</span>}
      </span>
    </Link>
  );
}
