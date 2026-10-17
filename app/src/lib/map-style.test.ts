import { describe, expect, it } from 'vitest';
import { mapStyleUrl } from './map-style';

describe('mapStyleUrl', () => {
  it('dark vs light', () => {
    expect(mapStyleUrl('dark')).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(mapStyleUrl('light')).toBe('https://tiles.openfreemap.org/styles/liberty');
  });
});
