import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'Wander · Travel Planner', template: '%s · Wander' },
  description: 'Plan trips, share with friends, get there.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const themePref = (jar.get('theme')?.value ?? 'system') as
    | 'light'
    | 'dark'
    | 'system';
  const lang = jar.get('lang')?.value ?? 'en';

  // Initial data-theme; client script below resolves 'system' before paint.
  const initialTheme = themePref === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang={lang}
      data-theme={initialTheme}
      data-theme-pref={themePref}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          // No-flash: resolve 'system' on the client before first paint.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=document.documentElement.getAttribute('data-theme-pref');if(p==='system'){var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme', d?'dark':'light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
