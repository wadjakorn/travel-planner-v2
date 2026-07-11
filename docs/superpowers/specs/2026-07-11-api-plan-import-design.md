# API Plan Import — Design (MVP)

**Date:** 2026-07-11
**Ticket:** `ShULpTKuaROd` [API-IMPORT] · **Epic:** `qdIoykC3QCeO` (API v1 hardening & expansion)
**Status:** Approved (brainstorm 2026-07-11), pending implementation plan.

## 1. Purpose

The public `/api/v1` REST API today is a granular CRUD surface (trips → days →
places, plus hotels/transport/expenses/notes). The **real** product intent is
narrower: let a user's **AI agent build a whole travel plan and drop it into the
app in one call**, after which the human fine-tunes everything in the app UI.

This spec adds a single coarse-grained **plan import** endpoint tuned for that
flow. The granular endpoints stay in the codebase but are demoted to "advanced"
in the agent-facing docs. Full agent-driven CRUD is deferred (decide later).

## 2. Goals / non-goals

**Goals (MVP)**
- One call that creates a complete trip from an agent-authored plan.
- One call to read the whole plan back (for hand-off / rendering).
- Import **days + places + hotels**. Google Place IDs carried as a reference.
- All-or-nothing: a malformed payload creates nothing.

**Non-goals (deferred)**
- Transport, expenses, notes, checklists in the import payload.
- Importing into / replacing an existing trip (import always creates new).
- Server-side resolution of Google Place IDs (no Google calls at import).
- Travel segments (drive/walk legs) at import time.
- Per-entity agent CRUD as the primary flow.

## 3. API surface

### 3.1 `POST /api/v1/trips/import` (new)

Creates a new trip owned by the token's user and returns the full created plan.

- **Auth:** bearer token, **read-write** scope (enforced by the existing
  `withUser`). Per-token rate limit applies. `Idempotency-Key` supported.
- **Runtime:** Node.js (default). Must **not** be an Edge route — it uses the
  TCP `dbNode` client for a real transaction (see §5).

**Request body**

```jsonc
{
  "trip": {
    "title": "Kyoto Autumn",          // required, non-empty
    "subtitle": "5 days",             // optional
    "startDate": "2026-11-01",        // optional, ISO YYYY-MM-DD
    "endDate": "2026-11-05",          // optional, ISO YYYY-MM-DD
    "cover": "https://…"              // optional
  },
  "days": [                            // optional; ordered
    {
      "date": "2026-11-01",           // optional, ISO; used to label the day
      "places": [                      // optional; ordered
        {
          "kind": "food",              // required: hotel|food|sight|transit
          "name": "Nishiki Market",    // required
          "lat": 35.005, "lng": 135.764, // recommended (renders on map)
          "placeIdExternal": "ChIJ…",  // optional, stored as reference
          "time": "10:00", "note": "…" // any other place field (see §4)
        }
      ]
    }
  ],
  "hotels": [                          // optional
    {
      "name": "Hotel Granvia",         // required
      "checkInDate": "2026-11-01", "checkOutDate": "2026-11-05",
      "address": "…", "lat": 34.98, "lng": 135.75,
      "placeIdExternal": "ChIJ…",
      "costAmount": 50000, "costCurrency": "JPY",
      "dayIdx": 0                      // optional: which imported day the check-in pairs with
    }
  ]
}
```

At least a valid `trip.title` is required. `days` and `hotels` may be empty or
omitted (a bare trip is valid).

**Response** `201 { "trip": { … } }` — the full created plan read back, with
the same nested shape as `GET /api/v1/trips/:tripId` (§3.2): `days[] →
places[]`, plus `hotels[]`. The agent gets all generated IDs.

**Errors:** `400 bad_request` (invalid/oversized payload — nothing written),
`401 unauthorized`, `403 forbidden` (read-only token), `409 conflict`
(idempotency-key reuse with a different/in-flight request), `429 rate_limited`,
`500 internal`.

### 3.2 `GET /api/v1/trips/:tripId` (extended, additive)

Currently returns `{ trip }` with nested `days[] → places[]/segments[]`. Extend
the response to also include `hotels[]` so a single GET returns the whole plan
(keeps the "1–2 API" promise for agents). Purely additive — no field removed or
renamed. The same loader powers the import response.

## 4. Field mapping & validation

- **Places:** reuse `parsePlaceFields` (`src/lib/api/place-input.ts`) unchanged
  — `kind` and `name` required; numeric/string coercion; `placeIdExternal`
  passed through. This guarantees the import validates places identically to
  `POST /days/:dayId/places`.
- **Hotels:** add `parseHotelFields` (`src/lib/api/hotel-input.ts`), mirroring
  the place parser, mapping JSON → the `HotelInput` that
  `booking-service.createHotel` already takes (`name` required; dates/address/
  lat/lng/cost/etc. optional; `placeIdExternal` and `dayIdx` passed through).
- **Trip:** `title` required (same rule as `createTrip`: non-empty); dates, if
  present, must be ISO `YYYY-MM-DD`.
- **Day labelling (NOT-NULL `label`/`num`/`date`/`title`):** these are derived,
  never required from the agent. For day at index `i`, the effective date is
  `day.date ?? (trip.startDate + i days, if startDate present) ?? null`. If an
  effective date exists, derive `label`/`num`/`date` from it via the shared
  helper (§5) and set `title = "Day {i+1}"`. If none, fall back to
  `label = "Day"`, `num = i+1`, `date = "Day {i+1}"`, `title = "Day {i+1}"`.
