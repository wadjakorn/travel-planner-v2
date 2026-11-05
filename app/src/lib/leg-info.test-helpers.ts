import type { LegInfo } from './leg-info';

const end = { name: 'x', lat: null, lng: null, address: null, placeIdExternal: null };

/** A LegInfo for tests that build MapLeg / segment literals by hand. */
export function fakeLegInfo(over: Partial<LegInfo> = {}): LegInfo {
  return {
    key: 'd1:a>b',
    kind: 'segment',
    dayId: 'd1',
    dayNum: 1,
    fromId: 'a',
    toId: 'b',
    fromNum: 1,
    toNum: 2,
    from: { ...end, name: 'A' },
    to: { ...end, name: 'B' },
    mode: 'drive',
    note: null,
    durationMin: null,
    slot: 0,
    placeId: 'b',
    after: 'a',
    hotelId: null,
    hotelLeg: null,
    ...over,
  };
}
