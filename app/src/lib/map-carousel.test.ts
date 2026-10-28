import { describe, expect, it } from 'vitest';
import type { Pin } from './map-helpers';
import { dayNav, indexOfPin, stopActivateHref, stopNavUrl } from './map-carousel';

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

it('stopActivateHref', () => {
  expect(stopActivateHref('t1', 2, 'p9')).toBe('/trip/t1?day=2&placeId=p9');
  expect(stopActivateHref('t1', 0, null)).toBe('/trip/t1?day=0');
});

it('indexOfPin', () => {
  const pins = [{ id: 'a' }, { id: 'b' }] as Pin[];
  expect(indexOfPin(pins, 'b')).toBe(1);
  expect(indexOfPin(pins, null)).toBe(-1);
});
