import { describe, it, expect } from 'vitest';
import type { HotelBooking, Segment, TransportBooking } from '@/db/schema';
import type { LoadedTrip } from '@/lib/trip-queries';
import type { Mode } from '@/lib/map-helpers';
import { legSlot } from '@/lib/map-route';
import { buildLegInfos } from './leg-info';
import {
  buildMapDays,
  buildMapLegs,
  dayLegs,
  displayPlacesForDay,
  hotelToSyntheticPlace,
  ridesForDay,
  type DayLeg,
  type DisplayPlace,
} from './day-augment';

function ride(p: Partial<TransportBooking> & { id: string }): TransportBooking {
  return {
    id: p.id,
    type: p.type ?? 'flight',
    title: 'x',
    dayIdx: p.dayIdx ?? null,
    fromCode: p.fromCode ?? null,
    fromName: p.fromName ?? null,
    fromTime: p.fromTime ?? null,
    fromDate: p.fromDate ?? null,
    toCode: p.toCode ?? null,
    toName: p.toName ?? null,
    toDate: p.toDate ?? null,
    fromLat: p.fromLat ?? null,
    fromLng: p.fromLng ?? null,
    toLat: p.toLat ?? null,
    toLng: p.toLng ?? null,
  } as unknown as TransportBooking;
}

describe('ridesForDay', () => {
  it('places a ride on its stored dayIdx', () => {
    const t = [
      ride({ id: 'a', dayIdx: 0, fromCode: 'BKK', toCode: 'CNX', fromTime: '08:30' }),
      ride({ id: 'b', dayIdx: 2 }),
    ];
    const rides = ridesForDay(t, 0, '2026-07-12');
    expect(rides.map((r) => r.id)).toEqual(['a']);
    expect(rides[0]).toMatchObject({ fromLabel: 'BKK', toLabel: 'CNX', time: '08:30' });
  });

  it('falls back to a fromDate match when dayIdx is null', () => {
    const t = [ride({ id: 'c', dayIdx: null, fromDate: '2026-07-13', fromName: 'Narita' })];
    expect(ridesForDay(t, 1, '2026-07-13').map((r) => r.id)).toEqual(['c']);
    expect(ridesForDay(t, 1, '2026-07-14')).toEqual([]);
  });

  it('prefers code over name for labels', () => {
    const [r] = ridesForDay([ride({ id: 'a', dayIdx: 0, fromCode: 'BKK', fromName: 'Suvarnabhumi', toName: 'Narita' })], 0, null);
    expect(r.fromLabel).toBe('BKK'); // code wins
    expect(r.toLabel).toBe('Narita'); // no code → name
  });

  it('flags an overnight ride (different from/to dates)', () => {
    const [r] = ridesForDay([ride({ id: 'a', dayIdx: 0, fromDate: '2026-07-12', toDate: '2026-07-13' })], 0, null);
    expect(r.overnight).toBe(true);
  });

  it('does not double-place a dayIdx ride via date fallback', () => {
    // dayIdx=0 ride should NOT also appear on day 1 even if its fromDate matches.
    const t = [ride({ id: 'a', dayIdx: 0, fromDate: '2026-07-13' })];
    expect(ridesForDay(t, 1, '2026-07-13')).toEqual([]);
  });

  it('returns [] when nothing matches', () => {
    expect(ridesForDay([], 0, '2026-07-12')).toEqual([]);
  });
});

describe('hotelToSyntheticPlace', () => {
  it('links the stop to its hotel booking edit page', () => {
    const h = { id: 'h1', tripId: 't1', name: 'Mr. Kinjo', lat: null, lng: null } as unknown as HotelBooking;
    expect(hotelToSyntheticPlace(h, 'end', null)).toMatchObject({
      id: 'hotel-h1-end',
      synthetic: true,
      editHref: '/trip/t1/booking/hotel/h1/edit',
    });
  });
  it('synthetic hotel stop carries status and coordsApprox', () => {
    const h = { id: 'h1', tripId: 't1', name: 'Dogo', lat: 1, lng: 2, status: 'tbd', coordsApprox: true } as unknown as HotelBooking;
    expect(hotelToSyntheticPlace(h, 'begin', null)).toMatchObject({ status: 'tbd', coordsApprox: true });
  });
});

// ─── Legs + map numbering ──────────────────────────────────────────────────────

function place(id: string, lat: number | null = null, lng: number | null = null): DisplayPlace {
  return { id, idx: 0, kind: 'sight', name: id, lat, lng };
}
const at = (id: string, lat: number, lng: number) => place(id, lat, lng);
const noCoords = (id: string) => place(id);

