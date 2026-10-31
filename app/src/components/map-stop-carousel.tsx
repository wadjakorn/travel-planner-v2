'use client';

// Mobile full-map stop strip (TP-0076): the day's stops as swipeable cards
// plus a day switcher. The URL stays the source of truth — a settled swipe or
// card tap calls onSelect (history replace), a pin tap scrolls the strip to its
// card. Rendered by persistent-map.tsx; hidden on md+ and outside full-map.

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { MapDay } from '@/lib/day-augment';
import { CARD_WIDTH, MAP_TOGGLE_SIZE, dayChip, dayNav, dayTitle, indexOfPin, legIntoStop, stopActivateHref, stopMode, stopLegNavUrl, stopNavUrl } from '@/lib/map-carousel';
import { stopName } from '@/lib/map-pin';
import { Drive, NavArrow, Transit, Walk } from './icons';
import { StopNumber } from './stop-number';
import { useMapPreview } from './map-preview-context';
import { useT } from './i18n-provider';

type Props = {
  tripId: string;
  days: MapDay[];
  dayIdx: number;
  activePlaceId: string | null;
  onSelect: (placeId: string) => void;
};

// Side padding that lets the first and last card snap to the centre.
const EDGE_PAD = `calc((100vw - ${CARD_WIDTH}) / 2)`;
// From the map section's bottom edge (= the nav's top in full-map): Google's
// logo is 26 tall there and must stay visible, so the control row sits 2 above.
const CAROUSEL_BOTTOM = 28;
// Keep its left edge aligned with the centred card and stop 8px left of the fixed List/Map button.
const SWITCHER_WIDTH = `min(${CARD_WIDTH}, calc(100vw - (100vw - ${CARD_WIDTH}) / 2 - 16px - ${MAP_TOGGLE_SIZE}px - 8px))`;

// Swipe guide (B2): shown until the first real swipe; the nudge plays once ever.
// Both flags live in localStorage and are read after hydration (server snapshot
// = "learned", so the pill never renders on the server).
const SWIPE_KEY = 'tp.mapSwipeLearned';
const NUDGE_KEY = 'tp.mapNudgeShown';
const NUDGE_DELAY = 800;
const NUDGE_PX = 24;
// A finger travels this far before it counts as a swipe rather than a tap.
const SWIPE_SLOP = 10;

const swipeListeners = new Set<() => void>();
// Fallback when storage is blocked (private mode): the guide still goes for the session.
let swipeLearnedMem = false;
let nudgeShownMem = false;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Blocked storage: nothing to persist.
  }
}

function subscribeSwipe(cb: () => void) {
  swipeListeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    swipeListeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

function markSwipeLearned() {
  if (swipeLearnedMem) return;
  swipeLearnedMem = true;
  writeFlag(SWIPE_KEY);
  swipeListeners.forEach((cb) => cb());
}

const MODE_ICON = { walk: Walk, drive: Drive, transit: Transit };
// Cards' icon links: full card height, 44 wide, a hairline apart from the body and each other.
// The card's overflow-hidden would cut the global outline, so focus is an inset ring.
const cardFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)]';
const cardLink = `flex w-11 shrink-0 flex-col items-center justify-center border-l border-border text-brand ${cardFocus}`;

