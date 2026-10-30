'use client';

// Mobile full-map stop strip (TP-0076): the day's stops as swipeable cards
// plus a day switcher. The URL stays the source of truth — a settled swipe or
// card tap calls onSelect (history replace), a pin tap scrolls the strip to its
// card. Rendered by persistent-map.tsx; hidden on md+ and outside full-map.

import { useEffect, useEffectEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { MapDay } from '@/lib/day-augment';
import { dayNav, dayTitle, indexOfPin, stopActivateHref, stopNavUrl } from '@/lib/map-carousel';
import { KIND_COLOR } from '@/lib/map-helpers';
import { stopName } from '@/lib/map-pin';
import { useMapPreview } from './map-preview-context';
import { useT } from './i18n-provider';

type Props = {
  tripId: string;
  days: MapDay[];
  dayIdx: number;
  activePlaceId: string | null;
  onSelect: (placeId: string) => void;
};

const CARD_WIDTH = 'min(calc(100vw - 64px), 320px)';
// Side padding that lets the first and last card snap to the centre.
const EDGE_PAD = `calc((100vw - ${CARD_WIDTH}) / 2)`;
// From the map section's bottom edge (= the nav's top in full-map): the
// List/Map pill sits at 80px from the viewport bottom, i.e. 24px above the
// 56px nav, and is 54px tall → its top is 78px up. The <ul>'s pb-1 adds 4px
// under the cards, so 86 leaves a 12px gap between cards and pill.
const CAROUSEL_BOTTOM = 86;

const navBtn =
  'inline-flex h-11 w-11 items-center justify-center rounded-full text-lg text-foreground disabled:text-muted disabled:opacity-40';

export function MapStopCarousel({ tripId, days, dayIdx, activePlaceId, onSelect }: Props) {
  const { fullMap } = useMapPreview();
  const router = useRouter();
  const t = useT();
  const stripRef = useRef<HTMLUListElement>(null);
  // The id the strip itself just selected by swiping: its card is already
  // centred, so the activePlaceId change it causes must not scroll again.
  const selfSelected = useRef<string | null>(null);
  const day = days[dayIdx];
  const pins = day?.pins ?? [];

  // Geometry, not IntersectionObserver ratios: IO callbacks land after
  // scrollend, so after an instant programmatic scroll they would be stale.
  const onSettle = useEffectEvent(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const box = strip.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let best = -1;
    let bestDist = Infinity;
    strip.querySelectorAll<HTMLElement>('[data-stop-card]').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const pin = pins[best];
    if (!pin || pin.id === activePlaceId) return;
    selfSelected.current = pin.id;
    onSelect(pin.id);
  });

  // Depends on day: the <ul> is keyed by day, so a day change mounts a new one.
  useEffect(() => {
    const strip = stripRef.current;
    if (!fullMap || !strip) return;
    if ('onscrollend' in window) {
      const h = () => onSettle();
      strip.addEventListener('scrollend', h);
      return () => strip.removeEventListener('scrollend', h);
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const h = () => {
      clearTimeout(t);
      t = setTimeout(() => onSettle(), 150);
    };
    strip.addEventListener('scroll', h, { passive: true });
    return () => {
      clearTimeout(t);
      strip.removeEventListener('scroll', h);
    };
  }, [fullMap, day]);

  const firstScroll = useRef(true);
  useEffect(() => {
    if (!fullMap) {
      firstScroll.current = true;
      return;
    }
    const first = firstScroll.current;
    firstScroll.current = false;
    if (activePlaceId && activePlaceId === selfSelected.current) {
      selfSelected.current = null;
      return;
    }
    selfSelected.current = null;
    const i = indexOfPin(day?.pins ?? [], activePlaceId);
    const card = stripRef.current?.querySelectorAll<HTMLElement>('[data-stop-card]')[i];
    if (!card) return;
    const instant = first || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: instant ? 'auto' : 'smooth' });
  }, [fullMap, activePlaceId, day]);

  if (!fullMap || !day) return null;

  const { prev, next } = dayNav(dayIdx, days.length);
  const goDay = (n: number | null) => {
    if (n == null) return;
    router.replace(stopActivateHref(tripId, n, null), { scroll: false });
  };

  return (
    <div
      data-map-carousel
      className="pointer-events-none absolute inset-x-0 z-[55] md:hidden"
      style={{ bottom: CAROUSEL_BOTTOM }}
    >
      {/* Centred over the centred active card and the List/Map pill: one axis. */}
      <div className="mb-2 flex justify-center">
        <div className="pointer-events-auto inline-flex h-11 items-center rounded-full border border-border bg-surface shadow-[var(--shadow-md)]">
          <button type="button" aria-label={t('map_prev_day')} disabled={prev == null} onClick={() => goDay(prev)} className={navBtn}>
            ‹
          </button>
          <span className="px-1 text-sm font-semibold text-foreground">
            {dayTitle(day, t)}
          </span>
          <button type="button" aria-label={t('map_next_day')} disabled={next == null} onClick={() => goDay(next)} className={navBtn}>
            ›
          </button>
        </div>
      </div>
      {pins.length === 0 ? (
        <p
          className="pointer-events-auto mx-auto rounded-2xl border border-border bg-surface p-3 text-sm text-muted shadow-[var(--shadow-md)]"
          style={{ width: CARD_WIDTH }}
        >
          {t('map_carousel_empty')}
        </p>
      ) : (
        <ul
          key={day.id}
          ref={stripRef}
          role="list"
          aria-label={t('map_carousel_stops_aria', { n: day.idx + 1 })}
          className="pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none]"
          style={{ scrollPaddingInline: 16, paddingInline: EDGE_PAD }}
        >
          {pins.map((pin) => {
            const active = pin.id === activePlaceId;
            const meta = [pin.category, pin.time].filter(Boolean).join(' · ');
            return (
              <li
                key={pin.id}
                data-stop-card
                aria-current={active ? 'true' : undefined}
                className={`flex shrink-0 snap-center items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-md)] ${
                  active ? 'ring-2 ring-[var(--brand)]' : ''
                }`}
                style={{ width: CARD_WIDTH }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!active) onSelect(pin.id);
                  }}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: KIND_COLOR[pin.kind] ?? KIND_COLOR.sight }}
                  >
                    {pin.idx}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      <span className="sr-only">{t('map_carousel_stop_prefix', { n: pin.idx })} </span>
                      {stopName(pin, t)}
                    </span>
                    {meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}
                  </span>
                </button>
                <a
                  href={stopNavUrl(pin)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-brand"
                >
                  {t('itin_segment_navigate')}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
