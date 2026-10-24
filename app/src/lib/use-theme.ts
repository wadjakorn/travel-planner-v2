'use client';

// Client hook: current resolved app theme from <html data-theme>. Tracks live
// changes (settings toggle, system switch) via MutationObserver. Initialises
// from the DOM when available; the only callers are ssr:false map components,
// so there is no hydration mismatch. Reading it up front means the Google map
// is created once with the right colour scheme instead of light-then-dark.

import { useEffect, useState } from 'react';

export function themeFromAttr(v: string | null): 'light' | 'dark' {
  return v === 'dark' ? 'dark' : 'light';
}

export function useTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document === 'undefined'
      ? 'light'
      : themeFromAttr(document.documentElement.getAttribute('data-theme')),
  );

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(themeFromAttr(el.getAttribute('data-theme')));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}
