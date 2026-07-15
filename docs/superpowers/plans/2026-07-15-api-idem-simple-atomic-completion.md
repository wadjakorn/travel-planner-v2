# API-IDEM Simple Atomic Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each simple `/api/v1` POST run its mutation and its idempotency completion in one `dbNode` transaction so it can safely enable `allowTakeover`, letting crashed idempotency claims self-heal instead of blocking the key with a 409.

**Architecture:** Add a shared `withIdempotencyAtomic` helper that generalizes `import-orchestrator`: claim the key with `allowTakeover: true`, run the route's mutation + `persistCompletion` inside one `dbNode.transaction` scoped to the claim row (0 rows updated on takeover → throw → rollback → no duplicate), read back the created entity inside that same tx, and store the full response body in the completion. Thread an optional executor param through the 8 mutation services and their coupled write helpers so their writes run inside that tx.

**Tech Stack:** Next.js App Router route handlers, Drizzle ORM (neon-http `db` for autocommit reads, postgres-js `dbNode` for interactive transactions), Vitest integration tests against Neon.

## Test-harness note (discovered at execution time)

Under vitest, module `@/db` is bound to a **placeholder** URL and never connects
(see `vitest.config.ts`). Integration tests are **gated on `TEST_DATABASE_URL`**
(`const suite = URL ? describe : describe.skip`) and **inject** a postgres-js
`drizzle` client for both idempotency ops and the tx. Route handlers use module
`@/db`, so they are **not** integration-testable directly. Therefore every test
below drives `withIdempotencyAtomic(userId, req, body, run, { idemDb: database,
txDb: database })` with a `run(tx)` that calls the **real threaded service**
(exactly the route's `run` body) — this exercises the service threading + atomic
completion end-to-end at the injectable layer. The thin route wrapper stays
untested, matching the repo (no existing `route.integration.test.ts`). Run tests
with `TEST_DATABASE_URL` exported from the dev `.env`'s `DATABASE_URL_UNPOOLED`.

## Global Constraints

- Executor type is `IdemExecutor = typeof db | NodeTx`, already exported from `app/src/lib/api/idempotency.ts`. Reuse it; do not define a new type.
- Every new/changed service or helper param is an **optional trailing** `exec: IdemExecutor = db` (or `= dbNode` where noted). Existing callers (server actions) must compile and behave unchanged.
- `.insert(...).returning()` and `.update(...).returning()` do not typecheck on the `typeof db | NodeTx` union (documented overload limitation in `idempotency.ts`). At those call sites cast the executor: `(exec as typeof db).insert(...)`. Plain `.select()`, `.delete()`, and `.update()` without `.returning()` work on the union with no cast.
- `writeAudit(...)` stays on module `db` (best-effort, explicitly non-atomic per its own comment). Do **not** thread it into the tx. This is the single deliberate exception to "all mutation writes run on `exec`".
- Access/authz resolver calls (`requireTripAccess`, `assertTripWrite`, `resolveDayWrite`, `resolvePlaceWrite`, `resolveNoteForItem`) stay on module `db` — they are preconditions that read committed state before the write, and leaving them un-threaded keeps `access.ts`, `trip-access.ts`, and `trip-queries.ts` untouched.
- Response bodies and status codes must be **byte-for-byte identical** to today for every endpoint (this ticket changes only crashed-claim recovery, nothing user-visible).
- Verify commands are run from `app/`. Build/typecheck verify = `tail -n 3` of output. Do not re-read files already shown in a task.

---

## File Structure

- **Create** `app/src/lib/api/idempotency-atomic.ts` — the `withIdempotencyAtomic` helper (mirrors `import-orchestrator.ts`'s split; keeps `idempotency.ts` primitives untouched).
- **Create** `app/src/lib/api/idempotency-atomic.integration.test.ts` — helper mechanism tests (mirrors `import-orchestrator.integration.test.ts`).
- **Modify** leaf write helpers to accept `exec`: `app/src/lib/touch-trip.ts`, `app/src/lib/seed-days.ts`.
- **Modify** 8 mutation services to accept `exec` and thread it (`trip-service.ts`, `day-service.ts`, `place-service.ts` + its `ensureSegmentForAppendedPlace`, `booking-service.ts` `createHotel`/`createTransport`, `expense-service.ts` `createExpense` + its `replaceSplits`, `note-service.ts` `createNote`/`addChecklistItem`).
- **Modify** 8 route handlers under `app/src/app/api/v1/...` to call `withIdempotencyAtomic` with a `run(tx)` callback.

---

### Task 1: `withIdempotencyAtomic` helper + mechanism tests

**Files:**
- Create: `app/src/lib/api/idempotency-atomic.ts`
- Test: `app/src/lib/api/idempotency-atomic.integration.test.ts`

**Interfaces:**
- Consumes (from `idempotency.ts`, unchanged): `claimKey`, `persistCompletion`, `releaseClaim`, `type IdemExecutor`.
- Produces:
  ```ts
  export type AtomicRunResult = { status: number; body: unknown };
  export type AtomicDeps = { idemDb?: IdemExecutor; txDb?: typeof dbNode };
  export function withIdempotencyAtomic(
    userId: string,
    req: Request,
    body: unknown,
    run: (tx: IdemExecutor) => Promise<AtomicRunResult>,
    deps?: AtomicDeps,
  ): Promise<NextResponse>;
  ```

- [ ] **Step 1: Write the helper**

Create `app/src/lib/api/idempotency-atomic.ts`:

```ts
// Atomic idempotent completion for simple POST endpoints (API-IDEM follow-up).
// Runs the route's mutation AND persistCompletion in ONE dbNode transaction,
// scoped to the claim row id. If a TTL takeover deleted the claim while a slow
// owner ran, persistCompletion updates 0 rows -> we throw -> the whole tx rolls
// back -> the mutation leaves no row. That makes allowTakeover safe here, so a
// crashed pending claim self-heals instead of blocking the key with a 409.
//
// Unlike import-orchestrator this stores the FULL response body (not a marker):
// the created entity is read back inside the same tx, so replay just returns it.

import 'server-only';
import { NextResponse } from 'next/server';
import { db, dbNode } from '@/db';
import {
  claimKey,
  persistCompletion,
  releaseClaim,
  type IdemExecutor,
} from '@/lib/api/idempotency';

export type AtomicRunResult = { status: number; body: unknown };
export type AtomicDeps = { idemDb?: IdemExecutor; txDb?: typeof dbNode };

// Thrown inside the tx to force a rollback; caught by the outer handler.
class TakeoverLostError extends Error {}
class NonSuccessResult extends Error {
  constructor(public result: AtomicRunResult) {
    super('non-success result');
  }
}

export async function withIdempotencyAtomic(
  userId: string,
  req: Request,
  body: unknown,
  run: (tx: IdemExecutor) => Promise<AtomicRunResult>,
  deps: AtomicDeps = {},
): Promise<NextResponse> {
  const idemDb = deps.idemDb ?? db;
  const txDb = deps.txDb ?? dbNode;

  const outcome = await claimKey(userId, req, body, idemDb, {
    allowTakeover: true,
  });
  if (outcome.kind === 'conflict') return outcome.response;
  if (outcome.kind === 'replay') {
    return NextResponse.json(outcome.responseJson, { status: outcome.statusCode });
  }
  if (outcome.kind === 'nokey') {
    const r = await run(idemDb);
    return NextResponse.json(r.body, { status: r.status });
  }

  // owned: mutation + completion commit atomically inside one tx.
  const { key, id } = outcome;
  try {
    const r = await txDb.transaction(async (tx) => {
      const res = await run(tx);
      if (res.status < 200 || res.status >= 300) {
        // A failed create must not be cached as a completed result; abort.
        throw new NonSuccessResult(res);
      }
      const n = await persistCompletion(tx, userId, key, id, res.status, res.body);
      if (n === 0) {
        // Our claim was taken over mid-flight; roll the mutation back so the
        // taker's row is the only one. Same guarantee as import-orchestrator.
        throw new TakeoverLostError();
      }
      return res;
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    // The tx rolled back. The claim row (inserted before the tx) survives, so
    // release it — scoped to our id and status_code=0, a no-op if a taker
    // already replaced it. Then surface the original error.
    await releaseClaim(userId, key, id, idemDb);
    if (err instanceof NonSuccessResult) {
      return NextResponse.json(err.result.body, { status: err.result.status });
    }
    throw err; // ServiceError -> mapped by withUser; TakeoverLostError -> 5xx
  }
}
```

- [ ] **Step 2: Write the failing mechanism tests**

Open `app/src/lib/api/import-orchestrator.integration.test.ts` and reuse its setup patterns (test DB via `dbNode`, a real user + trip fixture, direct row inspection of `apiIdempotencyKeys`). Create `app/src/lib/api/idempotency-atomic.integration.test.ts` with a stub `run` that inserts a sentinel row so rollback is observable:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, dbNode } from '@/db';
import { apiIdempotencyKeys, trips } from '@/db/schema';
import { withIdempotencyAtomic } from './idempotency-atomic';
import { CLAIM_TTL_MS } from './idempotency';

const USER = 'atomic-test-user';
function reqWithKey(key: string, path = 'https://x/api/v1/trips') {
  return new Request(path, {
    method: 'POST',
    headers: { 'idempotency-key': key },
  });
}
// A stub mutation that creates one trip row inside the given executor and
// returns the created id as the body.
function makeRun(title: string) {
  return async (tx: typeof db) => {
    const [row] = await (tx as typeof db)
      .insert(trips)
      .values({ ownerId: USER, title })
      .returning({ id: trips.id });
    return { status: 201, body: { id: row.id } };
  };
}

describe('withIdempotencyAtomic', () => {
  it('happy path: creates one row, replay returns the stored body', async () => {
    const key = `happy-${Date.now()}`;
    const res1 = await withIdempotencyAtomic(USER, reqWithKey(key), {}, makeRun('A'));
    const body1 = await res1.json();
    expect(res1.status).toBe(201);
    const res2 = await withIdempotencyAtomic(USER, reqWithKey(key), {}, makeRun('A'));
    const body2 = await res2.json();
    expect(body2).toEqual(body1); // replay, same body
    const rows = await db.select().from(trips).where(eq(trips.title, 'A'));
    expect(rows).toHaveLength(1); // no duplicate
  });

  it('mid-flight takeover rolls the superseded owner back (no row)', async () => {
    const key = `takeover-${Date.now()}`;
    // run that deletes its own claim right before returning, simulating a taker
    // having evicted it; persistCompletion then updates 0 rows -> rollback.
    const run = async (tx: typeof db) => {
      const [row] = await (tx as typeof db)
        .insert(trips)
        .values({ ownerId: USER, title: 'ROLLED_BACK' })
        .returning({ id: trips.id });
      // Evict the pending claim on the outer connection (not tx) so the in-tx
      // persistCompletion sees 0 rows.
      await db
        .delete(apiIdempotencyKeys)
        .where(and(eq(apiIdempotencyKeys.userId, USER), eq(apiIdempotencyKeys.key, key)));
      return { status: 201, body: { id: row.id } };
    };
    await expect(
      withIdempotencyAtomic(USER, reqWithKey(key), {}, run),
    ).rejects.toBeTruthy();
    const rows = await db.select().from(trips).where(eq(trips.title, 'ROLLED_BACK'));
    expect(rows).toHaveLength(0); // mutation rolled back with the completion
  });

  it('stale pending claim is taken over on retry (self-heal)', async () => {
    const key = `stale-${Date.now()}`;
    // Insert an abandoned pending claim older than CLAIM_TTL_MS.
    await db.insert(apiIdempotencyKeys).values({
      userId: USER,
      key,
      fingerprint: 'stale',
      statusCode: 0,
      responseJson: {},
      createdAt: new Date(Date.now() - CLAIM_TTL_MS - 5000),
    });
    const res = await withIdempotencyAtomic(USER, reqWithKey(key), {}, makeRun('HEALED'));
    expect(res.status).toBe(201);
    const rows = await db.select().from(trips).where(eq(trips.title, 'HEALED'));
    expect(rows).toHaveLength(1);
  });

  it('bad input (run throws) releases the claim and rethrows', async () => {
    const key = `bad-${Date.now()}`;
    const run = async () => {
      throw new Error('boom');
    };
    await expect(
      withIdempotencyAtomic(USER, reqWithKey(key), {}, run),
    ).rejects.toThrow('boom');
    const claim = await db
      .select()
      .from(apiIdempotencyKeys)
      .where(and(eq(apiIdempotencyKeys.userId, USER), eq(apiIdempotencyKeys.key, key)));
    expect(claim).toHaveLength(0); // released -> key reusable
  });
});
```

Note: adapt the fixture/user-seed boilerplate to match `import-orchestrator.integration.test.ts` (it already seeds a valid user row so `ownerId` FKs resolve). If `trips.ownerId` requires a real user row, create it in `beforeAll` exactly as that test does.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npx vitest run src/lib/api/idempotency-atomic.integration.test.ts`
Expected: FAIL — module compiles but assertions may fail until the helper is correct; if it errors on missing user FK, fix the fixture per the note above, not the helper.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/lib/api/idempotency-atomic.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/api/idempotency-atomic.ts app/src/lib/api/idempotency-atomic.integration.test.ts
git commit -m "feat(api): add withIdempotencyAtomic helper (atomic mutation+completion) [API-IDEM]"
```

---

### Task 2: Thread `exec` through leaf write helpers

**Files:**
- Modify: `app/src/lib/touch-trip.ts`
- Modify: `app/src/lib/seed-days.ts:83` (`seedTripDays`)

**Interfaces:**
- Produces:
  - `touchTrip(tripId: string, exec?: IdemExecutor): Promise<void>`
  - `seedTripDays(tripId: string, startDate: string, endDate: string, startIdx?: number, dayOffset?: number, exec?: IdemExecutor): Promise<number>`

- [ ] **Step 1: Thread `touchTrip`**

Edit `app/src/lib/touch-trip.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { trips } from '@/db/schema';
import type { IdemExecutor } from '@/lib/api/idempotency';

export async function touchTrip(
  tripId: string,
  exec: IdemExecutor = db,
): Promise<void> {
  await exec
    .update(trips)
    .set({ updatedAt: new Date() })
    .where(eq(trips.id, tripId));
}
```

- [ ] **Step 2: Thread `seedTripDays`**

Edit `app/src/lib/seed-days.ts` — add the import and the trailing param, and change the final insert to use `exec`:

```ts
// at top with other imports:
import type { IdemExecutor } from '@/lib/api/idempotency';

export async function seedTripDays(
  tripId: string,
  startDate: string,
  endDate: string,
  startIdx = 0,
  dayOffset = 0,
  exec: IdemExecutor = db,
): Promise<number> {
  // ...unchanged body until the insert...
  await exec.insert(days).values(rows);
  return rows.length;
}
```

- [ ] **Step 3: Verify existing behavior unchanged (typecheck + touched tests)**

Run: `cd app && npx tsc --noEmit 2>&1 | tail -n 3`
Expected: no errors.
Run: `cd app && npx vitest run src/lib/seed-days 2>&1 | tail -n 5` (if a seed-days test exists; otherwise skip)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/touch-trip.ts app/src/lib/seed-days.ts
git commit -m "refactor(api): thread optional executor through touchTrip/seedTripDays [API-IDEM]"
```

---

### Task 3: trips endpoint — `createTrip` atomic (read-back shape)

**Files:**
- Modify: `app/src/lib/services/trip-service.ts:21` (`createTrip`)
- Modify: `app/src/app/api/v1/trips/route.ts:18-33`
- Test: `app/src/app/api/v1/trips/route.integration.test.ts` (create if absent)

**Interfaces:**
- Consumes: `withIdempotencyAtomic` (Task 1), threaded `touchTrip`/`seedTripDays` (Task 2).
- Produces: `createTrip(userId, input, exec?: IdemExecutor): Promise<{ id: string }>`.

- [ ] **Step 1: Thread `createTrip`**

Edit `app/src/lib/services/trip-service.ts`. Add the import and param; use `exec` for the insert (with cast) and pass `exec` to `seedTripDays`:

```ts
import type { IdemExecutor } from '@/lib/api/idempotency';

export async function createTrip(
  userId: string,
  input: CreateTripInput,
  exec: IdemExecutor = db,
): Promise<{ id: string }> {
  const title = input.title;
  if (!title) throw new ServiceError('bad_request', 'Title is required');

  const [row] = await (exec as typeof db)
    .insert(trips)
    .values({
      ownerId: userId,
      title,
      subtitle: input.subtitle ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      cover: input.cover ?? null,
    })
    .returning({ id: trips.id });

  if (input.startDate && input.endDate) {
    await seedTripDays(row.id, input.startDate, input.endDate, 0, 0, exec);
  }

  return { id: row.id };
}
```

- [ ] **Step 2: Swap the route to the atomic helper with an in-tx read-back**

Edit `app/src/app/api/v1/trips/route.ts`. Replace the `withIdempotency` import and the POST body. The read-back becomes an inline `tx.select()` (not the `cache()`-wrapped `loadTripBasic`, which must not read uncommitted rows):

```ts
import { eq } from 'drizzle-orm';
import { trips as tripsTable } from '@/db/schema';
import { loadTripsForOwner } from '@/lib/trip-queries';
import { createTrip } from '@/lib/services/trip-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody, reqString, optString } from '@/lib/api/http';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';

// GET unchanged.

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readJsonBody(req);
    const input = {
      title: reqString(body, 'title'),
      subtitle: optString(body, 'subtitle'),
      startDate: optString(body, 'startDate'),
      endDate: optString(body, 'endDate'),
      cover: optString(body, 'cover'),
    };
    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const { id } = await createTrip(userId, input, tx);
      const [trip] = await tx
        .select()
        .from(tripsTable)
        .where(eq(tripsTable.id, id))
        .limit(1);
      return { status: 201, body: { trip } };
    });
  });
}
```

Note: keep the existing `loadTripBasic` import only if GET still uses it; the GET handler shown earlier uses `loadTripsForOwner` and `loadTripBasic`. Preserve whatever GET imports — only the POST branch changes. If GET used `loadTripBasic(id)` for its own response, leave it untouched.

- [ ] **Step 3: Write the failing endpoint test**

Create/extend `app/src/app/api/v1/trips/route.integration.test.ts` (model auth/fixture on any existing `*/route.integration.test.ts`; call `POST` directly with a `Request`):

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { POST } from './route';
// ...import/prepare an authed Request helper as sibling route tests do...

it('POST /trips is idempotent and atomic', async () => {
  const key = `trip-${Date.now()}`;
  const mk = () => authedPost('https://x/api/v1/trips', { title: 'Kyoto' }, key);
  const r1 = await POST(await mk());
  const b1 = await r1.json();
  expect(r1.status).toBe(201);
  expect(b1.trip.title).toBe('Kyoto');
  const r2 = await POST(await mk());
  const b2 = await r2.json();
  expect(b2).toEqual(b1); // replay
  const rows = await db.select().from(trips).where(eq(trips.title, 'Kyoto'));
  expect(rows).toHaveLength(1); // no duplicate
});
```

- [ ] **Step 4: Run the test**

Run: `cd app && npx vitest run src/app/api/v1/trips/route.integration.test.ts 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/services/trip-service.ts app/src/app/api/v1/trips/route.ts app/src/app/api/v1/trips/route.integration.test.ts
git commit -m "feat(api): atomic idempotent POST /trips via withIdempotencyAtomic [API-IDEM]"
```

---

### Task 4: hotels endpoint — `createHotel` atomic (entity-returning shape)

**Files:**
- Modify: `app/src/lib/services/booking-service.ts:50` (`createHotel`)
- Modify: `app/src/app/api/v1/trips/[tripId]/hotels/route.ts:17-25`
- Test: `app/src/app/api/v1/trips/[tripId]/hotels/route.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `createHotel(userId, tripId, body, exec?: IdemExecutor)` returning the created hotel row.

- [ ] **Step 1: Thread `createHotel`**

Edit `app/src/lib/services/booking-service.ts` — add `import type { IdemExecutor } from '@/lib/api/idempotency';` at the top, then:

```ts
export async function createHotel(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
) {
  await requireTripAccess(userId, tripId, 'write'); // precondition, module db
  const fields = pick(body, HOTEL_FIELDS);
  if (typeof fields.name !== 'string' || !fields.name.trim()) {
    throw new ServiceError('bad_request', '"name" is required');
  }
  const [row] = await (exec as typeof db)
    .insert(hotelBookings)
    .values({ ...fields, tripId, name: fields.name })
    .returning();
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'hotel', entityId: row.id });
  return row;
}
```

- [ ] **Step 2: Swap the route**

Edit `app/src/app/api/v1/trips/[tripId]/hotels/route.ts` POST — the entity is returned by the mutation, so no read-back:

```ts
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
// remove: import { withIdempotency } from '@/lib/api/idempotency';

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    const body = await readJsonBody(req);
    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const hotel = await createHotel(userId, tripId, body, tx);
      return { status: 201, body: { hotel } };
    });
  });
}
```

- [ ] **Step 3: Write the failing endpoint test**

Create `app/src/app/api/v1/trips/[tripId]/hotels/route.integration.test.ts` (seed a trip owned by the test user, then):

```ts
it('POST /hotels is idempotent and atomic', async () => {
  const key = `hotel-${Date.now()}`;
  const mk = () => authedPost(`https://x/api/v1/trips/${tripId}/hotels`, { name: 'Ryokan' }, key);
  const r1 = await POST(await mk(), { params: Promise.resolve({ tripId }) });
  const b1 = await r1.json();
  expect(r1.status).toBe(201);
  const r2 = await POST(await mk(), { params: Promise.resolve({ tripId }) });
  const b2 = await r2.json();
  expect(b2).toEqual(b1);
  const rows = await db.select().from(hotelBookings).where(eq(hotelBookings.tripId, tripId));
  expect(rows).toHaveLength(1);
});
```

- [ ] **Step 4: Run the test**

Run: `cd app && npx vitest run "src/app/api/v1/trips/[tripId]/hotels/route.integration.test.ts" 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/services/booking-service.ts "app/src/app/api/v1/trips/[tripId]/hotels/route.ts" "app/src/app/api/v1/trips/[tripId]/hotels/route.integration.test.ts"
git commit -m "feat(api): atomic idempotent POST /hotels [API-IDEM]"
```

---

### Task 5: days endpoint — `addDay` atomic (inline read-back)

**Files:**
- Modify: `app/src/lib/services/day-service.ts:51` (`addDay`)
- Modify: `app/src/app/api/v1/trips/[tripId]/days/route.ts:13-21`
- Test: `app/src/app/api/v1/trips/[tripId]/days/route.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `addDay(userId, tripId, exec?: IdemExecutor): Promise<{ id: string; idx: number }>`.

