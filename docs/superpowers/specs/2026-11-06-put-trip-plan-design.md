# TP-0146: `PUT /trips/:tripId/plan`, rearrange a trip's places in one call

Ticket: TP-0146 (epic TP-0138, AAUX2, wave 3). Status: **design v3**, after two scrutiny rounds (`…-design.scrutiny.md`): round 1 "rework", round 2 "fix-then-ship".

**Change history**
- **v2:** fixed day order; a structural in-tx check; explicit write order and parking; merged leg snapshot; `prune` requires a version.
- **v3:** dropped day append, hotels, `trip` fields and `budget` (round 2 N1, N2). Each duplicates a working endpoint and brought most of the new risk. Also adopted the LIS tie-break and live positions (N4), a narrower fingerprint (N6), and single-UPDATE moves with one audit row (N7).

## 1. Problem

- `POST /trips/import` always creates a new trip.
- An agent adjusting a plan today has two options:
  - **Delete and re-import:** every id changes; share links, members, expenses and history are lost.
  - **Make many single calls:** not atomic. Some edits are impossible: **no endpoint or service moves a place to another day**, and reordering needs one call per day.
- MCP `update_plan` (TP-0035) needs one call that applies a diff the user has reviewed.

## 2. Phase 1 scope

**In scope:** one atomic, previewable, version-checked call over the trip's **existing days**:
- **Day fields:** edit `title` and `defaultMode`.
- **Places:**
  - update by `id` (merge-patch, same parser as `PATCH /places/:id`, TP-0145);
  - create without an `id`;
  - **reorder within a day**;
  - **move across days**;
  - delete with `prune`.
- **Legs (`arrive`):** set or clear per place. Existing leg notes follow their place pair.

**Out of scope.** Each of these returns a specific 400, so an agent never assumes it was applied.

| Body | Error | Use instead / why |
|---|---|---|
| `days[]` that is not exactly the current day ids in current order (reorder, omission, a new day without `id`) | `400 day_order_unsupported` | To add a day, call `POST /trips/:id/days` first. Reordering or deleting days forces a choice between dates following content or following position, plus a `dayIdx` remap of expense, transport and hotel (round 1, M1/M2). Phase 2. |
| `days[].date` | `400 unsupported_field` | Dates come from position. |
| `trip`, `budget` | `400 unsupported_section` | Use `PATCH /trips/:id`, which has the `keepTravelers` rule (round 2, N2). |
| `hotels`, `transport`, `expenses`, `notes` | `400 unsupported_section` | Use their CRUD endpoints. These have no positional identity. Phase 2 for transport, expenses and notes. |

**Why this is safe:** no day row is inserted, deleted or re-indexed. Every `dayIdx` reference stays valid, and the trip row is never written except by `touchTrip`.

## 3. Request

```http
PUT /api/v1/trips/:tripId/plan
Idempotency-Key: <uuid>
{
  "ifUpdatedAt": "2026-11-06T03:12:45.120Z",  // trip.updatedAt from GET; REQUIRED when prune:true
  "prune": false,
  "dryRun": false,
  "days": [
    { "id": "d1", "places": [ { "id": "p3" }, { "id": "p1", "time": "10:00" } ] },
    { "id": "d2", "title": "Kyoto", "places": [
        { "id": "p7" },                                    // moved here from d1
        { "kind": "food", "name": "Nishiki", "query": "Nishiki Market Kyoto",
          "arrive": { "mode": "walk", "durationMin": 10 } } ] }
  ]
}
```

### 3.1 Rules

- **`days` is required.** It must list **exactly** the existing day ids, in current order. Otherwise the call returns `400 day_order_unsupported`.
- **A day item:**
  - `{ id, title?, defaultMode?, places? }`.
  - Merge-patch: absent means unchanged. `title` cannot be cleared. `defaultMode: null` clears it.
  - **If `places` is absent, that day's places are untouched**, unless one of them moves to another day (see below).
- **A place with an `id`:**
  - The id must be a place of this trip, otherwise `400 unknown_id` at its body path.
  - It is a merge-patch: absent = unchanged, `null` = clear, via `parsePlacePatch`.
  - `{ "id": … }` alone means "keep it here".
  - `googleMapsUrl` and `query` are accepted. Relocation uses `resolvePlacePatch` (TP-0145): the pin moves only on new location input.
- **A place without an `id`:** created with `parsePlaceFields` plus `googleMapsUrl`/`query`/`near`, as import does.
- **A place missing from a sent `places` array:**
  - With `prune: true`, it is deleted.
  - Otherwise it is kept and appended after the listed places, in its original relative order.
  - A place listed under another day is not "missing"; it moved.
- **`arrive`:**
  - Same tri-state as `PATCH /places`: an object sets it, `null` clears it, absent keeps it.
  - It is the leg *into* that place at its **final** position. On position 0 it is the day's start leg.
