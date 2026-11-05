import { describe, it, expect } from 'vitest';
import { daySummaryLine, tripSummary, fmtMinutes } from './trip-summary';

const hotel = (name: string, inD: string, outD: string, over = {}) => ({ name, lat: 35, lng: 135, checkInDate: inD, checkOutDate: outD, ...over });

describe('trip summary (TP-0035)', () => {
  it('counts stops, drive km / time (durationMin wins), the night hotel and flags', () => {
    const day = {
      date: 'Sat, Nov 14',
      dateIso: '2026-11-14',
      places: [
        { name: 'A', lat: 35, lng: 135, arrive: null },
        { name: 'B', lat: 35.5, lng: 135, arrive: { mode: 'drive' as const, durationMin: 300, estDistanceKm: 72 } },
        { name: 'C', lat: null, lng: null, arrive: { mode: 'walk' as const, durationMin: 5 } },
      ],
    };
    const line = daySummaryLine(day, 2, false, []);
    expect(line).toBe('Day 3 · Sat, Nov 14 · 3 stops · drive ~72 km / ~5 h 00 · ⚠ no hotel tonight, 1 stop without a pin, long drive');
    const withHotel = daySummaryLine({ ...day, places: day.places.slice(0, 2) }, 2, false, [hotel('Dogo', '2026-11-14', '2026-11-15', { status: 'tbd' })]);
    expect(withHotel).toContain('hotel: Dogo (tbd)');
    expect(withHotel).not.toContain('no hotel tonight');
  });
  it('the last day never warns about a hotel; header + updatedAt', () => {
    const s = tripSummary({ id: 't', title: 'Japan', startDate: '2026-11-13', endDate: '2026-11-14', updatedAt: '2026-11-06T00:00:00.000Z', days: [{ places: [] }] });
    expect(s).toBe('# Japan (2026-11-13 → 2026-11-14)\n\n- Day 1 · 0 stops\n\nupdatedAt: 2026-11-06T00:00:00.000Z');
    expect(fmtMinutes(45)).toBe('45 min');
  });
});
