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
});
