import { describe, it, expect } from 'vitest';
import { formatClock, type ClockLang } from './clock';

describe('formatClock', () => {
  it.each([
    ['15:00', 'en', '3:00 PM'],
    ['3:00 PM', 'en', '3:00 PM'],
    ['7:30 pm', 'th', '19:30'],
    ['08:30', 'th', '08:30'],
    ['00:15', 'en', '12:15 AM'],
    ['12:00', 'en', '12:00 PM'],
    ['9am', 'en', '9:00 AM'],
    ['15:00:00', 'en', '3:00 PM'],
    ['15:00 น.', 'en', '3:00 PM'],
    ['12:30 am', 'th', '00:30'],
    ['9:05 a.m.', 'en', '9:05 AM'],
  ])('%s (%s) → %s', (raw, lang, out) => expect(formatClock(raw, lang as ClockLang)).toBe(out));
  it('leaves unparseable text alone', () => {
    expect(formatClock('Morning', 'en')).toBe('Morning');
    expect(formatClock('after lunch', 'en')).toBe('after lunch');
    expect(formatClock('25:00', 'en')).toBe('25:00');
    expect(formatClock('15.30', 'en')).toBe('15.30');
    expect(formatClock('13 PM', 'en')).toBe('13 PM');
    expect(formatClock(' 10:00 – 12:00 ', 'en')).toBe('10:00 – 12:00');
  });
  it('empty → null', () => {
    expect(formatClock('  ', 'en')).toBeNull();
    expect(formatClock(null, 'en')).toBeNull();
    expect(formatClock(undefined, 'en')).toBeNull();
  });
});
