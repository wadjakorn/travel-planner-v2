// Shared day-augmentation helpers. Hotels are stored once per trip but shown
// as synthetic begin/end stops on each day they span, on both the itinerary
// list (page.tsx → DaysAccordion) and the persistent map (buildMapDays).
// Framework-agnostic + server-safe (no server actions, no 'server-only').

import type { HotelBooking, Place, TransportBooking } from '@/db/schema';
import type { LoadedTrip } from '@/lib/trip-queries';
import { formatDistance, type Units } from '@/lib/units';
import type { Pin } from '@/lib/map-helpers';

// A place as rendered — either a real Place row or a synthetic hotel stop.
export type DisplayPlace = {
  id: string;
  idx: number;
  kind: 'hotel' | 'food' | 'sight' | 'transit';
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
  category?: string | null;
  time?: string | null;
  synthetic?: boolean;
};

// The ISO date (YYYY-MM-DD) of a trip's day `idx`, given the trip start.
export function isoForDay(start: string, idx: number): string {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + idx);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Hotels that bracket a given day: `begin` = you wake up there (checked in
// before today, still checked in), `end` = you sleep there tonight.
export function splitHotelsForDay(
  hotels: HotelBooking[],
  dayIso: string | null,
): { beginHotels: HotelBooking[]; endHotels: HotelBooking[] } {
  if (!dayIso) return { beginHotels: [], endHotels: [] };
  const beginHotels = hotels.filter(
    (h) =>
      h.checkInDate &&
      h.checkOutDate &&
      h.checkInDate < dayIso &&
      dayIso <= h.checkOutDate,
  );
  const endHotels = hotels.filter(
    (h) =>
      h.checkInDate &&
      h.checkOutDate &&
      h.checkInDate <= dayIso &&
      dayIso < h.checkOutDate,
  );
  return { beginHotels, endHotels };
}

export function hotelToSyntheticPlace(
  h: HotelBooking,
  pos: 'begin' | 'end',
  dayIso: string | null,
): DisplayPlace {
  const time =
    pos === 'end' && dayIso === h.checkInDate
      ? h.checkInTime ?? null
      : pos === 'begin' && dayIso === h.checkOutDate
        ? h.checkOutTime ?? null
        : null;
  return {
    id: `hotel-${h.id}-${pos}`,
    idx: -1,
    kind: 'hotel',
    name: h.name,
    address: h.address ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    placeIdExternal: h.placeIdExternal ?? null,
    time,
    synthetic: true,
  };
}

// The full ordered place list for a day: begin hotels + real places + end
// hotels. Shared by the list view and the map.
export function displayPlacesForDay(
  day: { idx: number; places: Place[] },
  hotels: HotelBooking[],
  tripStart: string | null,
): DisplayPlace[] {
  const dayIso = tripStart ? isoForDay(tripStart, day.idx) : null;
  const { beginHotels, endHotels } = splitHotelsForDay(hotels, dayIso);
  const synBegin = beginHotels.map((h) => hotelToSyntheticPlace(h, 'begin', dayIso));
  const synEnd = endHotels.map((h) => hotelToSyntheticPlace(h, 'end', dayIso));
  return [...synBegin, ...(day.places as unknown as DisplayPlace[]), ...synEnd];
}

// ─── Transport rides on the itinerary ─────────────────────────────────────────
// Transport bookings are stored once per trip and surfaced on the itinerary the
// way hotels are — keyed by the existing transportBookings.dayIdx (falling back
// to a fromDate match). Transport has no coordinates, so rides appear on the
// list only, not as map pins (see spec §7).

export type DisplayRide = {
  id: string; // transport booking id — deep-link target on the Bookings page
  type: TransportBooking['type'];
  time: string | null; // departure time
  fromLabel: string | null; // code, else name
  toLabel: string | null;
  overnight: boolean; // arrives on a later calendar day
};

function rideLabel(code: string | null, name: string | null): string | null {
  return code || name || null;
}

/** Transport rides that belong to day `dayIdx` (ISO `dayIso`). A ride is placed
 *  by its stored `dayIdx`; when that is null it falls back to matching its
 *  departure date. Overnight rides render only on their departure day. */
export function ridesForDay(
  transport: TransportBooking[],
  dayIdx: number,
  dayIso: string | null,
): DisplayRide[] {
  return transport
    .filter((t) => {
      if (t.dayIdx != null) return t.dayIdx === dayIdx;
      if (dayIso && t.fromDate) return t.fromDate === dayIso;
      return false;
    })
    .map((t) => ({
      id: t.id,
      type: t.type,
      time: t.fromTime ?? null,
      fromLabel: rideLabel(t.fromCode, t.fromName),
      toLabel: rideLabel(t.toCode, t.toName),
      overnight: Boolean(t.fromDate && t.toDate && t.fromDate !== t.toDate),
    }));
}

// ─── Map data ────────────────────────────────────────────────────────────────

export type MapDay = {
  idx: number;
  label: string;
  num: number;
  summaryDistance: string | null; // already unit-formatted
  summaryTime: string | null;
  pins: Pin[];
};

// All days' map pins, computed server-side in the trip layout so the
// persistent <Map> can switch days client-side without a re-fetch.
export function buildMapDays(
  trip: LoadedTrip,
  hotels: HotelBooking[],
  units: Units,
): MapDay[] {
  return trip.days.map((d) => {
    const places = displayPlacesForDay(d, hotels, trip.startDate);
    const withCoords = places.filter((p) => p.lat != null && p.lng != null);
    const pins: Pin[] = withCoords.map((p, i) => ({
      id: p.id,
      idx: i + 1,
      kind: p.kind,
      lat: p.lat as number,
      lng: p.lng as number,
      name: p.name,
      category: p.category ?? null,
      time: p.time ?? null,
    }));
    return {
      idx: d.idx,
      label: d.label,
      num: d.num,
      summaryDistance: formatDistance(d.summaryDistance ?? null, units),
      summaryTime: d.summaryTime ?? null,
      pins,
    };
  });
}
