import { describe, expect, it } from 'vitest';
import { hotelFormFrom, hotelSelectionFrom, placeFormFrom, transportSelectionFrom } from './pick';
import type { Located, PlaceDetail, PlaceSuggestion } from './types';

const g: PlaceSuggestion = {
  id: 'ChIJabc', name: 'Jay Fai', secondary: 'Bangkok', address: null,
  lat: null, lng: null, kind: 'food', timeZone: null,
};
const located: Located = { ...g, lat: 13.7, lng: 100.5, address: 'Maha Chai Rd', timeZone: 'Asia/Bangkok' };

describe('selection helpers', () => {
  it('hotelSelectionFrom uses ensured coords', async () => {
    expect(await hotelSelectionFrom(g, async () => located)).toEqual({
      name: 'Jay Fai', address: 'Maha Chai Rd', lat: 13.7, lng: 100.5, placeId: 'ChIJabc',
    });
  });
  it('hotelSelectionFrom null when ensure fails', async () => {
    expect(await hotelSelectionFrom(g, async () => null)).toBeNull();
  });
  it('transportSelectionFrom computes offset from ensured timeZone', async () => {
    const sel = await transportSelectionFrom(g, async () => located);
    expect(sel).toMatchObject({ lat: 13.7, lng: 100.5, placeId: 'ChIJabc', utcOffsetMinutes: 420, secondary: 'Bangkok' });
  });
  it('transportSelectionFrom null when ensure fails', async () => {
    expect(await transportSelectionFrom(g, async () => null)).toBeNull();
  });
});

describe('form helpers', () => {
  it('hotelFormFrom never emits "null"', () => {
    const f = hotelFormFrom({ ...located, address: null });
    expect(Object.values(f)).not.toContain('null');
    expect(f).toEqual({ name: 'Jay Fai', address: '', lat: '13.7', lng: '100.5', placeIdExternal: 'ChIJabc' });
  });
  const d: PlaceDetail = { ...located, phone: null, website: null, hours: null, rating: null, reviews: null };
  it('placeFormFrom omits rating/reviews when null', () => {
    const f = placeFormFrom(d);
    expect(f).not.toHaveProperty('rating');
    expect(f).not.toHaveProperty('reviews');
    expect(Object.values(f)).not.toContain('null');
  });
  it('placeFormFrom adds rating/reviews when set', () => {
    expect(placeFormFrom({ ...d, phone: '02', rating: 4.4, reviews: 100 })).toMatchObject({
      phone: '02', rating: '4.4', reviews: '100', kind: 'food',
    });
  });
});