- [ ] **Step 1: Thread `addDay`**

Edit `app/src/lib/services/day-service.ts` — add `import type { IdemExecutor } from '@/lib/api/idempotency';`, add the param, keep the two precondition `db.select()` reads and `writeAudit` on module `db`, and route the insert (cast) + `touchTrip` through `exec`:

```ts
export async function addDay(
  userId: string,
  tripId: string,
  exec: IdemExecutor = db,
): Promise<{ id: string; idx: number }> {
  await assertTripWrite(userId, tripId); // precondition, module db
  // ...unchanged last-day / trip start-date reads on module db...
  const [created] = await (exec as typeof db)
    .insert(days)
    .values({
      tripId,
      idx: nextIdx,
      label: parts.label,
      num: parts.num,
      date: parts.dateLabel,
      title: `Day ${nextIdx + 1}`,
    })
    .returning({ id: days.id });
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'day', entityId: created.id, after: { idx: nextIdx } });
  return { id: created.id, idx: nextIdx };
}
```

- [ ] **Step 2: Swap the route with in-tx read-back**

Edit `app/src/app/api/v1/trips/[tripId]/days/route.ts` — change only the import and the read-back executor:

```ts
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
// remove withIdempotency import

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return withIdempotencyAtomic(userId, req, {}, async (tx) => {
      const { id } = await addDay(userId, tripId, tx);
      const [day] = await tx.select().from(days).where(eq(days.id, id)).limit(1);
      return { status: 201, body: { day } };
    });
  });
}
```

