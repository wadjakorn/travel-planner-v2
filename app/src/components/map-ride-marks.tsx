import type { CSSProperties } from 'react';
import { RIDE_COLOR } from '@/lib/map-helpers';
import type { MapRide } from '@/lib/map-helpers';
import { rideIcon } from './itinerary-ride-row';
import badgeStyles from './map-route-badge.module.css';
import styles from './map-ride-marks.module.css';

// DOM marks of a transport ride on the trip map (TP-0142), shared by the
// MapLibre Marker and Google AdvancedMarker renderers. Decorative and never
// interactive (R5): the day's stops keep the only tap targets.

/** Mid-arc type badge: RouteBadge's look, in the neutral ride colour. */
export function RideBadge({ type }: { type: MapRide['type'] }) {
  return (
    <div
      aria-hidden
      data-ride-badge={type}
      className={badgeStyles.badge}
      style={{ '--badge': RIDE_COLOR } as CSSProperties}
    >
      {rideIcon(type, { strokeWidth: 2 })}
    </div>
  );
}

/** A located ride end (departure or arrival). */
export function RideEndDot({ end }: { end: 'from' | 'to' }) {
  return <div aria-hidden data-ride-end={end} className={styles.end} />;
}
