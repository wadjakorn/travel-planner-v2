import { describe, expect, it } from 'vitest';
import { formatDistance, formatDurationMin } from './units';

describe('formatDistance', () => {
  it('leaves metric input untouched', () => {
    expect(formatDistance('8.4 km', 'metric')).toBe('8.4 km');
    expect(formatDistance('350 m', 'metric')).toBe('350 m');
  });

  it('converts km to miles', () => {
    expect(formatDistance('8.4 km', 'imperial')).toBe('5.2 mi');
    expect(formatDistance('184 km', 'imperial')).toBe('114.3 mi');
  });

  it('converts short metre distances to feet', () => {
    expect(formatDistance('350 m', 'imperial')).toBe('1148 ft');
  });

  it('uses miles once a metre value is long enough to read as one', () => {
    expect(formatDistance('900 m', 'imperial')).toBe('0.6 mi');
  });

  it('keeps the rest of the string', () => {
    expect(formatDistance('8.4 km total', 'imperial')).toBe('5.2 mi total');
  });

  it('is idempotent — already-imperial or unitless input falls through', () => {
    expect(formatDistance('5.2 mi', 'imperial')).toBe('5.2 mi');
    expect(formatDistance('45 min', 'imperial')).toBe('45 min');
    expect(formatDistance(null, 'imperial')).toBe('');
  });
});

describe('formatDurationMin', () => {
  it('formats minutes as h/m', () => {
    expect([150, 45, 120, 0].map(formatDurationMin)).toEqual(['2h 30m', '45m', '2h', '0m']);
  });
});
