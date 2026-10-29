// PlaceRow — collapsed itinerary card; expands in place when active.

import { Bed, Fork, Transit, MapPin, Star, Note, Help, External, GMaps } from '@/components/icons';
import { gmapsSearchUrl } from '@/lib/gmaps';
import { pinGoogleId } from '@/lib/map-helpers';
import { PlaceRowPhoto } from '@/components/place-row-photo';
import { statusBadgeLabel, type GoogleStatus } from '@/lib/places/google-sync';
import type { DayHours } from '@/lib/opening-hours';
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
    dayHours?: DayHours | null;
    tags?: string[] | null;
    thumb?: string | null;
    note?: string | null;
    bookingRef?: string | null;
    bookingRoom?: string | null;
    bookingTotal?: string | null;
    lat?: number | null;
    lng?: number | null;
    placeIdExternal?: string | null;
    googleStatus?: GoogleStatus | null;
    status?: 'confirmed' | 'tbd' | null;
  };
  active?: boolean;
  /** Its map pin is hovered (lib/maps/hover-store): linked highlight. */
  hovered?: boolean;
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

function hoursLines(hours: string): string[] {
  return hours.split(/\s*;\s*/).filter(Boolean);
}

function HoursList({ hours }: { hours: string }) {
  return (
    <div className={styles.hoursList}>
      {hoursLines(hours).map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

export function PlaceRow({ idx, place, active = false, hovered = false }: Props) {
  const isMock = isPlaceMock(place);
  const gmapsUrl = gmapsSearchUrl({
    name: place.name,
    address: place.address ?? null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    placeIdExternal: place.placeIdExternal ?? null,
  });

  return (
    <div
      className={`${styles.place}${isMock ? ` ${styles.placeMock}` : ''}${active ? ` ${styles.placeActive}` : ''}${hovered && !active ? ` ${styles.placeLinked}` : ''}`}
      data-place-id={place.id}
      data-mock={isMock ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      data-hover={hovered ? 'true' : undefined}
    >
      {/* Collapsed header: pin · thumb · main info · time */}
      <div className={styles.placeHead}>
        {/* Index circle */}
        <div className={styles.pin}>{idx + 1}</div>

        {/* Kind tile — free; the real photo loads only on expand. */}
        <div className={styles.placeThumb} data-kind={place.kind} aria-hidden="true">
          <KindIcon kind={place.kind} />
        </div>

        {/* Name + meta */}
        <div className={styles.placeMain}>
          <div className={styles.placeName}>{place.name}</div>
          <div className={styles.placeMeta}>
            {place.status === 'tbd' && (
              <span className={styles.statusBadge} data-tbd="true">
                TBD
              </span>
            )}
            {statusBadgeLabel(place.googleStatus) && (
              <span
                className={styles.statusBadge}
                data-closed={place.googleStatus === 'CLOSED_PERMANENTLY' ? 'permanent' : 'temporary'}
              >
                {statusBadgeLabel(place.googleStatus)}
              </span>
            )}
            {place.dayHours?.closed && (
              <span className={styles.statusBadge} data-closed="temporary">
                Closed {place.dayHours.weekday}
              </span>
            )}
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
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Help width={12} height={12} />
            <span>Not matched to a map place</span>
            <span className={styles.chipAction}>Find on map</span>
            <External width={11} height={11} />
          </a>
        </div>
      )}

      {/* Note callout — first line only when collapsed */}
      {!active && place.note && (
        <div className={styles.placeQuiet}>
          <div className={styles.chipNote}>
            <Note />
            <span>{place.note.split(/\r?\n/)[0]}</span>
          </div>
        </div>
      )}

      {/* Expanded body — REQUIREMENTS §5 (tags, when, hours, address, phone,
          website, note, action buttons). Visible only when active. */}
      {active && (
        <div className={styles.placeExpanded}>
          <PlaceRowPhoto googleId={pinGoogleId(place.placeIdExternal)} />
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
                {place.dayHours ? (
                  <>
                    <div className={`${styles.hoursList} ${styles.hoursToday}`}>
                      {place.dayHours.weekday} · {place.dayHours.text}
                    </div>
                    {hoursLines(place.hours).length > 1 && (
                      <details className={styles.hoursAll}>
                        <summary>All week</summary>
                        <HoursList hours={place.hours} />
                      </details>
                    )}
                  </>
                ) : (
                  <HoursList hours={place.hours} />
                )}
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
