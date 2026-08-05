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

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import styles from './route-progress.module.css';

const MIN_VISIBLE_MS = 400;

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const shownAt = useRef(0);

  // The URL changed, so whatever was in flight has landed. Hold the bar for a
  // moment first: a navigation that resolves in 80ms would otherwise paint and
  // clear inside one frame, which reads as no feedback at all.
  useEffect(() => {
    const elapsed = Date.now() - shownAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const timer = window.setTimeout(() => setActive(false), wait);
    return () => window.clearTimeout(timer);
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
      shownAt.current = Date.now();
      setActive(true);
    };
    // Capture phase, like the save guard: <Link> calls preventDefault() on the
    // anchor itself, so a bubble-phase listener on document sees every real
    // client-side navigation as already-defaultPrevented and skips it.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
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
