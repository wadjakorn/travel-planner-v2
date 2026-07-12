# API Idempotency — Atomic Completion — Design

**Date:** 2026-07-12
**Ticket:** `vgFORU9ZUPok` [API-IDEM] · **Epic:** `qdIoykC3QCeO` (API v1 hardening & expansion)
**Follow-up from:** `ShULpTKuaROd` [API-IMPORT] (codex review, High)
**Status:** Approved (brainstorm 2026-07-12), pending implementation plan.

## 1. Purpose

`withIdempotency` (`src/lib/api/idempotency.ts`) backs every `POST /api/v1`
endpoint. It **claims** an `Idempotency-Key` (a `pending` row), runs the
mutation, **then** writes the completed response as a *separate* neon-http write.
That second write is not atomic with the mutation. If the process crashes — or a
post-mutation step such as the read-back throws — **after** the mutation commits
but **before** the completion row is written, the `catch`/non-2xx branch calls
`releaseClaim` (deletes the pending row). A retry with the same key then re-runs
the whole mutation → **duplicate create**.

`trips/import` makes this most costly: a duplicate is a whole extra trip
(days + places + hotels), not one stray row.

This spec makes the "the side effect happened" record commit **in the same
atomic unit as the side effect** for `trips/import`, and adds a **claim-expiry
(TTL) takeover** that lets every endpoint recover from a crashed claim owner.

## 2. Goals / non-goals

**Goals**
- `trips/import`: a committed trip **always** has its idempotency completion
  committed with it. A retry can never produce a duplicate trip.
- All `/api/v1` POST endpoints: a `pending` claim whose owner died is
  auto-recovered after a TTL, instead of wedging that key on a permanent 409.
- Refactor the shared plumbing so the fix generalizes later (the "general-ready"
  seam) without changing `withIdempotency`'s public signature.

**Non-goals (deferred)**
- Making the *simple* neon-http endpoints (trips, days, places, hotels,
  transport, expenses, notes) fully atomic. They keep a tiny single-INSERT
  re-run window on the crash-between-commit-and-completion path; TTL takeover
  shrinks its consequence to a *delayed retry*. Their later hardening pass can
  adopt the same marker pattern.
- Any request-fingerprint uniqueness constraint at the entity level.
- Any schema migration (the needed `created_at` column already exists).

## 2a. Constraint: zero web-UI impact

Same guarantee as API-IMPORT. This is purely additive/internal on `/api/v1`:

- `loadTrip`, `loadHotelsForTrip`, `loadApiTrip`, and every web query stay
  **byte-for-byte untouched** — the import read-back keeps running post-commit
  on the neon-http `db`. We deliberately do **not** thread a tx executor through
  those React-`cache()`-wrapped, web-facing queries.
- `withIdempotency` keeps its exact public signature, so the simple endpoints'
  route files need **no change**.
- The one shared file that changes behavior, `idempotency.ts`, is reimplemented
  on smaller building blocks that preserve its existing observable behavior
  (verified by keeping/extending its tests) and *add* TTL takeover.

## 3. Background: current flow and the window

```
withIdempotency:
  1. INSERT claim (statusCode 0, pending)          [neon-http db]  ── the lock
  2. result = await produce()                        (mutation + read-back)
       import: importPlan() on dbNode tx  →  loadApiTrip() on neon-http
  3. on 2xx : UPDATE claim → (status, body)         [neon-http db]  ── completion
     else    : DELETE pending claim (releaseClaim)
     on throw: DELETE pending claim, rethrow
```

Failure window = **after step 2's mutation commits, before step 3's UPDATE
lands**. Two triggers:

- **Read-back throws** (`loadApiTrip` after the committed `importPlan` tx) →
  step 3 takes the `throw` branch → `releaseClaim` → retry duplicates.
- **Process crash** in the same gap → claim stays `pending` forever → every
  retry gets 409 "in progress" (liveness bug, not a duplicate).

Driver facts that shape the fix:
- Idempotency store: neon-http `db`.
- Simple POST mutations (trips/days/places/hotels/transport/expenses/notes):
  neon-http `db`, single `INSERT ... returning`, **no interactive transaction**.
- `trips/import`: `dbNode` (postgres-js/TCP) **interactive transaction** — the
  only endpoint that can absorb an extra write atomically.

## 4. Design

### 4.1 Marker-in-transaction (import atomicity)

Write the completion **inside** `importPlan`'s `dbNode` transaction as a
*marker*, so trip + completion commit as one unit.