- [ ] **Step 3: Write + run the test**

Create `app/src/app/api/v1/trips/[tripId]/days/route.integration.test.ts` following Task 4's shape (seed a trip; POST twice with the same key; assert one new day row and equal bodies).
Run: `cd app && npx vitest run "src/app/api/v1/trips/[tripId]/days/route.integration.test.ts" 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/services/day-service.ts "app/src/app/api/v1/trips/[tripId]/days/route.ts" "app/src/app/api/v1/trips/[tripId]/days/route.integration.test.ts"
git commit -m "feat(api): atomic idempotent POST /days [API-IDEM]"
```

---

### Task 6: places endpoint — `addPlace` atomic (+ coupled segment write)

**Files:**
- Modify: `app/src/lib/services/place-service.ts:38` (`ensureSegmentForAppendedPlace`) and `:60` (`addPlace`)
- Modify: `app/src/app/api/v1/days/[dayId]/places/route.ts:14-28`
- Test: `app/src/app/api/v1/days/[dayId]/places/route.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `addPlace(userId, dayId, fields, exec?: IdemExecutor): Promise<{ tripId: string; id: string }>`.

- [ ] **Step 1: Thread the coupled segment helper and `addPlace`**

Edit `app/src/lib/services/place-service.ts` — add `import type { IdemExecutor } from '@/lib/api/idempotency';`. Thread `ensureSegmentForAppendedPlace` (its select stays module `db`, its insert goes to `exec`) and `addPlace` (insert cast + segment + touchTrip on `exec`; `resolveDayWrite` + last-idx select stay module `db`):

```ts
async function ensureSegmentForAppendedPlace(
  dayId: string,
  prevIdx: number,
  defaultMode: SegmentMode | null,
  exec: IdemExecutor = db,
): Promise<void> {
  if (prevIdx < 0) return;
  const existing = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, prevIdx)))
    .limit(1);
  if (existing[0]) return;
  await exec.insert(segments).values({
    dayId,
    idx: prevIdx,
    mode: defaultMode ?? 'drive',
    distance: '',
    time: '',
  });
}

