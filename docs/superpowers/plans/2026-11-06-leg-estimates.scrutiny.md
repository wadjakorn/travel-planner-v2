# Scrutiny: TP-0149 plan

**Intent:** give agents an approximate distance and time for each leg, and flag days with too
much driving, with no new Google cost.

**Simpler alternative considered:** only add the warning, and do not expose `est*`.
- The decision explicitly asks for `est*`, and the transit-hint plan B reuses it.
- Computing it is a single pure function, so the extra surface is a few fields.
- **Keep the plan.**

## Trace

- `parseArrive` (`lib/api/arrive-input.ts:16-44`) builds `{ mode, durationMin, note }` from
  explicit keys. When an agent echoes a GET `arrive` back, `estDistanceKm` and `estDurationMin`
  are **dropped**, not stored. ✔
- `loadApiTrip` is called only from the API: `GET /trips/:id`
  (`app/api/v1/trips/[tripId]/route.ts:40`) and the import orchestrator's commit and replay.
  - No UI reads it, so there is no UI regression.
  - `summarizeTripStatus` filters afterwards. ✔
- `POST`/`PATCH` place responses build `arrive` through `readArriveView`, which has no `est*`.
  - **Inconsistency (minor):** fetching neighbours there would cost an extra query per write.
  - Ruling: document that `est*` appears on GET and on import/dryRun only.
- The import preview's `arrives` come from `importLegRows`, which defaults a missing leg to
  `drive`, so the preview's estimates match what GET returns after commit. ✔
- The begin/end hotel comes from `splitHotelsForDay` (`lib/day-augment.ts:49`).
  - It requires both `checkInDate` and `checkOutDate`.
  - A tbd hotel without dates contributes no leg, which is consistent with the UI. ✔
- The `long_drive_day` path `/days/<i>` groups with `night_without_hotel` once TP-0144 merges.
  They are independent PRs; the shapes are compatible either way. ✔

## Risks

- The flat 45 km/h is crude for highway-heavy days (Shikoku-type drives).
- The warning threshold is only a floor (legs with unknown duration are skipped). False
  positives come only from short urban hops, where 45 km/h underestimates the time, and that
  pushes the total down. **Acceptable for a hint.**

**Verdict:** ship. Fold the "est on GET/import only" note into the docs.
