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
            { kind: 'food', name: 'A', lat: 35, lng: 135, status: 'tbd', sourceUrl: 'https://src.test/a' },
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
      sql`SELECT name, idx, status, source_url FROM place WHERE day_id = ${dayRows[0].id} ORDER BY idx`,
    )) as unknown as { name: string; idx: number; status: string; source_url: string | null }[];
    expect(placeRows.map((p) => p.name)).toEqual(['A', 'B']);
    // TP-0042/TP-0043: status + sourceUrl persist from the parsed place; default
    // status is 'confirmed' and sourceUrl null when the place omits them.
    expect(placeRows[0]).toMatchObject({ status: 'tbd', source_url: 'https://src.test/a' });
    expect(placeRows[1]).toMatchObject({ status: 'confirmed', source_url: null });

    const hotelRows = (await db.execute(
      sql`SELECT name FROM hotel_booking WHERE trip_id = ${id}`,
    )) as unknown as { name: string }[];
    expect(hotelRows[0].name).toBe('Granvia');
  });

  it('persists transport, expenses, notes and budget in the same tx (TP-0040)', async () => {
    const plan = parseImportPlan({
      trip: {
        title: 'FullPayload',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        sourceUrl: 'https://example.com/plan',
      },
      days: [
        { date: '2026-11-01', places: [{ kind: 'food', name: 'A', lat: 35, lng: 135 }] },
        { date: '2026-11-02', places: [] },
      ],
      hotels: [{ name: 'Granvia', checkInDate: '2026-11-01' }],
      transport: [{ type: 'flight', title: 'NRT→CDG', dayIdx: 0, costCurrency: 'usd' }],
      expenses: [{ category: 'food', amount: 42.5, dayIdx: 1, currency: 'jpy' }],
      notes: [
        { kind: 'doc', title: 'Visas', body: 'ESTA done' },
        { kind: 'checklist', title: 'Packing' },
      ],
      budget: { amount: 5000, basis: 'per_person', caps: { hotels: 1200 }, currency: 'eur' },
    });
    const { id } = await importPlan('imp-u1', plan, db);

    // date_iso populated (not null) for imported days — explicit day.date, else
    // startDate + idx (TP-0037 regression guard).
    const dayIsoRows = (await db.execute(
      sql`SELECT date_iso FROM day WHERE trip_id = ${id} ORDER BY idx`,
    )) as unknown as { date_iso: string | null }[];
    expect(dayIsoRows.map((d) => d.date_iso)).toEqual(['2026-11-01', '2026-11-02']);

    const transportRows = (await db.execute(
      sql`SELECT title, type, day_idx, cost_currency FROM transport_booking WHERE trip_id = ${id}`,
    )) as unknown as { title: string; type: string; day_idx: number; cost_currency: string }[];
    expect(transportRows).toHaveLength(1);
    expect(transportRows[0]).toMatchObject({ title: 'NRT→CDG', type: 'flight', day_idx: 0, cost_currency: 'USD' });

    const expenseRows = (await db.execute(
      sql`SELECT category, amount, day_idx, currency FROM expense WHERE trip_id = ${id}`,
    )) as unknown as { category: string; amount: number; day_idx: number; currency: string }[];
    expect(expenseRows).toHaveLength(1);
    expect(expenseRows[0]).toMatchObject({ category: 'food', amount: 42.5, day_idx: 1, currency: 'JPY' });

    const noteRows = (await db.execute(
      sql`SELECT title, kind, idx FROM note WHERE trip_id = ${id} ORDER BY idx`,
    )) as unknown as { title: string; kind: string; idx: number }[];
    expect(noteRows.map((n) => [n.title, n.idx])).toEqual([['Visas', 0], ['Packing', 1]]);

    const tripRows = (await db.execute(
      sql`SELECT budget_config, currency, source_url FROM trip WHERE id = ${id}`,
    )) as unknown as { budget_config: unknown; currency: string; source_url: string }[];
    expect(tripRows[0].budget_config).toEqual({ amount: 5000, basis: 'per_person', caps: { hotels: 1200 } });
    expect(tripRows[0].currency).toBe('EUR');
    expect(tripRows[0].source_url).toBe('https://example.com/plan');
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
