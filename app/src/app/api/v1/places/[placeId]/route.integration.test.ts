// Integration test for PATCH /api/v1/places/:placeId `arrive` (TP-0141).
// Gated on TEST_DATABASE_URL. Drives `patchPlace` — the route's whole tx body
// after parsing — with the postgres-js client injected as `txDb`, mirroring
// days/[dayId]/places/route.integration.test.ts.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places, segments } from '@/db/schema';
import type { dbNode } from '@/db';
import { patchPlace } from '@/lib/services/place-service';
import { parsePlaceFields } from '@/lib/api/place-input';
import { readArrive } from '@/lib/api/arrive-input';

// writeAudit goes through the neon-http `db`; capture its calls instead.
const audit = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/audit', () => ({
  writeAudit: async (args: unknown) => {
    audit.calls.push(args);
  },
}));

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'patch-arrive-u1';

suite('PATCH /api/v1/places/:placeId arrive', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;
  let dayCounter = 0;

  const txDb = () => database as unknown as typeof dbNode;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('patch-arrive-u1','P','patch-arrive@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `patch-arrive-${Date.now()}` })
      .returning({ id: trips.id });
    tripId = t.id;
  });

  afterAll(async () => {
    if (tripId) await database.delete(trips).where(eq(trips.id, tripId));
    await client?.end();
  });

  beforeEach(() => {
    audit.calls.length = 0;
  });

  // Day with places a, b; segment idx 0 (a -> b) walk + note; start_* set.
  async function seedDay() {
    const [d] = await database
      .insert(days)
      .values({
        tripId,
        idx: dayCounter++,
        label: 'Mon',
        num: 1,
        date: 'Monday, Jan 1',
        title: 'Day',
        startMode: 'walk',
        startNote: 'Sa',
        startDurationMin: 5,
      })
      .returning({ id: days.id });
    const [a] = await database
      .insert(places)
      .values({ dayId: d.id, idx: 0, kind: 'sight', name: 'a' })
      .returning({ id: places.id });
    const [b] = await database
      .insert(places)
      .values({ dayId: d.id, idx: 1, kind: 'sight', name: 'b' })
      .returning({ id: places.id });
    await database
      .insert(segments)
      .values({ dayId: d.id, idx: 0, mode: 'walk', distance: '', time: '', note: 'ab', durationMin: 10 });
    return { dayId: d.id, a: a.id, b: b.id };
  }

  const segRow = async (dayId: string) =>
    (
      await database
        .select({ idx: segments.idx, mode: segments.mode, note: segments.note, durationMin: segments.durationMin })
        .from(segments)
        .where(eq(segments.dayId, dayId))
    )[0];

  const startRow = async (dayId: string) =>
    (
      await database
        .select({ m: days.startMode, n: days.startNote, du: days.startDurationMin })
        .from(days)
        .where(eq(days.id, dayId))
    )[0];

  // Same parsing the route runs on the JSON body.
  const patch = (placeId: string, body: Record<string, unknown>, db = txDb()) =>
    patchPlace(USER, placeId, parsePlaceFields(body), readArrive(body), db);

  it('arrive object writes the segment row and returns place.arrive', async () => {
    const s = await seedDay();
    const arrive = { mode: 'transit', durationMin: 40, note: 'Ferry' };
    const out = await patch(s.b, { name: 'b2', kind: 'sight', arrive });
    expect(out.place?.name).toBe('b2');
    expect(out.place?.arrive).toEqual(arrive);
    expect(await segRow(s.dayId)).toEqual({ idx: 0, mode: 'transit', note: 'Ferry', durationMin: 40 });
    expect(audit.calls).toContainEqual(expect.objectContaining({ entityId: s.b, after: { arrive } }));
  });

  it('arrive object on place 0 writes day.start_*', async () => {
    const s = await seedDay();
    const arrive = { mode: 'drive', durationMin: 25, note: 'Taxi' };
    const out = await patch(s.a, { name: 'a', kind: 'sight', arrive });
    expect(out.place?.arrive).toEqual(arrive);
    expect(await startRow(s.dayId)).toEqual({ m: 'drive', n: 'Taxi', du: 25 });
    expect((await segRow(s.dayId)).note).toBe('ab');
  });

  it('arrive: null clears note/duration and keeps the row and its mode', async () => {
    const s = await seedDay();
    const out = await patch(s.b, { name: 'b', kind: 'sight', arrive: null });
    expect(await segRow(s.dayId)).toEqual({ idx: 0, mode: 'walk', note: null, durationMin: null });
    expect(out.place?.arrive).toEqual({ mode: 'walk', durationMin: null, note: null });
    expect(audit.calls).toContainEqual(expect.objectContaining({ entityId: s.b, after: { arrive: null } }));
  });

  it('arrive: null on place 0 clears day.start_*', async () => {
    const s = await seedDay();
    await patch(s.a, { name: 'a', kind: 'sight', arrive: null });
    expect(await startRow(s.dayId)).toEqual({ m: null, n: null, du: null });
  });

  it('arrive absent leaves the leg untouched and writes no arrive audit', async () => {
    const s = await seedDay();
    const out = await patch(s.b, { name: 'b3', kind: 'sight' });
    expect(out.place?.name).toBe('b3');
    expect(await segRow(s.dayId)).toEqual({ idx: 0, mode: 'walk', note: 'ab', durationMin: 10 });
    expect(await startRow(s.dayId)).toEqual({ m: 'walk', n: 'Sa', du: 5 });
    expect(out.place?.arrive).toEqual({ mode: 'walk', durationMin: 10, note: 'ab' });
    expect(audit.calls.some((c) => (c as { after?: object }).after && 'arrive' in (c as { after: object }).after)).toBe(false);
  });

  it('a failing post-commit touchTrip does not fail the committed write', async () => {
    const s = await seedDay();
    // Only the post-commit touchTrip calls `update` on txDb itself (the tx
    // body uses `tx`), so this proxy fails exactly that statement.
    const failingTouch = new Proxy(txDb(), {
      get(target, prop, recv) {
        if (prop === 'update') {
          return () => {
            throw new Error('touchTrip down');
          };
        }
        return Reflect.get(target, prop, recv);
      },
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const arrive = { mode: 'transit', durationMin: 15, note: 'Bus' };
      const out = await patch(s.b, { name: 'b4', kind: 'sight', arrive }, failingTouch);
      expect(out.place?.arrive).toEqual(arrive);
      expect(await segRow(s.dayId)).toMatchObject({ note: 'Bus' });
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });
});
