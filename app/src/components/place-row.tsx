// PlaceRow — server component. Collapsed itinerary card.
// Ported from design/place-row.jsx (collapsed view only, no expand/edit/drag).

import { Bed, Fork, Transit, MapPin, Star, Note } from '@/components/icons';
import styles from './itinerary-list.module.css';

type Props = {
  idx: number;
  place: {
    id: string;
    kind: 'hotel' | 'food' | 'sight' | 'transit';
    name: string;
    category?: string | null;
    rating?: number | null;
    reviews?: number | null;
    time?: string | null;
    duration?: string | null;
    price?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    hours?: string | null;
    tags?: string[] | null;
    thumb?: string | null;
    note?: string | null;
    bookingRef?: string | null;
    bookingRoom?: string | null;
    bookingTotal?: string | null;
  };
};

function KindIcon({ kind }: { kind: Props['place']['kind'] }) {
  if (kind === 'hotel') return <Bed />;
  if (kind === 'food') return <Fork />;
  if (kind === 'transit') return <Transit />;
  return <MapPin />;
}

export function PlaceRow({ idx, place }: Props) {
  const thumbBg = place.thumb ?? '#e8e8ed';

  return (
    <div className={styles.place} data-place-id={place.id}>
      {/* Collapsed header: pin · thumb · main info · time */}
      <div className={styles.placeHead}>
        {/* Index circle */}
        <div className={styles.pin}>{idx + 1}</div>

        {/* Thumbnail swatch */}
        <div
          className={styles.placeThumb}
          style={{ background: thumbBg }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 48 48" width="48" height="48">
            <circle cx="34" cy="16" r="5" fill="rgba(255,255,255,0.7)" />
            <path
              d="M 4 38 L 16 26 L 24 32 L 36 22 L 48 32 L 48 48 L 4 48 Z"
              fill="rgba(255,255,255,0.6)"
            />
          </svg>
        </div>

        {/* Name + meta */}
        <div className={styles.placeMain}>
          <div className={styles.placeName}>{place.name}</div>
          <div className={styles.placeMeta}>
            <span className={styles.kindChip}>
              <KindIcon kind={place.kind} />
            </span>
            {place.rating != null && (
              <span className={styles.rating}>
                <Star />
                {place.rating}
              </span>
            )}
            {place.category && (
              <>
                <span className={styles.metaSep}>·</span>
                <span className={styles.metaText}>{place.category}</span>
              </>
            )}
            {place.duration && (
              <>
                <span className={styles.metaSep}>·</span>
                <span className={styles.metaText}>{place.duration}</span>
              </>
            )}
            {place.price && (
              <>
                <span className={styles.metaSep}>·</span>
                <span className={styles.price}>{place.price}</span>
              </>
            )}
          </div>
        </div>

        {/* Time pill */}
        {place.time && (
          <div className={styles.placeTime}>{place.time}</div>
        )}
      </div>

      {/* Note callout — shown when present */}
      {place.note && (
        <div className={styles.placeQuiet}>
          <div className={styles.chipNote}>
            <Note />
            <span>{place.note}</span>
          </div>
        </div>
      )}
    </div>
  );
}
