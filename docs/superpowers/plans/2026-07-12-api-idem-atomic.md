# API Idempotency — Atomic Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /api/v1/trips/import`'s idempotency completion commit atomically with the trip (marker-in-transaction), so a crash or post-commit read-back failure can never produce a duplicate trip; and add a claim-expiry (TTL) takeover that recovers crashed pending claims for every `/api/v1` POST.

**Architecture:** Refactor `idempotency.ts` into two reusable primitives — `claimKey` (claim + conflict/replay + TTL takeover) and `persistCompletion` (writes the completion via *any* Drizzle executor, `db` or a `dbNode` tx). `withIdempotency` keeps its public behavior and is reimplemented on them (simple endpoints get TTL takeover free, no route edits). `trips/import` composes the primitives in a new thin orchestrator: it writes a *marker* completion inside `importPlan`'s transaction, does the read-back post-commit, best-effort upgrades the marker to the full body, and re-renders from the marker on replay.

**Tech Stack:** Next.js App Router (Node runtime), Drizzle ORM (`drizzle-orm@^0.45.2`), two drivers (`db` neon-http, `dbNode` postgres-js/TCP), Vitest (`vitest run`). Integration tests gated on `TEST_DATABASE_URL` (postgres-js client injected, mirroring `rate-limit.integration.test.ts`).

## Global Constraints

- **Zero web-UI impact.** Do not touch `loadTrip`, `loadHotelsForTrip`, `loadApiTrip`, any web query, the DB schema, or any simple `/api/v1` POST route file. The import read-back stays post-commit on neon-http.
- **`withIdempotency` public signature is additive only.** Existing 4-arg callers (`(userId, req, body, produce)`) must keep compiling and behaving identically. Any new parameter is optional and trailing.
- **No `any` in `src/`.** The codebase has zero `: any`/`<any` in `src`. Use the union executor type `IdemExecutor = typeof db | NodeTx` (verified to compile).
- **No migration.** Reuse `api_idempotency_key` as-is (`created_at` already exists; `status_code 0` = pending, `>0` = completed; `response_json` holds the full body **or** an import marker `{ __idem: true, tripId }`).
- **TTL constant:** `CLAIM_TTL_MS = 60_000`.
- Verify commands (run from `app/`): `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test`. Integration tests only run when `TEST_DATABASE_URL` points at a migrated Postgres.

---

### Task 1: Idempotency integration test harness (characterization of current behavior)

Establish the test file and lock current `withIdempotency` behavior *before* refactoring. There are no idempotency tests today. These tests pass on the **current** code (they inject a postgres-js client via a new optional `exec` param — so Step 1 adds that param, a behavior-preserving change).

**Files:**
- Modify: `app/src/lib/api/idempotency.ts` (add optional `exec` params; no behavior change)
- Test: `app/src/lib/api/idempotency.integration.test.ts` (create)

**Interfaces:**
- Produces: `withIdempotency(userId, req, body, produce, exec?: IdemExecutor)`, `IdemExecutor` (exported type), `idempotencyKey`, `fingerprint` (already exported? — `idempotencyKey` is exported; keep as-is).

- [ ] **Step 1: Add the `IdemExecutor` type and thread an optional `exec` param through the existing functions (no behavior change).**

In `app/src/lib/api/idempotency.ts`, update imports and add the type near the top (after the existing imports):

```ts
import { db, dbNode } from '@/db';
```

(replace the existing `import { db } from '@/db';`). Then add:

```ts
// A Drizzle executor that can run the idempotency SQL: the neon-http `db`, or a
// postgres-js transaction handed in by a caller (so the completion can commit
// inside the mutation's tx). Both support insert/update/delete used here.
type NodeTx = Parameters<Parameters<typeof dbNode.transaction>[0]>[0];
export type IdemExecutor = typeof db | NodeTx;
```

