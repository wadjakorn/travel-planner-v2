'use client';

// Listens to OS prefers-color-scheme changes when user pref is 'system'
// and flips data-theme on <html>. No-op otherwise. Mounted in root layout.

import { useEffect } from 'react';

export function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const pref = document.documentElement.getAttribute('data-theme-pref');
      if (pref !== 'system') return;
      document.documentElement.setAttribute(
        'data-theme',
        mq.matches ? 'dark' : 'light',
      );
    };
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return null;
}
