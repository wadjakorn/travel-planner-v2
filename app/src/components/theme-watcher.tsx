'use client';

// Listens to OS prefers-color-scheme changes when user pref is 'system'
// and flips data-theme on <html>. No-op otherwise. Mounted in root layout.
//
// Appearance picker is "coming soon", so the app is pinned to light: while
// pref is 'system' we force light instead of following the OS. Restore the
// `mq.matches ? 'dark' : 'light'` resolution when the picker ships.

import { useEffect } from 'react';

export function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const pref = document.documentElement.getAttribute('data-theme-pref');
      if (pref !== 'system') return;
      document.documentElement.setAttribute('data-theme', 'light');
    };
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return null;
}