export async function addPlace(
  userId: string,
  dayId: string,
  fields: PlaceFields,
  exec: IdemExecutor = db,
): Promise<{ tripId: string; id: string }> {
  const owned = await resolveDayWrite(userId, dayId); // precondition, module db
  if (!fields.name) throw new ServiceError('bad_request', 'Name is required');
  // ...unchanged last-idx select on module db...
  const [created] = await (exec as typeof db)
    .insert(places)
    .values({ ...fields, dayId, idx: nextIdx })
    .returning({ id: places.id });
  await ensureSegmentForAppendedPlace(dayId, nextIdx - 1, owned.defaultMode, exec);
  await touchTrip(owned.tripId, exec);
  await writeAudit({ tripId: owned.tripId, userId, action: 'add', entityType: 'place', entityId: created.id, after: { name: fields.name, kind: fields.kind } });
  return { tripId: owned.tripId, id: created.id };
}
```

- [ ] **Step 2: Swap the route with in-tx read-back**

Edit `app/src/app/api/v1/days/[dayId]/places/route.ts`:

```ts
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
// remove withIdempotency import

    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const { id } = await addPlace(userId, dayId, fields, tx);
      const [place] = await tx.select().from(places).where(eq(places.id, id)).limit(1);
      return { status: 201, body: { place } };
    });
