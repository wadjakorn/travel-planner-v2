import { describe, expect, it } from 'vitest';
import { isGooglePlaceId, placeProvider } from './place-id';

describe('placeProvider', () => {
  it('treats a bare id as a legacy Google place_id', () => {
    expect(placeProvider('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe('google');
  });
  it('reads known prefixes', () => {
    expect(placeProvider('geoapify:51a1b2')).toBe('geoapify');
    expect(placeProvider('osm:N123456')).toBe('osm');
  });
  it('returns null for empty or unknown prefixes', () => {
    expect(placeProvider(null)).toBeNull();
    expect(placeProvider('')).toBeNull();
    expect(placeProvider('here:abc')).toBeNull();
  });
  it('isGooglePlaceId', () => {
    expect(isGooglePlaceId('ChIJabc')).toBe(true);
    expect(isGooglePlaceId('geoapify:abc')).toBe(false);
    expect(isGooglePlaceId(undefined)).toBe(false);
  });
});