1. **In-tx marker.** After the trip/day/place/hotel inserts, and only when an
   idempotency key is present, `importPlan` calls a caller-supplied
   `recordCompletion(tx, tripId)` hook. The hook writes the completion row via
   the **same `tx`**: `statusCode = 201`,
   `responseJson = { __idem: true, tripId }`. Committing the tx commits the
   marker; rolling back removes it. *The marker is the durable source of truth
   for "this key created this trip."*

2. **Post-commit read-back + best-effort upgrade.** After the tx commits, the
   route does the normal `loadApiTrip(id)` on neon-http (untouched), builds
   `{ trip }`, returns `201`, and **best-effort** UPDATEs the marker row's
   `responseJson` to the full body. This upgrade is a cache optimization only;
   if it fails (crash, transient error) nothing breaks — replay re-renders.

3. **Marker-aware replay.** When a retry finds a *completed* import row:
   - `responseJson` is the full body → return it as-is.
   - `responseJson` is a marker (`__idem === true`) → re-render:
     `{ trip: await loadApiTrip(marker.tripId) }` at the stored status. The
     read-back is idempotent, so concurrent replays are safe.

   A duplicate trip is now **impossible**: the marker exists **iff** the trip
   committed, and replay never re-runs `importPlan`.

Failure re-analysis for import:
- Read-back throws post-commit → the *marker is already committed*, so the retry
  hits the replay path and re-renders. No duplicate. (This request still returns
  its 500 to the caller; the retry succeeds.)
- Crash between commit and response → marker committed → retry replays. No
  duplicate, no wedged key.
- `importPlan` tx rolls back (bad data mid-tx) → no trip, no marker → claim
  still pending → released by the route's catch → clean retry. No orphan.

### 4.2 TTL takeover (all endpoints)

On a **claim conflict** (someone holds the key), inspect the existing row:

- Completed (`statusCode > 0`) → replay as today (fingerprint-checked).
- Pending (`statusCode === 0`) **and** `createdAt` older than `CLAIM_TTL_MS`
  (**60_000 ms**, comfortably above p99 latency) → the owner is presumed dead:
  DELETE the stale pending row (guarded on `statusCode = 0` so a row completed
  in the race is never dropped) and **re-attempt the claim**. If the re-claim
  wins, proceed as owner; if it loses (another retry beat us), fall back to the
  normal conflict handling.
- Pending and within TTL → 409 "in progress" as today.

`createdAt` already exists on `api_idempotency_key` — **no migration**. TTL is a
module constant (`CLAIM_TTL_MS`), overridable via env for tests if convenient.

Residual for the simple endpoints: their completion is still a second neon-http
write, so a crash in the gap can still re-run a single INSERT — but only after
the TTL, i.e. a *delayed* retry rather than an *immediate* duplicate. Accepted
per §2 non-goals.

### 4.3 Refactor shape (general-ready seam)

Extract two building blocks in `idempotency.ts`; keep `withIdempotency`'s public
API and reimplement it on them:

- `claimKey(userId, req, body)` → resolves to one of:
  - `{ proceed: 'nokey' }` — no `Idempotency-Key`; caller runs unguarded.
  - `{ proceed: true, key, fp }` — we own a fresh claim (incl. after TTL takeover).
  - `{ proceed: false, response }` — a ready `NextResponse`: a completed replay,
    a fingerprint-mismatch 409, or an in-progress 409.
  Encapsulates claim insert, conflict lookup, fingerprint check, and TTL takeover.
- `persistCompletion(exec, userId, key, fp, status, json)` — writes/UPSERTs the
  completion row via **any** drizzle executor (`db` **or** a `dbNode` tx). This
  is the one primitive that can run inside a transaction.
- `releaseClaim(userId, key)` — unchanged (guarded on `statusCode = 0`).

`withIdempotency(userId, req, body, produce)` (public, used by simple endpoints,
**signature unchanged**) becomes: `claimKey` → on `proceed:false` return the
response → run `produce()` → on 2xx `persistCompletion(db, …)` else
`releaseClaim` → on throw `releaseClaim` + rethrow. The simple endpoints get TTL
takeover for free and require **no route edits**.

`trips/import/route.ts` composes the blocks directly (the one atomic case):