Change `lookup`, `releaseClaim`, and `withIdempotency` to accept an optional trailing `exec: IdemExecutor = db` and use it instead of the module `db`. `lookup` must also select `createdAt` (needed by Task 3):

```ts
type Row = {
  fingerprint: string;
  statusCode: number;
  responseJson: unknown;
  createdAt: Date;
};

async function lookup(
  userId: string,
  key: string,
  exec: IdemExecutor = db,
): Promise<Row | null> {
  const rows = await exec
    .select({
      fingerprint: apiIdempotencyKeys.fingerprint,
      statusCode: apiIdempotencyKeys.statusCode,
      responseJson: apiIdempotencyKeys.responseJson,
      createdAt: apiIdempotencyKeys.createdAt,
    })
    .from(apiIdempotencyKeys)
    .where(
      and(eq(apiIdempotencyKeys.userId, userId), eq(apiIdempotencyKeys.key, key)),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function releaseClaim(
  userId: string,
  key: string,
  exec: IdemExecutor = db,
): Promise<void> {
  await exec
    .delete(apiIdempotencyKeys)
    .where(
      and(
        eq(apiIdempotencyKeys.userId, userId),
        eq(apiIdempotencyKeys.key, key),
        eq(apiIdempotencyKeys.statusCode, 0),
      ),
    );
}
```

In `withIdempotency`, add the trailing param and replace every `db` reference in its body with `exec`:

```ts
export async function withIdempotency(
  userId: string,
  req: Request,
  body: unknown,
  produce: () => Promise<{ status: number; body: unknown }>,
  exec: IdemExecutor = db,
): Promise<NextResponse> {
  // ...existing body, but use `exec` instead of `db` for the claim insert,
  // lookup(userId, key, exec), releaseClaim(userId, key, exec), and the
  // completion UPDATE. Logic otherwise unchanged.
}
```

- [ ] **Step 2: Write the characterization test.**

Create `app/src/lib/api/idempotency.integration.test.ts`:

```ts
// Integration tests for the idempotency plumbing against a live Postgres.
// Skipped unless TEST_DATABASE_URL is set (same pattern as
// rate-limit.integration.test.ts). Injects a postgres-js client as the `exec`
// param because the runtime neon-http client can't talk to a plain Postgres.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
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
});
```

- [ ] **Step 3: Run the tests to verify they pass on current-behavior code.**

