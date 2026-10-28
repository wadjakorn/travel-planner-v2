import type { Metadata } from 'next';
import { Geist, Geist_Mono, Noto_Sans_Thai } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeWatcher } from '@/components/theme-watcher';
import { Suspense } from 'react';
import { ToastProvider } from '@/components/toast';
import { PendingSaveProvider } from '@/components/pending-saves';
import { RouteProgress } from '@/components/route-progress';
import { MapsConfigProvider } from '@/components/maps-config-provider';
import { MAPS_CONFIG, toClientMapsConfig } from '@/lib/maps/config';
import { siteUrl } from '@/lib/site-url';
import { hasSessionCookie } from '@/lib/session-cookie';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Thai companion for Geist — Latin glyphs come from Geist, Thai from here via
// the font-family fallback chain (see globals.css --font-sans/--font-mono).
const notoThai = Noto_Sans_Thai({
  variable: '--font-noto-thai',
  subsets: ['thai'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  // Required for file-based opengraph-image routes to resolve to absolute URLs.
  metadataBase: new URL(siteUrl()),
  title: { default: 'Traver Planel', template: '%s · Traver Planel' },
  description: 'Plan trips, share with friends, get there.',
};

// Resolve theme server-side from the `theme` cookie (set by saveSettingsAction).
// Appearance picker is "coming soon", so the app is pinned to light: 'system'
// resolves to light (not the OS theme) everywhere. The pre-paint script keeps
// data-theme in sync with the pref without following the OS. Restore the
// matchMedia system->dark resolution here when the picker ships.
type ThemePref = 'light' | 'dark' | 'system';

const NO_FLASH = `(function(){try{var p=document.documentElement.getAttribute('data-theme-pref');document.documentElement.setAttribute('data-theme',p==='dark'?'dark':'light');}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const pref = (cookieStore.get('theme')?.value ?? 'light') as ThemePref;
  // Lets CSS keep signed-in-only skeletons away from visitors: `/` streams
  // (home)/loading.tsx's trip grid before it knows who is asking (TP-0072).
  const session = hasSessionCookie(cookieStore.getAll().map((c) => c.name));
  const resolved = pref === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={resolved}
      data-theme-pref={pref}
      data-session={session ? '' : undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${notoThai.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-full flex flex-col">
        <MapsConfigProvider value={toClientMapsConfig(MAPS_CONFIG)}>
          <ThemeWatcher />
          <ToastProvider>
            <PendingSaveProvider>
              <Suspense fallback={null}>
                <RouteProgress />
              </Suspense>
              {children}
            </PendingSaveProvider>
          </ToastProvider>
        </MapsConfigProvider>
      </body>
    </html>
  );
}
