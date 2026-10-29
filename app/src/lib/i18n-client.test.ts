import { describe, expect, it } from 'vitest';
import { placeholders, pluralKey, pseudoLocalize, withFallback } from './i18n-client';
import type { Dict } from './i18n-client';

describe('withFallback', () => {
  it('fills missing or empty Thai values from English', () => {
    const en = { a: 'A', b: 'B', c: 'C' } as unknown as Dict;
    const th = { a: 'ก', b: '' } as unknown as Partial<Dict>;
    expect(withFallback(en, th)).toEqual({ a: 'ก', b: 'B', c: 'C' });
  });
});

describe('pluralKey', () => {
  it('en: 1 → _one, 0 and 2 → _other', () => {
    expect(pluralKey('en', 'itin_places', 1)).toBe('itin_places_one');
    expect(pluralKey('en', 'itin_places', 0)).toBe('itin_places_other');
    expect(pluralKey('en', 'itin_places', 2)).toBe('itin_places_other');
  });
  it('th has no singular form', () => {
    expect(pluralKey('th', 'itin_places', 1)).toBe('itin_places_other');
  });
});

describe('pseudoLocalize', () => {
  it('brackets, accents and pads ≥ 30% but keeps {vars}', () => {
    const src = 'Add to {day}';
    const out = pseudoLocalize(src);
    expect(out.startsWith('⟦')).toBe(true);
    expect(out.endsWith('⟧')).toBe(true);
    expect(out).toContain('{day}');
    expect(out).not.toContain('Add');
    expect(out.length).toBeGreaterThanOrEqual(1.3 * src.length);
    expect(placeholders(out)).toEqual(['day']);
  });
});

describe('placeholders', () => {
  it('sorted unique {var} names', () => {
    expect(placeholders('{n} of {total}, {n} left')).toEqual(['n', 'total']);
    expect(placeholders('no vars')).toEqual([]);
  });
});
