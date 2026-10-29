import { describe, expect, it } from 'vitest';
import type { Pin } from './map-helpers';
import { mapSummary, travelChipLabel } from './map-a11y';

const pin = (idx: number, name?: string, time?: string | null): Pin => ({
  id: `p${idx}`,
  idx,
  kind: 'sight',
  lat: 35,
  lng: 139,
  name,
  time,
});

describe('mapSummary', () => {
  it('lists the day stops in pin order with their times', () => {
    expect(
      mapSummary('Day 1 · Sat 12', [pin(2, 'Tsuta Ramen', '19:30'), pin(1, 'Senso-ji', '09:00')]),
    ).toBe('Day 1 · Sat 12 has 2 places: 1. Senso-ji, 09:00; 2. Tsuta Ramen, 19:30.');
  });

  it('falls back to "Stop n" and omits a missing time', () => {
    expect(mapSummary('Day 3 · Mon 14', [pin(1)])).toBe(
      'Day 3 · Mon 14 has 1 place: 1. Stop 1.',
    );
  });

  it('keeps gapped pin numbers (they match the list)', () => {
    expect(mapSummary('Day 1 · Sat 12', [pin(3, 'B'), pin(1, 'A', null)])).toBe(
      'Day 1 · Sat 12 has 2 places: 1. A; 3. B.',
    );
  });

  it('says so when the day has no places', () => {
    expect(mapSummary('Day 2 · Sun 13', [])).toBe('Day 2 · Sun 13 has no places yet.');
  });

  it('does not reorder the caller array', () => {
    const pins = [pin(2, 'B'), pin(1, 'A')];
    mapSummary('Day 1', pins);
    expect(pins.map((p) => p.idx)).toEqual([2, 1]);
  });
});

describe('travelChipLabel', () => {
  it('reads the distance and time', () => {
    expect(travelChipLabel('8.4 km', '1h 12m')).toBe('Total travel for this day: 8.4 km, 1h 12m');
  });
});
