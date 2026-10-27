import { describe, it, expect } from 'vitest';
import { parseImportPlan, readImportPlaceLinks, MAX_DAYS, MAX_PLACES_PER_DAY } from './import-input';
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

  it('carries place status + sourceUrl through to the parsed plan', () => {
    const out = parseImportPlan({
      trip: { title: 'Kyoto' },
      days: [
        {
          places: [
            { kind: 'food', name: 'A', status: 'tbd', sourceUrl: 'https://src.test/a' },
            { kind: 'sight', name: 'B' },
          ],
        },
      ],
    });
    expect(out.days[0].places[0].status).toBe('tbd');
    expect(out.days[0].places[0].sourceUrl).toBe('https://src.test/a');
    expect(out.days[0].places[1].status).toBe('confirmed');
    expect(out.days[0].places[1].sourceUrl).toBeNull();
  });

  it('scheme-validates trip.sourceUrl (rejects javascript:)', () => {
    expect(() =>
      parseImportPlan({ trip: { title: 'Kyoto', sourceUrl: 'javascript:alert(1)' } }),
    ).toThrow(/trip\.sourceUrl/);
    expect(parseImportPlan({ trip: { title: 'K', sourceUrl: 'https://x.test' } }).trip.sourceUrl).toBe(
      'https://x.test',
    );
  });

  it('rejects a place with a bad sourceUrl scheme, with context', () => {
    expect(() =>
      parseImportPlan({
        ...base,
        days: [{ places: [{ kind: 'food', name: 'y', sourceUrl: 'javascript:1' }] }],
      }),
    ).toThrow(/day 1 place 1:/);
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

describe('parseImportPlan sections (TP-0040)', () => {
  it('defaults every section to empty/null when absent', () => {
    const out = parseImportPlan(base);
    expect(out.sections).toEqual({ transport: [], expenses: [], notes: [], budget: null });
  });

  it('validates transport, expenses, notes and budget shapes', () => {
    const out = parseImportPlan({
      ...base,
      transport: [{ type: 'flight', title: 'NRT→CDG', dayIdx: 0, costCurrency: 'usd' }],
      expenses: [{ category: 'food', amount: 42, dayIdx: 1, currency: 'jpy' }],
      notes: [{ kind: 'doc', title: 'Visas', body: 'ESTA done' }],
      budget: { amount: 5000, basis: 'per_person', caps: { hotels: 1200 }, currency: 'eur' },
    });
    expect(out.sections!.transport[0]).toMatchObject({ type: 'flight', title: 'NRT→CDG', dayIdx: 0, costCurrency: 'USD' });
    expect(out.sections!.expenses[0].values).toMatchObject({ category: 'food', amount: 42, currency: 'JPY' });
    expect(out.sections!.notes[0]).toEqual({ kind: 'doc', title: 'Visas', body: 'ESTA done' });
    expect(out.sections!.budget).toEqual({
      config: { amount: 5000, basis: 'per_person', caps: { hotels: 1200 } },
      currency: 'EUR',
    });
  });

  it('rejects a bad transport type with positional context', () => {
    expect(() =>
      parseImportPlan({ ...base, transport: [{ type: 'rocket', title: 'X' }] }),
    ).toThrow(/transport 1: .*flight, train, car, or ferry/);
  });

  it('rejects a bad expense category with positional context', () => {
    expect(() =>
      parseImportPlan({ ...base, expenses: [{ category: 'bribes', amount: 1 }] }),
    ).toThrow(/expenses 1: .*category/);
  });

  it('rejects a note missing its title', () => {
    expect(() =>
      parseImportPlan({ ...base, notes: [{ kind: 'doc' }] }),
    ).toThrow(/notes 1: .*title/);
  });

  it('rejects a budget cap under an unknown category', () => {
    expect(() =>
      parseImportPlan({ ...base, budget: { amount: 100, caps: { hotel: 50 } } }),
    ).toThrow(/Unknown budget category "hotel"/);
  });

  it('rejects a non-array section', () => {
    expect(() => parseImportPlan({ ...base, transport: {} })).toThrow(/"transport" must be an array/);
  });
});

describe('readImportPlaceLinks', () => {
  const U = 'https://maps.app.goo.gl/abc';
  it('returns [day][place] links, null where absent', () => {
    const body = {
      trip: { title: 'T' },
      days: [{ places: [{ kind: 'food', name: 'A' }, { kind: 'food', name: 'B', googleMapsUrl: ` ${U} ` }] }],
    };
    expect(readImportPlaceLinks(body)).toEqual([[null, U]]);
  });
  it('a non-string URL throws with positional context', () => {
    const body = {
      trip: { title: 'T' },
      days: [{ places: [{ kind: 'food', name: 'A' }, { kind: 'food', name: 'B', googleMapsUrl: 5 }] }],
    };
    expect(() => readImportPlaceLinks(body)).toThrow(/^day 1 place 2: /);
  });
});
