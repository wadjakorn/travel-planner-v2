import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {} }));

import { parseTransportInput, parseTransportPatch } from './booking-service';

const base = { type: 'flight', title: 'BKK to KIX' };

function err(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

describe('transport endpoint coordinate fields (TP-0142)', () => {
  it('accepts a valid pair', () => {
    const v = parseTransportInput({ ...base, fromLat: 13.69, fromLng: 100.75, fromPlaceId: 'abc' });
    expect(v).toMatchObject({ fromLat: 13.69, fromLng: 100.75, fromPlaceId: 'abc' });
  });

  it('rejects out-of-range lat/lng', () => {
    expect(err(() => parseTransportInput({ ...base, fromLat: 91, fromLng: 0 }))).toBe(
      '"fromLat" must be a number from -90 to 90',
    );
    expect(err(() => parseTransportInput({ ...base, toLat: 0, toLng: 181 }))).toBe(
      '"toLng" must be a number from -180 to 180',
    );
    expect(err(() => parseTransportInput({ ...base, fromLat: 'x', fromLng: 0 }))).toContain('fromLat');
  });

  it('rejects half pairs, including a lone null', () => {
    expect(err(() => parseTransportInput({ ...base, fromLat: 1 }))).toBe(
      '"fromLat" and "fromLng" go together',
    );
    expect(err(() => parseTransportInput({ ...base, fromLat: null }))).toBe(
      '"fromLat" and "fromLng" go together',
    );
    expect(err(() => parseTransportInput({ ...base, toLng: 1 }))).toBe(
      '"toLat" and "toLng" go together',
    );
    expect(err(() => parseTransportInput({ ...base, fromLat: 1, fromLng: null }))).toBeTruthy();
  });

  it('a null pair clears all three', () => {
    const v = parseTransportInput({ ...base, fromLat: null, fromLng: null, fromPlaceId: 'stale' });
    expect(v).toMatchObject({ fromLat: null, fromLng: null, fromPlaceId: null });
  });

  it('a new pair without placeId sets placeId null', () => {
    const v = parseTransportInput({ ...base, toLat: 1, toLng: 2 });
    expect(v).toMatchObject({ toLat: 1, toLng: 2, toPlaceId: null });
  });

  it('validates placeId shape', () => {
    expect(
      err(() => parseTransportInput({ ...base, fromLat: 1, fromLng: 2, fromPlaceId: 5 })),
    ).toContain('fromPlaceId');
    expect(
      err(() =>
        parseTransportInput({ ...base, fromLat: 1, fromLng: 2, fromPlaceId: 'x'.repeat(513) }),
      ),
    ).toContain('fromPlaceId');
  });

  it('legacy body adds no coordinate keys', () => {
    const v = parseTransportInput({ ...base, fromCode: 'BKK', toCode: 'KIX' });
    expect(Object.keys(v).some((k) => /Lat|Lng|PlaceId/.test(k))).toBe(false);
  });

  it('parseTransportPatch validates type, coords and currency without a DB', () => {
    expect(parseTransportPatch({ seats: '12A' })).toEqual({ seats: '12A' });
    expect(err(() => parseTransportPatch({ type: 'bus' }))).toBe('invalid "type"');
    expect(err(() => parseTransportPatch({ fromLat: 1 }))).toContain('go together');
    expect(parseTransportPatch({ toLat: 1, toLng: 2 })).toMatchObject({ toPlaceId: null });
    expect(err(() => parseTransportPatch({ costCurrency: 'xx' }))).toContain('costCurrency');
  });
});
