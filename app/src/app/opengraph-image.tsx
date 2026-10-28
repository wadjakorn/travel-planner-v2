// Root Open Graph card (TP-0031, plan §3.3). Without this, the production URL
// shared on social previewed with no image at all.
//
// metadataBase is already set in layout.tsx, which is what makes a file-based
// opengraph route resolve to an absolute URL. Static content only — no DB, no
// secrets: this route is fetched by unauthenticated crawlers.
//
// The same palette as the trip card (trip/[id]/opengraph-image.tsx) so a
// shared trip and a shared home page look like the same product.
//
// The right half is the real product shot the landing hero uses (TP-0073), so
// a shared link previews the actual app rather than a styled mock. Files are
// read at build time — this route has no dynamic input, so it is prerendered.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Traver Planel — plan trips, share with friends, get there.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#141414';
const MUTED = '#6b6b6b';
const SURFACE = '#faf7f2';
const FRAME = '#e7e2d9';

function jpegDataUrl(bytes: Buffer): string {
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

export default async function Image() {
  // Literal paths, so the file tracer scopes them instead of the whole project.
  const [shot, logo] = (
    await Promise.all([
      readFile(join(process.cwd(), 'src/assets/landing/desktop-itinerary.jpg')),
      readFile(join(process.cwd(), 'public/logo.jpg')),
    ])
  ).map(jpegDataUrl);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: SURFACE,
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            width: 520,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 0 64px 64px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* satori renders plain <img>; next/image has no meaning here. */}
            <img src={logo} width={48} height={48} alt="" style={{ borderRadius: 12 }} />
            <div style={{ fontSize: 30, color: INK, fontWeight: 600 }}>
              Traver Planel
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 60, lineHeight: 1.08, color: INK, fontWeight: 700 }}>
              Plan trips, share with friends, get there.
            </div>
            <div style={{ fontSize: 28, lineHeight: 1.3, color: MUTED }}>
              Itinerary, map, hotels and budget in one place.
            </div>
          </div>
        </div>

        {/* Real screenshot, bleeding off the right and bottom edges. */}
        <div
          style={{
            position: 'absolute',
            left: 584,
            top: 72,
            width: 900,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 18,
            border: `2px solid ${FRAME}`,
            background: '#ffffff',
            boxShadow: '0 24px 60px -12px rgba(20,20,20,0.25)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: '#f3efe8' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: 999, background: FRAME }} />
            ))}
          </div>
          <img src={shot} width={900} height={563} alt="" />
        </div>
      </div>
    ),
    size,
  );
}
