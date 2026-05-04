'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { children: React.ReactNode };

export function TripRailFrame({ children }: Props) {
  // hidden=true → translate-y-full on mobile (rail slides off bottom edge).
  // Desktop ignores translate (md:translate-y-0).
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      const dy = y - lastY.current;
      // Threshold to ignore tiny jitters.
      if (Math.abs(dy) < 6) return;
      if (y <= 0) setHidden(false);
      else if (dy > 0) setHidden(true);
      else setHidden(false);
      lastY.current = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      aria-label="Trip navigation"
      className={
        // Mobile: fixed bottom bar, hide on scroll down.
        // Desktop (md+): sticky left rail.
        'fixed inset-x-0 bottom-0 z-30 flex h-14 w-full flex-row items-center justify-around gap-1 border-t border-zinc-200 bg-white px-2 transition-transform duration-200 ' +
        'md:sticky md:top-[57px] md:bottom-auto md:inset-x-auto md:h-[calc(100vh-57px)] md:w-14 md:shrink-0 md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:py-3 ' +
        (hidden ? 'translate-y-full md:translate-y-0' : 'translate-y-0')
      }
    >
      {children}
    </nav>
  );
}