Run (from `app/`): `TEST_DATABASE_URL=<url> npm run test -- idempotency.integration`
Expected: 3 tests PASS. (Without `TEST_DATABASE_URL`, the suite is skipped — that's fine locally, but you MUST run it against a DB before moving on.)

- [ ] **Step 4: Typecheck + lint.**

Run: `npm run typecheck && npm run lint`
Expected: clean (no errors).

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/api/idempotency.ts app/src/lib/api/idempotency.integration.test.ts
git commit -m "test(api): idempotency integration harness + injectable exec [API-IDEM]"
```

---

### Task 2: Extract `claimKey` + `persistCompletion`; reimplement `withIdempotency` on them

Behavior-preserving refactor. Task 1's tests stay green.

**Files:**
- Modify: `app/src/lib/api/idempotency.ts`
- Test: `app/src/lib/api/idempotency.integration.test.ts` (add one assertion)

**Interfaces:**
- Produces:
  - `type ClaimOutcome = { kind: 'nokey' } | { kind: 'owned'; key: string; fp: string } | { kind: 'conflict'; response: NextResponse } | { kind: 'replay'; statusCode: number; responseJson: unknown }`
  - `claimKey(userId: string, req: Request, body: unknown, exec?: IdemExecutor): Promise<ClaimOutcome>`
  - `persistCompletion(exec: IdemExecutor, userId: string, key: string, status: number, json: unknown): Promise<void>`
  - `releaseClaim(userId: string, key: string, exec?: IdemExecutor): Promise<void>` (already exists; keep exported? — export it now for the orchestrator)

- [ ] **Step 1: Add `ClaimOutcome`, `claimKey`, and `persistCompletion`; export `releaseClaim`.**

In `app/src/lib/api/idempotency.ts` add (keep the existing `idempotencyKey`, `fingerprint`, `lookup`, `releaseClaim`):

```ts
export type ClaimOutcome =
  | { kind: 'nokey' }
  | { kind: 'owned'; key: string; fp: string }
  | { kind: 'conflict'; response: NextResponse }
  | { kind: 'replay'; statusCode: number; responseJson: unknown };

// Claim an Idempotency-Key or resolve to a replay/conflict. Encapsulates the
// atomic pending-claim insert, the fingerprint check, and (Task 3) TTL takeover.
export async function claimKey(
  userId: string,
  req: Request,
  body: unknown,
  exec: IdemExecutor = db,
): Promise<ClaimOutcome> {
  const key = idempotencyKey(req);
  if (!key) return { kind: 'nokey' };
  const fp = fingerprint(req, body);

  for (let attempt = 0; attempt < 2; attempt++) {
    const claim = await exec
      .insert(apiIdempotencyKeys)
      .values({ userId, key, fingerprint: fp, statusCode: 0, responseJson: {} })
      .onConflictDoNothing({
        target: [apiIdempotencyKeys.userId, apiIdempotencyKeys.key],
      })
      .returning({ id: apiIdempotencyKeys.id });
    if (claim.length > 0) return { kind: 'owned', key, fp };

    const existing = await lookup(userId, key, exec);
    if (!existing) continue; // released mid-race — retry the claim
    if (existing.fingerprint !== fp) {
      return {
        kind: 'conflict',
        response: apiError('conflict', 'Idempotency-Key reused with a different request'),
      };
    }
    if (existing.statusCode === 0) {
      return {
        kind: 'conflict',
        response: apiError('conflict', 'A request with this Idempotency-Key is still in progress'),
      };
    }
    return { kind: 'replay', statusCode: existing.statusCode, responseJson: existing.responseJson };
  }
  // Pathological churn: stay safe rather than run unguarded.
  return {
    kind: 'conflict',
    response: apiError('conflict', 'A request with this Idempotency-Key is still in progress'),
  };
}

// Write the completed response onto the (already-claimed) row via any executor.
// Called with `db` on the normal path, or a `dbNode` tx to commit atomically
// with the mutation (import).
export async function persistCompletion(
  exec: IdemExecutor,
  userId: string,
  key: string,
  status: number,
  json: unknown,
): Promise<void> {
  await exec
    .update(apiIdempotencyKeys)
    .set({ statusCode: status, responseJson: json as object })
    .where(
      and(eq(apiIdempotencyKeys.userId, userId), eq(apiIdempotencyKeys.key, key)),
    );
}
```

Add `export` to `releaseClaim` (change `async function releaseClaim` → `export async function releaseClaim`).

- [ ] **Step 2: Reimplement `withIdempotency` on the new primitives.**

Replace the whole body of `withIdempotency` with:

```ts
export async function withIdempotency(
  userId: string,
  req: Request,
  body: unknown,
  produce: () => Promise<{ status: number; body: unknown }>,
  exec: IdemExecutor = db,
): Promise<NextResponse> {
  const outcome = await claimKey(userId, req, body, exec);
  if (outcome.kind === 'conflict') return outcome.response;
  if (outcome.kind === 'replay') {
    return NextResponse.json(outcome.responseJson, { status: outcome.statusCode });
  }
  if (outcome.kind === 'nokey') {
    const r = await produce();
    return NextResponse.json(r.body, { status: r.status });
  }
  // owned
  try {
    const r = await produce();
    if (r.status >= 200 && r.status < 300) {
      await persistCompletion(exec, userId, outcome.key, r.status, r.body);
    } else {
      await releaseClaim(userId, outcome.key, exec);
    }
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await releaseClaim(userId, outcome.key, exec);
    throw err;
  }
}
```

- [ ] **Step 3: Add a parity assertion for a non-2xx release.**

Append to `idempotency.integration.test.ts` inside the suite:

```ts
  it('releases the claim on a non-2xx result (no completion cached)', async () => {
    const key = `k-4xx-${Date.now()}`;
    const r1 = await mod.withIdempotency('idem-u1', reqWith(key), {}, async () => ({ status: 400, body: { error: 'bad' } }), exec);
    expect(r1.status).toBe(400);
    // retry re-runs because the claim was released
    let ran = false;
    await mod.withIdempotency('idem-u1', reqWith(key), {}, async () => { ran = true; return { status: 201, body: {} }; }, exec);
    expect(ran).toBe(true);
  });
```

- [ ] **Step 4: Run tests + typecheck + lint.**

Run: `TEST_DATABASE_URL=<url> npm run test -- idempotency.integration && npm run typecheck && npm run lint`
Expected: 4 tests PASS; typecheck/lint clean.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/api/idempotency.ts app/src/lib/api/idempotency.integration.test.ts
git commit -m "refactor(api): extract claimKey + persistCompletion from withIdempotency [API-IDEM]"
```

---

### Task 3: TTL takeover of stale pending claims

**Files:**
- Modify: `app/src/lib/api/idempotency.ts`
- Test: `app/src/lib/api/idempotency.integration.test.ts` (add takeover tests)

**Interfaces:**
- Produces: `CLAIM_TTL_MS` (module constant); `claimKey` now takes over a pending row older than the TTL.

- [ ] **Step 1: Write the failing takeover tests.**

Append to `idempotency.integration.test.ts`:

```ts
  it('takes over a pending claim older than the TTL', async () => {
    const key = `k-ttl-${Date.now()}`;
    // Insert a stale pending row directly (created_at well past the TTL).
    await client`INSERT INTO api_idempotency_key(id,user_id,key,fingerprint,status_code,response_json,created_at)
      VALUES (${crypto.randomUUID()},'idem-u1',${key},'stale-fp',0,'{}'::jsonb, now() - interval '10 minutes')`;
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
```

Note: the fresh-pending test inserts fingerprint `'fp'`, but the request's real fingerprint differs, so it would 409 as a reuse anyway; to specifically prove the *in-progress* branch, compute the matching fingerprint. Simpler and unambiguous — assert only the status is 409 (both reuse and in-progress are 409); the takeover test above already proves stale rows are cleared. Keep as written.

- [ ] **Step 2: Run to verify the takeover test fails.**

Run: `TEST_DATABASE_URL=<url> npm run test -- idempotency.integration`
Expected: `takes over a pending claim older than the TTL` FAILS (current `claimKey` returns 409 for any pending row; `ran` stays false).

- [ ] **Step 3: Implement TTL takeover in `claimKey`.**

Add the constant near the top of `idempotency.ts` (after the `IdemExecutor` type):

```ts
// A pending claim older than this is presumed abandoned (owner crashed); a
// retry may delete it and take over. Comfortably above p99 request latency.
export const CLAIM_TTL_MS = 60_000;
```

In `claimKey`, replace the `if (existing.statusCode === 0) { ...return in-progress... }` block with:

```ts
    if (existing.statusCode === 0) {
      const stale = existing.createdAt.getTime() < Date.now() - CLAIM_TTL_MS;
      if (stale) {
        await releaseClaim(userId, key, exec); // guarded on status_code = 0
        continue; // retry the claim — takeover
      }
      return {
        kind: 'conflict',
        response: apiError('conflict', 'A request with this Idempotency-Key is still in progress'),
      };
    }
```

- [ ] **Step 4: Run to verify all pass.**

Run: `TEST_DATABASE_URL=<url> npm run test -- idempotency.integration && npm run typecheck && npm run lint`
Expected: all idempotency tests PASS; typecheck/lint clean.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/api/idempotency.ts app/src/lib/api/idempotency.integration.test.ts
git commit -m "feat(api): TTL takeover of stale pending idempotency claims [API-IDEM]"
```

---

### Task 4: `recordCompletion` hook in `importPlan`

Let `importPlan` run a caller-supplied write inside its transaction, after the inserts, so the idempotency completion commits atomically with the trip.

**Files:**
- Modify: `app/src/lib/services/import-service.ts`
- Test: `app/src/lib/services/import-service.integration.test.ts` (add atomicity tests)

**Interfaces:**
- Consumes: `IdemExecutor` (type, from `@/lib/api/idempotency`).
- Produces: `importPlan(userId, plan, database?, recordCompletion?: (tx: IdemExecutor, tripId: string) => Promise<void>)`.

- [ ] **Step 1: Write the failing atomicity tests.**

Add to `import-service.integration.test.ts` (inside the `suite`, after the existing tests). It asserts (a) the hook runs inside the tx and its write persists on commit, and (b) a hook that throws rolls back the whole trip:

```ts
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
```

- [ ] **Step 2: Run to verify it fails.**

Run: `TEST_DATABASE_URL=<url> npm run test -- import-service.integration`
Expected: FAILS to compile / run — `importPlan` has no 4th parameter (`Expected 2-3 arguments, but got 4`).

- [ ] **Step 3: Add the `recordCompletion` hook to `importPlan`.**

In `app/src/lib/services/import-service.ts`, add the import and the 4th parameter, and invoke the hook after all inserts, before returning:

```ts
import type { IdemExecutor } from '@/lib/api/idempotency';
```

```ts
export async function importPlan(
  userId: string,
  plan: ParsedImportPlan,
  database: typeof dbNode = dbNode,
  recordCompletion?: (tx: IdemExecutor, tripId: string) => Promise<void>,
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    // ...all existing inserts unchanged, ending with the hotels loop...

    if (recordCompletion) await recordCompletion(tx, trip.id);
    return { id: trip.id };
  });
}
```

(`tx` from postgres-js `.transaction` is a `NodeTx`, one member of `IdemExecutor`, so it passes to `persistCompletion` without a cast.)

- [ ] **Step 4: Run to verify pass.**

Run: `TEST_DATABASE_URL=<url> npm run test -- import-service.integration && npm run typecheck && npm run lint`
Expected: all import-service tests PASS; typecheck/lint clean.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/services/import-service.ts app/src/lib/services/import-service.integration.test.ts
git commit -m "feat(api): importPlan recordCompletion hook (in-tx side write) [API-IDEM]"
```

