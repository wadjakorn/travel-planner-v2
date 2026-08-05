import { describe, expect, it } from 'vitest';
import { localeTag, weekStart, weekdayNames, weekdayHeader } from './week';

describe('weekStart', () => {
  it('is Sunday for the two locales the app ships', () => {
    expect(weekStart(localeTag('en'))).toBe(0);
    expect(weekStart(localeTag('th'))).toBe(0);
  });

  it('follows the locale where the locale disagrees', () => {
    // The point of deriving instead of hardcoding: these are Monday-start.
    expect(weekStart('en-GB')).toBe(1);
    expect(weekStart('de-DE')).toBe(1);
  });
});

describe('weekdayNames', () => {
  it('indexes by JS day, so 0 is Sunday', () => {
    const names = weekdayNames('en-US');
    expect(names[0]).toBe('Sun');
    expect(names[6]).toBe('Sat');
  });
});

describe('weekdayHeader', () => {
  it('runs in the locale column order', () => {
    expect(weekdayHeader('en-US').map((d) => d.dow)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayHeader('en-GB').map((d) => d.dow)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('labels each column with its own day', () => {
    const gb = weekdayHeader('en-GB');
    expect(gb[0].label).toBe('Mon');
    expect(gb[6].label).toBe('Sun');
  });
});
