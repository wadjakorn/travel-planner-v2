// Integration tests for withIdempotencyAtomic. Gated on TEST_DATABASE_URL.
// A postgres-js client is injected for BOTH the idempotency ops and the tx
// (same DB, one driver in the test), mirroring import-orchestrator's test.
// The stub `run` creates a trip row via the injected executor so rollback and
// duplicate-prevention are directly observable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { apiIdempotencyKeys, trips } from '@/db/schema';
import type { IdemExecutor } from './idempotency';
import { CLAIM_TTL_MS } from './idempotency';

// Mirrors the private fingerprint() in idempotency.ts (method + pathname + body
// hash) so a directly-inserted claim row matches a given Request — required to
// reach the takeover branch (a mismatched fingerprint 409s first).
function fingerprintFor(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method}\n${path}\n${JSON.stringify(body ?? {})}`)
    .digest('hex');
}

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'atomic-u1';

function reqWithKey(key: string): Request {
  const headers = new Headers();
  headers.set('idempotency-key', key);
  return new Request('http://t.local/api/v1/trips', { method: 'POST', headers });
}

suite('withIdempotencyAtomic (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let mod: typeof import('./idempotency-atomic');

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('atomic-u1','A','atomic@t.local') ON CONFLICT (id) DO NOTHING`;
    mod = await import('./idempotency-atomic');
  });

  afterAll(async () => {
    await client?.end();
  });

  const deps = () => ({
    idemDb: database as unknown as IdemExecutor,
    txDb: database as unknown as typeof import('@/db').dbNode,
  });

  // A stub mutation that creates one trip row on the given executor and returns
  // its id as the body (the shape a real create service + read-back produces).
  const makeRun =
    (title: string) =>
    async (tx: IdemExecutor) => {
      const [row] = await (tx as unknown as typeof database)
        .insert(trips)
        .values({ ownerId: USER, title })
        .returning({ id: trips.id });
      return { status: 201, body: { id: row.id } };
    };

  const countByTitle = async (title: string) =>
    (await database.select().from(trips).where(eq(trips.title, title))).length;

  it('happy path: creates one row, replay returns the stored body', async () => {
    const title = `happy-${Date.now()}`;
    const key = `atomic-happy-${Date.now()}`;
    const r1 = await mod.withIdempotencyAtomic(USER, reqWithKey(key), {}, makeRun(title), deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    const r2 = await mod.withIdempotencyAtomic(USER, reqWithKey(key), {}, makeRun(title), deps());
    const b2 = await r2.json();
    expect(b2).toEqual(b1); // replay, same body
    expect(await countByTitle(title)).toBe(1); // no duplicate
  });

  it('mid-flight takeover rolls the superseded owner back (no row)', async () => {
    const title = `rolled-${Date.now()}`;
    const key = `atomic-takeover-${Date.now()}`;
    // run inserts the trip via the tx, then evicts the pending claim on the
    // OUTER connection so the in-tx persistCompletion sees 0 rows -> rollback.
    const run = async (tx: IdemExecutor) => {
      const [row] = await (tx as unknown as typeof database)
        .insert(trips)
        .values({ ownerId: USER, title })
        .returning({ id: trips.id });
      await database
        .delete(apiIdempotencyKeys)
        .where(and(eq(apiIdempotencyKeys.userId, USER), eq(apiIdempotencyKeys.key, key)));
      return { status: 201, body: { id: row.id } };
    };
    await expect(
      mod.withIdempotencyAtomic(USER, reqWithKey(key), {}, run, deps()),
    ).rejects.toBeTruthy();
    expect(await countByTitle(title)).toBe(0); // mutation rolled back with the completion
  });

  it('stale pending claim is taken over on retry (self-heal)', async () => {
    const title = `healed-${Date.now()}`;
    const key = `atomic-stale-${Date.now()}`;
    // Insert an abandoned pending claim older than CLAIM_TTL_MS.
    await database.insert(apiIdempotencyKeys).values({
      userId: USER,
      key,
      fingerprint: fingerprintFor('POST', '/api/v1/trips', {}),
      statusCode: 0,
      responseJson: {},
      createdAt: new Date(Date.now() - CLAIM_TTL_MS - 5000),
    });
    const res = await mod.withIdempotencyAtomic(USER, reqWithKey(key), {}, makeRun(title), deps());
    expect(res.status).toBe(201);
    expect(await countByTitle(title)).toBe(1);
  });

  it('bad input (run throws) releases the claim and rethrows', async () => {
    const key = `atomic-bad-${Date.now()}`;
    const run = async () => {
      throw new Error('boom');
    };
    await expect(
      mod.withIdempotencyAtomic(USER, reqWithKey(key), {}, run, deps()),
    ).rejects.toThrow('boom');
    const claim = await database
      .select()
      .from(apiIdempotencyKeys)
      .where(and(eq(apiIdempotencyKeys.userId, USER), eq(apiIdempotencyKeys.key, key)));
    expect(claim).toHaveLength(0); // released -> key reusable
  });
});
