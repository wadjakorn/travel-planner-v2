// One plain, JSON-serializable descriptor per travel leg, built once on the
// server from `dayLegs` and shared by the list's leg bar and the map's arcs
// (it crosses the RSC boundary, so: no functions, no Dates).

import type { DayLeg, DisplayPlace } from './day-augment';
import { legSlot } from './map-route';
import type { Mode } from './map-helpers';

/** Only what the leg sheet reads: the header name + the fields that
 *  gmapsDirectionsUrl / missingLocation inspect. */
export type LegEnd = {
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  placeIdExternal: string | null;
};

export type LegInfo = {
  key: string; // `${dayId}:${fromId}>${toId}` — unique per trip
  kind: 'segment' | 'start' | 'gap' | 'hotel';
  dayId: string;
  dayNum: number; // the day as displayed (1-based, day.num)
  fromId: string;
  toId: string; // display ids (hotel = `hotel-<id>-begin|end`)
  fromNum: number;
  toNum: number; // list numbers (display position + 1)
  from: LegEnd;
  to: LegEnd;
  mode: Mode; // gap → the day default, else drive
  note: string | null; // hotel → null
  durationMin: number | null; // hotel → null
  slot: number | null; // legSlot(i, from, to)
  // Where a save goes.
  placeId: string | null; // segment/start/gap: the real destination; hotel: null
  after: string | null; // segment/gap: the real origin; start: null (= {at:'start'})
  hotelId: string | null;
  hotelLeg: 'arrival' | 'departure' | null;
};

function legEnd(p: DisplayPlace): LegEnd {
  return {
    name: p.name,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    address: p.address ?? null,
    placeIdExternal: p.placeIdExternal ?? null,
  };
}

/** One LegInfo per consecutive pair of display places; `legs` is `dayLegs`
 *  for the same day, so `legs[i]` joins `places[i]` and `places[i + 1]`. */
export function buildLegInfos(
  day: { id: string; num: number; defaultMode: Mode | null },
  places: DisplayPlace[],
  legs: DayLeg[],
): LegInfo[] {
  const out: LegInfo[] = [];
  for (let i = 0; i + 1 < places.length; i++) {
    const a = places[i];
    const b = places[i + 1];
    const l = legs[i] ?? null;
    const base = {
      key: `${day.id}:${a.id}>${b.id}`,
      dayId: day.id,
      dayNum: day.num,
      fromId: a.id,
      toId: b.id,
      fromNum: i + 1,
      toNum: i + 2,
      from: legEnd(a),
      to: legEnd(b),
      slot: legSlot(i, a, b),
    };
    if (l?.kind === 'hotel') {
      out.push({
        ...base,
        kind: 'hotel',
        mode: l.mode,
        note: null,
        durationMin: null,
        placeId: null,
        after: null,
        hotelId: l.hotelId,
        hotelLeg: l.leg,
      });
    } else if (l?.kind === 'start') {
      out.push({
        ...base,
        kind: 'start',
        mode: l.mode,
        note: l.note,
        durationMin: l.durationMin,
        placeId: b.id,
        after: null,
        hotelId: l.hotelId,
        hotelLeg: null,
      });
    } else if (l?.kind === 'segment') {
      out.push({
        ...base,
        kind: 'segment',
        mode: l.mode,
        note: l.segment.note ?? null,
        durationMin: l.segment.durationMin ?? null,
        placeId: b.id,
        after: a.id,
        hotelId: null,
        hotelLeg: null,
      });
    } else {
      out.push({
        ...base,
        kind: 'gap',
        mode: day.defaultMode ?? 'drive',
        note: null,
        durationMin: null,
        placeId: b.id,
        after: a.id,
        hotelId: null,
        hotelLeg: null,
      });
    }
  }
  return out;
}
