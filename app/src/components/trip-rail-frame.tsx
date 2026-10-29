'use client';

import { useEffect, useRef, useState } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

export type TripRailSegment =
  | 'itinerary'
  | 'calendar'
  | 'bookings'
  | 'budget'
  | 'notes'
  | 'settings';

const RAIL_SEGMENTS = new Set<string>([
  'calendar',
  'bookings',
  'budget',
  'notes',
  'settings',
]);

// Segment below /trip/[id]; the itinerary page itself has none (null).
function useRailSegment(): TripRailSegment | null {
  const segment = useSelectedLayoutSegment();
  if (segment === null) return 'itinerary';
  return RAIL_SEGMENTS.has(segment) ? (segment as TripRailSegment) : null;
}

type Props = { children: React.ReactNode };

export function TripRailFrame({ children }: Props) {
  const current = useRailSegment();
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

  // Add/edit forms (place, booking, expense) render without the rail.
  if (!current) return null;

  return (
    <nav
      aria-label="Trip navigation"
      className={
        // Mobile: fixed bottom bar, hide on scroll down.
        // Desktop (md+): sticky left rail. dvh, not vh — see TP-0066.
        'fixed inset-x-0 bottom-0 z-30 flex h-14 w-full flex-row items-center justify-between gap-0 border-t border-border bg-surface px-1 transition-transform duration-200 ' +
        'md:sticky md:top-[57px] md:bottom-auto md:inset-x-auto md:h-[calc(100dvh-57px)] md:w-[72px] md:shrink-0 md:flex-col md:items-center md:justify-start md:gap-1 md:border-r md:border-t-0 md:py-3 ' +
        (hidden ? 'translate-y-full md:translate-y-0' : 'translate-y-0')
      }
    >
      {children}
    </nav>
  );
}

// Whole icon+label column is the tap target; the visible label is the
// accessible name, so the Bookings count is announced with it.
const ITEM_CLASS =
  'group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 md:w-16 md:flex-none md:py-1.5 ';
const PILL_CLASS =
  'relative inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors ';
const LABEL_CLASS = 'max-w-full truncate text-[12px] leading-4 ';

export function TripRailLink({
  segment,
  href,
  label,
  icon,
  badge,
}: {
  segment: TripRailSegment;
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}): React.JSX.Element {
  // Flips the moment the URL commits (the loading boundary shows), so the
  // tapped item highlights before the destination page has streamed in.
  const isActive = useRailSegment() === segment;
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        ITEM_CLASS +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      }
    >
      <span
        className={
          PILL_CLASS +
          (isActive
            ? 'bg-brand text-brand-foreground'
            : 'text-muted group-hover:bg-surface-2 group-hover:text-foreground')
        }
      >
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-[18px] text-background ring-2 ring-surface">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
        <PendingRing />
      </span>
      <span
        className={
          LABEL_CLASS +
          (isActive ? 'font-semibold text-foreground' : 'font-medium text-muted')
        }
      >
        {label}
      </span>
    </Link>
  );
}

// Not-yet-shipped item (Notes): same slot and label, greyed, not focusable.
// role="link" + aria-disabled is the ARIA disabled-link pattern; on a bare
// span (generic role) aria-label/aria-disabled are prohibited and ignored.
export function TripRailDisabledItem({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      role="link"
      aria-label={`${label} (coming soon)`}
      aria-disabled="true"
      title={`${label} — coming soon`}
      className={ITEM_CLASS + 'cursor-not-allowed'}
    >
      <span className={PILL_CLASS + 'text-muted/40'}>{icon}</span>
      <span className={LABEL_CLASS + 'font-medium text-muted/60'}>{label}</span>
    </span>
  );
}

function PendingRing() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 animate-pulse rounded-full ring-2 ring-brand/50"
    />
  );
}