const navBtn =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-foreground disabled:text-muted disabled:opacity-40';

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
  const swipeLearned = useSyncExternalStore(
    subscribeSwipe,
    () => swipeLearnedMem || readFlag(SWIPE_KEY),
    () => true,
  );
  const [nudging, setNudging] = useState(false);
  // Finger down on the strip, and where: a scroll or drag while it is down is a real swipe.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const showGuide = pins.length >= 2 && !swipeLearned;

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

  // A day change remounts the strip mid-touch, so its touchend never arrives.
  useEffect(() => {
    touchStart.current = null;
  }, [day?.id]);

  // Once ever, a beat after the map opens: every card slides towards its
  // neighbour and back (transform, so the strip never scrolls or selects).
  useEffect(() => {
    if (!fullMap || !showGuide || nudgeShownMem || readFlag(NUDGE_KEY)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = setTimeout(() => {
      nudgeShownMem = true;
      writeFlag(NUDGE_KEY);
      setNudging(true);
      // animationend ends it; this is the floor if it never fires.
      setTimeout(() => setNudging(false), 1000);
    }, NUDGE_DELAY);
    return () => clearTimeout(start);
  }, [fullMap, showGuide]);

  if (!fullMap || !day) return null;

  const activeIdx = indexOfPin(pins, activePlaceId);
  // Towards the side that has a neighbour: left, unless the active card is the last.
  const nudgeX = activeIdx === pins.length - 1 ? NUDGE_PX : -NUDGE_PX;
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
      {showGuide ? (
        // Above the strip, outside its overflow clip, and out of the flow: the
        // cards and the day switcher below do not move for it.
        <div className="absolute inset-x-0 bottom-full flex justify-center pb-1">
          <p
            data-swipe-guide
            className="pointer-events-none flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground shadow-[var(--shadow-md)]"
          >
            <span aria-hidden>‹</span>
            {t('map_carousel_swipe_hint')}
            <span aria-hidden>›</span>
          </p>
        </div>
      ) : null}
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
          // `relative`: makes the strip the containing block of absolutely
          // positioned children (each card's sr-only "Stop n:"), so the scroll
          // container clips them. Without it they escape to the carousel box,
          // widen the page, and mobile Chrome grows the layout viewport —
          // pushing the fixed bottom nav and List/Map button off-screen (TP-0119).
          // overflow-x:auto clips the y-axis too, so leave room for the active card's ring and shadow.
          className="pointer-events-auto relative flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 pt-2 [scrollbar-width:none]"
          style={{ scrollPaddingInline: 16, paddingInline: EDGE_PAD, '--nudge-x': `${nudgeX}px` } as CSSProperties}
          data-nudging={nudging ? '' : undefined}
          onAnimationEnd={() => setNudging(false)}
          onTouchStart={(e) => {
            const f = e.touches[0];
            touchStart.current = f ? { x: f.clientX, y: f.clientY } : null;
            setNudging(false);
          }}
          onTouchMove={(e) => {
            const f = e.touches[0];
            const from = touchStart.current;
            if (!f || !from) return;
            const dx = Math.abs(f.clientX - from.x);
            if (dx > SWIPE_SLOP && dx > Math.abs(f.clientY - from.y)) markSwipeLearned();
          }}
          onTouchEnd={() => {
            touchStart.current = null;
          }}
          onTouchCancel={() => {
            touchStart.current = null;
          }}
          // The browser takes over the gesture as a pan and stops sending touchmove.
          onScroll={() => {
            if (touchStart.current) markSwipeLearned();
          }}
        >
          {pins.map((pin, i) => {
            const leg = legIntoStop(pins, day.legs, i);
            const legMode = stopMode(leg, day.defaultMode);
            const ModeIcon = MODE_ICON[legMode];
            const active = pin.id === activePlaceId;
            const meta = [pin.category, pin.time].filter(Boolean).join(' · ');
            return (
              <li
                key={pin.id}
                data-stop-card
                aria-current={active ? 'true' : undefined}
                // No padding here: the icon links run to the card's edge, so the select button carries the left padding.
                className={`flex shrink-0 snap-center items-stretch overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-md)] ${
                  active ? 'ring-2 ring-[var(--brand)]' : ''
                }`}
                style={{ width: CARD_WIDTH }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!active) onSelect(pin.id);
                  }}
                  className={`flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-1 pl-3 pr-2 text-left ${cardFocus}`}
                >
                  <StopNumber kind={pin.kind} n={pin.idx} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      <span className="sr-only">{t('map_carousel_stop_prefix', { n: pin.idx })} </span>
                      {stopName(pin, t)}
                    </span>
                    {meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}
                  </span>
                </button>
                {leg ? (
                  <a
                    href={stopLegNavUrl(leg.fromPin, pin, legMode)}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-nav-leg
                    aria-label={t('map_nav_from_stop_aria', { n: leg.fromPin.idx, from: stopName(leg.fromPin, t), to: stopName(pin, t) })}
                    className={`${cardLink} bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]`}
                  >
                    <ModeIcon aria-hidden className="h-4 w-4" />
                    <span aria-hidden className="text-xs font-semibold leading-none">
                      {leg.fromPin.idx}
                    </span>
                  </a>
                ) : null}
                <a
                  href={stopNavUrl(pin, legMode)}
                  target="_blank"
                  rel="noreferrer noopener"
                  data-nav-here
                  aria-label={t('map_nav_from_here_aria', { to: stopName(pin, t) })}
                  className={cardLink}
                >
                  <NavArrow aria-hidden className="h-5 w-5" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {/* Under the cards, flush with their edges. The strip's pb-1 counts towards the 8 px gap. */}
      <div className={`mx-auto ${pins.length === 0 ? 'mt-2' : 'mt-1'}`} style={{ width: CARD_WIDTH }}>
        <div
          data-map-day-switcher
          className="pointer-events-auto flex h-11 items-center justify-between rounded-full border border-border bg-surface shadow-[var(--shadow-md)]"
          style={{ width: SWITCHER_WIDTH }}
        >
          <button type="button" aria-label={t('map_prev_day')} disabled={prev == null} onClick={() => goDay(prev)} className={navBtn}>
            ‹
          </button>
          <span className="min-w-0 truncate text-center text-sm font-semibold text-foreground">
            {/* Below 360 px the row has no room for the date (it stays in the list). */}
            <span aria-hidden className="max-[359.98px]:hidden">{dayChip(day, t, true)}</span>
            <span aria-hidden className="min-[360px]:hidden">{dayChip(day, t)}</span>
            <span className="sr-only">{dayTitle(day, t)}</span>
          </span>
          <button type="button" aria-label={t('map_next_day')} disabled={next == null} onClick={() => goDay(next)} className={navBtn}>
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
