// PlaceRow — server component. Collapsed itinerary card.

import { Bed, Fork, Transit, MapPin, Star, Note, Help, External, GMaps } from '@/components/icons';
import { gmapsSearchUrl } from '@/lib/gmaps';
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
    lat?: number | null;
    lng?: number | null;
    placeIdExternal?: string | null;
  };
  active?: boolean;
};

function isPlaceMock(p: Props['place']): boolean {
  return p.lat == null || p.lng == null;
}

function prettyHost(url: string): string {
  // Strip protocol + tracking query so "https://x.jp/?utm_source=…" → "x.jp".
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function KindIcon({ kind }: { kind: Props['place']['kind'] }) {
  if (kind === 'hotel') return <Bed />;
  if (kind === 'food') return <Fork />;
  if (kind === 'transit') return <Transit />;
  return <MapPin />;
}

export function PlaceRow({ idx, place, active = false }: Props) {
  const thumbBg = place.thumb ?? '#e8e8ed';
  const isMock = isPlaceMock(place);
  const gmapsUrl = gmapsSearchUrl({
    name: place.name,
    address: place.address ?? null,
  });

  return (
    <div
      className={`${styles.place}${isMock ? ` ${styles.placeMock}` : ''}${active ? ` ${styles.placeActive}` : ''}`}
      data-place-id={place.id}
      data-mock={isMock ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
    >
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

      {/* Unverified place — collapsed banner */}
      {isMock && (
        <div className={styles.placeQuiet}>
          <a
            className={styles.chipUnverified}
            href={gmapsSearchUrl({ name: place.name, address: place.address ?? null })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Help width={12} height={12} />
            <span>Unverified place — re-search on Google Maps</span>
            <External width={11} height={11} />
          </a>
        </div>
      )}

      {/* Note callout — shown when present (collapsed) */}
      {!active && place.note && (
        <div className={styles.placeQuiet}>
          <div className={styles.chipNote}>
            <Note />
            <span>{place.note}</span>
          </div>
        </div>
      )}

      {/* Expanded body — REQUIREMENTS §5 (tags, when, hours, address, phone,
          website, note, action buttons). Visible only when active. */}
      {active && (
        <div className={styles.placeExpanded}>
          {place.tags && place.tags.length > 0 && (
            <div className={styles.tagRow}>
              {place.tags.map((t) => (
                <span key={t} className={styles.tagChip}>
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className={styles.expandedGrid}>
            {(place.time || place.duration) && (
              <div className={styles.expandedField}>
                <div className={styles.expandedLabel}>When</div>
                <div className={styles.expandedValue}>
                  {[place.time, place.duration].filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
            {place.hours && (
              <div className={`${styles.expandedField} ${styles.expandedFull}`}>
                <div className={styles.expandedLabel}>Hours</div>
                <div className={styles.hoursList}>
                  {place.hours
                    .split(/\s*;\s*/)
                    .filter(Boolean)
                    .map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                </div>
              </div>
            )}
            {place.address && (
              <div className={`${styles.expandedField} ${styles.expandedFull}`}>
                <div className={styles.expandedLabel}>Address</div>
                <a
                  className={styles.expandedLink}
                  href={gmapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {place.address}
                  <External width={10} height={10} />
                </a>
              </div>
            )}
            {place.phone && (
              <div className={styles.expandedField}>
                <div className={styles.expandedLabel}>Phone</div>
                <a className={styles.expandedLink} href={`tel:${place.phone}`}>
                  {place.phone}
                </a>
              </div>
            )}
            {place.website && (
              <div className={styles.expandedField}>
                <div className={styles.expandedLabel}>Website</div>
                <a
                  className={styles.expandedLink}
                  href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {prettyHost(place.website)}
                  <External width={10} height={10} />
                </a>
              </div>
            )}
          </div>
          {place.note && (
            <div className={`${styles.chipNote}`}>
              <Note />
              <span>{place.note}</span>
            </div>
          )}
          <div className={styles.actionRow}>
            <a
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GMaps />
              Open in Maps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
