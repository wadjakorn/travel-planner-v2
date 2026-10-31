import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import { makeT, withFallback } from './i18n-client';
import type { MapLeg, Pin } from './map-helpers';
import { dayChip, dayNav, dayTitle, indexOfPin, legIntoStop, stopActivateHref, stopLegNavUrl, stopNavUrl } from './map-carousel';

describe('day labels', () => {
  const t = makeT(en);
  it('dayTitle / dayChip', () => {
    expect(dayTitle({ idx: 0, label: 'Sat', num: 12 }, t)).toBe('Day 1 · Sat 12');
    expect(dayChip({ idx: 4, label: 'Wed', num: 16 }, t)).toBe('D5');
    expect(dayChip({ idx: 4, label: 'Wed', num: 16 }, t, true)).toBe('D5 · Wed 16');
  });
  it('reads the caller’s language', () => {
    const tTh = makeT(withFallback(en, th));
    expect(dayTitle({ idx: 0, label: 'ส.', num: 12 }, tTh)).toBe('วันที่ 1 · ส. 12');
  });
});

describe('dayNav', () => {
  it('first day has no prev', () => expect(dayNav(0, 5)).toEqual({ prev: null, next: 1 }));
  it('last day has no next', () => expect(dayNav(4, 5)).toEqual({ prev: 3, next: null }));
  it('single day has neither', () => expect(dayNav(0, 1)).toEqual({ prev: null, next: null }));
});

describe('stopNavUrl', () => {
  it('uses coords when no google id', () => {
    const u = stopNavUrl({ id: 'a', idx: 1, kind: 'sight', lat: 35.1, lng: 139.2, name: 'X', googleId: null });
    expect(u).toContain('destination=35.1%2C139.2');
  });
  it('uses the google place id when present', () => {
    const u = stopNavUrl({ id: 'a', idx: 1, kind: 'food', lat: 35, lng: 139, name: 'Tsuta', googleId: 'ChIJabc' });
    expect(u).toContain('destination_place_id=ChIJabc');
  });
});

const pin = (i: number, over: Partial<Pin> = {}): Pin => ({ id: `p${i}`, idx: i + 1, kind: 'sight', lat: 35 + i, lng: 139 + i, name: `S${i}`, googleId: null, ...over });
const leg = (from: number, to: number, mode: MapLeg['mode']): MapLeg => ({ from, to, mode, slot: 0 });

describe('legIntoStop', () => {
  const pins = [pin(0), pin(1), pin(2)];
  it('finds the leg that ends at a middle stop', () => {
    const r = legIntoStop(pins, [leg(0, 1, 'walk'), leg(1, 2, 'transit')], 2);
    expect(r?.fromPin.id).toBe('p1');
    expect(r?.mode).toBe('transit');
  });
  it('keeps every mode, null included (the card falls back to the day mode)', () => {
    for (const mode of ['drive', 'walk', 'transit', null] as const) {
      expect(legIntoStop(pins, [leg(0, 1, mode)], 1)?.mode).toBe(mode);
    }
  });
  it('is null for the first stop', () => {
    expect(legIntoStop(pins, [leg(0, 1, 'walk')], 0)).toBeNull();
  });
  it('does not skip over an unlocated previous stop (buildMapLegs left no leg)', () => {
    // Display places A, (no coords), C: pins are [A, C] and there is no leg A -> C.
    expect(legIntoStop([pin(0), pin(2)], [], 1)).toBeNull();
  });
});

describe('stopLegNavUrl', () => {
  it('routes previous stop to this one in the leg mode', () => {
    const u = stopLegNavUrl(pin(0), pin(1), 'walk');
    expect(u).toContain('origin=35%2C139');
    expect(u).toContain('destination=36%2C140');
    expect(u).toContain('travelmode=walking');
    expect(u).not.toContain('place_id');
  });
  it('sends place ids for Google stops', () => {
    const u = stopLegNavUrl(pin(0, { googleId: 'ChIJa' }), pin(1, { googleId: 'ChIJb' }), 'transit');
    expect(u).toContain('origin_place_id=ChIJa');
    expect(u).toContain('destination_place_id=ChIJb');
    expect(u).toContain('travelmode=transit');
  });
  it('stopNavUrl has no origin and takes a mode', () => {
    const u = stopNavUrl(pin(1), 'walk');
    expect(u).not.toContain('origin');
    expect(u).toContain('travelmode=walking');
    expect(stopNavUrl(pin(1))).toContain('travelmode=driving');
  });
});

it('stopActivateHref', () => {
  expect(stopActivateHref('t1', 2, 'p9')).toBe('/trip/t1?day=2&placeId=p9');
  expect(stopActivateHref('t1', 0, null)).toBe('/trip/t1?day=0');
});

it('indexOfPin', () => {
  const pins = [{ id: 'a' }, { id: 'b' }] as Pin[];
  expect(indexOfPin(pins, 'b')).toBe(1);
  expect(indexOfPin(pins, null)).toBe(-1);
});
