// Integration test for POST /api/v1/days/:dayId/places atomic idempotency.
// Gated on TEST_DATABASE_URL. Drives withIdempotencyAtomic with an injected
// client and a run(tx) mirroring the route body (real threaded addPlace +
// coupled segment write + inline read-back on the tx).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places } from '@/db/schema';
import { addPlace } from '@/lib/services/place-service';
import { parsePlaceFields } from '@/lib/api/place-input';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { apiPlaceView } from '@/lib/places/google-sync';

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
});
