// Shared day-augmentation helpers. Hotels are stored once per trip but shown
// as synthetic begin/end stops on each day they span, on both the itinerary
// list (page.tsx → DaysAccordion) and the persistent map (buildMapDays).
// Framework-agnostic + server-safe (no server actions, no 'server-only').

import type { HotelBooking, Place, Segment, TransportBooking } from '@/db/schema';
import type { LoadedTrip } from '@/lib/trip-queries';
import { formatDistance, type Units } from '@/lib/units';
import { pinGoogleId, type LatLng, type MapLeg, type MapRide, type Mode, type Pin } from '@/lib/map-helpers';
import { legSlot } from '@/lib/map-route';
import { buildLegInfos, type LegInfo } from '@/lib/leg-info';
import { formatClock, type ClockLang } from '@/lib/clock';
import { dayDisplay } from '@/lib/date-format';

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
  // Hotel stops only: booked or not (drives the tbd badge) and whether the
  // coordinates are an approximation (drives the pin style). Independent.
  status?: 'confirmed' | 'tbd' | null;
  coordsApprox?: boolean;
  // Synthetic hotel stops have no place row to edit/remove — they link to
  // the hotel booking instead.
  editHref?: string;
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
    status: h.status,
    coordsApprox: h.coordsApprox,
    editHref: `/trip/${h.tripId}/booking/hotel/${h.id}/edit`,
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

// ─── Legs ────────────────────────────────────────────────────────────────────
// Leg i joins display places i and i+1. Shared by the list (page.tsx) and the
// map (buildMapDays) so both always agree on which mode belongs to which leg.

export type DayLeg =
  | { kind: 'segment'; mode: Mode; segment: Segment }
  | { kind: 'hotel'; mode: Mode; hotelId: string; leg: 'departure' | 'arrival' }
  // Last begin hotel → first place: the day's own leg (`day.start_*`).
  | { kind: 'start'; mode: Mode; hotelId: string; note: string | null; durationMin: number | null }
  | null; // real-place gap with no segment row (the list shows nothing)

/** One entry per consecutive pair of display places (begin hotels → places →
 *  end hotels). Hotel legs use the hotel's stored mode, then the day default,
 *  then drive. Real-place legs are looked up by `segment.idx` (rows are sparse:
 *  imported days have none, appending a place creates only the last leg's). */
export function dayLegs(
  d: {
    idx: number;
    defaultMode: Mode | null;
    places: unknown[];
    segments: Segment[];
    startMode?: Mode | null;
    startNote?: string | null;
    startDurationMin?: number | null;
  },
  hotels: HotelBooking[],
  tripStart: string | null,
): DayLeg[] {
  const dayIso = tripStart ? isoForDay(tripStart, d.idx) : null;
  const { beginHotels, endHotels } = splitHotelsForDay(hotels, dayIso);
  const b = beginHotels.length;
  const r = d.places.length;
  const count = Math.max(0, b + r + endHotels.length - 1);
  const baseMode: Mode = d.defaultMode ?? 'drive';
  const legs: DayLeg[] = [];
  for (let i = 0; i < count; i++) {
    if (r > 0 && i === b - 1) {
      const h = beginHotels[i];
      legs.push({
        kind: 'start',
        hotelId: h.id,
        mode: d.startMode ?? h.departureMode ?? baseMode,
        note: d.startNote ?? null,
        durationMin: d.startDurationMin ?? null,
      });
    } else if (i < b) {
      const h = beginHotels[i];
      legs.push({ kind: 'hotel', leg: 'departure', hotelId: h.id, mode: h.departureMode ?? baseMode });
    } else if (i + 1 >= b + r) {
      const h = endHotels[i + 1 - (b + r)];
      legs.push({ kind: 'hotel', leg: 'arrival', hotelId: h.id, mode: h.arrivalMode ?? baseMode });
    } else {
      const segment = d.segments.find((s) => s.idx === i - b);
      legs.push(segment ? { kind: 'segment', mode: segment.mode, segment } : null);
    }
  }
  return legs;
}

/** Map legs for one day: `places` in display order, `legs` from `dayLegs`.
 *  A leg touching a stop without coordinates, or shorter than 10 m, is skipped.
 *  `from`/`to` index the day's pins (located places, in display order); `slot`
 *  is the leg's colour, the same one the list derives from `legSlot`. */
export function buildMapLegs(places: DisplayPlace[], legs: DayLeg[], infos: LegInfo[]): MapLeg[] {
  const pinPos: (number | null)[] = [];
  let next = 0;
  for (const p of places) pinPos.push(hasCoords(p) ? next++ : null);
  const out: MapLeg[] = [];
  for (let i = 0; i + 1 < places.length; i++) {
    const from = pinPos[i];
    const to = pinPos[i + 1];
    const slot = legSlot(i, places[i], places[i + 1]);
    if (from == null || to == null || slot == null) continue;
    out.push({ from, to, mode: legs[i]?.mode ?? null, slot, info: infos[i] });
  }
  return out;
}