- **Duplicates:** any place id listed twice returns `400 duplicate_id`, with both paths.
- **`prune: true` without `ifUpdatedAt`** returns `400 version_required`.

### 3.2 Legs across reorder and moves

Legs are positional rows: `segment.idx = position − 1`, and `day.start_*` holds position 0.

1. Before writing, read `readLegSnapshot` for **every touched day** and **merge them into one map**. A touched day is any day whose place list changes, including the source days of moves. Pair keys are place-id pairs, and start legs are `__start__|placeId`, so the keys are globally unique.
2. After the place writes, for each touched day run `normalizeDayLegs`, then `applyLegRealign(merged)`.
   - Note and duration follow their pair, including a pair that moved together to another day.
   - Mode stays positional, as in `reorderPlaces`.
3. Body `arrive` values are applied last with `applyPlaceArrive`, so they win.

### 3.3 Concurrency

`trip.updatedAt` is not an atomic version:
- leg and place writers bump it after commit;
- `addPlace` and the segment services write it outside a transaction;
- `removeDay` is several autocommits.

1. **Client token.** `ifUpdatedAt` is compared to `trip.updatedAt` (ms) on the pre-read. A mismatch returns `409 conflict` with `details: { updatedAt }`. It is required for `prune`.
2. **Authoritative check, structural and inside the tx.**
   - **Pre-read snapshot.** One `REPEATABLE READ READ ONLY` dbNode tx reads days, places and segments. It must not use the `cache()`-wrapped neon loaders.
   - **Write tx:**
     - Lock the trip with `SELECT … FOR NO KEY UPDATE WHERE id = ? AND deleted_at IS NULL`. Zero rows returns 404.
     - Lock **all** the trip's days with `SELECT … FOR UPDATE ORDER BY idx`. This serialises with every single-day writer, and with non-tx place and segment inserts through FK KEY SHARE.
     - **Fingerprint** (round 2, N6): day `id:idx:title:defaultMode:start_mode:start_note:start_duration_min`; place `id:dayId:idx`; segment `dayId:idx:mode:note:durationMin`. It must equal the pre-read, otherwise `409 conflict` and nothing is written.
   - Place field edits made by others in the meantime are not in the fingerprint. The merge re-reads the row inside the tx (`patchPlace` semantics), so their unsent fields survive.
   - **Day idx must be exactly `0..n-1` in the fingerprint**, otherwise `409`. This catches a `removeDay` that is half done (round 2, N1).
3. **Error mapping.** `40P01`, `40001` and `23505` map to `409 conflict`. The agent retries after a fresh GET.
4. The response carries the new `trip.updatedAt`.

### 3.4 Idempotency

- Same as import: `claimKey`, with the marker `{ __idem, tripId, diff, warnings }` written in the tx.
- `dryRun` never claims a key.
- A `409` or any 4xx **releases the claim**.
- A replay returns the marker's diff and warnings plus the *current* trip.

## 4. Response

- On commit: `200 { trip, diff, warnings, summary }`.
  - `trip` is the `GET /trips/:id` shape.
  - `warnings` and `summary` use the TP-0144 shape, with paths into the request body.
  - Only created or relocated places are link-resolved and warned about. This adds `transit_as_place` and `long_drive_day` where they apply.
- `dryRun: true` returns `200 { trip: null, diff, warnings, summary }` and writes nothing.

```jsonc
"diff": {
  "days":   { "updated": [{ "id": "d2", "fields": ["title"] }] },
  "places": { "created": [{ "path": "/days/1/places/1", "name": "Nishiki" }],
              "updated": [{ "id": "p1", "fields": ["time"] }],
              "moved":   [{ "id": "p7", "fromDay": "d1", "from": 2, "toDay": "d2", "to": 0 },
                          { "id": "p3", "fromDay": "d1", "from": 1, "toDay": "d1", "to": 0 }],
              "deleted": [{ "id": "p9", "name": "Fushimi" }] },
  "legs":   { "updated": [{ "path": "/days/1/places/1", "fields": ["arrive"] }] }
}
```