function seg(p: { idx: number; mode: Mode; time?: string }): Segment {
  return { id: `s${p.idx}`, dayId: 'd', idx: p.idx, mode: p.mode, distance: '', time: p.time ?? '' } as Segment;
}
function hotel(p: Partial<HotelBooking> & { id: string }): HotelBooking {
  return { tripId: 't', name: p.id, lat: null, lng: null, departureMode: null, arrivalMode: null, ...p } as unknown as HotelBooking;
}
const segLeg = (mode: Mode): DayLeg => ({ kind: 'segment', mode, segment: seg({ idx: 0, mode }) });
const hotelLeg = (mode: Mode): DayLeg => ({ kind: 'hotel', mode, hotelId: 'h', leg: 'departure' });

describe('dayLegs', () => {
  const [p0, p1, p2] = [noCoords('p0'), noCoords('p1'), noCoords('p2')];

  it('looks segments up by idx, not array position', () => {
    // Sparse rows: only leg 1 has a stored mode (e.g. imported day + one edit).
    const legs = dayLegs({ idx: 0, defaultMode: null, places: [p0, p1, p2], segments: [seg({ idx: 1, mode: 'walk' })] }, [], null);
    expect(legs.map((l) => l?.mode ?? null)).toEqual([null, 'walk']);
    expect(legs[1]).toMatchObject({ kind: 'segment', segment: { idx: 1 } });
  });

  it('offsets the segment lookup past begin hotels', () => {
    // Day 2 of a 07-12 → 07-14 stay: hotel, p0, p1, hotel. Leg 1 = p0 → p1 = segment idx 0.
    const legs = dayLegs(
      { idx: 1, defaultMode: null, places: [p0, p1], segments: [seg({ idx: 0, mode: 'transit' })] },
      [hotel({ id: 'h', checkInDate: '2026-07-12', checkOutDate: '2026-07-14' })],
      '2026-07-12',
    );
    expect(legs.map((l) => l?.kind ?? null)).toEqual(['start', 'segment', 'hotel']);
    expect(legs[1]?.mode).toBe('transit');
  });

  it('hotel legs use the hotel mode, then the day default, then drive', () => {
    const h = hotel({ id: 'h', checkInDate: '2026-07-12', checkOutDate: '2026-07-14', departureMode: 'walk' });
    expect(dayLegs({ idx: 1, defaultMode: 'transit', places: [p0], segments: [] }, [h], '2026-07-12')).toEqual([
      { kind: 'start', hotelId: 'h', mode: 'walk', note: null, durationMin: null },
      { kind: 'hotel', leg: 'arrival', hotelId: 'h', mode: 'transit' },
    ]);
    expect(dayLegs({ idx: 1, defaultMode: null, places: [p0], segments: [] }, [h], '2026-07-12')[1]?.mode).toBe('drive');
  });

  const stay = { checkInDate: '2026-07-12', checkOutDate: '2026-07-14' };

  it('start leg prefers day.startMode over the hotel departureMode', () => {
    const h = hotel({ id: 'h', ...stay, departureMode: 'walk' });
    const legs = dayLegs(
      { idx: 1, defaultMode: null, places: [p0], segments: [], startMode: 'transit', startNote: 'n', startDurationMin: 15 },
      [h],
      '2026-07-12',
    );
    expect(legs[0]).toEqual({ kind: 'start', mode: 'transit', hotelId: 'h', note: 'n', durationMin: 15 });
  });

  it('start leg falls back to departureMode, then defaultMode, then drive', () => {
    const withDep = hotel({ id: 'h', ...stay, departureMode: 'walk' });
    const noDep = hotel({ id: 'h', ...stay });
    const day = (defaultMode: Mode | null) => ({ idx: 1, defaultMode, places: [p0], segments: [] });
    expect(dayLegs(day('transit'), [withDep], '2026-07-12')[0]?.mode).toBe('walk');
    expect(dayLegs(day('transit'), [noDep], '2026-07-12')[0]?.mode).toBe('transit');
    expect(dayLegs(day(null), [noDep], '2026-07-12')[0]?.mode).toBe('drive');
  });

  it('with two begin hotels only the last one → place 0 is the start leg', () => {
    const h0 = hotel({ id: 'h0', checkInDate: '2026-07-10', checkOutDate: '2026-07-12', departureMode: 'walk' });
    const h1 = hotel({ id: 'h1', checkInDate: '2026-07-11', checkOutDate: '2026-07-12', departureMode: 'transit' });
    const legs = dayLegs({ idx: 2, defaultMode: null, places: [p0], segments: [] }, [h0, h1], '2026-07-10');
    expect(legs.map((l) => l?.kind)).toEqual(['hotel', 'start']);
    expect(legs[0]?.mode).toBe('walk');
  });

  it('a hotel day with no places keeps the departure leg (r = 0)', () => {
    const h0 = hotel({ id: 'h0', checkInDate: '2026-07-10', checkOutDate: '2026-07-12' });
    const h1 = hotel({ id: 'h1', checkInDate: '2026-07-12', checkOutDate: '2026-07-14' });
    const legs = dayLegs({ idx: 2, defaultMode: null, places: [], segments: [], startMode: 'walk' }, [h0, h1], '2026-07-10');
    expect(legs).toMatchObject([{ kind: 'hotel', leg: 'departure' }]);
  });

  it('dayLegs with b = 0 has no start leg even when startMode is set', () => {
    const legs = dayLegs({ idx: 0, defaultMode: null, places: [p0, p1], segments: [], startMode: 'walk' }, [], null);
    expect(legs.map((l) => l?.kind ?? null)).toEqual([null]);
  });

  it('has no legs for a day with fewer than two stops', () => {
    expect(dayLegs({ idx: 0, defaultMode: null, places: [p0], segments: [] }, [], null)).toEqual([]);
    expect(dayLegs({ idx: 0, defaultMode: null, places: [], segments: [] }, [], null)).toEqual([]);
  });
});

