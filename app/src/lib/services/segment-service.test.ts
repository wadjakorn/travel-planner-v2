import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));

import { dayDefaultModePatch } from './segment-service';

describe('dayDefaultModePatch', () => {
  it('a concrete mode also sets start_mode', () => {
    expect(dayDefaultModePatch('walk')).toEqual({ defaultMode: 'walk', startMode: 'walk' });
  });
  it('mixed (null) leaves start_mode alone', () => {
    expect(dayDefaultModePatch(null)).toEqual({ defaultMode: null });
  });
});
