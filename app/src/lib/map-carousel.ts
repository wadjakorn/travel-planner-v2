// Pure helpers for the mobile full-map stop carousel (map-stop-carousel.tsx)
// and the md+ map day bar (map-day-bar.tsx).

import { gmapsDirectionsUrl, gmapsNavigateUrl, travelMode } from './gmaps';
import type { Translate } from './i18n-client';
import type { MapDay } from './day-augment';
import type { MapLeg, Mode, Pin } from './map-helpers';

// The phone map's control column: stop cards above, day switcher and List/Map
// button below, sharing both edges (map-stop-carousel.tsx, map-panel-toggle.tsx).
export const CARD_WIDTH = 'min(calc(100vw - 64px), 320px)';
export const MAP_TOGGLE_SIZE = 44;

/** Full day name: `Day 1 · Sat 12` (chip and switcher accessible name, map summary). */
export function dayTitle(d: Pick<MapDay, 'idx' | 'label' | 'num'>, t: Translate): string {
  return t('map_day_title', { n: d.idx + 1, weekday: d.label, num: d.num });
}

/** Day-bar chip text: `D1`; the active chip adds the date, `D1 · Sat 12`. */
export function dayChip(d: Pick<MapDay, 'idx' | 'label' | 'num'>, t: Translate, active = false): string {
  return active
    ? t('map_day_chip_active', { n: d.idx + 1, weekday: d.label, num: d.num })
    : t('map_day_chip', { n: d.idx + 1 });
}

export function dayNav(dayIdx: number, dayCount: number): { prev: number | null; next: number | null } {
  return {
    prev: dayIdx > 0 ? dayIdx - 1 : null,
    next: dayIdx < dayCount - 1 ? dayIdx + 1 : null,
  };
}

const place = (pin: Pin) => ({ name: pin.name ?? '', lat: pin.lat, lng: pin.lng, placeIdExternal: pin.googleId ?? null });

/** The leg that ends at pin `i` and the pin it starts from. Null when there is none (first stop,
 *  or a leg `buildMapLegs` dropped): the stop before an unlocated one is deliberately not used. */
export function legIntoStop(pins: Pin[], legs: MapLeg[], i: number): { fromPin: Pin; mode: Mode | null } | null {
  const leg = legs.find((l) => l.to === i);
  const fromPin = leg ? pins[leg.from] : undefined;
  return leg && fromPin ? { fromPin, mode: leg.mode } : null;
}

/** Mode for a stop's links: its incoming leg's, else the day's (imported days store no leg modes). */
export function stopMode(leg: { mode: Mode | null } | null, dayMode: Mode): Mode {
  return leg?.mode ?? dayMode;
}

/** Directions to a stop from the device location. */
export function stopNavUrl(pin: Pin, mode: Mode): string {
  return gmapsNavigateUrl(place(pin), travelMode(mode));
}

/** Directions from the previous stop to this one. */
export function stopLegNavUrl(fromPin: Pin, toPin: Pin, mode: Mode): string {
  return gmapsDirectionsUrl([place(fromPin), place(toPin)], travelMode(mode));
}

export function stopActivateHref(tripId: string, dayIdx: number, placeId: string | null): string {
  const qs = new URLSearchParams();
  qs.set('day', String(dayIdx));
  if (placeId) qs.set('placeId', placeId);
  return `/trip/${tripId}?${qs}`;
}

/**
 * The list's `(day, placeId)` from the URL: an out-of-range day means the first,
 * a stop that is not on that day means none. Client-side now, so a shallow
 * selection reaches the list without the server.
 */
export function activeStopFromUrl(
  params: { get(name: string): string | null },
  days: { id: string; places: { id: string }[] }[],
): { dayId: string | null; placeId: string | null } {
  const raw = Number(params.get('day'));
  const day = days[Number.isInteger(raw) && raw >= 0 && raw < days.length ? raw : 0];
  const placeId = params.get('placeId');
  return { dayId: day?.id ?? null, placeId: placeId && day?.places.some((p) => p.id === placeId) ? placeId : null };
}

export function indexOfPin(pins: Pin[], id: string | null): number {
  return id ? pins.findIndex((p) => p.id === id) : -1;
}
