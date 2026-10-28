import { describe, expect, it } from 'vitest';
import { OPEN_CLIENT_CONFIG, effectiveRenderer } from './client-config';

describe('effectiveRenderer', () => {
  const g = { renderer: 'google' as const, browserKey: 'B', mapId: 'M', poiAdd: true };
  it('is google when fully configured and not degraded', () => {
    expect(effectiveRenderer(g, false)).toBe('google');
  });
  it('falls back when degraded', () => {
    expect(effectiveRenderer(g, true)).toBe('maplibre');
  });
  it('falls back without a browser key', () => {
    expect(effectiveRenderer({ ...g, browserKey: '' }, false)).toBe('maplibre');
  });
  it('falls back without a map id', () => {
    expect(effectiveRenderer({ ...g, mapId: '' }, false)).toBe('maplibre');
  });
  it('is maplibre for the open config', () => {
    expect(effectiveRenderer(OPEN_CLIENT_CONFIG, false)).toBe('maplibre');
  });
});
