# TP-0149: approximate leg distance and time (haversine), plus the `long_drive_day` warning

Ticket TP-0149 (AAUX2, low). The 2026-11-04 decision is binding:
- **Do:**
  - `estDistanceKm` and `estDurationMin` per leg.
  - The `long_drive_day` warning.
  - No new Google cost.
- **Don't:** `closed_on_day` and `after_closing`. They need trustworthy opening hours, which
  belong in a separate ticket.

## Design note: what data is used and why it costs nothing

- **Inputs** are only what is already stored or sent: place and hotel `lat`/`lng`, the leg
  `mode`, and the agent's `durationMin`. There is no Routes, Directions or Places call
  (decision #24, `REQUIREMENTS.md:298`).
- **Distance:** `metersBetween` (haversine, `lib/map-preview.ts`) × a detour factor per mode.
- **Duration:** the estimated distance ÷ a flat speed per mode.
- These are rough figures, so the API names them `est*`. The 2026-11-03 transit-hint plan B
  (`~3.2 km`) can reuse the same function.

| mode | detour | speed | estDurationMin |
|---|---|---|---|
| drive | 1.3 | 45 km/h (mixed city and highway) | ✔ |
| walk | 1.2 | 4.5 km/h | ✔ |
| transit | 1.3 | — | `null`: timetables and waiting cannot be estimated (plan B) |

- Rounding: `estDistanceKm` to 1 decimal; `estDurationMin` to a whole minute, with a minimum of 1.
- If either end has no coordinates, both fields are `null`.

## API changes (additive)

- `place.arrive` (`GET /trips/:id`, and the import and dryRun preview) gains `estDistanceKm` and
  `estDurationMin`. Both are read-only, and sending them in `arrive` does nothing: `readArrive`
  ignores unknown keys. This needs a check during implementation.
  - **Places j ≥ 1:** the leg runs from place j−1 to place j.
  - **Place 0:** the leg runs from the day's begin hotel (`splitHotelsForDay(hotels,
    dateIso).beginHotels[0]`) to place 0. It is only computed when `arrive` is not null and the
    hotel has coordinates; otherwise both fields are `null`.
- `arrive: null` stays `null`. No new object is invented.
- The `?status=` filter on GET runs after this step, so estimates always describe the real
  neighbour in the full order. That is correct, because the leg follows the day's real order.

## The `long_drive_day` warning (import and dryRun)

- **Per day, sum the minutes of every leg whose mode is `drive`.** A leg uses `durationMin` when
  it is set, else `estDurationMin`. The legs are:
  - the start leg, from the begin hotel to place 0, when the day has a start arrive;
  - every leg between places;
  - the leg from the last place to the end hotel (`endHotels[0]`). Its mode is
    `hotel.arrivalMode ?? 'drive'`, matching the UI's hotel leg default.
- **If the total is over 240 min**, emit
  `{ code: 'long_drive_day', path: '/days/<i>', message: 'About 6 h 10 min of driving on this day (over 4 h). Check the plan is realistic.' }`.
- Legs whose duration is unknown, or whose ends lack coordinates, are skipped, so the total is a
  floor.
- TP-0144 (`finalizeImportWarnings`) groups the warning under `/days/<i>` with
  `night_without_hotel`.
- **Placement:** `collectLegWarnings` already walks the days with hotels.
- **Not on GET:** warnings are an import concept. Agents can sum `est*` themselves.

## Out of scope

- **A UI "~" display.** The decision lists only the API and the warning. The leg bar UI the
  user just approved shows only stored values. Adding estimates to it would need its own
  mockup, and is noted as a follow-up.
- `closed_on_day` and `after_closing`.

## Files

- New `app/src/lib/leg-estimate.ts`: `LEG_EST`, `estimateLeg(a, b, mode)`, and
  `driveMinutesForDay(...)`. Pure.
- `app/src/lib/trip-queries.ts`: `loadApiTrip` adds the estimates after `legDayView`, using the
  loaded `hotels`.
- `app/src/lib/api/import-orchestrator.ts`: `buildImportPreview` adds the same, using the plan
  hotels.
- To avoid two code paths, one helper `withLegEstimates(day, hotels)` works on the API day shape
  (`dateIso`, `start`, `places[].{lat,lng,arrive}`).
- `app/src/lib/api/leg-warnings.ts`: `long_drive_day`, added to `LegWarningCode`.
- SKILL.md §7 (codes table, place fields) and API.md: document `est*` and `long_drive_day`.

## Tests

- **`leg-estimate.test.ts`:**
  - Pin the known distance between two points.
  - Factors per mode.
  - Transit has no duration.
  - Missing coordinates give `null`.
  - Rounding.
- **`withLegEstimates`:**
  - j ≥ 1 legs.
  - Start leg from the begin hotel.
  - No hotel, or `arrive` null, gives `null`.
- **`leg-warnings.test.ts`, `long_drive_day`:**
  - Over the threshold → warning.
  - At or under the threshold → no warning.
  - `durationMin` overrides the estimate.
  - Walk and transit legs are not counted.
  - The end-hotel leg is counted.
- **Import orchestrator dryRun:** the preview `arrive` carries `est*`.
- No integration test is needed: no DB write path changes, and `loadApiTrip` is a pure map over
  loaded rows. The `withLegEstimates` unit test covers it.
- No e2e (batch rule).
