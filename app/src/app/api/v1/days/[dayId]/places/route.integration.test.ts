// Integration test for POST /api/v1/days/:dayId/places atomic idempotency.
// Gated on TEST_DATABASE_URL. Drives withIdempotencyAtomic with an injected
// client and a run(tx) mirroring the route body (real threaded addPlace +
// coupled segment write + inline read-back on the tx).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places, segments } from '@/db/schema';
import { addPlace } from '@/lib/services/place-service';
import { parsePlaceFields } from '@/lib/api/place-input';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { apiPlaceView } from '@/lib/places/google-sync';
import { readArriveView } from '@/lib/services/leg-service';
import type { ArriveInput } from '@/lib/legs';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'places-u1';

function reqWithKey(key: string, dayId: string): Request {
  const headers = new Headers();
  headers.set('idempotency-key', key);
  return new Request(`http://t.local/api/v1/days/${dayId}/places`, { method: 'POST', headers });
}

suite('POST /api/v1/days/:dayId/places (atomic idempotency)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let dayId: string;
  let tripId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('places-u1','P','places@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `places-trip-${Date.now()}` })
      .returning({ id: trips.id });
    const [d] = await database
      .insert(days)
      .values({ tripId: t.id, idx: 0, label: 'Mon', num: 1, date: 'Monday, Jan 1', title: 'Day 1' })
      .returning({ id: days.id });
    dayId = d.id;
    tripId = t.id;
  });

  afterAll(async () => {
    await client?.end();
  });

  const deps = () => ({
    idemDb: database as unknown as IdemExecutor,
    txDb: database as unknown as typeof import('@/db').dbNode,
  });

  const run = async (tx: IdemExecutor) => {
    const fields = parsePlaceFields({ name: 'Museum', kind: 'sight' });
    const { id } = await addPlace(USER, dayId, fields, tx);
    const [place] = await (tx as unknown as typeof database)
      .select()
      .from(places)
      .where(eq(places.id, id))
      .limit(1);
    // Mirrors the route: stripped inside the callback, so the stored
    // idempotency body (replayed verbatim) is stripped too.
    return { status: 201, body: { place: apiPlaceView(place, new Date()) } };
  };

  it('creates one place and replays the retry without duplicating', async () => {
    const key = `places-${Date.now()}`;
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, dayId), { name: 'Museum' }, run, deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, dayId), { name: 'Museum' }, run, deps());
    const b2 = await r2.json();
    expect(b2).toEqual(b1); // replay
    const rows = await database.select().from(places).where(eq(places.dayId, dayId));
    expect(rows).toHaveLength(1); // no duplicate
  });

  it('returns the API place view, also on an idempotent replay', async () => {
    const key = `places-view-${Date.now()}`;
    const hidden = ['googleSnapshot', 'ratingSyncedAt', 'hoursSyncedAt', 'googleSyncedAt'];
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, dayId), { name: 'Museum' }, run, deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    expect(b1.place).toHaveProperty('googleStatus');
    for (const k of hidden) expect(b1.place).not.toHaveProperty(k);
    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, dayId), { name: 'Museum' }, run, deps());
    const b2 = await r2.json();
    expect(b2.place).toEqual(b1.place);
    for (const k of hidden) expect(b2.place).not.toHaveProperty(k);
  });

  async function newDay(idx: number) {
    const [d] = await database
      .insert(days)
      .values({ tripId, idx, label: 'Tue', num: idx + 1, date: 'Tuesday, Jan 2', title: `Day ${idx + 1}` })
      .returning({ id: days.id });
    return d.id;
  }

  // Mirrors the route body with `arrive`: addPlace writes the leg inside the
  // tx and the arrive view is read back on the tx, so the stored body replays.
  const runArrive = (onDay: string, name: string, arrive: ArriveInput) => async (tx: IdemExecutor) => {
    const fields = parsePlaceFields({ name, kind: 'sight' });
    const { id } = await addPlace(USER, onDay, fields, tx, { arrive });
    const [place] = await (tx as unknown as typeof database)
      .select()
      .from(places)
      .where(eq(places.id, id))
      .limit(1);
    return {
      status: 201,
      body: { place: { ...apiPlaceView(place, new Date()), arrive: await readArriveView(tx, id) }, warnings: [] },
    };
  };

  it('POST with arrive writes the leg in the same tx and replays verbatim', async () => {
    const d = await newDay(10);
    const k0 = `arrive-a-${Date.now()}`;
    await withIdempotencyAtomic(USER, reqWithKey(k0, d), { name: 'A' }, runArrive(d, 'A', { mode: 'walk', durationMin: null, note: null }), deps());
    const key = `arrive-b-${Date.now()}`;
    const arrive: ArriveInput = { mode: 'transit', durationMin: 150, note: 'Ferry' };
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, d), { name: 'B', arrive }, runArrive(d, 'B', arrive), deps());
    expect(r1.status).toBe(201);
    const b1 = await r1.json();
    expect(b1.place.arrive).toEqual(arrive);
    const segs = await database.select().from(segments).where(eq(segments.dayId, d));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ idx: 0, mode: 'transit', durationMin: 150, note: 'Ferry' });
    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, d), { name: 'B', arrive }, runArrive(d, 'B', arrive), deps());
    expect(await r2.json()).toEqual(b1);
    expect(await database.select().from(segments).where(eq(segments.dayId, d))).toHaveLength(1);
    expect(await database.select().from(places).where(eq(places.dayId, d))).toHaveLength(2);
  });

  it('POST first place with arrive writes day.start_*', async () => {
    const d = await newDay(11);
    const arrive: ArriveInput = { mode: 'transit', durationMin: 30, note: 'Airport bus' };
    const r = await withIdempotencyAtomic(USER, reqWithKey(`arrive-first-${Date.now()}`, d), { name: 'A', arrive }, runArrive(d, 'A', arrive), deps());
    expect(r.status).toBe(201);
    expect((await r.json()).place.arrive).toEqual(arrive);
    const [row] = await database
      .select({ m: days.startMode, n: days.startNote, du: days.startDurationMin })
      .from(days)
      .where(eq(days.id, d));
    expect(row).toEqual({ m: 'transit', n: 'Airport bus', du: 30 });
    expect(await database.select().from(segments).where(eq(segments.dayId, d))).toHaveLength(0);
  });

  it('addPlace with arrive refuses the non-transactional neon-http db', async () => {
    const { db } = await import('@/db');
    const fields = parsePlaceFields({ name: 'X', kind: 'sight' });
    await expect(
      addPlace(USER, dayId, fields, db, { arrive: { mode: 'walk', durationMin: null, note: null } }),
    ).rejects.toMatchObject({ code: 'internal' });
  });
});