const infosFor = (places: DisplayPlace[], legs: DayLeg[]) =>
  buildLegInfos({ id: 'd1', num: 1, defaultMode: null }, places, legs);

describe('buildMapLegs', () => {
  it('skips legs touching a stop without coords', () => {
    const places = [at('a', 35, 139), noCoords('b'), at('c', 35.01, 139.01)];
    expect(buildMapLegs(places, [segLeg('drive'), segLeg('walk')], infosFor(places, [segLeg('drive'), segLeg('walk')]))).toEqual([]);
  });

  it('skips a zero-length leg (same hotel morning and night)', () => {
    const hs = [at('h1', 35, 139), at('h2', 35, 139)];
    expect(buildMapLegs(hs, [hotelLeg('drive')], infosFor(hs, [hotelLeg('drive')]))).toEqual([]);
  });

  it('emits pin positions and the leg mode (null when no stored mode)', () => {
    const places = [at('a', 35, 139), noCoords('x'), at('b', 35.01, 139), at('c', 35.02, 139), at('d', 35.03, 139)];
    const legs = [null, null, segLeg('walk'), null];
    const infos = infosFor(places, legs);
    expect(buildMapLegs(places, legs, infos)).toEqual([
      { from: 1, to: 2, mode: 'walk', slot: 2, info: infos[2] },
      { from: 2, to: 3, mode: null, slot: 3, info: infos[3] },
    ]);
  });
});