- **Empty `days` with a date range:** if `days` is omitted/empty **and** both
  `trip.startDate` and `trip.endDate` are present, seed the day skeleton from
  the range (same derivation) so a dated trip still gets its days — matching
  normal trip creation. If `days` is provided, it is used verbatim and no
  auto-seeding happens.
- **Caps (reject with `400` before any write):** `days ≤ 60`,
  `places per day ≤ 100`, `hotels ≤ 50`. Tunable constants. Prevents a single
  request from creating an unbounded plan (the rate limiter bounds request
  *rate*, not payload *size*).

## 5. Atomicity — the key architecture decision

**Constraint:** the default `db` client is `drizzle-orm/neon-http`, which does
**not** support interactive multi-statement transactions (only single-shot
`batch`, which can't thread generated IDs — trip → day → place). The repo has
**no** existing `db.transaction()` usage.

**Decision:** the import runs inside a single **`dbNode` (postgres-js / TCP)
transaction** via a new dedicated service, `importPlan`
(`src/lib/services/import-service.ts`):

```
dbNode.transaction(async (tx) => {
  insert trip
  for each payload day: insert day row (idx in order; label/num/date/title
      derived from `date` via the pure helpers in seed-days.ts, or "Day N"
      when no date)
  for each place in a day: insert place row (dayId, idx in order)
  for each hotel: insert hotel row (tripId, dayIdx)
})
```

- Any failure rolls the whole thing back → clean `400`, no orphan trip.
- Inserts are done directly against the schema **within `tx`** (the per-entity
  services close over the module-level neon `db`, so they are not reused inside
  the transaction). Field parsing/derivation helpers *are* reused, so validation
  stays single-sourced.
- No travel segments are created (MVP exclusion; the app computes them when the
  human edits the plan).
- Refactor: extract the pure day-field derivation (`partsForDate` / date → `{
  label, num, dateLabel }`) from `seed-days.ts` into a reusable helper so both
  the seeder and the import build day rows the same way. No behavior change to
  the seeder.

**Rejected alternative:** best-effort inserts with the neon `db`, soft-deleting
the trip if a later step fails. Simpler, but a crash between steps leaves an
orphan/partial trip and the cleanup is racy. Not worth it for a security- and
data-integrity-sensitive write.

**Composition with existing plumbing:**
- `withUser` runs bearer auth + rate limit via neon `db` (unchanged).
- `withIdempotency` claims/stores the key via neon `db` (unchanged); the import
  transaction runs *inside* the wrapped handler. Two drivers in one request
  (neon-http for auth/rate-limit/idempotency, `dbNode` for the atomic write)
  both target the same Postgres — acceptable and isolated.
- Read-back after commit uses the same nested loader as `GET /trips/:tripId`.

## 6. New / changed files

| File | Change |
|------|--------|
| `src/app/api/v1/trips/import/route.ts` | **new** — POST handler: `withUser` → `withIdempotency` → parse → `importPlan` → read-back → `201 { trip }` |
| `src/lib/services/import-service.ts` | **new** — `importPlan(userId, payload)` in one `dbNode` transaction |
| `src/lib/api/import-input.ts` | **new** — parse/validate the top-level payload + caps; reuses `parsePlaceFields` + `parseHotelFields` |
| `src/lib/api/hotel-input.ts` | **new** — `parseHotelFields` (JSON → `HotelInput`) |
| `src/lib/seed-days.ts` | **edit** — extract pure day-field derivation for reuse (no behavior change) |
| `src/app/api/v1/trips/[tripId]/route.ts` | **edit** — include `hotels[]` in the nested response (additive) |
| `API.md`, `agent-skill/travel-planner-api/SKILL.md` | **edit** — lead with "Import a plan"; demote granular CRUD to advanced; document the import endpoint + extended GET |
| `REQUIREMENTS.md` | **edit** — note the import endpoint in the API surface section |
| tests | **new** — see §7 |

## 7. Testing plan (vitest, added in the rate-limit PR)

**Unit** (`import-input.test.ts`, no DB): title required; place/hotel field
mapping; cap enforcement (61 days → 400, 101 places in a day → 400); empty
days/hotels allowed; bad `kind` → 400.

**Integration** (`import-service.integration.test.ts`, skipped unless
`TEST_DATABASE_URL` — same pattern as `rate-limit.integration.test.ts`):
- happy path — a full payload creates the trip, ordered days, ordered places,
  and hotels; returns generated IDs;
- **rollback** — a payload whose 2nd place is invalid writes **nothing** (no
  trip, no days) — proves the transaction;
- ordering — `days[i].idx == i`, places within a day preserve payload order;
- idempotent retry — same `Idempotency-Key` returns the first trip, does not
  create a second (exercised at the route level or documented as covered by the
  existing idempotency path).

**Whole suite green** via `pnpm test` (unit only) and with `TEST_DATABASE_URL`
(unit + integration). `typecheck` + `lint` + `build` clean.

## 8. Error contract

Same `{ "error", "message" }` envelope as the rest of `/api/v1`. Import-specific
`400` messages name the offending field/cap (e.g. `"days" exceeds the limit of
60`, `day 2 place 3: "name" is required`). Nothing is written on any `400`.

## 9. Out of scope / future

- Transport / expenses / notes / checklist in the payload.
- Import-into-existing-trip / re-sync (replace semantics).
- Google Place ID → details resolution at import (ties into the Maps epic:
  shared `place_cache`, deferred paid Details).
- Segment (travel-leg) generation at import.
- Making the per-entity services transaction-aware (only needed if more
  multi-entity atomic writes appear later).
