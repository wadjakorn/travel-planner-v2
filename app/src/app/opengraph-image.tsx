// Root Open Graph card (TP-0031, plan §3.3). Without this, the production URL
// shared on social previewed with no image at all.
//
// metadataBase is already set in layout.tsx, which is what makes a file-based
// opengraph route resolve to an absolute URL. Static content only — no DB, no
// secrets: this route is fetched by unauthenticated crawlers.
//
// The same palette as the trip card (trip/[id]/opengraph-image.tsx) so a
// shared trip and a shared home page look like the same product.

import { ImageResponse } from 'next/og';

export const alt = 'Traver Planel — plan trips, share with friends, get there.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BRAND = '#e4572e';
const INK = '#141414';
const MUTED = '#6b6b6b';
const SURFACE = '#faf7f2';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: SURFACE,
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: BRAND,
            }}
          />
          <div style={{ fontSize: 30, color: INK, fontWeight: 600 }}>
            Traver Planel
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.05,
              color: INK,
              fontWeight: 700,
              maxWidth: 900,
            }}
          >
            Plan trips, share with friends, get there.
          </div>
          <div style={{ fontSize: 32, color: MUTED, maxWidth: 860 }}>
            Itinerary, map, hotels and budget in one place.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {['Itinerary', 'Map & routes', 'Bookings', 'Budget'].map((label) => (
            <div
              key={label}
              style={{
                fontSize: 24,
                color: MUTED,
                border: `2px solid ${MUTED}33`,
                borderRadius: 999,
                padding: '10px 24px',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
