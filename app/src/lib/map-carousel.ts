// Pure helpers for the mobile full-map stop carousel (map-stop-carousel.tsx)
// and the md+ map day bar (map-day-bar.tsx).

import { gmapsNavigateUrl } from './gmaps';
import type { Translate } from './i18n-client';
import type { MapDay } from './day-augment';
import type { Pin } from './map-helpers';

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

export function stopNavUrl(pin: Pin): string {
  return gmapsNavigateUrl({ name: pin.name ?? '', lat: pin.lat, lng: pin.lng, placeIdExternal: pin.googleId ?? null });
}

export function stopActivateHref(tripId: string, dayIdx: number, placeId: string | null): string {
  const qs = new URLSearchParams();
  qs.set('day', String(dayIdx));
  if (placeId) qs.set('placeId', placeId);
  return `/trip/${tripId}?${qs}`;
}

export function indexOfPin(pins: Pin[], id: string | null): number {
  return id ? pins.findIndex((p) => p.id === id) : -1;
}
