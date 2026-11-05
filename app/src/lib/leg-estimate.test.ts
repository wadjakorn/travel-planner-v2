import { describe, it, expect } from 'vitest';
import { estimateLeg, withLegEstimates, driveMinutesForDay, LEG_EST } from './leg-estimate';
import { metersBetween } from './map-preview';

// Kyoto Station → Kiyomizu-dera, ~2.9 km straight line.
const A = { lat: 34.9858, lng: 135.7588 };
const B = { lat: 34.9949, lng: 135.785 };
const km = metersBetween(A, B) / 1000;

describe('estimateLeg (TP-0149)', () => {
  it('drive: haversine × 1.3 at 45 km/h, km to 1 decimal', () => {
    const r = estimateLeg(A, B, 'drive');
    expect(r.estDistanceKm).toBe(Math.round(km * 1.3 * 10) / 10);
    expect(r.estDurationMin).toBe(Math.round(((km * 1.3) / 45) * 60));
  });
  it('walk: × 1.2 at 4.5 km/h', () => {
    const r = estimateLeg(A, B, 'walk');
    expect(r.estDistanceKm).toBe(Math.round(km * LEG_EST.walk.detour * 10) / 10);
    expect(r.estDurationMin).toBe(Math.round(((km * 1.2) / 4.5) * 60));
  });
  it('transit: distance only', () => {
    expect(estimateLeg(A, B, 'transit')).toEqual({ estDistanceKm: Math.round(km * 1.3 * 10) / 10, estDurationMin: null });
  });
  it('missing coords on either end → both null', () => {
    expect(estimateLeg(A, { lat: null, lng: null }, 'drive')).toEqual({ estDistanceKm: null, estDurationMin: null });
    expect(estimateLeg(null, B, 'walk')).toEqual({ estDistanceKm: null, estDurationMin: null });
  });
  it('same point → 0 km but at least 1 min', () => {
    expect(estimateLeg(A, A, 'drive')).toEqual({ estDistanceKm: 0, estDurationMin: 1 });
  });
});

const hotel = { lat: 34.98, lng: 135.75, checkInDate: '2026-11-01', checkOutDate: '2026-11-03' };

describe('withLegEstimates (TP-0149)', () => {
  it('adds est* to every non-null arrive; place 0 from the begin hotel', () => {
    const day = {
      dateIso: '2026-11-02',
      places: [
        { ...A, arrive: { mode: 'drive' as const, durationMin: null } },
        { ...B, arrive: { mode: 'walk' as const, durationMin: 20 } },
        { lat: null, lng: null, arrive: { mode: 'drive' as const, durationMin: null } },
      ],
    };
    const out = withLegEstimates(day, [hotel]);
    expect(out.places[0].arrive).toEqual({ mode: 'drive', durationMin: null, ...estimateLeg(hotel, A, 'drive') });
    expect(out.places[1].arrive).toMatchObject({ durationMin: 20, ...estimateLeg(A, B, 'walk') });
    expect(out.places[2].arrive).toMatchObject({ estDistanceKm: null, estDurationMin: null });
  });
  it('no begin hotel, or arrive null → no estimate', () => {
    const day = { dateIso: '2026-11-01', places: [{ ...A, arrive: { mode: 'drive' as const, durationMin: null } }, { ...B, arrive: null }] };
    const out = withLegEstimates(day, [hotel]); // check-in day: hotel is the end, not the begin
    expect(out.places[0].arrive).toMatchObject({ estDistanceKm: null, estDurationMin: null });
    expect(out.places[1].arrive).toBeNull();
  });
});

describe('driveMinutesForDay (TP-0149)', () => {
  const far = { lat: 34.0, lng: 133.0 }; // ~290 km from Kyoto
  it('sums drive legs: durationMin wins over the estimate; walk/transit ignored', () => {
    const places = [A, B, far];
    const arrives = [null, { mode: 'walk' as const, durationMin: 30 }, { mode: 'drive' as const, durationMin: 200 }];
    expect(driveMinutesForDay(places, arrives, [], null)).toBe(200);
  });
  it('counts the start leg and the leg to the end hotel', () => {
    const begin = { ...far, checkInDate: '2026-11-01', checkOutDate: '2026-11-02' };
    const end = { ...far, checkInDate: '2026-11-02', checkOutDate: '2026-11-03', arrivalMode: 'drive' as const };
    const arrives = [{ mode: 'drive' as const, durationMin: 10 }, { mode: 'drive' as const, durationMin: 5 }];
    const toEnd = estimateLeg(B, end, 'drive').estDurationMin!;
    expect(driveMinutesForDay([A, B], arrives, [begin, end], '2026-11-02')).toBe(10 + 5 + toEnd);
    expect(driveMinutesForDay([A, B], arrives, [{ ...end, arrivalMode: 'walk' as const }], '2026-11-02')).toBe(15);
  });
});
