import { describe, it, expect } from 'vitest';
import {
  deriveCode,
  shortPlaceLabel,
  computeTitle,
  computeArrival,
  arrivalBadge,
} from './transport-compute';

describe('deriveCode', () => {
  it('extracts a parenthesized code', () => {
    expect(deriveCode('Los Angeles International Airport (LAX)')).toBe('LAX');
  });
  it('uppercases a bare 3-letter code', () => {
    expect(deriveCode('nrt')).toBe('NRT');
  });
  it('returns null when there is no code', () => {
    expect(deriveCode('Narita International Airport')).toBeNull();
    expect(deriveCode('Grand Central Terminal')).toBeNull();
    expect(deriveCode('')).toBeNull();
    expect(deriveCode(null)).toBeNull();
  });
});

describe('shortPlaceLabel', () => {
  it('strips airport/station noise words', () => {
    expect(shortPlaceLabel('Los Angeles International Airport')).toBe('Los Angeles');
    expect(shortPlaceLabel('Narita International Airport')).toBe('Narita');
    expect(shortPlaceLabel('Tokyo Station')).toBe('Tokyo');
    expect(shortPlaceLabel('Hakata Ferry Terminal')).toBe('Hakata');
  });
  it('drops a parenthetical code', () => {
    expect(shortPlaceLabel('Los Angeles International Airport (LAX)')).toBe('Los Angeles');
  });
  it('passes through a plain name', () => {
    expect(shortPlaceLabel('Kyoto')).toBe('Kyoto');
  });
});

describe('computeTitle', () => {
  it('uses ref as prefix when present', () => {
    expect(computeTitle('flight', 'JL5', 'Los Angeles', 'Tokyo')).toBe('JL5 · Los Angeles → Tokyo');
  });
  it('falls back to the type label', () => {
    expect(computeTitle('flight', null, 'Los Angeles', 'Tokyo')).toBe('Flight · Los Angeles → Tokyo');
    expect(computeTitle('train', '', 'Kyoto', 'Osaka')).toBe('Train · Kyoto → Osaka');
  });
  it('handles a missing endpoint', () => {
    expect(computeTitle('ferry', null, 'Hakata', null)).toBe('Ferry · Hakata');
    expect(computeTitle('flight', null, null, null)).toBe('Flight');
  });
});

describe('computeArrival', () => {
  it('adds duration within the same day, no TZ shift', () => {
    const a = computeArrival({
      departDate: '2026-01-01',
      departTime: '10:00',
      durationMinutes: 120,
      fromOffsetMinutes: 0,
      toOffsetMinutes: 0,
    })!;
    expect(a).toMatchObject({ date: '2026-01-01', time: '12:00', dayDelta: 0, tzDeltaMinutes: 0 });
  });

  it('rolls into the next day', () => {
    const a = computeArrival({
      departDate: '2026-01-01',
      departTime: '23:00',
      durationMinutes: 120,
      fromOffsetMinutes: 0,
      toOffsetMinutes: 0,
    })!;
    expect(a).toMatchObject({ date: '2026-01-02', time: '01:00', dayDelta: 1 });
  });

  it('applies both UTC offsets (LA → Tokyo)', () => {
    // Depart 10:30 PDT (−420), fly 11h20m (680m), arrive JST (+540).
    const a = computeArrival({
      departDate: '2026-07-12',
      departTime: '10:30',
      durationMinutes: 680,
      fromOffsetMinutes: -420,
      toOffsetMinutes: 540,
    })!;
    expect(a).toMatchObject({ date: '2026-07-13', time: '13:50', dayDelta: 1, tzDeltaMinutes: 960 });
  });

  it('returns null when an offset or field is missing', () => {
    expect(
      computeArrival({ departDate: '2026-01-01', departTime: '10:00', durationMinutes: 60, fromOffsetMinutes: 0, toOffsetMinutes: null }),
    ).toBeNull();
    expect(
      computeArrival({ departDate: null, departTime: '10:00', durationMinutes: 60, fromOffsetMinutes: 0, toOffsetMinutes: 0 }),
    ).toBeNull();
  });
});

describe('arrivalBadge', () => {
  it('notes next-day and TZ shift', () => {
    expect(arrivalBadge({ date: '2026-07-13', time: '13:50', dayDelta: 1, tzDeltaMinutes: 960 })).toBe('next day · +16h TZ');
  });
  it('shows nothing for same-day, same-zone', () => {
    expect(arrivalBadge({ date: '2026-01-01', time: '12:00', dayDelta: 0, tzDeltaMinutes: 0 })).toBeNull();
  });
  it('handles a negative TZ and multi-day', () => {
    expect(arrivalBadge({ date: '2026-01-03', time: '09:00', dayDelta: 2, tzDeltaMinutes: -300 })).toBe('+2 days · −5h TZ');
  });
});
