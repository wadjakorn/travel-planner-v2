'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { MapDay } from '@/lib/day-augment';
import { dayChip, dayNav, dayTitle, stopActivateHref } from '@/lib/map-carousel';
import { useMapPreview } from './map-preview-context';
import { useT } from './i18n-provider';

// md+ day switcher on top of the trip map (‹ D1 D2 … ›). Rendered by
// PersistentMap outside the canvas, so it also shows on a day with no pins.
// Links push (Back steps through days, like the list's day chips). Mobile
// full-map uses the stop carousel's own switcher instead.

const arrow =
  'tp-hit inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-foreground md:h-9 md:w-9';

export function MapDayBar({ tripId, days, dayIdx }: { tripId: string; days: MapDay[]; dayIdx: number }) {
  // Clear before navigating: a change-of-day effect would run after the
  // camera's own effect and leave the new day unframed (lib/map-preview.ts).
  const { clearPreview } = useMapPreview();
  const t = useT();
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the active chip fully visible. Scrolls only the chip row, unlike
  // scrollIntoView, which would also scroll the list column / page.
  useEffect(() => {
    const ul = listRef.current;
    const li = ul?.querySelector<HTMLElement>('[aria-current]')?.parentElement;
    if (!ul || !li) return;
    const left = li.offsetLeft;
    const right = left + li.offsetWidth;
    if (left < ul.scrollLeft) ul.scrollLeft = left;
    else if (right > ul.scrollLeft + ul.clientWidth) ul.scrollLeft = right - ul.clientWidth;
  }, [dayIdx, days.length]);

  if (days.length === 0) return null;
  const { prev, next } = dayNav(dayIdx, days.length);
  const onNav = () => clearPreview();

  const step = (to: number | null, label: string, glyph: string) =>
    to == null ? (
      <span role="link" aria-disabled="true" aria-label={label} className={`${arrow} text-muted opacity-40`}>
        <span aria-hidden="true">{glyph}</span>
      </span>
    ) : (
      <Link
        href={stopActivateHref(tripId, to, null)}
        scroll={false}
        prefetch={false}
        aria-label={label}
        onClick={onNav}
        className={`${arrow} hover:bg-surface-2`}
      >
        <span aria-hidden="true">{glyph}</span>
      </Link>
    );

  return (
    <nav
      aria-label={t('map_days_nav_aria')}
      className="pointer-events-auto flex min-w-0 shrink items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-[var(--shadow-md)]"
    >
      {step(prev, t('map_prev_day'), '‹')}
      <ul
        ref={listRef}
        className="relative flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((d) => {
          const active = d.idx === dayIdx;
          return (
            <li key={d.id} className="shrink-0">
              <Link
                href={stopActivateHref(tripId, d.idx, null)}
                scroll={false}
                // A long trip would otherwise prefetch one RSC payload per day.
                prefetch={false}
                aria-label={dayTitle(d, t)}
                aria-current={active ? 'true' : undefined}
                onClick={onNav}
                className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap md:h-9 ${
                  active ? 'bg-brand text-brand-foreground' : 'text-foreground hover:bg-surface-2'
                }`}
              >
                {dayChip(d, t, active)}
              </Link>
            </li>
          );
        })}
      </ul>
      {step(next, t('map_next_day'), '›')}
    </nav>
  );
}