```

- [ ] **Step 3: Write + run the test**

Create `app/src/app/api/v1/days/[dayId]/places/route.integration.test.ts` following Task 4's shape (seed trip+day; POST a place twice with the same key; assert one place row and equal bodies).
Run: `cd app && npx vitest run "src/app/api/v1/days/[dayId]/places/route.integration.test.ts" 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/services/place-service.ts "app/src/app/api/v1/days/[dayId]/places/route.ts" "app/src/app/api/v1/days/[dayId]/places/route.integration.test.ts"
git commit -m "feat(api): atomic idempotent POST /places [API-IDEM]"
```

---

### Task 7: expenses endpoint — `createExpense` atomic (+ coupled splits write)

**Files:**
- Modify: `app/src/lib/services/expense-service.ts:59` (`replaceSplits`) and `:91` (`createExpense`)
- Modify: `app/src/app/api/v1/trips/[tripId]/expenses/route.ts:17-25`
- Test: `app/src/app/api/v1/trips/[tripId]/expenses/route.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `createExpense(userId, tripId, body, exec?: IdemExecutor)` returning the created expense row.

- [ ] **Step 1: Thread `replaceSplits` and `createExpense`**

Edit `app/src/lib/services/expense-service.ts` — add `import type { IdemExecutor } from '@/lib/api/idempotency';`:

