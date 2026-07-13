import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeWatcher } from '@/components/theme-watcher';
import { ToastProvider } from '@/components/toast';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
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
  const pref = ((await cookies()).get('theme')?.value ?? 'light') as ThemePref;
  const resolved = pref === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={resolved}
      data-theme-pref={pref}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeWatcher />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
