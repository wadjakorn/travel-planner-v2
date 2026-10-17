import { describe, expect, it } from 'vitest';
import { timeZoneAt } from './tz-lookup';

describe('timeZoneAt', () => {
  it('resolves airports', () => {
    expect(timeZoneAt(13.69, 100.75)).toBe('Asia/Bangkok'); // BKK
    expect(timeZoneAt(35.55, 139.78)).toBe('Asia/Tokyo'); // HND
  });
  it('null for invalid coordinates', () => {
    expect(timeZoneAt(999, 0)).toBeNull();
  });
});