```ts
async function replaceSplits(
  expenseId: string,
  splits: SplitInput[],
  exec: IdemExecutor = db,
): Promise<void> {
  await exec.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
  if (splits.length > 0) {
    await exec.insert(expenseSplits).values(
      splits.map((s) => ({
        expenseId,
        accountId: s.accountId,
        shareAmount: s.shareAmount ?? null,
        sharePct: s.sharePct ?? null,
      })),
    );
  }
}

export async function createExpense(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
) {
  await requireTripAccess(userId, tripId, 'write'); // precondition, module db
  // ...unchanged validation + coerceAt + parseSplits...
  const [row] = await (exec as typeof db)
    .insert(expenses)
    .values({
      ...fields,
      tripId,
      category: fields.category as 'transport' | 'hotels' | 'food' | 'activities' | 'shopping' | 'other',
      amount: fields.amount,
    })
    .returning();
  if (splits) await replaceSplits(row.id, splits, exec);
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'expense', entityId: row.id });
  return row;
}
```

- [ ] **Step 2: Swap the route** (entity-returning; no read-back)

Edit `app/src/app/api/v1/trips/[tripId]/expenses/route.ts`:

```ts
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
// remove withIdempotency import

    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const expense = await createExpense(userId, tripId, body, tx);
      return { status: 201, body: { expense } };
    });
```

