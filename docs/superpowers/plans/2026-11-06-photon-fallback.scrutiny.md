# Scrutiny: TP-0151 plan

**Intent:** in keyless mode, stop reporting "not found" for places Photon failed to answer, and stop
causing those failures with 5 concurrent requests.

**Simpler alternatives:**
- *Only raising the timeout:* this does not fix the 503s, which come from concurrency.
- *Only mapping errors to `lookup_skipped`:* honest, but every concurrent burst still loses 4 of 8 lookups.

The two fixes are complementary and each is about 20 lines, so the plan keeps both.

**Trace:**
- `applyPlaceLink` → `lookup` (`place-link.ts:136`) → `search()` (`:166`) → `searchPlaces` with `skipGoogle: true` → Geoapify (only if a key is set) → Photon (`search.ts:113`).
- The `'skipped'` result already maps to `lookup_skipped`.
- The geocode cache (`budget.geocodeCache`) stores the pending promise.
  - **Finding:** a thrown error needs `lookup` to catch it **inside** the promise it caches. Otherwise the shared promise rejects for every awaiting place, and `Promise.all` workers crash the import as a 500.
  - **Fix:** `lookup` returns `'skipped'` from a try/catch around `search`, so the cached promise never rejects.
- The gate is per process. A serverless instance handles its own requests; across instances, public Photon still sees parallelism. That is acceptable for dev and self-host.
- The UI autocomplete (`app/api/places/autocomplete/route.ts:25`) is non-strict, so its behaviour is unchanged.

**Verdict:** ship, with the catch placed inside `lookup`.