describe('buildMapDays', () => {
  const trip = {
    startDate: null,
    days: [
      {
        id: 'd1',
        idx: 0,
        label: 'Day 1',
        num: 1,
        defaultMode: null,
        summaryDistance: null,
        summaryTime: null,
        places: [at('a', 35, 139), noCoords('b'), at('c', 35.01, 139), at('d', 35.02, 139)],
        segments: [seg({ idx: 2, mode: 'walk' })],
      },
    ],
  } as unknown as LoadedTrip;

  it('numbers pins by list position', () => {
    expect(buildMapDays(trip, [], [], 'metric')[0].pins.map((p) => p.idx)).toEqual([1, 3, 4]);
  });

  it('carries the day default mode, drive when unset', () => {
    expect(buildMapDays(trip, [], [], 'metric')[0].defaultMode).toBe('drive');
    const walking = { ...trip, days: [{ ...trip.days[0], defaultMode: 'walk' }] } as unknown as LoadedTrip;
    expect(buildMapDays(walking, [], [], 'metric')[0].defaultMode).toBe('walk');
  });

  it('builds the day legs against pin positions', () => {
    expect(buildMapDays(trip, [], [], 'metric')[0].legs).toEqual([
      { from: 1, to: 2, mode: 'walk', slot: 2, info: expect.objectContaining({ kind: 'segment', dayId: 'd1', dayNum: 1, fromNum: 3, toNum: 4 }) },
    ]);
  });

  it('map slots equal the list slots on a hotel day with a stop without coords', () => {
    const h = hotel({ id: 'h', checkInDate: '2026-05-01', checkOutDate: '2026-05-03', lat: 35.03, lng: 139 });
    const day = { ...trip.days[0], idx: 0 };
    const dated = { ...trip, startDate: '2026-05-02', days: [day] } as unknown as LoadedTrip;
    const places = displayPlacesForDay(day as never, [h], dated.startDate);
    const listSlots = places.map((p, i) => legSlot(i, p, places[i + 1])).filter((n) => n != null);
    expect(listSlots).toEqual([0, 3, 4]);
    expect(buildMapDays(dated, [h], [], 'metric')[0].legs.map((l) => l.slot)).toEqual(listSlots);
  });

  it('formats a stay check-in time for the pin (default en)', () => {
    const dated = {
      startDate: '2025-04-12',
      days: [{ ...trip.days[0], places: [] }],
    } as unknown as LoadedTrip;
    const h = hotel({
      id: 'h1', lat: 35.6, lng: 139.7,
      checkInDate: '2025-04-12', checkOutDate: '2025-04-14', checkInTime: '15:00',
    });
    expect(buildMapDays(dated, [h], [], 'metric')[0].pins[0].time).toBe('3:00 PM');
    expect(buildMapDays(dated, [h], [], 'metric', 'th')[0].pins[0].time).toBe('15:00');
  });

  it('marks approx pins from coords_approx, not status', () => {
    const dated = {
      startDate: '2025-04-12',
      days: [{ ...trip.days[0], places: [] }],
    } as unknown as LoadedTrip;
    const stay = { checkInDate: '2025-04-12', checkOutDate: '2025-04-14', lat: 35.6, lng: 139.7 };
    const a = hotel({ id: 'A', ...stay, status: 'tbd', coordsApprox: false } as never);
    const b = hotel({ id: 'B', ...stay, status: 'confirmed', coordsApprox: true } as never);
    const pins = buildMapDays(dated, [a, b], [], 'metric')[0].pins;
    expect(pins.find((p) => p.id === 'hotel-A-end')?.approx).toBe(false);
    expect(pins.find((p) => p.id === 'hotel-B-end')?.approx).toBe(true);
  });
});

describe('buildMapDays rides', () => {
  const day = (idx: number) => ({
    id: `d${idx}`, idx, label: `Day ${idx + 1}`, num: idx + 1, defaultMode: null,
    summaryDistance: null, summaryTime: null, places: [], segments: [],
  });
  const trip = { startDate: '2026-07-12', days: [day(0), day(1)] } as unknown as LoadedTrip;
  const BKK = { lat: 13.69, lng: 100.75 };
  const KIX = { lat: 34.43, lng: 135.23 };
  const located = (p: Partial<TransportBooking> & { id: string }) =>
    ride({ fromLat: BKK.lat, fromLng: BKK.lng, toLat: KIX.lat, toLng: KIX.lng, ...p });

  it('puts an overnight BKK→KIX flight on its departure day only (R17)', () => {
    const t = [located({ id: 'f', dayIdx: 0, fromCode: 'BKK', toCode: 'KIX', fromDate: '2026-07-12', toDate: '2026-07-13' })];
    const days = buildMapDays(trip, [], t, 'metric');
    expect(days[0].rides).toEqual([
      { id: 'f', type: 'flight', from: BKK, to: KIX, fromLabel: 'BKK', toLabel: 'KIX' },
    ]);
    expect(days[1].rides).toEqual([]);
  });

  it('places a ride with no dayIdx by its departure date, like the list', () => {
    const t = [located({ id: 'f', type: 'train', fromDate: '2026-07-13', fromName: 'Shin-Osaka' })];
    const days = buildMapDays(trip, [], t, 'metric');
    expect(days[0].rides).toEqual([]);
    expect(days[1].rides.map((r) => [r.id, r.type, r.fromLabel])).toEqual([['f', 'train', 'Shin-Osaka']]);
  });

  it('drops a ride with no located end', () => {
    const t = [ride({ id: 'n', dayIdx: 0, fromCode: 'BKK', toCode: 'KIX' })];
    expect(buildMapDays(trip, [], t, 'metric')[0].rides).toEqual([]);
  });

  it('keeps a one-ended ride with its other end null', () => {
    const t = [ride({ id: 'o', dayIdx: 0, toLat: KIX.lat, toLng: KIX.lng })];
    const [r] = buildMapDays(trip, [], t, 'metric')[0].rides;
    expect(r).toMatchObject({ id: 'o', from: null, to: KIX });
  });

  it('ignores a half coordinate pair', () => {
    const t = [ride({ id: 'h', dayIdx: 0, fromLat: 13.69, toLat: KIX.lat, toLng: KIX.lng })];
    expect(buildMapDays(trip, [], t, 'metric')[0].rides[0].from).toBeNull();
  });
});