- [ ] **Step 3: Write + run the test**

Create `app/src/app/api/v1/trips/[tripId]/expenses/route.integration.test.ts` following Task 4's shape (seed a trip; POST an expense — include a `splits` array — twice with the same key; assert exactly one `expenses` row for the trip and one matching `expense_split` set; equal bodies).
Run: `cd app && npx vitest run "src/app/api/v1/trips/[tripId]/expenses/route.integration.test.ts" 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/services/expense-service.ts "app/src/app/api/v1/trips/[tripId]/expenses/route.ts" "app/src/app/api/v1/trips/[tripId]/expenses/route.integration.test.ts"
git commit -m "feat(api): atomic idempotent POST /expenses (incl. splits) [API-IDEM]"
```

---

### Task 8: transport endpoint — `createTransport` atomic

**Files:**
- Modify: `app/src/lib/services/booking-service.ts:124` (`createTransport`)
- Modify: `app/src/app/api/v1/trips/[tripId]/transport/route.ts:17-25`
- Test: `app/src/app/api/v1/trips/[tripId]/transport/route.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `createTransport(userId, tripId, body, exec?: IdemExecutor)` returning the created transport row.

- [ ] **Step 1: Thread `createTransport`**

Edit `app/src/lib/services/booking-service.ts` (import already added in Task 4):

```ts
export async function createTransport(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
) {
  await requireTripAccess(userId, tripId, 'write'); // precondition, module db
  const fields = pick(body, TRANSPORT_FIELDS);
  if (typeof fields.type !== 'string' || !TRANSPORT_TYPES.includes(fields.type)) {
    throw new ServiceError('bad_request', '"type" must be flight, train, car, or ferry');
  }
  if (typeof fields.title !== 'string' || !fields.title.trim()) {
    throw new ServiceError('bad_request', '"title" is required');
  }
  const [row] = await (exec as typeof db)
    .insert(transportBookings)
    .values({ ...fields, tripId, type: fields.type as 'flight' | 'train' | 'car' | 'ferry', title: fields.title })
    .returning();
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'transport', entityId: row.id });
  return row;
}
```

- [ ] **Step 2: Swap the route**

Edit `app/src/app/api/v1/trips/[tripId]/transport/route.ts`:

```ts
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
// remove withIdempotency import

    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const transport = await createTransport(userId, tripId, body, tx);
      return { status: 201, body: { transport } };
    });
```

- [ ] **Step 3: Write + run the test**

Create `app/src/app/api/v1/trips/[tripId]/transport/route.integration.test.ts` following Task 4's shape (POST a transport `{ type: 'flight', title: 'NRT->KIX' }` twice with the same key; assert one row, equal bodies).
Run: `cd app && npx vitest run "src/app/api/v1/trips/[tripId]/transport/route.integration.test.ts" 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/services/booking-service.ts "app/src/app/api/v1/trips/[tripId]/transport/route.ts" "app/src/app/api/v1/trips/[tripId]/transport/route.integration.test.ts"
git commit -m "feat(api): atomic idempotent POST /transport [API-IDEM]"
```

---

### Task 9: notes endpoint — `createNote` atomic

**Files:**
- Modify: `app/src/lib/services/note-service.ts:37` (`createNote`)
- Modify: `app/src/app/api/v1/trips/[tripId]/notes/route.ts:17-25`
- Test: `app/src/app/api/v1/trips/[tripId]/notes/route.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `createNote(userId, tripId, body, exec?: IdemExecutor)` returning the created note row.

- [ ] **Step 1: Thread `createNote`**

Edit `app/src/lib/services/note-service.ts` — add `import type { IdemExecutor } from '@/lib/api/idempotency';`:

```ts
export async function createNote(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
) {
  await requireTripAccess(userId, tripId, 'write'); // precondition, module db
  // ...unchanged validation + last-idx select on module db...
  const [row] = await (exec as typeof db)
    .insert(notes)
    .values({ tripId, idx, kind: kind as 'checklist' | 'doc', title, body: bodyText })
    .returning();
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'note', entityId: row.id });
  return row;
}
```

- [ ] **Step 2: Swap the route**

Edit `app/src/app/api/v1/trips/[tripId]/notes/route.ts`:

```ts
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
// remove withIdempotency import

    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const note = await createNote(userId, tripId, body, tx);
      return { status: 201, body: { note } };
    });
```

- [ ] **Step 3: Write + run the test**

Create `app/src/app/api/v1/trips/[tripId]/notes/route.integration.test.ts` following Task 4's shape (POST `{ kind: 'checklist', title: 'Packing' }` twice with the same key; assert one row, equal bodies).
Run: `cd app && npx vitest run "src/app/api/v1/trips/[tripId]/notes/route.integration.test.ts" 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/services/note-service.ts "app/src/app/api/v1/trips/[tripId]/notes/route.ts" "app/src/app/api/v1/trips/[tripId]/notes/route.integration.test.ts"
git commit -m "feat(api): atomic idempotent POST /notes [API-IDEM]"
```

