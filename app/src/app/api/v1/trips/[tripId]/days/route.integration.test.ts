// Integration test for POST /api/v1/trips/:tripId/days atomic idempotency.
// Gated on TEST_DATABASE_URL. Drives withIdempotencyAtomic with an injected
// client and a run(tx) mirroring the route body (real threaded addDay + inline
// read-back on the tx).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days } from '@/db/schema';
import { addDay } from '@/lib/services/day-service';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'days-u1';

function reqWithKey(key: string, tripId: string): Request {
  const headers = new Headers();
  headers.set('idempotency-key', key);
  return new Request(`http://t.local/api/v1/trips/${tripId}/days`, { method: 'POST', headers });
}

suite('POST /api/v1/trips/:tripId/days (atomic idempotency)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('days-u1','D','days@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `days-trip-${Date.now()}` })
      .returning({ id: trips.id });
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
    const { id } = await addDay(USER, tripId, tx);
    const [day] = await (tx as unknown as typeof database)
      .select()
      .from(days)
      .where(eq(days.id, id))
      .limit(1);
    return { status: 201, body: { day } };
  };

  it('creates one day and replays the retry without duplicating', async () => {
    const key = `days-${Date.now()}`;
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), {}, run, deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), {}, run, deps());
    const b2 = await r2.json();
    expect(b2).toEqual(b1); // replay
    const rows = await database.select().from(days).where(eq(days.tripId, tripId));
    expect(rows).toHaveLength(1); // no duplicate
  });
});
