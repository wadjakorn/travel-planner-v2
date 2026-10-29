import { describe, it, expect } from 'vitest';
import { missingLocation } from './segment-fix';

const base = '/trip/t/place';
const ok = { id: 'a', name: 'Tsuta Ramen', lat: 35.7, lng: 139.7 };
const noLoc = { id: 'b', name: 'Park Hotel Tokyo', lat: null, lng: null };
const hotel = { id: 'hotel-h1-end', name: 'Park Hotel Tokyo', lat: null, lng: null, synthetic: true, editHref: '/trip/t/booking/hotel/h1/edit' };

describe('missingLocation', () => {
  it('names the next stop', () => expect(missingLocation(ok, noLoc, base)).toEqual({ name: 'Park Hotel Tokyo', fixHref: '/trip/t/place/b/edit' }));
  it('names the previous stop when only it is missing', () => expect(missingLocation(noLoc, ok, base)?.fixHref).toBe('/trip/t/place/b/edit'));
  it('prefers the next stop when both are missing', () =>
    expect(missingLocation({ ...noLoc, id: 'p', name: 'Prev' }, noLoc, base)?.name).toBe('Park Hotel Tokyo'));
  it('sends hotel stops to the booking', () => expect(missingLocation(ok, hotel, base)?.fixHref).toBe('/trip/t/booking/hotel/h1/edit'));
  it('no link for a synthetic stop without an edit route', () =>
    expect(missingLocation(ok, { ...hotel, editHref: undefined }, base)?.fixHref).toBeNull());
  it('no link for viewers', () => expect(missingLocation(ok, noLoc, null)).toEqual({ name: 'Park Hotel Tokyo', fixHref: null }));
  it('no link for viewers on hotel stops either', () => expect(missingLocation(ok, hotel, null)?.fixHref).toBeNull());
  it('null when both located', () => expect(missingLocation(ok, { ...ok, id: 'c' }, base)).toBeNull());
  it('null when an endpoint is absent', () => {
    expect(missingLocation(ok, null, base)).toBeNull();
    expect(missingLocation(undefined, noLoc, base)).toBeNull();
  });
});
