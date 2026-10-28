import { describe, expect, it } from 'vitest';
import { googlePickJson, hotelFormFrom, hotelSelectionFrom, placeFormData, placeFormFrom, transportSelectionFrom } from './pick';
import { parseGooglePick } from './google-sync';
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

describe('googlePickJson', () => {
  const googleDetail: PlaceDetail = {
    ...located, phone: '02 123', website: 'https://jayfai.example', hours: 'Mon: 9–5', rating: 4.4, reviews: 1234,
  };
  it('full pick carries the permanent fields only', () => {
    expect(parseGooglePick(googlePickJson(googleDetail, 'full'))).toEqual({
      fields: 'full',
      snapshot: { name: 'Jay Fai', address: 'Maha Chai Rd', lat: 13.7, lng: 100.5, phone: '02 123', website: 'https://jayfai.example' },
    });
    const raw = JSON.parse(googlePickJson(googleDetail, 'full') as string);
    for (const k of ['rating', 'reviews', 'hours']) expect(raw.snapshot).not.toHaveProperty(k);
  });
  it('basic pick has name, address and coords only', () => {
    const raw = JSON.parse(googlePickJson(googleDetail, 'basic') as string);
    expect(raw).toEqual({ fields: 'basic', snapshot: { name: 'Jay Fai', address: 'Maha Chai Rd', lat: 13.7, lng: 100.5 } });
  });
  it('null for a non-Google place', () => {
    expect(googlePickJson({ ...googleDetail, id: 'geoapify:abc' }, 'full')).toBeNull();
  });
  it('placeFormFrom emits the full pick for Google, nothing for Geoapify', () => {
    expect(placeFormFrom(googleDetail).googlePick).toBe(googlePickJson(googleDetail, 'full'));
    expect(placeFormFrom({ ...googleDetail, id: 'geoapify:abc' })).not.toHaveProperty('googlePick');
  });
});

describe('placeFormData', () => {
  const detail: PlaceDetail = { ...located, phone: '02 123', website: null, hours: null, rating: 4.5, reviews: 10 };
  it('sets dayId and every placeFormFrom value', () => {
    const fd = placeFormData('day-1', detail);
    expect(fd.get('dayId')).toBe('day-1');
    expect(fd.get('kind')).toBe('food');
    expect(fd.get('phone')).toBe('02 123');
    expect(fd.get('rating')).toBe('4.5');
    expect(parseGooglePick(fd.get('googlePick'))?.fields).toBe('full');
    for (const [k, v] of Object.entries(placeFormFrom(detail))) expect(fd.get(k)).toBe(v);
  });
  it('no googlePick for a non-Google place', () => {
    expect(placeFormData('d', { ...detail, id: 'geoapify:x' }).has('googlePick')).toBe(false);
  });
});
