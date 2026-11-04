import { describe, it, expect } from 'vitest';
import { readTransportEnds } from './transport-input';

function err(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

describe('readTransportEnds', () => {
  it('absent -> undefined, null -> null', () => {
    const r = readTransportEnds({ title: 'x', to: null });
    expect(r.from).toBeUndefined();
    expect(r.to).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(err(() => readTransportEnds({ from: 'BKK' }))).toBe('"from" must be an object or null');
    expect(err(() => readTransportEnds({ to: [] }))).toBe('"to" must be an object or null');
  });

  it('parses lat/lng/placeId/name', () => {
    const r = readTransportEnds({ from: { name: ' BKK ', lat: 13.69, lng: 100.75, placeId: 'p1' } });
    expect(r.from).toEqual({
      name: 'BKK', lat: 13.69, lng: 100.75, placeId: 'p1',
      googleMapsUrl: null, query: null, near: null,
    });
  });

  it('range and pair errors carry the end prefix', () => {
    expect(err(() => readTransportEnds({ from: { lat: 91, lng: 0 } }))).toBe(
      'from: "lat" must be a number from -90 to 90',
    );
    expect(err(() => readTransportEnds({ to: { lat: 1 } }))).toBe(
      'to: "lat" and "lng" go together',
    );
    expect(err(() => readTransportEnds({ to: { lat: 1, lng: 181 } }))).toBe(
      'to: "lng" must be a number from -180 to 180',
    );
  });

  it('bad name / placeId', () => {
    expect(err(() => readTransportEnds({ from: { name: 'x'.repeat(201), lat: 1, lng: 1 } }))).toContain('from: "name"');
    expect(err(() => readTransportEnds({ from: { name: 5, lat: 1, lng: 1 } }))).toContain('from: "name"');
    expect(err(() => readTransportEnds({ from: { lat: 1, lng: 1, placeId: 'x'.repeat(513) } }))).toContain('from: "placeId"');
  });

  it('blank name -> null', () => {
    expect(readTransportEnds({ from: { name: '  ', query: 'KIX' } }).from?.name).toBeNull();
  });

  it('needs something to resolve or label', () => {
    expect(err(() => readTransportEnds({ from: {} }))).toBe(
      '"from" needs lat/lng, googleMapsUrl, query or name',
    );
    expect(err(() => readTransportEnds({ from: { status: 'x' } }))).toContain('needs');
  });

  it('name alone is allowed', () => {
    expect(readTransportEnds({ from: { name: 'BKK' } }).from).toMatchObject({ name: 'BKK', query: null });
  });

  it('googleMapsUrl and query/near', () => {
    const r = readTransportEnds({
      from: { googleMapsUrl: ' https://maps.app.goo.gl/x ' },
      to: { query: 'Kansai International Airport', near: '34.4,135.2' },
    });
    expect(r.from?.googleMapsUrl).toBe('https://maps.app.goo.gl/x');
    expect(r.to).toMatchObject({ query: 'Kansai International Airport', near: { lat: 34.4, lng: 135.2 } });
  });

  it('bad near is prefixed', () => {
    expect(err(() => readTransportEnds({ from: { query: 'x', near: 'nope' } }))).toBe(
      'from: "near" string must be "lat,lng"',
    );
  });

  it('ignores status/sourceUrl inside an end', () => {
    expect(() => readTransportEnds({ from: { status: 'bogus', sourceUrl: 5, query: 'KIX' } })).not.toThrow();
  });

  it('object wins: flat keys dropped from the cleaned body (R9)', () => {
    const body = {
      title: 't', fromCode: 'BKK', fromLat: 1, fromLng: 2, fromPlaceId: 'old',
      toLat: 3, toLng: 4, from: { query: 'KIX' },
    };
    const r = readTransportEnds(body);
    expect(r.body).toEqual({ title: 't', fromCode: 'BKK', toLat: 3, toLng: 4, from: { query: 'KIX' } });
    expect(body.fromLat).toBe(1); // input not mutated
  });

  it('null end also drops flat keys; absent end keeps them', () => {
    const r = readTransportEnds({ to: null, toLat: 1, toLng: 2, fromLat: 5, fromLng: 6 });
    expect(r.body).not.toHaveProperty('toLat');
    expect(r.body).toMatchObject({ fromLat: 5, fromLng: 6 });
  });
});
