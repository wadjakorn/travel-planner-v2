# API-IDEM: atomic completion for simple `/api/v1` POST endpoints

**Ticket:** `LxG9VRbNmYtp` (Maps epic sibling; API-IDEM follow-up)
**Date:** 2026-07-15
**Status:** approved design, pre-implementation
**Prior art:** PR #31 (API-IDEM), `app/src/lib/api/import-orchestrator.ts`

## Problem

`withIdempotency` (in `app/src/lib/api/idempotency.ts`) runs a simple POST's
mutation on the neon-http `db`, then writes the completion row in a **separate**
statement. Because the two are not atomic, these endpoints leave TTL takeover
**off** (`allowTakeover` defaults false): if the process crashed between the
mutation committing and the completion write, re-running the mutation on takeover
could duplicate the row (the completion write can't roll the committed mutation
back). So a crashed pending claim currently blocks that `Idempotency-Key` with a
409 until the client retries under a fresh key.

Only the import path self-heals crashed claims: `import-orchestrator` writes the
completion **inside the same `dbNode` transaction** as the mutation, scoped to
the claim row id. If a retry took the claim over mid-flight, `persistCompletion`
updates 0 rows → it throws → the whole tx rolls back → no duplicate. That lets
import safely set `allowTakeover: true`.

This ticket brings the same atomicity — and therefore safe `allowTakeover` — to
the 8 simple POST endpoints.

## Scope

**In scope — the 8 simple idempotent POST endpoints and their mutations:**

| Endpoint (`app/src/app/api/v1/...`) | Mutation service | Read-back today |
|---|---|---|
| `trips/route.ts` | `createTrip` → `{id}` | `loadTripBasic(id)` |
| `trips/[tripId]/days/route.ts` | `addDay` → `{id}` | `loadApiDay(id)` |
| `days/[dayId]/places/route.ts` | `addPlace` → `{id}` | `loadApiPlace(id)` |
| `trips/[tripId]/hotels/route.ts` | `createHotel` → hotel | — (returns entity) |
| `trips/[tripId]/transport/route.ts` | `createTransport` → transport | — |
| `trips/[tripId]/expenses/route.ts` | `createExpense` → expense | — |
| `trips/[tripId]/notes/route.ts` | `createNote` → note | — |
| `notes/[noteId]/items/route.ts` | `addChecklistItem` → item | — |

**Out of scope:** the import path (already atomic); non-POST verbs; the
idempotency primitives' existing semantics (`claimKey`, `persistCompletion`,
`releaseClaim`, `CLAIM_TTL_MS`, fingerprinting) — reused as-is.

## Approach (approved: "B — full body in-tx")

Compute the **full response body inside the mutation transaction**, then persist
the completion with that body in the same tx. No marker, no post-commit
read-back, no replay-render, no best-effort upgrade. Replay simply returns the
stored body.

Why B over the import-style marker (A): 5 of the 8 mutations already return the
full entity from within the mutation, so their body is available in-tx for free.
Only the 3 `{id}`-returning endpoints need a read-back, and those 3 readers
(`loadTripBasic`, `loadApiDay`, `loadApiPlace`) already exist — they just need to
accept the tx executor. A would instead require 5 **new** `loadXById` readers
plus the marker/replay machinery. B is strictly less code and surface.

### New shared helper

Add `withIdempotencyAtomic` (either in `idempotency.ts` or a sibling
`idempotency-atomic.ts`, following the `import-orchestrator` split) with roughly:

```ts
withIdempotencyAtomic(
  userId: string,
  req: Request,
  body: unknown,
  run: (tx: IdemExecutor) => Promise<{ status: number; body: unknown }>,
  deps?: { idemDb?: IdemExecutor; txDb?: typeof dbNode },
): Promise<NextResponse>
```

Behaviour, mirroring `import-orchestrator` but with the full body (not a marker):

