// Maps #5 — Open Graph image for a trip, backed by a Static Map.
//
// Privacy: this route is fetched by unauthenticated crawlers, so it only ever
// reveals a trip that is explicitly `isPublic`. Every other case (private trip,
// deleted trip, unknown id) renders the same generic branded card — an attacker
// cannot distinguish "private" from "does not exist".

import { ImageResponse } from 'next/og';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { db } from '@/db';
import { trips, days, places } from '@/db/schema';
import { fetchStaticMapDataUri, type LatLng } from '@/lib/static-map';

export const alt = 'Trip on Traver Planel';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Re-render at most once a day per trip. This is the main lever keeping the
// Static Maps SKU inside its 10k/month free tier.
export const revalidate = 86400;

const BRAND = '#e4572e';
const INK = '#141414';
const MUTED = '#6b6b6b';
const SURFACE = '#faf7f2';

const MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start) return '';
  const [sy, sm, sd] = start.split('-').map(Number);
  const startStr = `${MONTH[sm - 1]} ${sd}`;
  if (!end) return `${startStr}, ${sy}`;
  const [ey, em, ed] = end.split('-').map(Number);
  if (sy !== ey) return `${startStr}, ${sy} – ${MONTH[em - 1]} ${ed}, ${ey}`;
  if (sm !== em) return `${startStr} – ${MONTH[em - 1]} ${ed}, ${ey}`;
  return `${startStr}–${ed}, ${ey}`;
}

type PublicTrip = {
  title: string;
  subtitle: string | null;
  startDate: string | null;
  endDate: string | null;
  points: LatLng[];
  dayCount: number;
};

/** Returns the trip only when it is public; null in every other case. */
async function loadPublicTrip(tripId: string): Promise<PublicTrip | null> {
  const row = await db
    .select({
      title: trips.title,
      subtitle: trips.subtitle,
      startDate: trips.startDate,
      endDate: trips.endDate,
    })
    .from(trips)
    .where(
      and(
        eq(trips.id, tripId),
        eq(trips.isPublic, true),
        isNull(trips.deletedAt),
      ),
    )
    .limit(1);

  const trip = row[0];
  if (!trip) return null;

  const stops = await db
    .select({ dayId: places.dayId, lat: places.lat, lng: places.lng })
    .from(places)
    .innerJoin(days, eq(places.dayId, days.id))
    .where(and(eq(days.tripId, tripId), isNull(places.deletedAt)))
    .orderBy(asc(days.idx), asc(places.idx));

  const points = stops
    .filter((s): s is typeof s & { lat: number; lng: number } =>
      s.lat != null && s.lng != null,
    )
    .map((s) => ({ lat: s.lat, lng: s.lng }));

  return {
    ...trip,
    points,
    dayCount: new Set(stops.map((s) => s.dayId)).size,
  };
}

/**
 * Noto Sans Thai, so Thai trip titles do not render as tofu. Fetched from
 * Google Fonts (subset to the glyphs actually used) and cached indefinitely;
 * null on failure, in which case satori falls back to its bundled font.
 */
async function loadThaiFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@700&text=${encodeURIComponent(text)}`,
      { cache: 'force-cache', signal: AbortSignal.timeout(3000) },
    );
    if (!cssRes.ok) return null;
    const url = /src:\s*url\(([^)]+)\)/.exec(await cssRes.text())?.[1];
    if (!url) return null;

    const fontRes = await fetch(url, {
      cache: 'force-cache',
      signal: AbortSignal.timeout(3000),
    });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await loadPublicTrip(id).catch(() => null);

  const title = trip?.title ?? 'Traver Planel';
  const tagline = trip
    ? (trip.subtitle ?? 'Trip itinerary')
    : 'Plan trips, share with friends, get there.';

  const [mapUri, fontData] = await Promise.all([
    trip ? fetchStaticMapDataUri(trip.points) : Promise.resolve(null),
    loadThaiFont(`${title}${tagline}`),
  ]);

  const meta = trip
    ? [
        formatDateRange(trip.startDate, trip.endDate),
        trip.dayCount > 0
          ? `${trip.dayCount} ${trip.dayCount === 1 ? 'day' : 'days'}`
          : '',
        trip.points.length > 0
          ? `${trip.points.length} ${trip.points.length === 1 ? 'stop' : 'stops'}`
          : '',
      ].filter(Boolean).join('  ·  ')
    : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: SURFACE,
        }}
      >
        {/* Map band (or brand gradient when there is nothing to map) */}
        <div
          style={{
            display: 'flex',
            height: 400,
            width: '100%',
            position: 'relative',
            background: mapUri
              ? SURFACE
              : `linear-gradient(135deg, ${BRAND} 0%, #f2a65a 100%)`,
          }}
        >
          {mapUri && (
            // satori renders plain <img>; next/image has no meaning here.
            <img
              src={mapUri}
              alt=""
              width={1200}
              height={400}
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>

        {/* Caption */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            padding: '0 56px',
            borderTop: `6px solid ${BRAND}`,
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.1,
              // satori has no ellipsis: keep the box to one line's worth.
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 12,
              fontSize: 26,
              color: MUTED,
            }}
          >
            {meta || tagline}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: 'Noto Sans Thai', data: fontData, weight: 700, style: 'normal' as const }]
        : undefined,
    },
  );
}
