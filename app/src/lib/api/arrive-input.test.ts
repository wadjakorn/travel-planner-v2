import { describe, expect, it } from 'vitest';
import { parseArrive, readArrive } from './arrive-input';

describe('parseArrive', () => {
  it('accepts valid input and normalises', () => {
    expect(parseArrive({ mode: 'transit' })).toEqual({ mode: 'transit', durationMin: null, note: null });
    expect(parseArrive({ mode: 'drive', durationMin: 150, note: '  Matsuyama expressway  ' })).toEqual({
      mode: 'drive',
      durationMin: 150,
      note: 'Matsuyama expressway',
    });
    expect(parseArrive({ mode: 'walk', note: '   ' }).note).toBeNull();
    expect(parseArrive({ mode: 'walk', durationMin: 0 }).durationMin).toBe(0);
    expect(parseArrive({ mode: 'walk', durationMin: 2880 }).durationMin).toBe(2880);
    expect(parseArrive({ mode: 'walk', note: 'x'.repeat(500) }).note).toHaveLength(500);
  });

  it('rejects invalid input with bad_request naming the field', () => {
    const bads: unknown[] = [
      { mode: 'train' }, {}, [], 'drive', null,
      { mode: 'drive', durationMin: '90' }, { mode: 'drive', durationMin: 90.5 },
      { mode: 'drive', durationMin: -1 }, { mode: 'drive', durationMin: 2881 },
      { mode: 'drive', note: 'x'.repeat(501) }, { mode: 'drive', note: 5 },
    ];
    for (const bad of bads) {
      expect(() => parseArrive(bad)).toThrow(/arrive/);
      try { parseArrive(bad); } catch (e) { expect((e as { code: string }).code).toBe('bad_request'); }
    }
  });
});

describe('readArrive', () => {
  it('distinguishes absent, null and present', () => {
    expect(readArrive({})).toBeUndefined();
    expect(readArrive({ arrive: null })).toBeNull();
    expect(readArrive({ arrive: { mode: 'walk' } })).toEqual({ mode: 'walk', durationMin: null, note: null });
    expect(() => readArrive({ arrive: [] })).toThrow(/arrive/);
  });
});
