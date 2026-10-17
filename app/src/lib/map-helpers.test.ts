import { describe, expect, it } from 'vitest';
import { pinBounds, type Pin } from './map-helpers';

const pin = (lat: number, lng: number): Pin => ({ id: `${lat},${lng}`, idx: 1, kind: 'sight', lat, lng });

describe('pinBounds', () => {
  it('returns [[minLng,minLat],[maxLng,maxLat]] for 2+ pins', () => {
    expect(pinBounds([pin(35, 139), pin(34, 140), pin(36, 138)])).toEqual([[138, 34], [140, 36]]);
  });
  it('returns null for 0 or 1 pin', () => {
    expect(pinBounds([])).toBeNull();
    expect(pinBounds([pin(35, 139)])).toBeNull();
  });
});
