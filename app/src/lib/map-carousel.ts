// Pure helpers for the mobile full-map stop carousel (map-stop-carousel.tsx).

import { gmapsNavigateUrl } from './gmaps';
import type { Pin } from './map-helpers';

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
