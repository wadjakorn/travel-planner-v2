import { describe, expect, it } from 'vitest';
import { centroidOf, dayBiasCenter, transportNear } from './bias-center';

describe('dayBiasCenter', () => {
  it('prefers the last real place over tonight hotel', () => {
    expect(dayBiasCenter([{ id: 'd1', places: [{ id: 'a', lat: 1, lng: 1 }, { id: 'b', lat: 2, lng: 2 }, { id: 'hotel-end', lat: 9, lng: 9, synthetic: true }] }], 'd1')).toEqual({ lat: 2, lng: 2 });
  });
  it('falls back through end hotel, begin hotel, earlier day and trip centroid', () => {
    expect(dayBiasCenter([{ id: 'd1', places: [{ id: 'hotel-end', lat: 9, lng: 9, synthetic: true }] }], 'd1')).toEqual({ lat: 9, lng: 9 });
    expect(dayBiasCenter([{ id: 'd1', places: [{ id: 'hotel-begin', lat: 8, lng: 8, synthetic: true }] }], 'd1')).toEqual({ lat: 8, lng: 8 });
    expect(dayBiasCenter([{ id: 'd1', places: [{ lat: 4, lng: 4 }] }, { id: 'd2', places: [] }], 'd2')).toEqual({ lat: 4, lng: 4 });
    expect(dayBiasCenter([{ id: 'd1', places: [] }, { id: 'd2', places: [{ lat: 2, lng: 2 }] }], 'd1')).toEqual({ lat: 2, lng: 2 });
  });
  it('ignores incomplete coordinates while retaining zero', () => {
    expect(centroidOf([{ lat: 5, lng: null }, { lat: 0, lng: 0 }])).toEqual({ lat: 0, lng: 0 });
  });
});

describe('transportNear', () => {
  it('uses only a complete just-picked endpoint', () => {
    expect(transportNear({ lat: 35.69, lng: 139.7 })).toEqual({ lat: 35.69, lng: 139.7 });
    expect(transportNear({ lat: null, lng: null })).toBeUndefined();
    expect(transportNear(null)).toBeUndefined();
  });
});
