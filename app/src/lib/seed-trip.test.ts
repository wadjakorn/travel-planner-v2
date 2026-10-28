import { describe, it, expect } from 'vitest';
import { SEED_TRIP } from './seed-trip';
import { isRealISODate } from './api/iso-date';

// TP-0070: the demo seed must honour the same storage contract the forms and
// /api/v1 enforce — YYYY-MM-DD dates, HH:MM (24h, <input type="time">) times.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

describe('SEED_TRIP bookings', () => {
  it('stores hotel dates as YYYY-MM-DD and times as HH:MM', () => {
    for (const h of SEED_TRIP.hotels) {
      for (const d of [h.checkInDate, h.checkOutDate]) expect(isRealISODate(d ?? '')).toBe(true);
      for (const t of [h.checkInTime, h.checkOutTime]) expect(t).toMatch(HHMM);
    }
  });

  it('stores transport dates as YYYY-MM-DD and times as HH:MM', () => {
    for (const t of SEED_TRIP.transport) {
      for (const d of [t.fromDate, t.toDate]) expect(isRealISODate(d ?? '')).toBe(true);
      for (const tm of [t.fromTime, t.toTime]) expect(tm).toMatch(HHMM);
    }
  });
});
