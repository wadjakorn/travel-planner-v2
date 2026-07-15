'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { children: React.ReactNode };

export function TripRailFrame({ children }: Props) {
  // hidden=true → translate-y-full on mobile (rail slides off bottom edge).
  // Desktop ignores translate (md:translate-y-0).
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    lastY.current = window.scrollY;
    // Read the scroll offset from whichever element actually scrolled: the
    // window (Bookings and other page-scroll views) OR an inner scroll pane
    // like the itinerary aside (overflow-y-auto). Capture-phase listening lets
    // one handler cover both, so nav auto-hide is consistent across trip pages.
    function offsetOf(target: EventTarget | null): number {
      if (
        !target ||
        target === window ||
        target === document ||
        target === document.documentElement ||
        target === document.body
      ) {
        return window.scrollY;
      }
      return (target as HTMLElement).scrollTop;
    }
    function onScroll(e: Event) {
      const y = offsetOf(e.target);
      const dy = y - lastY.current;
      // Always re-show the nav shortly after scrolling stops.
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setHidden(false), 900);
      // Threshold to ignore tiny jitters.
      if (Math.abs(dy) < 6) return;
      if (y <= 0) setHidden(false);
      else if (dy > 0) setHidden(true);
      else setHidden(false);
      lastY.current = y;
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  return (
    <nav
      aria-label="Trip navigation"
      className={
        // Mobile: fixed bottom bar, hide on scroll down.
        // Desktop (md+): sticky left rail.
        'fixed inset-x-0 bottom-0 z-30 flex h-14 w-full flex-row items-center justify-around gap-1 border-t border-border bg-surface px-2 transition-transform duration-200 ' +
        'md:sticky md:top-[57px] md:bottom-auto md:inset-x-auto md:h-[calc(100vh-57px)] md:w-14 md:shrink-0 md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:py-3 ' +
        (hidden ? 'translate-y-full md:translate-y-0' : 'translate-y-0')
      }
    >
      {children}
    </nav>
  );
}
