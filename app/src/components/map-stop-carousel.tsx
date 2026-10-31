'use client';

// Mobile full-map stop strip (TP-0076): the day's stops as swipeable cards
// plus a day switcher. The URL stays the source of truth — a settled swipe or
// card tap calls onSelect (shallow history replace), a pin tap scrolls the strip to its
// card. Rendered by persistent-map.tsx; hidden on md+ and outside full-map.

import { Fragment, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { MapDay } from '@/lib/day-augment';
import { CARD_EDGE, CARD_WIDTH, CONNECTOR_WIDTH, MAP_TOGGLE_SIZE, dayChip, dayNav, dayTitle, indexOfPin, legIntoStop, stopActivateHref, stopMode, stopLegNavUrl, stopNavUrl } from '@/lib/map-carousel';
import { selectStop } from '@/lib/full-map-history';
import { stopName } from '@/lib/map-pin';
import { mapLegStyle } from '@/lib/map-route';
import { NavArrow } from './icons';
import s from './map-stop-carousel.module.css';
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

// Left padding that lets the first card, after its connector, reach the snap line.
const STRIP_LEFT = `calc(100vw - ${CARD_WIDTH} - ${CARD_EDGE + CONNECTOR_WIDTH}px)`;
// From the map section's bottom edge (= the nav's top in full-map): Google's
// logo is 26 tall there and must stay visible, so the control row sits 2 above.
const CAROUSEL_BOTTOM = 28;
// From 16 off the screen's left edge to 8 before the fixed List/Map button.
const SWITCHER_WIDTH = `calc(100vw - ${CARD_EDGE * 2 + MAP_TOGGLE_SIZE + 8}px)`;

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

const navBtn =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-foreground disabled:text-muted disabled:opacity-40';

export function MapStopCarousel({ tripId, days, dayIdx, activePlaceId, onSelect }: Props) {
  const { fullMap } = useMapPreview();
  const t = useT();
  const stripRef = useRef<HTMLUListElement>(null);
  // The id the strip itself just selected by swiping: its card is already
  // right-aligned, so the activePlaceId change it causes must not scroll again.
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
    const target = strip.getBoundingClientRect().right - CARD_EDGE;
    let best = -1;
    let bestDist = Infinity;
    strip.querySelectorAll<HTMLElement>('[data-stop-card]').forEach((el, i) => {
      const d = Math.abs(el.getBoundingClientRect().right - target);
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
    card.scrollIntoView({ inline: 'end', block: 'nearest', behavior: instant ? 'auto' : 'smooth' });
  }, [fullMap, activePlaceId, day]);

  // A day change remounts the strip mid-touch, so its touchend never arrives.
  useEffect(() => {
    touchStart.current = null;
  }, [day?.id]);

  // Once ever, a beat after the map opens: the strip slides towards the
  // neighbour and back, pulling the next leg's button on screen (transform, so the strip never scrolls or selects).
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
    selectStop(stopActivateHref(tripId, n, null));
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
        <div className="absolute inset-x-0 bottom-full flex justify-end pb-1" style={{ paddingRight: CARD_EDGE }}>
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
          className="pointer-events-auto rounded-2xl border border-border bg-surface p-3 text-sm text-muted shadow-[var(--shadow-md)]"
          style={{ marginLeft: CARD_EDGE, width: SWITCHER_WIDTH }}
        >
          {t('map_carousel_empty')}
        </p>
      ) : (
        <ul
          key={day.id}
          ref={stripRef}
          role="list"
          aria-label={t('map_carousel_stops_aria', { n: day.idx + 1 })}
          // `relative`, here and on each card: absolutely positioned descendants
          // (the sr-only "Stop n:") need a containing block inside the scroll
          // container so it clips them. Without one they escape to the carousel box,
          // widen the page, and mobile Chrome grows the layout viewport —
          // pushing the fixed bottom nav and List/Map button off-screen (TP-0119).
          // overflow-x:auto clips the y-axis too, so leave room for the active card's ring and shadow.
          className="pointer-events-auto relative flex snap-x snap-mandatory overflow-x-auto pb-1 pt-2 [scrollbar-width:none]"
          style={{ scrollPaddingRight: CARD_EDGE, paddingLeft: STRIP_LEFT, paddingRight: CARD_EDGE, '--nudge-x': `${nudgeX}px` } as CSSProperties}
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
            const mode = stopMode(leg, day.defaultMode);
            const active = pin.id === activePlaceId;
            const meta = [pin.category, pin.time].filter(Boolean).join(' · ');
            const navLabel = (
              <>
                <NavArrow aria-hidden fill="currentColor" className="h-4 w-4" />
                <span className="text-xs font-semibold">{t('map_nav_go')}</span>
              </>
            );
            return (
              <Fragment key={pin.id}>
                {leg ? (
                  <li className={s.connector} style={{ width: CONNECTOR_WIDTH, ...mapLegStyle(leg.slot) }}>
                    <span aria-hidden data-nav-line className={s.line} />
                    <a
                      href={stopLegNavUrl(leg.fromPin, pin, mode)}
                      target="_blank"
                      rel="noreferrer noopener"
                      data-nav-leg
                      aria-label={t('map_nav_from_stop_aria', { n: leg.fromPin.idx, from: stopName(leg.fromPin, t), to: stopName(pin, t) })}
                      className={s.nav}
                    >
                      {navLabel}
                    </a>
                  </li>
                ) : i === 0 ? (
                  <li className={s.connector} style={{ width: CONNECTOR_WIDTH }}>
                    <a
                      href={stopNavUrl(pin, mode)}
                      target="_blank"
                      rel="noreferrer noopener"
                      data-nav-here
                      aria-label={t('map_nav_from_here_aria', { to: stopName(pin, t) })}
                      className={s.nav}
                    >
                      {navLabel}
                    </a>
                  </li>
                ) : null}
                <li
                  data-stop-card
                  aria-current={active ? 'true' : undefined}
                  className={`relative z-[1] flex shrink-0 snap-end items-stretch rounded-2xl border border-border bg-surface shadow-[var(--shadow-md)] ${
                    active ? 'ring-2 ring-[var(--brand)]' : ''
                  } ${!leg && i > 0 ? 'ml-2' : ''}`}
                  style={{ width: CARD_WIDTH }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!active) onSelect(pin.id);
                    }}
                    className={`flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-[inherit] py-1 pl-3 pr-3 text-left ${s.select}`}
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
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
      {/* Under the cards. The strip's pb-1 counts towards the 8 px gap. */}
      <div className={pins.length === 0 ? 'mt-2' : 'mt-1'} style={{ marginLeft: CARD_EDGE }}>
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
