import { describe, it, expect } from 'vitest';
import type { Segment } from '@/db/schema';
import { buildLegInfos } from './leg-info';
import type { DayLeg, DisplayPlace } from './day-augment';

const day = { id: 'd1', num: 3, defaultMode: 'walk' as const };
const stop = (id: string, kind: DisplayPlace['kind'], lat?: number, lng?: number): DisplayPlace => ({
  id,
  idx: 0,
  kind,
  name: id.toUpperCase(),
  lat,
  lng,
});
const H1 = stop('hotel-H1-begin', 'hotel', 35, 139);
const A = stop('A', 'sight', 35.01, 139);
const B = stop('B', 'sight', 35.02, 139);
const C = stop('C', 'sight', 35.03, 139);
const H2 = stop('hotel-H2-end', 'hotel', 35.04, 139);
const places = [H1, A, B, C, H2];
const legs: DayLeg[] = [
  { kind: 'start', mode: 'transit', hotelId: 'H1', note: 's', durationMin: null },
  { kind: 'segment', mode: 'drive', segment: { id: 's0', idx: 0, mode: 'drive', note: 'n', durationMin: 40 } as Segment },
  null,
  { kind: 'hotel', mode: 'drive', hotelId: 'H2', leg: 'arrival' },
];

describe('buildLegInfos', () => {
  const infos = buildLegInfos(day, places, legs);

  it('maps every dayLegs outcome to a LegInfo', () => {
    expect(infos.map((l) => l.kind)).toEqual(['start', 'segment', 'gap', 'hotel']);
    expect(infos[0]).toMatchObject({ placeId: 'A', after: null, hotelId: 'H1', hotelLeg: null, note: 's', mode: 'transit' });
    expect(infos[1]).toMatchObject({ placeId: 'B', after: 'A', note: 'n', durationMin: 40, hotelId: null });
    expect(infos[2]).toMatchObject({ placeId: 'C', after: 'B', mode: 'walk', note: null, durationMin: null });
    expect(infos[3]).toMatchObject({ hotelId: 'H2', hotelLeg: 'arrival', placeId: null, after: null, note: null, durationMin: null });
  });

  it('numbers from/to by display position and keys by day + ids', () => {
    expect(infos.map((l) => [l.fromNum, l.toNum])).toEqual([[1, 2], [2, 3], [3, 4], [4, 5]]);
    expect(infos[1].key).toBe('d1:A>B');
    expect(infos[0].key).toBe('d1:hotel-H1-begin>A');
    expect(infos[1]).toMatchObject({ dayId: 'd1', dayNum: 3, fromId: 'A', toId: 'B', from: { name: 'A' }, to: { name: 'B' } });
  });

  it('an empty day with a hotel departure only yields one hotel leg', () => {
    const out = buildLegInfos(day, [H1, H2], [{ kind: 'hotel', mode: 'drive', hotelId: 'H1', leg: 'departure' }]);
    expect(out).toMatchObject([{ kind: 'hotel', hotelLeg: 'departure', hotelId: 'H1' }]);
  });

  it('slot is null when legSlot is null', () => {
    const nowhere = stop('N', 'sight');
    const out = buildLegInfos(day, [A, nowhere, B], [null, null]);
    expect(out.map((l) => l.slot)).toEqual([null, null]);
    expect(infos.map((l) => l.slot)).toEqual([0, 1, 2, 3]);
  });

  it('is plain JSON and handles fewer than two stops', () => {
    expect(JSON.parse(JSON.stringify(infos))).toEqual(infos);
    expect(buildLegInfos(day, [A], [])).toEqual([]);
  });

  it('gap falls back to drive without a day default', () => {
    expect(buildLegInfos({ ...day, defaultMode: null }, [A, B], [null])[0].mode).toBe('drive');
  });
});
