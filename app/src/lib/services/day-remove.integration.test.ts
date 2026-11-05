// TP-0155: removeDay in one tx + dayIdx references follow. Gated on TEST_DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, expenses, hotelBookings, transportBookings, tripMemberships } from '@/db/schema';
import type { dbNode } from '@/db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
const OWNER = 'rmday-owner';
const VIEWER = 'rmday-viewer';

suite('removeDay (TP-0155)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let removeDay: typeof import('./day-service').removeDay;
  const tripIds: string[] = [];
  const tx = () => database as unknown as typeof dbNode;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    ({ removeDay } = await import('./day-service'));
    await client`INSERT INTO "user"(id,name,email) VALUES (${OWNER},'O','rmday-o@t.local'),(${VIEWER},'V','rmday-v@t.local') ON CONFLICT (id) DO NOTHING`;
  });
  afterAll(async () => {
    for (const id of tripIds) await database.delete(trips).where(eq(trips.id, id));
    await client?.end();
  });

  // 5 days from 2026-12-01; refs on days 0..4.
  async function seed(startDate: string | null = '2026-12-01') {
    const [t] = await database.insert(trips).values({ ownerId: OWNER, title: `rmday-${Date.now()}`, startDate }).returning({ id: trips.id });
    tripIds.push(t.id);
    await database.insert(tripMemberships).values({ tripId: t.id, userId: VIEWER, role: 'viewer' });
    const ds = await database
      .insert(days)
      .values([0, 1, 2, 3, 4].map((idx) => ({ tripId: t.id, idx, label: 'x', num: idx + 1, date: 'x', title: `D${idx}` })))
      .returning({ id: days.id, idx: days.idx });
    const byIdx = Object.fromEntries(ds.map((d) => [d.idx, d.id])) as Record<number, string>;
    await database.insert(expenses).values([1, 2, 4].map((dayIdx) => ({ tripId: t.id, dayIdx, category: 'food', amount: 1, label: `e${dayIdx}` })));
    await database.insert(hotelBookings).values([{ tripId: t.id, name: 'h3', dayIdx: 3 }, { tripId: t.id, name: 'h2', dayIdx: 2 }]);
    await database.insert(transportBookings).values([
      { tripId: t.id, type: 'train', title: 'undated4', dayIdx: 4 },
      { tripId: t.id, type: 'flight', title: 'dated4', dayIdx: 4, fromDate: '2026-12-05' },
      { tripId: t.id, type: 'train', title: 'early0', dayIdx: 0 },
    ]);
    return { tripId: t.id, byIdx };
  }

  it('repacks days, re-derives dates and shifts / clears the references atomically', async () => {
    const s = await seed();
    const out = await removeDay(OWNER, s.byIdx[2], tx());
    expect(out).toEqual({ tripId: s.tripId, targetIdx: 1 });
    const left = await database.select({ idx: days.idx, title: days.title, iso: days.dateIso }).from(days).where(eq(days.tripId, s.tripId)).orderBy(asc(days.idx));
    expect(left.map((d) => [d.idx, d.title, d.iso])).toEqual([
      [0, 'D0', null],
      [1, 'D1', null],
      [2, 'D3', '2026-12-03'],
      [3, 'D4', '2026-12-04'],
    ]);
    const ex = await database.select({ l: expenses.label, d: expenses.dayIdx }).from(expenses).where(eq(expenses.tripId, s.tripId));
    expect(Object.fromEntries(ex.map((e) => [e.l, e.d]))).toEqual({ e1: 1, e2: null, e4: 3 });
    const ho = await database.select({ n: hotelBookings.name, d: hotelBookings.dayIdx }).from(hotelBookings).where(eq(hotelBookings.tripId, s.tripId));
    expect(Object.fromEntries(ho.map((h) => [h.n, h.d]))).toEqual({ h3: 2, h2: null });
    const tr = await database.select({ t: transportBookings.title, d: transportBookings.dayIdx }).from(transportBookings).where(eq(transportBookings.tripId, s.tripId));
    expect(Object.fromEntries(tr.map((r) => [r.t, r.d]))).toEqual({ undated4: 3, dated4: null, early0: 0 });
  });

  it('without a trip start date a dated ride is shifted like the rest', async () => {
    const s = await seed(null);
    await removeDay(OWNER, s.byIdx[1], tx());
    const tr = await database.select({ t: transportBookings.title, d: transportBookings.dayIdx }).from(transportBookings).where(eq(transportBookings.tripId, s.tripId));
    expect(Object.fromEntries(tr.map((r) => [r.t, r.d]))).toMatchObject({ dated4: 3, undated4: 3 });
  });

  it('a viewer cannot remove a day; nothing changes', async () => {
    const s = await seed();
    await expect(removeDay(VIEWER, s.byIdx[0], tx())).rejects.toBeDefined();
    const n = await database.select({ id: days.id }).from(days).where(eq(days.tripId, s.tripId));
    expect(n).toHaveLength(5);
  });
});