type Located = DisplayPlace & { lat: number; lng: number };
function hasCoords(p: DisplayPlace): p is Located {
  return p.lat != null && p.lng != null;
}

// ─── Transport rides on the itinerary ─────────────────────────────────────────
// Transport bookings are stored once per trip and surfaced on the itinerary the
// way hotels are — keyed by the existing transportBookings.dayIdx (falling back
// to a fromDate match). Rides are not map pins: the map draws a located ride
// as a dashed line between its ends on the same day (MapDay.rides, TP-0142).

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

/** Whether ride `t` belongs to day `dayIdx` (ISO `dayIso`). A ride is placed
 *  by its stored `dayIdx`; when that is null it falls back to matching its
 *  departure date. Overnight rides belong only to their departure day. */
export function rideOnDay(t: TransportBooking, dayIdx: number, dayIso: string | null): boolean {
  if (t.dayIdx != null) return t.dayIdx === dayIdx;
  if (dayIso && t.fromDate) return t.fromDate === dayIso;
  return false;
}

/** Transport rides that belong to day `dayIdx` (rideOnDay), as list rows. */
export function ridesForDay(
  transport: TransportBooking[],
  dayIdx: number,
  dayIso: string | null,
): DisplayRide[] {
  return transport
    .filter((t) => rideOnDay(t, dayIdx, dayIso))
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
  id: string;
  idx: number;
  label: string;
  num: number;
  summaryDistance: string | null; // already unit-formatted
  summaryTime: string | null;
  pins: Pin[];
  legs: MapLeg[]; // visit-order legs; positions index `pins`
  // Every leg of the day, located or not (the stop cards' "Getting here" row).
  // Each MapLeg.info is the same object as its entry here, so Flight sends it once.
  legInfos: LegInfo[];
  defaultMode: Mode; // a leg with no mode of its own travels this way
  rides: MapRide[]; // departing this day, at least one end located (R4)
};

function rideEnd(lat: number | null, lng: number | null): LatLng | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

function mapRidesForDay(transport: TransportBooking[], dayIdx: number, dayIso: string | null): MapRide[] {
  const out: MapRide[] = [];
  for (const t of transport) {
    if (!rideOnDay(t, dayIdx, dayIso)) continue;
    const from = rideEnd(t.fromLat, t.fromLng);
    const to = rideEnd(t.toLat, t.toLng);
    if (!from && !to) continue;
    out.push({
      id: t.id,
      type: t.type,
      from,
      to,
      fromLabel: rideLabel(t.fromCode, t.fromName),
      toLabel: rideLabel(t.toCode, t.toName),
    });
  }
  return out;
}

// All days' map pins, computed server-side in the trip layout so the
// persistent <Map> can switch days client-side without a re-fetch.
export function buildMapDays(
  trip: LoadedTrip,
  hotels: HotelBooking[],
  transport: TransportBooking[],
  units: Units,
  lang: ClockLang = 'en',
): MapDay[] {
  return trip.days.map((d) => {
    const places = displayPlacesForDay(d, hotels, trip.startDate);
    // Pin numbers = list numbers (display position + 1), so a stop without
    // coords leaves a gap (1, 3) instead of renumbering the pins after it.
    const pins: Pin[] = [];
    places.forEach((p, i) => {
      if (!hasCoords(p)) return;
      pins.push({
        id: p.id,
        idx: i + 1,
        kind: p.kind,
        lat: p.lat,
        lng: p.lng,
        name: p.name,
        category: p.category ?? null,
        time: formatClock(p.time, lang),
        googleId: pinGoogleId(p.placeIdExternal),
        approx: p.coordsApprox === true,
      });
    });
    const iso = trip.startDate ? isoForDay(trip.startDate, d.idx) : d.dateIso;
    const dl = dayLegs(d, hotels, trip.startDate);
    const legInfos = buildLegInfos({ id: d.id, num: d.num, defaultMode: d.defaultMode ?? null }, places, dl);
    return {
      id: d.id,
      idx: d.idx,
      label: dayDisplay(d, iso, lang).label,
      num: d.num,
      summaryDistance: formatDistance(d.summaryDistance ?? null, units),
      summaryTime: d.summaryTime ?? null,
      pins,
      legs: buildMapLegs(places, dl, legInfos),
      legInfos,
      defaultMode: d.defaultMode ?? 'drive',
      // Same day rule as the list (page.tsx → ridesForDay): no trip start → dayIdx only.
      rides: mapRidesForDay(transport, d.idx, trip.startDate ? iso : null),
    };
  });
}
