// Integration test for the real rate-limit SQL against a live Postgres.
// Skipped unless TEST_DATABASE_URL is set, so CI without a DB stays green:
//
//   TEST_DATABASE_URL=postgres://user:pw@localhost:5432/db pnpm test
//
// Exercises the exact UPSERT via consumeRateLimit (db injected), covering the
// boundary, Retry-After, per-token isolation, window reset, and concurrency
// atomicity — the behaviors that can't be checked without a database.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

// Small limit + short window so the reset test doesn't sleep long. Set before
// importing rate-limit (its limits are read from env at module load).
const MAX = 3;
const WINDOW = 2;

suite('consumeRateLimit (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let consumeRateLimit: typeof import('./rate-limit').consumeRateLimit;
  // The postgres-js client runs the same standard SQL as the runtime neon-http
  // client; typed as the injectable param since only the driver differs.
  type Db = NonNullable<Parameters<typeof consumeRateLimit>[1]>;
  let database: Db;

  beforeAll(async () => {
    process.env.API_RATE_LIMIT_MAX = String(MAX);
    process.env.API_RATE_LIMIT_WINDOW_SECONDS = String(WINDOW);
    process.env.DATABASE_URL ??= URL;

    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema }) as unknown as Db;
    // api_rate_limit.token_id has an FK to api_token (migration 0012), so on a
    // migrated DB the token rows must exist. Seed a user + one token per id the
    // tests use.
    await database.execute(
      sql`INSERT INTO "user"(id,name,email) VALUES ('rl-u1','RL','rl@t.local') ON CONFLICT (id) DO NOTHING`,
    );
    for (const id of ['it-boundary', 'it-iso-a', 'it-iso-b', 'it-reset', 'it-concurrent']) {
      await database.execute(
        sql`INSERT INTO api_token(id,user_id,name,scope,token_hash)
            VALUES (${id},'rl-u1',${id},'read-write',${'hash-' + id})
            ON CONFLICT (id) DO NOTHING`,
      );
    }

    ({ consumeRateLimit } = await import('./rate-limit'));
  });

  afterAll(async () => {
    await client?.end();
  });

  const reset = (token: string) =>
    database.execute(sql`DELETE FROM api_rate_limit WHERE token_id = ${token}`);

  it('allows 1..MAX then 429s with a positive Retry-After', async () => {
    const tok = 'it-boundary';
    await reset(tok);
    for (let i = 1; i <= MAX; i++) {
      expect(await consumeRateLimit(tok, database)).toEqual({ ok: true });
    }
    const over = await consumeRateLimit(tok, database);
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error('expected denial');
    expect(over.retryAfter).toBeGreaterThan(0);
    expect(over.limit).toBe(MAX);
  });

  it('keeps a separate counter per token', async () => {
    const a = 'it-iso-a';
    const b = 'it-iso-b';
    await reset(a);
    await reset(b);
    // Exhaust token A.
    for (let i = 1; i <= MAX; i++) await consumeRateLimit(a, database);
    expect((await consumeRateLimit(a, database)).ok).toBe(false);
    // Token B is unaffected.
    expect((await consumeRateLimit(b, database)).ok).toBe(true);
  });

  it('resets after the window elapses', async () => {
    const tok = 'it-reset';
    await reset(tok);
    for (let i = 1; i <= MAX; i++) await consumeRateLimit(tok, database);
    expect((await consumeRateLimit(tok, database)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, WINDOW * 1000 + 250));
    expect((await consumeRateLimit(tok, database)).ok).toBe(true);
  });

  it('is atomic under concurrency: exactly MAX of 2×MAX succeed', async () => {
    const tok = 'it-concurrent';
    await reset(tok);
    const results = await Promise.all(
      Array.from({ length: MAX * 2 }, () => consumeRateLimit(tok, database)),
    );
    const passed = results.filter((r) => r.ok).length;
    expect(passed).toBe(MAX);
  });
});
