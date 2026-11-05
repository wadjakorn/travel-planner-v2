# TP-0151: keyless Photon fallback (serialize, retry 503, failure ≠ not found)

Ticket: TP-0151, low. This affects only deployments with no Google key and no Geoapify key: local dev and keyless self-hosts.

## Root cause (from the ticket, re-checked in code)
- `lib/places/photon.ts` `photonSearch` calls the public photon.komoot.io with the shared 4 s `withTimeout`.
- Plan and hotel resolves run 5 wide (`PLAN_CONCURRENCY`, `HOTEL_CONCURRENCY`), so Photon returns 503.
- `searchPlaces` (`lib/places/search.ts:113`) does `.catch(() => [])`, so `applyPlaceLink` reports a failure as **`place_unresolved`** ("no match") instead of `lookup_skipped`.

## Change
1. **Serialize Photon per process (`photon.ts`).**
   - A module-level FIFO gate allows one Photon request in flight at a time.
   - Waiting honours `signal`: an aborted waiter rejects and leaves the queue.
   - Public Photon asks for fair use, so serialization is the polite default.
2. **Retry once on 503 or 429**, after 600 ms, abortable. Other statuses are not retried.
3. **Photon gets its own timeout of 6 s.** The shared `withTimeout` stays 4 s for Geoapify.
   - Observed Photon latency is about 4 s, so a 4 s limit cut successful responses.
   - The import deadline (20 s, shared `LinkBudget.signal`) still bounds the whole resolve. Places that are still queued when it fires get `lookup_skipped`, which is the honest result.
4. **Report a failure as a failure.**
   - `searchPlaces(q, { strict: true })` throws `PlaceLookupUnavailable` when Photon, the last resort, throws and nothing earlier returned results.
   - Default (`strict` unset): unchanged, still returns `[]`. The UI autocomplete keeps its graceful empty list.
   - The place-link `search()` passes `strict: true`. `lookup()` catches the error and returns `'skipped'`, so the place or hotel gets **`lookup_skipped`** ("send lat/lng or retry"), not `place_unresolved`.

## Not done
- No Photon result caching beyond the existing `next.revalidate`.
- Google and Geoapify paths are unchanged.

## Tests (unit)
- `photon.test.ts`:
  - Concurrent calls are serialized (in-flight count stays at most 1).
  - 503 then 200 → results.
  - Two 503s → throws.
  - An aborted waiter rejects and does not block the queue.
- `search.test.ts`: when Photon throws, strict mode throws and non-strict mode returns `[]`.
- `place-link.test.ts`: when search throws `PlaceLookupUnavailable`, the result is `lookup_skipped`, not `place_unresolved`.
- No integration or e2e test: there is no DB involvement, and the batch rule applies.