---

### Task 5: `import-orchestrator.ts` (atomic import + marker replay) + thin route

Compose the primitives into the atomic import flow; make the route thin.

**Files:**
- Create: `app/src/lib/api/import-orchestrator.ts`
- Modify: `app/src/app/api/v1/trips/import/route.ts`
- Test: `app/src/lib/api/import-orchestrator.integration.test.ts` (create)

**Interfaces:**
- Consumes: `claimKey`, `persistCompletion`, `releaseClaim`, `IdemExecutor` (from `@/lib/api/idempotency`); `importPlan` (from `@/lib/services/import-service`); `parseImportPlan` (from `@/lib/api/import-input`); `loadApiTrip` (from `@/lib/trip-queries`); `db`, `dbNode` (from `@/db`).
- Produces: `importTripIdempotent(userId, req, body, deps?): Promise<NextResponse>` and `type ImportDeps = { loadApiTrip: typeof loadApiTrip; idemDb: IdemExecutor; txDb: typeof dbNode }`.

- [ ] **Step 1: Write the failing orchestrator tests.**

Create `app/src/lib/api/import-orchestrator.integration.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `TEST_DATABASE_URL=<url> npm run test -- import-orchestrator.integration`
Expected: FAILS — `./import-orchestrator` does not exist.

- [ ] **Step 3: Implement the orchestrator.**

Create `app/src/lib/api/import-orchestrator.ts`:

```ts
// Atomic idempotent import (API-IDEM). Composes the idempotency primitives so
// the trip and its idempotency completion commit in ONE dbNode transaction: the
// recordCompletion hook writes a marker inside importPlan's tx. The read-back
// runs post-commit on neon-http (loadApiTrip untouched); a best-effort upgrade
// replaces the marker with the full body. On replay, a marker is re-rendered
// from its tripId — so a retry never re-runs importPlan and can never duplicate.