- **`updated.fields`** lists only keys whose stored value actually changes.
- **`from` and `to` are live positions** (0-based in the day's live order), not raw `idx`.
- **`moved`** (round 2, N4):
  - every place whose day changes;
  - plus, per day, the kept places that are **not** in the longest increasing subsequence of their old positions.
  - Ties are broken toward the subsequence that **keeps the earliest old positions**, which is deterministic.
  - Example: old `[p1, p3]` → new `[p3, p1]`: the LIS keeps `p1` (old position 0), so `p3` is the one that moved.
  - Places that only slide because of inserts or deletes are not listed.
- **An empty diff** from a dryRun confirms the agent's copy is current.

## 5. Side effects

- **Prune.** A pruned place is deleted as `removePlace` does it, and legs are realigned (§3.2).
- **Expenses are unaffected:** they have no place FK, only `dayIdx`. This answers the design question "what happens to an expense tied to a pruned place?"
- **Days** are never created, deleted or re-indexed, so `dayIdx` stays valid.
- **Follow-up tickets filed with this design:**
  - **`removeDay` safety:** wrap it in a dbNode tx with days locked `ORDER BY idx` (round 2, N3), and shift `dayIdx` on expense, transport and hotel (a latent bug).
  - **PUT phase 2:** day reorder and delete (decide the dates rule and the remap), plus transport, expenses and notes.

## 6. Pipeline

```mermaid
sequenceDiagram
  participant A as Agent
  participant R as PUT route
  participant S as plan-update service
  participant L as link resolvers
  participant DB as Postgres
  A->>R: body
  R->>S: parsePlanUpdate(body) — pure: shape, sections, duplicate ids → 400
  S->>DB: readPlanSnapshot (REPEATABLE READ RO tx, write access)
  S->>S: ifUpdatedAt → 409 · day order / unknown ids → 400
  S->>S: computePlanDiff(snapshot, parsed) — pure → ops + diff
  S->>L: resolve created places; resolvePlacePatch for updated (one LinkBudget)
  S-->>A: dryRun → { diff, warnings, summary }
  S->>DB: tx: lock trip (NO KEY UPDATE) → lock all days ORDER BY idx → fingerprint == snapshot, idx = 0..n-1? else 409
  S->>DB: apply ops (§7) + marker + touchTrip + 1 audit row
  R-->>A: 200 { trip, diff, warnings, summary }
```

## 7. Write order inside the tx

1. Lock and check (§3.3 step 2).
2. Merge the leg snapshots of every touched day (§3.2).
3. Day fields: update `title` and `defaultMode`.
4. Places:
   1. **Park** every place of every touched day: `UPDATE place SET idx = -(idx + 1)` per day. This is collision-free (`compactPlaces`).
   2. Moves and reorders: **one `UPDATE` per place sets both `day_id` and final `idx`** (round 2, N7). Unlisted kept places are appended.
   3. Insert the created places at their final `idx`.
   4. Delete the pruned places.
   5. Field merges: re-read the row in the tx, merge the patch, then `updatePlace(…, { deferTouch: true, audit: false })`. `updatePlace` gains `audit: false` so PUT writes one audit row.
5. Legs: for each touched day, `normalizeDayLegs` → `applyLegRealign(merged)`, then `applyPlaceArrive` for each body `arrive`.
6. Idempotency marker; `touchTrip`; one audit row `{ action: 'plan_update', entityType: 'trip', after: counts }`.

## 8. Modules

- `lib/api/plan-update-input.ts`: `parsePlanUpdate`. Pure.
- `lib/services/plan-snapshot.ts`: `readPlanSnapshot`, `planFingerprint`.
- `lib/services/plan-diff.ts`: `computePlanDiff` → `{ ops, diff }`. Pure, including the LIS.
- `lib/services/plan-update.ts`: `applyPlanOps(tx, ops)`, following §7.
- `lib/api/plan-update-orchestrator.ts`: version and fingerprint checks, resolution, dryRun, idempotency, error mapping.
- `app/api/v1/trips/[tripId]/plan/route.ts`: `PUT`.

## 9. Tests (DoD)

**Unit** (`plan-update-input`, `plan-diff`):
- Shape: duplicate and unknown ids, `day_order_unsupported` (reorder, omit, new), `unsupported_field` / `unsupported_section`, `version_required`.
- Update vs no-op: `fields` only lists real changes.
- Create; prune vs keep-and-append; in-day reorder; cross-day move.
- LIS tie-break, including the §4 example.

**Integration** (`tp-test-pg`):
- update, create, prune, reorder, cross-day move;
- a pair that moves together keeps its leg note;
- a body `arrive` wins;
- `409` when `ifUpdatedAt` does not match;
- `409` on a structural change between snapshot and tx (simulate a reorder in between);
- idempotent replay, and the claim is released after a 409;
- dryRun writes nothing.

**Docs:**
- SKILL.md: an "Edit an existing trip" flow: GET → edit → PUT `dryRun` → show the user → PUT with `ifUpdatedAt`. List the phase-1 limits and what to use instead.
- API.md: the endpoint row.

## 10. Decisions

| Question | Decision |
|---|---|
| Does a moved day keep its id? | Phase 1 never moves days. Phase 2 must decide whether dates follow content or position, and the `dayIdx` remap. |
| What happens to an expense tied to a pruned place? | It cannot happen. Expenses reference only a day position, and phase 1 never changes days. |
| Version token? | `ifUpdatedAt`, required with `prune`, plus the authoritative in-tx fingerprint. No new column. |
| Full replace or merge? | Merge-patch, the same as TP-0145. |
| Trip fields, budget, hotels, new days? | Use their existing endpoints. A `400` names the replacement. |