1. `claimKey(userId, req, body, idemDb, { allowTakeover: true })`.
2. `conflict` → return response; `replay` → return stored `{status, body}`;
   `nokey` → run `run(db)` outside any tx and return (parity with
   `withIdempotency`'s nokey branch — no idempotency row, so atomicity is moot).
3. `owned` → `txDb.transaction(async (tx) => { const r = await run(tx); const n =
   await persistCompletion(tx, userId, key, id, r.status, r.body); if (n === 0)
   throw TakeoverError; return r })`.
   - On success (2xx): the mutation + completion committed atomically; return `r`.
   - The claim is arbitrated by `claimKey` on `idemDb` **before** the tx opens
     (step 1) — exactly as `import-orchestrator` does. The claim insert therefore
     stays **outside** the mutation tx; only `persistCompletion` runs inside it.
     So when `run` throws a `ServiceError` (bad input) the tx rolls back but the
     claim row survives, and we must `releaseClaim(userId, key, id, idemDb)` and
     rethrow — matching `withIdempotency`'s non-2xx / throw handling.
4. Non-2xx status returned by `run`: do **not** persist completion; roll back and
   `releaseClaim`, then return the error response (a failed create must not be
   cached as a completed idempotent result — same as `withIdempotency` today).

`persistCompletion`, `releaseClaim`, `claimKey` are reused unchanged; the 0-row
guard in `persistCompletion` is exactly what makes takeover safe here.

### Service transactionalization (executor threading)

Each mutation service gains an optional trailing executor param defaulting to the
current module-level `db`, so existing callers (server actions) are unchanged:

```ts
export async function createTrip(userId, input, exec: IdemExecutor = db) { ... }
```

**All writes within a mutation's atomic boundary must run on `exec`**, not the
module `db` — including nested helpers. Known nested writes to thread:

- `createTrip` → `seedTripDays`, `touchTrip` (and `assertTripWrite` reads).
- Others: audit-row / re-index / `touchTrip` side-writes each service performs
  (enumerate per service during implementation; every `db.insert/update/delete`
  reachable from the mutation must take `exec`).

Reads inside the boundary (access checks, `loadTripBasic` / `loadApiDay` /
`loadApiPlace` read-backs for the 3 id-returning endpoints) also run on `exec`
so they see the uncommitted row and the whole unit is consistent.

Executor type: reuse `IdemExecutor = typeof db | NodeTx` from `idempotency.ts`.
Both neon-http and postgres-js share the Drizzle query API, so the same service
body runs on either driver (as `import-service` already demonstrates).

### Route handler changes

Each of the 8 POST handlers swaps `withIdempotency(...)` for
`withIdempotencyAtomic(...)`, moving the mutation (+ read-back for the 3) into the
`run(tx)` callback and passing `tx` down to the service:

```ts
return withIdempotencyAtomic(userId, req, body, async (tx) => {
  const { id } = await createTrip(userId, input, tx);
  const trip = await loadTripBasic(id, tx);
  return { status: 201, body: { trip } };
});
```

For the 5 entity-returning endpoints, `run` just calls the service on `tx` and
wraps the returned entity — no read-back.

## Correctness / safety argument

- **No duplicates under takeover.** Mutation + completion commit atomically,
  scoped to the claim row id. If a retry takes the claim over while a slow owner
  runs, the owner's in-tx `persistCompletion` hits 0 rows → throws → its mutation
  rolls back. Exactly the guarantee proven for import in PR #31.
- **Crashed claim self-heals.** With `allowTakeover: true`, a pending claim older
  than `CLAIM_TTL_MS` from a crashed owner is taken over by a retry instead of
  blocking the key with a 409. The crashed owner committed nothing (tx never
  reached commit), so the taker's row is the only one.
- **Failed creates aren't cached.** Non-2xx / thrown `ServiceError` rolls back
  and releases the claim; the key is reusable, no completion is stored.
- **Existing callers unaffected.** The executor param defaults to `db`; server
  actions and any non-idempotent callers behave exactly as before.

## Testing

Extend `app/src/lib/api/idempotency.integration.test.ts` (and/or a new
`idempotency-atomic.integration.test.ts`, mirroring
`import-orchestrator.integration.test.ts`):

1. **Happy path** — POST with a key creates one row and stores the completion;
   re-POST with the same key replays the same body, creates no second row.
2. **Concurrent same-key** — two simultaneous claims: one runs, the other 409s
   ("in progress"); exactly one row.
3. **Takeover after crash** — insert a stale pending claim (`createdAt` past
   `CLAIM_TTL_MS`, no committed mutation); a retry takes over, creates exactly
   one row, stores completion.
4. **Takeover mid-flight rolls back the superseded owner** — simulate the owner's
   `persistCompletion` seeing 0 rows (claim deleted): its tx rolls back, no row
   created; the taker's row is the only one. (Direct analogue of the import
   takeover test.)
5. **Bad input** — `ServiceError` from the mutation rolls back, releases the
   claim, returns the 4xx, stores no completion; the key is reusable.
6. Do at least one full pass on a real neon endpoint (`createTrip`) and one on an
   entity-returning endpoint (`createHotel`) to cover both route shapes.

## Rollout / risk

- Low priority, no schema change, no API contract change — response bodies and
  status codes are identical; only the crashed-claim recovery behaviour improves
  (409-until-fresh-key → self-heal after TTL).
- Main risk is an **un-threaded nested write** silently escaping the tx (running
  on module `db` while the rest runs on `tx`), which would break atomicity
  without an obvious error. Mitigation: grep each mutation's call graph for
  `db.` writes and confirm every one is threaded; the mid-flight-rollback test
  (case 4) fails loudly if the completion isn't in the same tx.

## Definition of done

- `withIdempotencyAtomic` helper added, unit/integration tested.
- All 8 mutation services accept an executor and thread it through every nested
  write in their atomic boundary; defaults preserve existing callers.
- All 8 POST handlers use the atomic helper with `allowTakeover` on.
- Integration tests (cases 1–6) pass; typecheck + lint + build clean.
- Ticket `LxG9VRbNmYtp` → completed.
