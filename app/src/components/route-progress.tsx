'use client';

// A top-of-window progress bar for navigations, app-wide.
//
// The App Router has no router events, and useLinkStatus only reports for the
// one Link it sits inside — neither gives a single place to answer "is a
// navigation happening right now". So this listens for clicks on internal
// anchors (the same capture-phase trick the save guard uses) and clears itself
// when the URL actually changes. Any <Link> anywhere gets the feedback for
// free, including the settings folio tabs.
//
// Mounted once in the root layout. Segment-level loading.tsx files still do the
// heavy lifting for slow pages; this covers the gap before one of those renders.

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import styles from './route-progress.module.css';

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  // The URL changed, so whatever was in flight has landed.
  useEffect(() => {
    setActive(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      if (anchor.getAttribute('aria-disabled') === 'true') return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.href === window.location.href) return;
      setActive(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // A navigation that never resolves (blocked by a guard, a cancelled click)
  // must not leave the bar running forever.
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div className={styles.track} role="status" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div className={styles.bar} />
    </div>
  );
}
