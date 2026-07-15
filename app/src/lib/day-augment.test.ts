import { describe, it, expect } from 'vitest';
import type { TransportBooking } from '@/db/schema';
import { ridesForDay } from './day-augment';

function ride(p: Partial<TransportBooking> & { id: string }): TransportBooking {
  return {
    id: p.id,
    type: p.type ?? 'flight',
    title: 'x',
    dayIdx: p.dayIdx ?? null,
    fromCode: p.fromCode ?? null,
    fromName: p.fromName ?? null,
    fromTime: p.fromTime ?? null,
    fromDate: p.fromDate ?? null,
    toCode: p.toCode ?? null,
    toName: p.toName ?? null,
    toDate: p.toDate ?? null,
  } as unknown as TransportBooking;
}

describe('ridesForDay', () => {
  it('places a ride on its stored dayIdx', () => {
    const t = [
      ride({ id: 'a', dayIdx: 0, fromCode: 'BKK', toCode: 'CNX', fromTime: '08:30' }),
      ride({ id: 'b', dayIdx: 2 }),
    ];
    const rides = ridesForDay(t, 0, '2026-07-12');
    expect(rides.map((r) => r.id)).toEqual(['a']);
    expect(rides[0]).toMatchObject({ fromLabel: 'BKK', toLabel: 'CNX', time: '08:30' });
  });

  it('falls back to a fromDate match when dayIdx is null', () => {
    const t = [ride({ id: 'c', dayIdx: null, fromDate: '2026-07-13', fromName: 'Narita' })];
    expect(ridesForDay(t, 1, '2026-07-13').map((r) => r.id)).toEqual(['c']);
    expect(ridesForDay(t, 1, '2026-07-14')).toEqual([]);
  });

  it('prefers code over name for labels', () => {
    const [r] = ridesForDay([ride({ id: 'a', dayIdx: 0, fromCode: 'BKK', fromName: 'Suvarnabhumi', toName: 'Narita' })], 0, null);
    expect(r.fromLabel).toBe('BKK'); // code wins
    expect(r.toLabel).toBe('Narita'); // no code → name
  });

  it('flags an overnight ride (different from/to dates)', () => {
    const [r] = ridesForDay([ride({ id: 'a', dayIdx: 0, fromDate: '2026-07-12', toDate: '2026-07-13' })], 0, null);
    expect(r.overnight).toBe(true);
  });

  it('does not double-place a dayIdx ride via date fallback', () => {
    // dayIdx=0 ride should NOT also appear on day 1 even if its fromDate matches.
    const t = [ride({ id: 'a', dayIdx: 0, fromDate: '2026-07-13' })];
    expect(ridesForDay(t, 1, '2026-07-13')).toEqual([]);
  });

  it('returns [] when nothing matches', () => {
    expect(ridesForDay([], 0, '2026-07-12')).toEqual([]);
  });
});
