import { describe, it, expect } from 'vitest';
import { hoursForDate } from './opening-hours';

// Google weekdayDescriptions use U+2009 around the dash and U+202F before AM/PM.
const G_EN = [
  'Monday: 11:00 AM – 9:00 PM', 'Tuesday: 11:00 AM – 9:00 PM',
  'Wednesday: Closed', 'Thursday: 11:00 AM – 9:00 PM', 'Friday: 11:00 AM – 9:00 PM',
  'Saturday: 10:00 AM – 2:00 PM, 5:00 – 10:00 PM', 'Sunday: Open 24 hours',
].join('; ');

describe('hoursForDate', () => {
  // 2025-04-12 is a Saturday (the test trip's Day 1), 2025-04-16 a Wednesday.
  it('picks the trip day and normalises spaces', () =>
    expect(hoursForDate(G_EN, '2025-04-12', 'en')).toEqual({ weekday: 'Sat', text: '10:00 AM – 2:00 PM, 5:00 – 10:00 PM', closed: false }));
  it('flags a closed day', () =>
    expect(hoursForDate(G_EN, '2025-04-16', 'en')).toEqual({ weekday: 'Wed', text: 'Closed', closed: true }));
  it('keeps "Open 24 hours" as text', () =>
    expect(hoursForDate(G_EN, '2025-04-13', 'en')).toEqual({ weekday: 'Sun', text: 'Open 24 hours', closed: false }));
  it('reads Thai weekday names', () =>
    expect(hoursForDate('วันจันทร์: 11:00–21:00; วันเสาร์: ปิดทำการ', '2025-04-12', 'th')).toEqual({ weekday: 'ส.', text: 'ปิดทำการ', closed: true }));
  it('treats legacy "Today · …" seed text as daily hours', () =>
    expect(hoursForDate('Today · 11:00 – 21:00', '2025-04-12', 'en')).toEqual({ weekday: 'Sat', text: '11:00 – 21:00', closed: false }));
  it('returns null for formats it cannot place on a weekday', () =>
    expect(hoursForDate('Mo-Sa 11:00-21:00', '2025-04-12', 'en')).toBeNull());
  it('returns null when the trip day is not listed', () =>
    expect(hoursForDate('Monday: 9:00 AM – 5:00 PM', '2025-04-12', 'en')).toBeNull());
  it('returns null without a date or hours', () => {
    expect(hoursForDate(G_EN, null, 'en')).toBeNull();
    expect(hoursForDate(null, '2025-04-12', 'en')).toBeNull();
  });
});
