// Integration tests for the idempotency plumbing against a live Postgres.
// Skipped unless TEST_DATABASE_URL is set (same pattern as
// rate-limit.integration.test.ts). Injects a postgres-js client as the `exec`
// param because the runtime neon-http client can't talk to a plain Postgres.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createHash } from 'crypto';
import * as schema from '@/db/schema';

// Mirrors the private fingerprint() in idempotency.ts (method + path + body
// hash) so a directly-inserted row can be made to match a given Request.
function fingerprintFor(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method}\n${path}\n${JSON.stringify(body ?? {})}`)
    .digest('hex');
}

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

function reqWith(key: string | null, path = '/api/v1/trips/import'): Request {
  const headers = new Headers();
  if (key) headers.set('idempotency-key', key);
  return new Request(`http://t.local${path}`, { method: 'POST', headers });
}

suite('withIdempotency (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let mod: typeof import('./idempotency');
  type Exec = NonNullable<Parameters<typeof mod.withIdempotency>[4]>;
  let exec: Exec;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    exec = drizzle(client, { schema }) as unknown as Exec;
    await client`INSERT INTO "user"(id,name,email) VALUES ('idem-u1','I','idem@t.local') ON CONFLICT (id) DO NOTHING`;
    mod = await import('./idempotency');
  });

  afterAll(async () => {
    await client?.end();
  });

  it('claims, runs the mutation once, and replays the cached response', async () => {
    const key = `k-happy-${Date.now()}`;
    let calls = 0;
    const produce = async () => {
      calls++;
      return { status: 201, body: { hello: 'world', n: calls } };
    };
    const r1 = await mod.withIdempotency('idem-u1', reqWith(key), {}, produce, exec);
    const r2 = await mod.withIdempotency('idem-u1', reqWith(key), {}, produce, exec);
    expect(r1.status).toBe(201);
    expect(await r1.json()).toEqual({ hello: 'world', n: 1 });
    expect(await r2.json()).toEqual({ hello: 'world', n: 1 }); // replay, not re-run
    expect(calls).toBe(1);
  });

  it('rejects the same key with a different body (fingerprint reuse)', async () => {
    const key = `k-fp-${Date.now()}`;
    await mod.withIdempotency('idem-u1', reqWith(key), { a: 1 }, async () => ({ status: 201, body: {} }), exec);
    const r = await mod.withIdempotency('idem-u1', reqWith(key), { a: 2 }, async () => ({ status: 201, body: {} }), exec);
    expect(r.status).toBe(409);
  });

  it('releases the claim on a thrown mutation so a retry can run again', async () => {
    const key = `k-throw-${Date.now()}`;
    await expect(
      mod.withIdempotency('idem-u1', reqWith(key), {}, async () => { throw new Error('boom'); }, exec),
    ).rejects.toThrow('boom');
    let ran = false;
    const r = await mod.withIdempotency('idem-u1', reqWith(key), {}, async () => { ran = true; return { status: 201, body: { ok: true } }; }, exec);
    expect(ran).toBe(true);
    expect(r.status).toBe(201);
  });

  it('releases the claim on a non-2xx result (no completion cached)', async () => {
    const key = `k-4xx-${Date.now()}`;
    const r1 = await mod.withIdempotency('idem-u1', reqWith(key), {}, async () => ({ status: 400, body: { error: 'bad' } }), exec);
    expect(r1.status).toBe(400);
    // retry re-runs because the claim was released
    let ran = false;
    await mod.withIdempotency('idem-u1', reqWith(key), {}, async () => { ran = true; return { status: 201, body: {} }; }, exec);
    expect(ran).toBe(true);
  });

  it('takes over a pending claim older than the TTL', async () => {
    const key = `k-ttl-${Date.now()}`;
    // Insert a stale pending row directly (created_at well past the TTL).
    // Fingerprint must match the real request below so this test exercises
    // the staleness/takeover branch rather than the fingerprint-mismatch 409
    // (fingerprint is checked first in claimKey).
    const fp = fingerprintFor('POST', '/api/v1/trips/import', {});
    await client`INSERT INTO api_idempotency_key(id,user_id,key,fingerprint,status_code,response_json,created_at)
      VALUES (${crypto.randomUUID()},'idem-u1',${key},${fp},0,'{}'::jsonb, now() - interval '10 minutes')`;
    let ran = false;
    const r = await mod.withIdempotency('idem-u1', reqWith(key), {}, async () => { ran = true; return { status: 201, body: { took: 'over' } }; }, exec);
    expect(ran).toBe(true);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ took: 'over' });
  });

  it('does NOT take over a fresh pending claim (409 in progress)', async () => {
    const key = `k-fresh-${Date.now()}`;
    await client`INSERT INTO api_idempotency_key(id,user_id,key,fingerprint,status_code,response_json,created_at)
      VALUES (${crypto.randomUUID()},'idem-u1',${key},${'fp'},0,'{}'::jsonb, now())`;
    // Same request fingerprint so it isn't a reuse-409; must be the in-progress 409.
    const r = await mod.withIdempotency('idem-u1', reqWith(key), {}, async () => ({ status: 201, body: {} }), exec);
    expect(r.status).toBe(409);
  });

  it('releaseClaim is scoped to the row id — it will not evict a newer claim for the same key', async () => {
    // Reproduces the concurrent-takeover race deterministically: an interrupted
    // caller observed a stale row; a concurrent retry then took over (deleted it,
    // inserted a fresh claim). The interrupted caller's late releaseClaim, scoped
    // to the row IT observed, must NOT delete that fresh claim. With an unscoped
    // (userId,key)-only delete it would — letting two callers both own the key.
    const key = `k-scope-${Date.now()}`;
    const staleId = crypto.randomUUID();
    await client`INSERT INTO api_idempotency_key(id,user_id,key,fingerprint,status_code,response_json,created_at)
      VALUES (${staleId},'idem-u1',${key},'fp',0,'{}'::jsonb, now() - interval '10 minutes')`;
    // takeover: the stale row is gone and a fresh claim now holds the key
    await client`DELETE FROM api_idempotency_key WHERE id = ${staleId}`;
    const freshId = crypto.randomUUID();
    await client`INSERT INTO api_idempotency_key(id,user_id,key,fingerprint,status_code,response_json,created_at)
      VALUES (${freshId},'idem-u1',${key},'fp',0,'{}'::jsonb, now())`;
    await mod.releaseClaim('idem-u1', key, staleId, exec);
    const rows = (await client`SELECT id FROM api_idempotency_key WHERE user_id='idem-u1' AND key=${key}`) as unknown as { id: string }[];
    expect(rows.length).toBe(1); // the fresh claim survives
    expect(rows[0].id).toBe(freshId);
  });

  it('concurrent retries racing on the same stale claim yield exactly one owner', async () => {
    // The end-to-end guarantee: N retries hit an expired pending claim at once;
    // exactly one may take over and run the mutation, the rest see the fresh
    // in-progress claim and 409. onConflictDoNothing (single insert wins) plus
    // the id-scoped takeover delete make this hold for any interleaving.
    const key = `k-conc-${Date.now()}`;
    const fp = fingerprintFor('POST', '/api/v1/trips/import', {});
    await client`INSERT INTO api_idempotency_key(id,user_id,key,fingerprint,status_code,response_json,created_at)
      VALUES (${crypto.randomUUID()},'idem-u1',${key},${fp},0,'{}'::jsonb, now() - interval '10 minutes')`;
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => mod.claimKey('idem-u1', reqWith(key), {}, exec)),
    );
    expect(outcomes.filter((o) => o.kind === 'owned').length).toBe(1);
    outcomes
      .filter((o) => o.kind !== 'owned')
      .forEach((o) => expect(o.kind).toBe('conflict')); // in-progress 409, never a 2nd owner
  });
});
