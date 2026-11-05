# TP-0144 — Import warnings: one entry per location, 0-based `path`, `name`, `summary`

Ticket: TP-0144 (epic TP-0138, AAUX2). Additive, no breaking change.

## Problem (measured)

`~/development/_scratch/tp-import/dry-resp.json` (E-city first dryRun): 71 warnings.
26 `place_unresolved` + 33 `place_without_coords` + 7 `lookup_skipped` + 5 `coords_approx`.
Each unresolved place shows up twice. Place-link warnings use 1-based `{day, place}`.
Semantic warnings use 0-based `path`. Neither carries the place name.

## Design

One pass at the end of `resolveImport` (`lib/api/import-orchestrator.ts`):
`finalizeImportWarnings(raw, plan)` in `lib/api/import-warnings.ts`.

1. **Path everywhere.** If a warning has no `path` but has `day`/`place` (1-based), set
   `path = /days/{day-1}/places/{place-1}`. `resolvePlanLinks` also sets `path` itself.
   `day`/`place` stay on the warning (deprecated, documented).
2. **Group by entity.** The key is the entity root of `path`, the first match of
   `^/(days/\d+/places/\d+|days/\d+|hotels/\d+|transport/\d+|budget)`, else the whole path.
   Sub-paths (`/days/0/places/0/arrive`, `/transport/2/from`, `/transport/2/fromCode`) therefore
   group with their place or ride, so the response has at most one entry per place, hotel and ride.
   Grouping on the exact path would leave a place with `place_unresolved` plus
   `arrive_without_origin` at two entries.
   - `path`: the entity root.
   - `code`: the first code seen. The merge order is hotel-link → place-link → transport-link →
     semantic → leg, so the root cause (`place_unresolved`, `lookup_skipped`) comes first and
     `place_without_coords` comes second.
   - `codes: string[]` lists every code, in order and de-duplicated. It is always present, even
     with a single code, so agents can read one field.
   - `message`: the first warning's message.
   - `details: [{ code, path, message }]` is present **only when more than one warning merged**.
     It keeps every original warning, with its exact sub-path (e.g. which transport end failed).
   - `day`/`place`: kept from whichever merged warning carries them.
   - Warnings with no `path` (none on import today) pass through unchanged, with
     `codes: [code]`.
   - Order: the position where each entity first appears.
3. **`name`.**
   - Places use `/days/i/places/j…` → `plan.days[i].places[j].name`.
   - Hotels use `/hotels/i…` → `plan.hotels[i].name`, or `area` if there is no name.
   - Transport uses `/transport/i…` → `plan.sections.transport[i].title`.
   - Days use `/days/i` → the day `title` if set.
   - Budget has no name.
   - A name that is already set (leg warnings) is kept.
4. **`summary: { [code]: count }`.** Every code in each entry's `codes` is counted once.
   `place_without_coords` stays visible in the summary even though it no longer has its own entry.
   `summarizeWarnings(ws)` is computed at response time on all three paths: dryRun 200, commit 201,
   and the idempotent replay. It is computed then so that old replay markers (no `codes`) still get
   a summary, with each entry counting as its `code`.

Response: `{ trip, warnings, summary }`.

## Not in scope

- REST place/hotel/transport endpoints. They return warnings for a single object, with no index
  problem.
- Changing `code` values or removing `day`/`place`.

## Files

- `app/src/lib/api/import-warnings.ts`
  - Type: `ImportWarning` gains `codes?`, `details?`, `day?`, `place?`.
  - New: `finalizeImportWarnings`, `summarizeWarnings`.
  - Delete the stale "place_unresolved is not emitted" note; place-link emits it since TP-0140.
- `app/src/lib/api/place-link.ts`: `resolvePlanLinks` adds `path`.
- `app/src/lib/api/import-orchestrator.ts`
  - `resolveImport` returns finalized warnings.
  - All three responses add `summary`.
- `agent-skill/travel-planner-api/SKILL.md` §7 (and §2 response line): new shape, deprecation
  note, `summary`.
- Tests:
  - `import-warnings.test.ts`: path from day/place, grouping (exact + sub-path → root, details only when merged), name, summary, old-marker summary.
  - `place-link.test.ts`: `path` on plan warnings.
  - `import-orchestrator.test.ts`: update the exact-equality assertions and add one for `summary`.

## Verify

- Focused vitest: `import-warnings`, `place-link`, `import-orchestrator`.
- Integration: `import-orchestrator.integration` (asserts warnings on 201 + replay; the commit path
  changes).
- `pnpm typecheck`, `pnpm lint`.
- DoD check: a small script runs `finalizeImportWarnings` against the raw `dry-resp.json` warnings
  plus the `e-city.json` plan names, and asserts at most 1 entry per place path.
- No e2e (batch rule).
