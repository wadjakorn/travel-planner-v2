import { describe, expect, it } from 'vitest';
import type { HotelBooking } from '@/db/schema';
import type { LoadedTrip } from '@/lib/trip-queries';
import { buildBiasCenters, centroidOf, dayBiasCenter, transportNear } from './bias-center';

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
  it('never treats a last synthetic row as a real place', () => {
    expect(dayBiasCenter([{ id: 'd1', places: [{ id: 'real', lat: 2, lng: 2 }, { id: 'hotel-stay-end', lat: 9, lng: 9, synthetic: true }] }], 'd1')).toEqual({ lat: 2, lng: 2 });
  });
  it('prefers an end hotel over a begin hotel when no real place exists', () => {
    expect(dayBiasCenter([{ id: 'd1', places: [{ id: 'hotel-stay-begin', lat: 8, lng: 8, synthetic: true }, { id: 'hotel-stay-end', lat: 9, lng: 9, synthetic: true }] }], 'd1')).toEqual({ lat: 9, lng: 9 });
  });
  it('uses the trip centroid for an unknown day', () => {
    expect(dayBiasCenter([{ id: 'd1', places: [{ lat: 1, lng: 1 }] }, { id: 'd2', places: [{ lat: 3, lng: 3 }] }], 'missing')).toEqual({ lat: 2, lng: 2 });
  });
  it('returns null when there are no centers anywhere', () => {
    expect(dayBiasCenter([{ id: 'd1', places: [] }], 'd1')).toBeNull();
  });
  it('ignores incomplete coordinates while retaining zero', () => {
    expect(centroidOf([{ lat: 5, lng: null }, { lat: 0, lng: 0 }])).toEqual({ lat: 0, lng: 0 });
  });
});

describe('buildBiasCenters', () => {
  it('uses actual synthetic hotel begin/end ids when building day centers', () => {
    const trip = {
      startDate: '2026-01-01',
      days: [
        { id: 'day-1', idx: 0, places: [{ id: 'place-1', lat: 13.7, lng: 100.5 }, { id: 'place-2', lat: 13.8, lng: 100.6 }] },
        { id: 'day-2', idx: 1, places: [] },
      ],
    } as unknown as LoadedTrip;
    const hotel = {
      id: 'hotel-1',
      lat: 35.68,
      lng: 139.76,
      checkInDate: '2026-01-01',
      checkOutDate: '2026-01-02',
    } as unknown as HotelBooking;

    expect(buildBiasCenters(trip, [hotel])).toEqual({
      trip: { lat: 35.68, lng: 139.76 },
      byDay: {
        'day-1': { lat: 13.8, lng: 100.6 },
        'day-2': { lat: 35.68, lng: 139.76 },
      },
    });
  });

  it('returns null centers for every day when a trip has no places or hotels', () => {
    const trip = {
      startDate: '2026-01-01',
      days: [{ id: 'day-1', idx: 0, places: [] }, { id: 'day-2', idx: 1, places: [] }],
    } as unknown as LoadedTrip;

    expect(buildBiasCenters(trip, [])).toEqual({
      trip: null,
      byDay: { 'day-1': null, 'day-2': null },
    });
  });
});

describe('transportNear', () => {
  it('uses only a complete just-picked endpoint', () => {
    expect(transportNear({ lat: 35.69, lng: 139.7 })).toEqual({ lat: 35.69, lng: 139.7 });
    expect(transportNear({ lat: null, lng: null })).toBeUndefined();
    expect(transportNear(null)).toBeUndefined();
  });
});