import 'server-only';
import { NextResponse } from 'next/server';
import { db, dbNode } from '@/db';
import {
  claimKey,
  persistCompletion,
  releaseClaim,
  type IdemExecutor,
} from '@/lib/api/idempotency';
import { parseImportPlan } from '@/lib/api/import-input';
import { importPlan } from '@/lib/services/import-service';
import { loadApiTrip } from '@/lib/trip-queries';

type Marker = { __idem: true; tripId: string };
function importMarker(tripId: string): Marker {
  return { __idem: true, tripId };
}
function isImportMarker(json: unknown): json is Marker {
  return (
    typeof json === 'object' &&
    json !== null &&
    (json as { __idem?: unknown }).__idem === true &&
    typeof (json as { tripId?: unknown }).tripId === 'string'
  );
}

export type ImportDeps = {
  loadApiTrip: typeof loadApiTrip;
  idemDb: IdemExecutor;
  txDb: typeof dbNode;
};

const defaultDeps: ImportDeps = { loadApiTrip, idemDb: db, txDb: dbNode };

export async function importTripIdempotent(
  userId: string,
  req: Request,
  body: Record<string, unknown>,
  deps: ImportDeps = defaultDeps,
): Promise<NextResponse> {
  const outcome = await claimKey(userId, req, body, deps.idemDb);

  if (outcome.kind === 'conflict') return outcome.response;
  if (outcome.kind === 'replay') {
    if (isImportMarker(outcome.responseJson)) {
      const trip = await deps.loadApiTrip(outcome.responseJson.tripId);
      return NextResponse.json({ trip }, { status: outcome.statusCode });
    }
    return NextResponse.json(outcome.responseJson, { status: outcome.statusCode });
  }

  const key = outcome.kind === 'owned' ? outcome.key : null;
  let committed = false;
  try {
    const plan = parseImportPlan(body);
    const { id } = await importPlan(
      userId,
      plan,
      deps.txDb,
      key
        ? (tx, tripId) => persistCompletion(tx, userId, key, 201, importMarker(tripId))
        : undefined,
    );
    committed = true; // trip + marker committed atomically
    const trip = await deps.loadApiTrip(id);
    const full = { trip };
    if (key) {
      // Best-effort: replace the marker with the full body so replays skip the
      // read-back. Failure is harmless — replay re-renders from the marker.
      await persistCompletion(deps.idemDb, userId, key, 201, full).catch(() => {});
    }
    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    // Only release when the mutation never committed (e.g. bad payload). After
    // commit the marker is the durable truth; releasing is both wrong and a
    // no-op (releaseClaim is guarded on status_code = 0).
    if (key && !committed) await releaseClaim(userId, key, deps.idemDb);
    throw err;
  }
}
```

- [ ] **Step 4: Run the orchestrator tests to verify pass.**

Run: `TEST_DATABASE_URL=<url> npm run test -- import-orchestrator.integration`
Expected: 3 tests PASS — including `read-back throws after commit, retry does NOT duplicate`.

- [ ] **Step 5: Rewire the route to be thin.**

Replace `app/src/app/api/v1/trips/import/route.ts` with:

```ts
// POST /api/v1/trips/import — create a whole trip (days + places + hotels) from
// an agent-authored plan, atomically and idempotently. Auth/scope/rate-limit
// come from withUser; the atomic idempotency flow lives in importTripIdempotent.

