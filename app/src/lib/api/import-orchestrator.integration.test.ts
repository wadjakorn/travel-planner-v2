// Integration tests for the atomic import flow. Gated on TEST_DATABASE_URL.
// A postgres-js client is injected for BOTH the idempotency ops and importPlan's
// transaction (same DB, one driver in the test).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

function importReq(key: string | null): Request {
  const headers = new Headers();
  if (key) headers.set('idempotency-key', key);
  return new Request('http://t.local/api/v1/trips/import', { method: 'POST', headers });
}

const BODY = { trip: { title: 'IdemTrip', startDate: '2026-11-01', endDate: '2026-11-01' }, days: [], hotels: [] };

suite('importTripIdempotent (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let mod: typeof import('./import-orchestrator');
  type Db = ReturnType<typeof drizzle<typeof schema>>;
  let database: Db;
  // Only used via `typeof` below (to type testLoad's cast) — the eslint rule
  // doesn't recognize that as a use of the runtime binding.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let realLoadApiTrip: typeof import('@/lib/trip-queries').loadApiTrip;

  const countTrips = async () =>
    ((await database.execute(
      sql`SELECT count(*)::int AS c FROM trip WHERE title = 'IdemTrip' AND owner_id = 'orch-u1'`,
    )) as unknown as { c: number }[])[0].c;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('orch-u1','O','orch@t.local') ON CONFLICT (id) DO NOTHING`;
    mod = await import('./import-orchestrator');
    ({ loadApiTrip: realLoadApiTrip } = await import('@/lib/trip-queries'));
  });

  afterAll(async () => {
    await client?.end();
  });

  // A loadApiTrip that reads via the injected test client (the real one uses
  // neon-http `db`, which can't reach a plain Postgres). Reads the created trip
  // straight from the tables — enough for these tests.
  const testLoad = (async (tripId: string) => {
    const rows = (await database.execute(
      sql`SELECT id, title FROM trip WHERE id = ${tripId}`,
    )) as unknown as { id: string; title: string }[];
    return rows[0] ? { ...rows[0], hotels: [] } : null;
  }) as unknown as typeof realLoadApiTrip;

  const deps = (load = testLoad) => ({ loadApiTrip: load, idemDb: database as unknown as import('./idempotency').IdemExecutor, txDb: database as unknown as typeof import('@/db').dbNode });

  it('happy path: creates the trip once and replays the retry (no duplicate)', async () => {
    const key = `orch-happy-${Date.now()}`;
    const before = await countTrips();
    const r1 = await mod.importTripIdempotent('orch-u1', importReq(key), BODY, deps());
    const r2 = await mod.importTripIdempotent('orch-u1', importReq(key), BODY, deps());
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(await countTrips()).toBe(before + 1); // retry did NOT create a second
  });

  it('read-back throws after commit, retry does NOT duplicate (the reported bug)', async () => {
    const key = `orch-bug-${Date.now()}`;
    const before = await countTrips();
    const throwing = (async () => { throw new Error('read-back down'); }) as unknown as typeof realLoadApiTrip;
    await expect(
      mod.importTripIdempotent('orch-u1', importReq(key), BODY, deps(throwing)),
    ).rejects.toThrow('read-back down');
    // The trip committed (marker committed atomically). Retry replays from marker.
    const r = await mod.importTripIdempotent('orch-u1', importReq(key), BODY, deps());
    expect(r.status).toBe(201);
    expect(await countTrips()).toBe(before + 1); // exactly one trip, not two
  });

  it('caches the full body on success (replay needs no read-back)', async () => {
    const key = `orch-cache-${Date.now()}`;
    await mod.importTripIdempotent('orch-u1', importReq(key), BODY, deps());
    const rows = (await database.execute(
      sql`SELECT response_json FROM api_idempotency_key WHERE user_id = 'orch-u1' AND key = ${key}`,
    )) as unknown as { response_json: { trip?: unknown; __idem?: boolean } }[];
    expect(rows[0].response_json.__idem).toBeUndefined(); // upgraded past the marker
    expect(rows[0].response_json.trip).toBeDefined();
  });

  it('no-key path: creates the trip and writes no idempotency row', async () => {
    const countIdemRows = async () =>
      ((await database.execute(
        sql`SELECT count(*)::int AS c FROM api_idempotency_key WHERE user_id = 'orch-u1'`,
      )) as unknown as { c: number }[])[0].c;

    const tripsBefore = await countTrips();
    const idemBefore = await countIdemRows();
    const r = await mod.importTripIdempotent('orch-u1', importReq(null), BODY, deps());
    expect(r.status).toBe(201);
    expect(await countTrips()).toBe(tripsBefore + 1);
    expect(await countIdemRows()).toBe(idemBefore); // no key => no idempotency row written
  });

  it('slow import whose claim is taken over mid-tx rolls back — no duplicate trip', async () => {
    const key = `orch-takeover-${Date.now()}`;
    const before = await countTrips();
    // Simulate a concurrent TTL takeover: delete this caller's claim row right
    // before importPlan's transaction runs. The in-tx marker write is scoped to
    // that claim id, finds 0 rows, and must roll the whole import back.
    const takeoverTx = {
      transaction: async (cb: Parameters<Db['transaction']>[0]) => {
        await database.execute(
          sql`DELETE FROM api_idempotency_key WHERE user_id = 'orch-u1' AND key = ${key}`,
        );
        return database.transaction(cb);
      },
    } as unknown as typeof import('@/db').dbNode;
    await expect(
      mod.importTripIdempotent('orch-u1', importReq(key), BODY, { ...deps(), txDb: takeoverTx }),
    ).rejects.toThrow(/taken over/);
    expect(await countTrips()).toBe(before); // rolled back — no trip created
  });
});
