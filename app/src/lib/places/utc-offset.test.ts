import { describe, expect, it } from 'vitest';
import { utcOffsetMinutes } from './utc-offset';

describe('utcOffsetMinutes', () => {
  it('fixed-offset zones', () => {
    expect(utcOffsetMinutes('Asia/Bangkok')).toBe(420);
    expect(utcOffsetMinutes('Asia/Tokyo')).toBe(540);
    expect(utcOffsetMinutes('Asia/Kolkata')).toBe(330);
    expect(utcOffsetMinutes('UTC')).toBe(0);
  });
  it('honours DST at the given instant', () => {
    expect(utcOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(utcOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240);
  });
  it('null for an unknown zone', () => {
    expect(utcOffsetMinutes('Not/AZone')).toBeNull();
  });
});
