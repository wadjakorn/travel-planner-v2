import { describe, it, expect } from 'vitest';
import { parseImportPlan, MAX_DAYS, MAX_PLACES_PER_DAY } from './import-input';
import { ServiceError } from '@/lib/services/service-error';

const base = { trip: { title: 'Kyoto' } };

describe('parseImportPlan', () => {
  it('accepts a minimal trip with no days/hotels', () => {
    const out = parseImportPlan({ trip: { title: 'Kyoto' } });
    expect(out.trip.title).toBe('Kyoto');
    expect(out.days).toEqual([]);
    expect(out.hotels).toEqual([]);
  });

  it('parses days, places and hotels', () => {
    const out = parseImportPlan({
      trip: { title: 'Kyoto', startDate: '2026-11-01', endDate: '2026-11-02' },
      days: [
        { date: '2026-11-01', places: [{ kind: 'food', name: 'Nishiki', lat: 35, lng: 135 }] },
      ],
      hotels: [{ name: 'Granvia', checkInDate: '2026-11-01' }],
    });
    expect(out.days).toHaveLength(1);
    expect(out.days[0].places[0].name).toBe('Nishiki');
    expect(out.days[0].places[0].placeIdExternal).toBeNull();
    expect(out.days[0].date).toBe('2026-11-01');
    expect(out.hotels[0].name).toBe('Granvia');
  });

  it('requires a non-empty title', () => {
    expect(() => parseImportPlan({ trip: { title: '' } })).toThrow('"title" is required');
    expect(() => parseImportPlan({})).toThrow(ServiceError);
  });

  it('rejects a bad place kind (delegated to parsePlaceFields) with context', () => {
    expect(() =>
      parseImportPlan({ ...base, days: [{ places: [{ kind: 'x', name: 'y' }] }] }),
    ).toThrow(/day 1 place 1:/);
  });

  it('enforces the days cap', () => {
    const days = Array.from({ length: MAX_DAYS + 1 }, () => ({ places: [] }));
    expect(() => parseImportPlan({ ...base, days })).toThrow(
      `"days" exceeds the limit of ${MAX_DAYS}`,
    );
  });

  it('enforces the places-per-day cap', () => {
    const places = Array.from({ length: MAX_PLACES_PER_DAY + 1 }, () => ({
      kind: 'food',
      name: 'p',
    }));
    expect(() => parseImportPlan({ ...base, days: [{ places }] })).toThrow(
      `exceeds the limit of ${MAX_PLACES_PER_DAY}`,
    );
  });

  it('rejects non-calendar trip dates', () => {
    expect(() =>
      parseImportPlan({ trip: { title: 'K', startDate: '2026-02-31' } }),
    ).toThrow('"trip.startDate" must be a valid YYYY-MM-DD date');
    expect(() =>
      parseImportPlan({ trip: { title: 'K', endDate: '11/01/2026' } }),
    ).toThrow(/valid YYYY-MM-DD/);
  });

  it('rejects a non-calendar day date', () => {
    expect(() =>
      parseImportPlan({ ...base, days: [{ date: '2026-13-01', places: [] }] }),
    ).toThrow(/day 1 "date" must be a valid YYYY-MM-DD/);
  });

  it('caps the day skeleton implied by a huge date range (no explicit days)', () => {
    expect(() =>
      parseImportPlan({ trip: { title: 'K', startDate: '2000-01-01', endDate: '2001-01-01' } }),
    ).toThrow(`exceeds the limit of ${MAX_DAYS}`);
  });

  it('accepts a modest date range with no explicit days', () => {
    const out = parseImportPlan({
      trip: { title: 'K', startDate: '2026-11-01', endDate: '2026-11-03' },
    });
    expect(out.days).toEqual([]);
    expect(out.trip.startDate).toBe('2026-11-01');
  });
});