---

### Task 10: note-items endpoint — `addChecklistItem` atomic

**Files:**
- Modify: `app/src/lib/services/note-service.ts:134` (`addChecklistItem`)
- Modify: `app/src/app/api/v1/notes/[noteId]/items/route.ts:9-17`
- Test: `app/src/app/api/v1/notes/[noteId]/items/route.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `addChecklistItem(userId, noteId, body, exec?: IdemExecutor)` returning the created item row.

- [ ] **Step 1: Thread `addChecklistItem`**

Edit `app/src/lib/services/note-service.ts` (import added in Task 9):

```ts
export async function addChecklistItem(
  userId: string,
  noteId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
) {
  const tripId = await resolveNoteForItem(noteId); // precondition, module db
  await requireTripAccess(userId, tripId, 'write'); // precondition, module db
  // ...unchanged text validation + last-idx select on module db...
  const [row] = await (exec as typeof db)
    .insert(checklistItems)
    .values({ noteId, idx, text, done: body.done === true })
    .returning();
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'checklist_item', entityId: row.id });
  return row;
}
```

- [ ] **Step 2: Swap the route**

Edit `app/src/app/api/v1/notes/[noteId]/items/route.ts`:

```ts
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
// remove withIdempotency import

    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const item = await addChecklistItem(userId, noteId, body, tx);
      return { status: 201, body: { item } };
    });
```

- [ ] **Step 3: Write + run the test**

Create `app/src/app/api/v1/notes/[noteId]/items/route.integration.test.ts` following Task 4's shape (seed trip + checklist note; POST `{ text: 'Passport' }` twice with the same key; assert one item row, equal bodies).
Run: `cd app && npx vitest run "src/app/api/v1/notes/[noteId]/items/route.integration.test.ts" 2>&1 | tail -n 8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/services/note-service.ts "app/src/app/api/v1/notes/[noteId]/items/route.ts" "app/src/app/api/v1/notes/[noteId]/items/route.integration.test.ts"
git commit -m "feat(api): atomic idempotent POST /notes/items [API-IDEM]"
```

---

### Task 11: Full verification + close ticket

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd app && npx tsc --noEmit 2>&1 | tail -n 3`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd app && npm run lint 2>&1 | tail -n 5`
Expected: clean (or only pre-existing warnings unrelated to changed files).

- [ ] **Step 3: Full test suite**

Run: `cd app && npx vitest run 2>&1 | tail -n 12`
Expected: all pass, including the new endpoint + helper integration tests and the existing `idempotency`/`import-orchestrator` suites.

- [ ] **Step 4: Build**

Run: `cd app && npm run build 2>&1 | tail -n 3`
Expected: build succeeds.

- [ ] **Step 5: Manual end-to-end sanity (one read-back + one entity endpoint)**

Against a running dev server + Neon, POST `/api/v1/trips` twice with the same `Idempotency-Key` and confirm identical `201` bodies and a single trip row; repeat for `/api/v1/trips/:id/hotels`. (Use the verify skill / existing API E2E harness if present.)

- [ ] **Step 6: Grep guard — no un-threaded mutation write escaped the tx**

Run: `cd app && grep -nE "await db\.(insert|update|delete)" src/lib/services/*.ts`
Expected: every hit is in a NON-create function (update*/remove*/delete*) or is a documented precondition/`writeAudit` — no create-path entity write still uses module `db`. Eyeball each hit against the threaded services above.

- [ ] **Step 7: Close the ticket**

```bash
pm task move --id LxG9VRbNmYtp --status completed
```

---

## Self-Review

**Spec coverage:**
- Shared `withIdempotencyAtomic` helper + tests → Task 1. ✓
- All 8 mutation services accept an executor and thread it through nested writes (`seedTripDays`, `ensureSegmentForAppendedPlace`, `replaceSplits`, `touchTrip`) → Tasks 2–10. ✓ (`writeAudit` deliberately excluded per Global Constraints, matching its existing non-atomic contract.)
- All 8 POST handlers use the atomic helper with `allowTakeover` on → Tasks 3–10 (allowTakeover is set inside the helper). ✓
- Integration tests cases 1–6 → Task 1 (mechanism: happy/replay/takeover/stale/bad-input) + Tasks 3 & 4 (real neon read-back shape + entity shape) + per-endpoint smoke tests. ✓
- typecheck + lint + build clean; ticket → completed → Task 11. ✓

**Placeholder scan:** No "TBD/TODO". "...unchanged..." markers point at code shown verbatim earlier in the same task or in the file dumps referenced; each such marker is bracketed by the exact lines that DO change. No un-shown code step.

**Type consistency:** `IdemExecutor` reused everywhere; `(exec as typeof db)` applied to every `.insert(...).returning()`. Helper signature `withIdempotencyAtomic(userId, req, body, run, deps?)` matches all 8 route call sites. Service signatures add the same trailing `exec?: IdemExecutor = db` and are called with the tx from `run(tx)`.