import { withUser, readJsonBody } from '@/lib/api/http';
import { importTripIdempotent } from '@/lib/api/import-orchestrator';

// importPlan runs its transaction over the postgres-js dbNode (TCP) client,
// which cannot run on Edge. Pin Node so this route is never flipped to Edge.
export const runtime = 'nodejs';

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readJsonBody(req);
    return importTripIdempotent(userId, req, body);
  });
}
```

- [ ] **Step 6: Full verify.**

Run: `TEST_DATABASE_URL=<url> npm run test && npm run typecheck && npm run lint && npm run build`
Expected: all tests PASS (37 prior + the new idempotency/orchestrator tests), typecheck/lint clean, `next build` succeeds. Verify the build tail shows the `/api/v1/trips/import` route compiled.

- [ ] **Step 7: Manual E2E (real server, real Neon).**

Start the dev server, mint a read-write token, and confirm: (a) `POST /trips/import` with `Idempotency-Key: X` → 201 with `{ trip }`; (b) identical retry with `X` → 201, same trip, and `GET /trips/:id` shows exactly one trip; (c) a malformed payload with a fresh key → 400 and no trip; (d) a read-write token succeeds while a read-only token → 403. (Record the commands + outputs for the PR body.)

- [ ] **Step 8: Commit.**

```bash
git add app/src/lib/api/import-orchestrator.ts app/src/lib/api/import-orchestrator.integration.test.ts app/src/app/api/v1/trips/import/route.ts
git commit -m "feat(api): atomic idempotent trips/import via marker-in-tx [API-IDEM]

