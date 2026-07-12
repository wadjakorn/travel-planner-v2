// Integration test for the transactional plan importer against a live Postgres.
// Skipped unless TEST_DATABASE_URL points at a migrated database (same pattern
// as rate-limit.integration.test.ts):
//
//   TEST_DATABASE_URL=postgres://postgres:pw@localhost:5432/tp pnpm test
//
// Verifies the happy path (trip + ordered days + ordered places + hotels) and
// that a mid-plan failure rolls the whole thing back (no orphan trip).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { parseImportPlan } from '@/lib/api/import-input';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

suite('importPlan (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let importPlan: typeof import('./import-service').importPlan;

  beforeAll(async () => {
    client = postgres(URL as string, { prepare: false });
    db = drizzle(client, { schema });
    await db.execute(
      sql`INSERT INTO "user"(id,name,email) VALUES ('imp-u1','I','i@t.local') ON CONFLICT (id) DO NOTHING`,
    );
    ({ importPlan } = await import('./import-service'));
  });

  afterAll(async () => {
    await client?.end();
  });

  it('creates trip + ordered days + ordered places + hotels', async () => {
    const plan = parseImportPlan({
      trip: { title: 'Kyoto', startDate: '2026-11-01', endDate: '2026-11-02' },
      days: [
        {
          date: '2026-11-01',
          places: [
            { kind: 'food', name: 'A', lat: 35, lng: 135 },
            { kind: 'sight', name: 'B', lat: 35, lng: 135 },
          ],
        },
        { date: '2026-11-02', places: [{ kind: 'food', name: 'C' }] },
      ],
      hotels: [{ name: 'Granvia', checkInDate: '2026-11-01' }],
    });
    const { id } = await importPlan('imp-u1', plan, db);

    const dayRows = (await db.execute(
      sql`SELECT id, idx FROM day WHERE trip_id = ${id} ORDER BY idx`,
    )) as unknown as { id: string; idx: number }[];
    expect(dayRows.map((d) => d.idx)).toEqual([0, 1]);

    const placeRows = (await db.execute(
      sql`SELECT name, idx FROM place WHERE day_id = ${dayRows[0].id} ORDER BY idx`,
    )) as unknown as { name: string; idx: number }[];
    expect(placeRows.map((p) => p.name)).toEqual(['A', 'B']);

    const hotelRows = (await db.execute(
      sql`SELECT name FROM hotel_booking WHERE trip_id = ${id}`,
    )) as unknown as { name: string }[];
    expect(hotelRows[0].name).toBe('Granvia');
  });

  it('rolls back completely on a mid-plan failure', async () => {
    // A place with a NULL name bypasses the parser (constructed directly) to
    // force a DB NOT-NULL violation inside the transaction.
    const badPlan = {
      trip: {
        title: 'RollbackTrip',
        startDate: null,
        endDate: null,
        cover: null,
        subtitle: null,
      },
      days: [{ date: null, places: [{ kind: 'food', name: null } as never] }],
      hotels: [],
    };
    await expect(importPlan('imp-u1', badPlan, db)).rejects.toThrow();

    const tripRows = (await db.execute(
      sql`SELECT id FROM trip WHERE title = 'RollbackTrip'`,
    )) as unknown as { id: string }[];
    expect(tripRows.length).toBe(0);
  });

  it('runs recordCompletion inside the tx (its write persists with the trip)', async () => {
    const plan = parseImportPlan({ trip: { title: 'Hooked' }, days: [], hotels: [] });
    let seenTripId = '';
    const { id } = await importPlan('imp-u1', plan, db, async (tx, tripId) => {
      seenTripId = tripId;
      // A side write on the same tx: mark a sentinel row keyed by tripId.
      await tx.execute(
        sql`INSERT INTO api_idempotency_key(id,user_id,key,fingerprint,status_code,response_json)
            VALUES (${crypto.randomUUID()},'imp-u1',${'hook-' + tripId},'fp',201, ${JSON.stringify({ __idem: true, tripId })}::jsonb)`,
      );
    });
    expect(seenTripId).toBe(id);
    const rows = (await db.execute(
      sql`SELECT status_code FROM api_idempotency_key WHERE key = ${'hook-' + id}`,
    )) as unknown as { status_code: number }[];
    expect(rows[0]?.status_code).toBe(201); // committed alongside the trip
  });

  it('rolls back the trip if recordCompletion throws', async () => {
    const plan = parseImportPlan({ trip: { title: 'Doomed' }, days: [], hotels: [] });
    await expect(
      importPlan('imp-u1', plan, db, async () => { throw new Error('hook boom'); }),
    ).rejects.toThrow('hook boom');
    const rows = (await db.execute(
      sql`SELECT id FROM trip WHERE title = 'Doomed' AND owner_id = 'imp-u1'`,
    )) as unknown as { id: string }[];
    expect(rows.length).toBe(0); // no orphan trip
  });
});
