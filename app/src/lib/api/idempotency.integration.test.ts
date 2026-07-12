// Integration tests for the idempotency plumbing against a live Postgres.
// Skipped unless TEST_DATABASE_URL is set (same pattern as
// rate-limit.integration.test.ts). Injects a postgres-js client as the `exec`
// param because the runtime neon-http client can't talk to a plain Postgres.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';

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
});
