import { describe, it, expect } from 'vitest';
import { readPlaceLink } from './place-input';

describe('readPlaceLink', () => {
  it('returns null when absent', () => {
    expect(readPlaceLink({})).toBeNull();
  });
  it('trims', () => {
    expect(readPlaceLink({ googleMapsUrl: ' https://x ' })).toBe('https://x');
  });
  it('rejects a non-string', () => {
    expect(() => readPlaceLink({ googleMapsUrl: 5 })).toThrow();
  });
  it('rejects a string over 2048 chars', () => {
    expect(() => readPlaceLink({ googleMapsUrl: 'a'.repeat(2049) })).toThrow();
  });
  it('accepts exactly 2048 chars', () => {
    expect(readPlaceLink({ googleMapsUrl: 'a'.repeat(2048) })).toHaveLength(2048);
  });
});
