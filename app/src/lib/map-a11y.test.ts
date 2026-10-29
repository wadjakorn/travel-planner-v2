import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import { makeT, pluralKey, withFallback, type Lang, type TranslatePlural } from './i18n-client';
import type { Pin } from './map-helpers';
import { mapSummary as summary } from './map-a11y';

const translators = (lang: Lang) => {
  const t = makeT(lang === 'th' ? withFallback(en, th) : en);
  const tp: TranslatePlural = (base, n, vars) => t(pluralKey(lang, base, n), { n, ...vars });
  return [t, tp] as const;
};
const [t, tp] = translators('en');
const mapSummary = (day: string, pins: Pin[]) => summary(day, pins, t, tp);

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

describe('mapSummary in Thai', () => {
  it('reads the caller’s language', () => {
    const [tTh, tpTh] = translators('th');
    expect(summary('วันที่ 1', [pin(1)], tTh, tpTh)).toBe('วันที่ 1 มี 1 สถานที่: 1. จุดที่ 1');
    expect(summary('วันที่ 2', [], tTh, tpTh)).toBe('วันที่ 2 ยังไม่มีสถานที่');
  });
});

describe('map_travel_total_aria', () => {
  it('reads the distance and time', () => {
    expect(t('map_travel_total_aria', { distance: '8.4 km', time: '1h 12m' })).toBe(
      'Total travel for this day: 8.4 km, 1h 12m',
    );
  });
});
