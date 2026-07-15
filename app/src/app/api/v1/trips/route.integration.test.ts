// Integration test for POST /api/v1/trips atomic idempotency. Gated on
// TEST_DATABASE_URL. Route handlers use module @/db (never connects under
// vitest), so this drives withIdempotencyAtomic with an injected client and a
// run(tx) that mirrors the route body: the real threaded createTrip + inline
// read-back on the tx. Dates are set so seedTripDays runs inside the same tx.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days } from '@/db/schema';
import { createTrip } from '@/lib/services/trip-service';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'trips-u1';

function reqWithKey(key: string): Request {
  const headers = new Headers();
  headers.set('idempotency-key', key);
  return new Request('http://t.local/api/v1/trips', { method: 'POST', headers });
}

suite('POST /api/v1/trips (atomic idempotency)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('trips-u1','T','trips@t.local') ON CONFLICT (id) DO NOTHING`;
  });

  afterAll(async () => {
    await client?.end();
  });

  const deps = () => ({
    idemDb: database as unknown as IdemExecutor,
    txDb: database as unknown as typeof import('@/db').dbNode,
  });

  // Mirrors the route's POST run body exactly.
  const runFor = (title: string) => async (tx: IdemExecutor) => {
    const { id } = await createTrip(
      USER,
      { title, startDate: '2026-11-01', endDate: '2026-11-03' },
      tx,
    );
    const [trip] = await (tx as unknown as typeof database)
      .select()
      .from(trips)
      .where(eq(trips.id, id))
      .limit(1);
    return { status: 201, body: { trip } };
  };

  it('creates one trip (+ seeded days) and replays the retry without duplicating', async () => {
    const title = `Kyoto-${Date.now()}`;
    const key = `trips-${Date.now()}`;
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key), { title }, runFor(title), deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    expect(b1.trip.title).toBe(title);

    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key), { title }, runFor(title), deps());
    const b2 = await r2.json();
    expect(b2).toEqual(b1); // replay

    const tripRows = await database.select().from(trips).where(eq(trips.title, title));
    expect(tripRows).toHaveLength(1); // no duplicate
    // seedTripDays ran inside the tx: a 3-day range -> 3 day rows.
    const dayRows = await database.select().from(days).where(eq(days.tripId, tripRows[0].id));
    expect(dayRows).toHaveLength(3);
  });
});
