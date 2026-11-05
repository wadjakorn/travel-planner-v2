# Scrutiny — TP-0144 plan

**Intent.** Every warning in an import or dryRun response gets the same locator (a 0-based `path`)
and the entity's `name`. Each place, hotel and ride gets at most one entry, plus a `summary`.

**Simpler alternative considered.** Drop `place_without_coords` when the same place already has
`place_unresolved`, `lookup_skipped` or `url_unresolved`.
- This covers about 90% of the E-city noise: 33 of the 71 entries are duplicates.
- It misses `arrive_without_origin`, which sits at the sub-path `/places/0/arrive`.
- It misses `transit_as_place` plus `flight_without_time` on the same transit stop.
- It misses hotel `lookup_skipped` plus `hotel_without_location`.
- It also hides `place_without_coords` from any count.

Grouping by entity plus `codes` and `summary` costs about 40 more lines and covers every case.
**Keep the plan.**

## Trace

- `POST /api/v1/trips/import` (`route.ts:24`) → `importTripIdempotent`, the only caller of
  `resolveImport`. There is no tsx consumer of import warnings, so there is no UI impact.
- **dryRun** (`import-orchestrator.ts:227`): `resolveImport` → finalized → `{trip, warnings, summary}`. ✔
- **Commit:**
  - `importMarker(tripId, warnings)` persists the *finalized* warnings, so a marker replay returns
    the new shape. ✔
  - `full` is persisted as the best-effort replay body. Add `summary` to it. ✔
- **Replay branch for a non-marker body** (`:247`) returns `responseJson` as-is.
  - A full body persisted **before** this change has no `summary`.
  - **Finding (minor):** the plan says "summary on all three paths", but this branch would not
    have it.
  - **Fix:** when `responseJson.warnings` is an array and `summary` is absent, add
    `summarizeWarnings(...)`. An old marker without `codes` is counted by `code`; the plan
    already covers this.
- **Merge order** (`:205-211`) is hotel-link → place-link → transport-link → collectTripWarnings
  → leg.
  - Within `collectTripWarnings`, hotels and transport are emitted before places.
  - Because grouping keeps first-seen order per entity, `place_unresolved` and `lookup_skipped`
    lead `place_without_coords`. ✔
  - The leg `arrive_without_origin` lands at the end of its place's `details`. ✔

## Contract changes (deliberate)

- An agent counting `code === 'place_without_coords'` entries now gets fewer entries. It should
  use `codes` or `summary` instead.
  - This is the ticket's explicit ask ("ไม่ส่ง warning ซ้ำ").
  - The new behaviour is documented in SKILL §7.
- `path` on place-link entries is new. `day`/`place` are unchanged.

## Tests

- The orchestrator unit tests use `toEqual(warnings)` against raw mocks; they need updating.
- The integration test (`:158`) compares the 201 and replay warnings. Run it.

**Verdict:** ship after folding in the replay-branch summary fix.
