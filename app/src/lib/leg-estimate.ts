// Rough per-leg distance/time from coordinates only (TP-0149). No Google call
// (decision #24, REQUIREMENTS.md:298): haversine × a detour factor per mode,
// over a flat speed. `est*` names say it: a hint, not a route.

import { metersBetween } from '@/lib/map-preview';
import { splitHotelsForDay } from '@/lib/day-augment';
import type { HotelBooking } from '@/db/schema';

type Mode = 'drive' | 'walk' | 'transit';
type Pt = { lat?: number | null; lng?: number | null };

export const LEG_EST: Record<Mode, { detour: number; kmh: number | null }> = {
  drive: { detour: 1.3, kmh: 45 },
  walk: { detour: 1.2, kmh: 4.5 },
  // Timetables and waits can't be guessed from a straight line.
  transit: { detour: 1.3, kmh: null },
};

export const LONG_DRIVE_DAY_MIN = 240;

export type LegEstimate = { estDistanceKm: number | null; estDurationMin: number | null };
const NONE: LegEstimate = { estDistanceKm: null, estDurationMin: null };

const hasCoords = (p: Pt | null | undefined): p is { lat: number; lng: number } =>
  p != null && typeof p.lat === 'number' && typeof p.lng === 'number';

export function estimateLeg(a: Pt | null | undefined, b: Pt | null | undefined, mode: Mode): LegEstimate {
  if (!hasCoords(a) || !hasCoords(b)) return NONE;
  const { detour, kmh } = LEG_EST[mode] ?? LEG_EST.drive;
  const km = (metersBetween(a, b) / 1000) * detour;
  return {
    estDistanceKm: Math.round(km * 10) / 10,
    estDurationMin: kmh === null ? null : Math.max(1, Math.round((km / kmh) * 60)),
  };
}

type ArriveLike = { mode: Mode; durationMin: number | null };
export type HotelLike = Pt & {
  checkInDate?: string | null;
  checkOutDate?: string | null;
  arrivalMode?: Mode | null;
};

// The hotel a day starts from / ends at, as the UI draws it (first match).
export function dayHotels(hotels: HotelLike[], dateIso: string | null) {
  const s = splitHotelsForDay(hotels as unknown as HotelBooking[], dateIso);
  return {
    begin: (s.beginHotels[0] as unknown as HotelLike | undefined) ?? null,
    end: (s.endHotels[0] as unknown as HotelLike | undefined) ?? null,
  };
}

// API day shape → same shape with est* on every non-null `arrive`: place j ≥ 1
// from place j-1; place 0 from the day's begin hotel.
export function withLegEstimates<
  P extends Pt & { arrive: ArriveLike | null },
  D extends { dateIso?: string | null; places: P[] },
>(day: D, hotels: HotelLike[]): D & { places: (P & { arrive: (ArriveLike & LegEstimate) | null })[] } {
  const { begin } = dayHotels(hotels, day.dateIso ?? null);
  return {
    ...day,
    places: day.places.map((p, j) => {
      if (!p.arrive) return { ...p, arrive: null };
      const from = j === 0 ? begin : day.places[j - 1];
      return { ...p, arrive: { ...p.arrive, ...estimateLeg(from, p, p.arrive.mode) } };
    }),
  };
}

// Minutes of driving on one day: the start leg (begin hotel → place 0, when the
// day has a start arrive), every place-to-place leg, and the leg to the end
// hotel (its arrivalMode ?? drive). A leg uses its durationMin, else the
// estimate; legs with neither are skipped, so this is a floor.
export function driveMinutesForDay(
  places: Pt[],
  arrives: (ArriveLike | null)[],
  hotels: HotelLike[],
  dateIso: string | null,
): number {
  const { begin, end } = dayHotels(hotels, dateIso);
  let total = 0;
  const add = (a: Pt | null, b: Pt | null, mode: Mode, durationMin: number | null) => {
    if (mode !== 'drive') return;
    total += durationMin ?? estimateLeg(a, b, mode).estDurationMin ?? 0;
  };
  places.forEach((p, j) => {
    const arr = arrives[j];
    if (!arr) return;
    add(j === 0 ? begin : places[j - 1], p, arr.mode, arr.durationMin);
  });
  if (end && places.length > 0) add(places[places.length - 1], end, end.arrivalMode ?? 'drive', null);
  return total;
}
