import { describe, it, expect } from 'vitest';
import { readTransportFields } from './transport-form-fields';
import { initialSelection, effectiveEnd } from './transport-initial-selection';

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}
const base = { type: 'flight', title: 'x' };

describe('readTransportFields coordinates', () => {
  it('picked → new numbers and place ids', () => {
    const r = readTransportFields(
      fd({ ...base, fromLat: '13.69', fromLng: '100.75', fromPlaceId: 'p1', toLat: '-3.5', toLng: '0', toPlaceId: '' }),
    );
    expect(r).toMatchObject({ fromLat: 13.69, fromLng: 100.75, fromPlaceId: 'p1', toLat: -3.5, toLng: 0, toPlaceId: null });
  });
  it('cleared (empty strings) → all nulls', () => {
    const r = readTransportFields(
      fd({ ...base, fromLat: '', fromLng: '', fromPlaceId: '', toLat: '', toLng: '', toPlaceId: '' }),
    );
    expect([r.fromLat, r.fromLng, r.fromPlaceId, r.toLat, r.toLng, r.toPlaceId]).toEqual([null, null, null, null, null, null]);
  });
  it('non-finite → null', () => {
    const r = readTransportFields(fd({ ...base, fromLat: 'abc', fromLng: 'Infinity' }));
    expect(r.fromLat).toBeNull();
    expect(r.fromLng).toBeNull();
  });
  it('untouched initial → stored coords round-trip through the hidden fields', () => {
    const stored = { name: 'BKK', code: 'BKK', lat: 13.69, lng: 100.75, placeId: 'abc' };
    const e = effectiveEnd(undefined, stored);
    const r = readTransportFields(
      fd({ ...base, fromLat: String(e.lat ?? ''), fromLng: String(e.lng ?? ''), fromPlaceId: e.placeId ?? '' }),
    );
    expect([r.fromLat, r.fromLng, r.fromPlaceId]).toEqual([13.69, 100.75, 'abc']);
  });
  it('rejects an invalid type', () => {
    expect(() => readTransportFields(fd({ type: 'rocket' }))).toThrow();
  });
});

describe('effectiveEnd', () => {
  const stored = { name: 'Suvarnabhumi', code: 'BKK', lat: 1, lng: 2, placeId: 'p' };
  it('untouched passes stored values verbatim (coords-only gets no synthesized label)', () => {
    expect(effectiveEnd(undefined, { lat: 1, lng: 2 })).toEqual({ name: null, code: null, lat: 1, lng: 2, placeId: null });
  });
  it('cleared blanks label, code and coords together', () => {
    expect(effectiveEnd(null, stored)).toEqual({ name: null, code: null, lat: null, lng: null, placeId: null });
  });
  it('code-chip edit on the initial selection keeps stored coords', () => {
    const sel = { ...initialSelection(stored)!, code: 'ZZZ' };
    expect(effectiveEnd(sel, stored)).toMatchObject({ code: 'ZZZ', lat: 1, lng: 2, placeId: 'p' });
  });
});

describe('initialSelection', () => {
  it('null when no name and no coords', () => {
    expect(initialSelection(null)).toBeNull();
    expect(initialSelection({ name: null, code: 'BKK' })).toBeNull();
    expect(initialSelection({ lat: 1, lng: null })).toBeNull();
  });
  it('name-only: derives code, no coords', () => {
    expect(initialSelection({ name: 'Narita (NRT)' })).toMatchObject({ name: 'Narita (NRT)', code: 'NRT', lat: null, lng: null, placeId: null });
  });
  it('name + coords carry the stored coords and place id', () => {
    expect(initialSelection({ name: 'X', code: 'BKK', lat: 13.69, lng: 100.75, placeId: 'p' })).toMatchObject({
      name: 'X', code: 'BKK', lat: 13.69, lng: 100.75, placeId: 'p',
    });
  });
  it('coords-only: label falls back to code', () => {
    expect(initialSelection({ code: 'BKK', lat: 13.69, lng: 100.75 })).toMatchObject({ name: 'BKK', code: 'BKK', lat: 13.69, lng: 100.75 });
  });
  it('coords-only without code: short coordinates', () => {
    expect(initialSelection({ lat: 13.69, lng: 100.75 })).toMatchObject({ name: '13.690, 100.750', code: null, lat: 13.69, lng: 100.75 });
  });
});