```
withUser(req, async (userId) => {
  const body = await readJsonBody(req);
  const c = await claimKey(userId, req, body);
  if (c.proceed === false) {
    // marker-aware replay: if the stored json is a marker, re-render from tripId
    return renderImportReplay(c.response);   // identity for a full-body row
  }
  const plan = parseImportPlan(body);        // 400 → thrown/returned → release below
  try {
    const { id } = await importPlan(userId, plan, {
      recordCompletion: c.proceed === true
        ? (tx, tripId) => persistCompletion(tx, userId, c.key, c.fp, 201, marker(tripId))
        : undefined,
    });
    const full = { trip: await loadApiTrip(id) };
    if (c.proceed === true) await upgradeCompletion(userId, c.key, full).catch(() => {});
    return apiJson(full, 201);
  } catch (err) {
    if (c.proceed === true) await releaseClaim(userId, c.key);
    throw err;
  }
});
```

Note: marker-aware replay needs the raw completed row, not a pre-baked
`NextResponse`. Implementation detail for the plan: either `claimKey` returns the
completed row alongside the response, or exposes a small `replayCompleted` helper
the import route calls. The plan picks the cleanest of the two; the contract
above (proceed / replay / render-from-marker) is what matters.

## 5. Data model

No migration. Reuse `api_idempotency_key` as-is:
- `statusCode = 0` pending, `> 0` completed (unchanged).
- `responseJson` holds either the full response body **or** a marker
  `{ __idem: true, tripId }` (new shape, import only). `__idem` is the
  discriminator; simple endpoints never write a marker.
- `createdAt` drives TTL takeover.

## 6. Error handling

- Bad import payload (400) → no tx, no marker, claim released → clean retry.
- Read-back failure post-commit → 500 to this caller; marker committed → retry
  replays successfully.
- Fingerprint reuse → 409 (unchanged).
- In-progress within TTL → 409 (unchanged). Past TTL → takeover.
- `persistCompletion` inside the tx failing → the whole `importPlan` tx rolls
  back (no trip, no marker) → treated as a failed mutation → release → retry.

## 7. Testing

Unit / integration (Node runtime, migrated DB — matches API-IMPORT's harness):
1. **Happy path** — import with a key returns 201; row completed; a byte-identical
   retry replays the same body and creates **no** second trip.
2. **Atomic marker** — after `importPlan` commits, the completion row exists with
   `statusCode 201` in the *same* transaction (assert via a tx-abort test: force
   the hook path and confirm marker+trip both absent on rollback, both present on
   commit).
3. **Read-back-fails-then-retry (the reported bug)** — stub `loadApiTrip` to throw
   on first call; first request 500s; retry with the same key returns 201 from the
   marker and total trip count stays 1 (**no duplicate**). This test must fail on
   the current code and pass after.
4. **Marker → full-body upgrade** — after a successful import, the stored
   `responseJson` is the full body (not the marker); replay returns it without a
   read-back.
5. **Marker replay when upgrade skipped** — leave the row as a marker; replay
   re-renders via `loadApiTrip` and returns the full trip.
6. **TTL takeover** — insert a pending row with `createdAt` older than the TTL;
   a new request with that key takes over and succeeds. A pending row *within*
   the TTL still returns 409 "in progress".
7. **Fingerprint reuse** — same key, different body → 409 (regression).
8. **Simple-endpoint parity** — an existing `withIdempotency` test (e.g. trips or
   places create + retry) still passes unchanged, proving the refactor preserved
   behavior and wired TTL takeover without breaking replay.

Plus the existing suite green (`tsc`, `eslint`, `next build`) and a manual E2E:
create + idempotent retry + simulated read-back failure + retry (no dup) + 409
paths.

## 8. Blast radius

- `src/lib/api/idempotency.ts` — refactor into `claimKey` + `persistCompletion`
  (+ TTL takeover); `withIdempotency` reimplemented, signature unchanged.
- `src/lib/services/import-service.ts` — add optional `recordCompletion(tx, tripId)`
  hook invoked inside the existing tx (default undefined → today's behavior).
- `src/app/api/v1/trips/import/route.ts` — compose `claimKey` + hook + post-commit
  upgrade + marker-aware replay.
- Untouched: `loadTrip`, `loadHotelsForTrip`, `loadApiTrip`, all web paths, all
  simple `/api/v1` POST route files, DB schema.

## 9. Rollout

Single PR on `t3code/api-idem-atomic`. TDD task-by-task. No migration, no env
change required (TTL is a constant). Board: `vgFORU9ZUPok` → Doing → Review with
the PR linked.