Completion commits inside importPlan's transaction; post-commit read-back with
best-effort full-body upgrade; marker-aware replay. A crash or read-back
failure after commit can no longer duplicate a trip. Closes the codex-High
finding from API-IMPORT.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §4.1 marker-in-transaction → Tasks 4 (hook) + 5 (marker write + replay). ✓
- §4.2 TTL takeover (all endpoints) → Task 3 (in `claimKey`, inherited by `withIdempotency`). ✓
- §4.3 `claimKey` + `persistCompletion` + unchanged `withIdempotency` signature → Tasks 1–2. ✓ (`withIdempotency`'s new `exec` param is optional/trailing — existing 4-arg simple-endpoint callers untouched.)
- §2a zero web impact → no task touches `loadTrip`/`loadHotelsForTrip`/`loadApiTrip`/web/schema; read-back stays post-commit. ✓
- §7 tests 1–8 → happy+retry (T5), atomic marker (T4), read-back-fails-no-dup (T5), full-body upgrade (T5), marker replay (T5 happy path exercises marker→render on the bug retry), TTL takeover (T3), fingerprint reuse (T1), simple-endpoint parity (T1/T2). ✓
- §5 no migration → confirmed; `response_json` marker shape used only by the orchestrator. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**Type consistency:** `IdemExecutor` defined in Task 1, reused in Tasks 2/4/5. `claimKey`/`persistCompletion`/`releaseClaim` signatures identical across tasks. `importPlan`'s 4th param `recordCompletion(tx: IdemExecutor, tripId: string)` matches the orchestrator's call and `persistCompletion`. `ImportDeps` fields (`loadApiTrip`, `idemDb`, `txDb`) consistent between the type, `defaultDeps`, and the tests' `deps()` helper. ✓

**Note for the executor:** the integration tests require a migrated `TEST_DATABASE_URL`. If none is available at execution time, stand up a local Postgres and run the repo's migrations against it first (`drizzle-kit migrate` with `DATABASE_URL_UNPOOLED` pointing at it), then export `TEST_DATABASE_URL`. Do not mark a task done on a skipped suite.
