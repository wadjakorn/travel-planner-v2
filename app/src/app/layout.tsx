import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeWatcher } from '@/components/theme-watcher';

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
// 'system' renders provisional light; the pre-paint script corrects it before
// first paint to avoid a flash. ThemeWatcher tracks OS changes while 'system'.
type ThemePref = 'light' | 'dark' | 'system';

const NO_FLASH = `(function(){try{var p=document.documentElement.getAttribute('data-theme-pref');if(p==='system'){var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',d?'dark':'light');}}catch(e){}})();`;

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
      data-theme={resolved}
      data-theme-pref={pref}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
