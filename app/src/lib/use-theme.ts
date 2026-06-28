'use client';

// Client hook: current resolved app theme from <html data-theme>. Tracks live
// changes (settings toggle, system switch) via MutationObserver. SSR-safe —
// starts 'light' and corrects on mount.

import { useEffect, useState } from 'react';

export function useTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const el = document.documentElement;
    const read = () =>
      setTheme(el.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}
