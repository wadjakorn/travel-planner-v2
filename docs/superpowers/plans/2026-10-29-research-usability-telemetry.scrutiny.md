# Scrutiny: 2026-10-29-research-usability-telemetry.md (+ docs/research/2026-10-29-map-usability-test.md)

An outsider review, checked against `main` @ `6f6f7a2`. **[applied]** means the fix is now in the plan or the research doc. **[open]** means it is left for the user.

## Intent

The plan has two goals. First, run a 5-person map usability test (the protocol is in the research doc). Second, collect enough first-party map events, with no PII, to answer review §12 step B: "do mobile users switch List↔Map more than twice per session?". That answer decides whether to build a full bottom sheet.

**Simpler-alternative pass. Is a custom table + endpoint + cron the simplest thing?**

| Alternative | Verdict (verified) |
|---|---|
| Do nothing; rely on the 5 observed sessions | The test already counts toggles by hand (§6 note sheet). 5 sessions are enough to find problems but not to set a threshold, and §12 explicitly asks for 2–3 weeks of usage data. Telemetry is justified, but only if real usage exists. **[open]** If the invite-only app has only a handful of active mobile users in the next 3 weeks, the §12 number will rest on single digits. Ship anyway (it's cheap), but read the result as directional. |
| `audit_log` via `writeAudit` (`lib/audit.ts`) | **No.** `trip_id` is `NOT NULL` with an FK, and `user_id` is stored (`db/schema.ts:592-611`), so every event would be tied to a person and a trip. That contradicts the no-PII rule. It is also the user-facing per-trip activity feed (REQUIREMENTS §17 "Audit log"). I added this row to the plan's options table. **[applied]** |
| `console.log` → Vercel runtime logs | **No.** Hobby log retention is far shorter than 3 weeks, and log drains are a paid feature. The plan's reasoning holds. |
| Vercel Web Analytics custom events | **No.** Hobby plan (`2026-10-23-maps-google-resync-stage-c.md:380`), and the dashboard is aggregate-only, so per-session counts are impossible. I did not re-fetch the vendor doc; the citation is the plan's. |
| Separate prune route + cron vs folding into `prune-rate-limit` | A separate route is ~15 lines copied from `prune-rate-limit/route.ts`. Hobby allows 100 crons. Keeping one concern per route is fine. Not a finding. |

**Conclusion:** the `ui_event` table + `sendBeacon` design is the simplest option that can answer a per-session question. The closed schema and server-side re-sanitising are the right privacy posture.

## Trace / verification

- `newSessionToken()` is a v4 UUID from `getRandomValues` (`lib/places/session.ts:7-15`), so `SID_RE` = v4 holds.
- `consumeRateLimitKey(key, max, windowSeconds)` is at `lib/api/rate-limit.ts:69`. It upserts into `rate_limit`, which is already pruned by `prune-rate-limit` (cron `17 4 * * *`, `vercel.json`).
- `auth()` is a DB lookup (database sessions, `lib/auth.ts:56`). Each beacon therefore costs an auth lookup, a rate-limit upsert and one insert. That is negligible at this scale.
- `sendBeacon` sends same-origin cookies. The Auth.js session cookie is `SameSite=Lax`, so a cross-site page can't POST events as the user. CSRF surface is nil.
- **Call sites (all lines match):** `persistent-map.tsx:87` `activate`, `map-stop-carousel.tsx:60` (`onSelect` after a settled swipe), `:107` `goDay`, `:162` card tap, `:181` Navigate; `segment.tsx:118`; `place-search-picker.tsx:96,166`; `use-poi-preview.ts:70,74`; `map-panel-toggle.tsx:39,49`; `maps-config-provider.tsx:19-23`.
- **Surprise:** `activate` toggles (`next = shownPlaceId === id ? null : id`, `persistent-map.tsx:88`). It is also the PinCard close handler (`real-map-canvas-google.tsx:170` `onClose={() => onActivate?.(popupPin.id)}`). See M2.
- The Preview DB is shared and auto-migrated non-fatally (`app/package.json` `vercel-build`; TP-0050). Drizzle applies only journal entries newer than the last one applied. See M1.

## Findings

### M1. A migration collision with budget-correctness on the shared Preview DB **[applied]**
- **Evidence.** Both plans generate the next index from `0021`. Preview builds run `drizzle-kit migrate || echo WARNING`, and drizzle skips any migration whose `when` is older than the last one applied.
- **Why it matters.** Suppose telemetry's later-stamped migration reaches the Preview DB first. Budget's earlier-stamped migration is then skipped there permanently and silently. Generating both at the same index also conflicts in `meta/_journal.json`.
- **Change (settled with the budget scrutiny).** budget-correctness merges first and takes the next free index (its plan now has one idempotent backfill, `0022` at HEAD). Telemetry generates its migration only after that, using the next free index (`0023`), and does not push a branch carrying the migration before then. If anything else lands first, it deletes its sql + snapshot + journal entry and regenerates. Recorded in both plans' scrutiny files.

### M2. `map_pin_click` would also count card closes **[applied]**
- **Evidence.** The plan tracked unconditionally in `activate`. `activate` is the open handler and also the close handler (re-click on the same pin, and the PinCard ✕ at `real-map-canvas-google.tsx:170`).
- **Change.** Track only when `next !== null`. The Task 5 check now asserts that closing via ✕ adds no row.

### M3. The §12 metric had no denominator and an unbounded "session" **[applied]**
- **Evidence.** A session that opens the trip but never touches the map writes zero rows, so the research query's `count(*)` over `group by sid` counted only map users. That inflates `share_over_2`. `sid` lived in `sessionStorage` for the tab's lifetime. Mobile tabs survive for days, so one "session" could span a whole trip, and toggles add up past 2 trivially.
- **Change.** Added the `trip_view {}` event, fired once per trip-layout mount from `PersistentMap`, and used it as the denominator. `sid` now rotates after 30 min idle (pure `sessionIdFor`, with tests). The research query now uses `trip_view` sessions and reports both `toggles` and `to_map`.

### M4. Test participants lose their `?ut=` code **[applied]**
- **Evidence.** The trip layout redirects signed-out users to `/sign-in` without the query (`layout.tsx:40`; layouts can't read `searchParams`). After sign-in they land on `/`. Separately, the plan read `?ut` "on the first `track`". By then `router.replace(stopActivateHref…)` may have rewritten the query.
- **Change.** `ut` is captured at client module evaluation. The research doc (§3 ลิงก์) now has participants sign in on each device before opening the `?ut=` link, including the phone for task C.

### M5. `markDegraded` ownership is now with map-degraded-notice **[applied]**
- Per the coordinator: map-degraded-notice lands first and owns the signature, the three call sites and `DegradeReason`. This plan now adds only `track('map_degraded', { reason })` inside `onDegrade` and derives its enum from `DegradeReason`. Its edits to `google-maps-api.tsx` and `google-map-error-boundary.tsx` are dropped from Touches and Task 4.

### Nits
- **[applied]** The route checks `content-length` before `req.text()`. The post-read length check stays for chunked bodies.
- **[applied, documented]** Rate-limit worst case: 120 batches × 50 events = 6k rows per user per 10 min. That's acceptable because only invited users can sign in and the 90-day prune bounds growth. Lowering to 60 costs nothing if the user prefers it.
- **[open]** Definition of a "toggle" for the §12 threshold. "> 2 toggles", counting both directions, means "opened the map twice". "> 2 to-map switches" is stricter. The query now reports both. The user picks before reading the result.
- **Privacy:** `ut` codes are linkable to a named participant by design. The doc already requires consent, keeps names separate and deletes recordings after 90 days, which matches the 90-day telemetry retention. The `rate_limit` key holds the raw `userId` for at most one window plus the daily prune, and it is not joinable to `ui_event`. GPC/DNT handling and the `TELEMETRY=off` kill switch are adequate for an invite-only app (Decision 1).

## Cross-plan

- **budget-correctness:** migration order (M1). A note is appended to its scrutiny file.
- **map-degraded-notice:** owns `markDegraded`/`DegradeReason` (M5). It lands first.
- **header-share-export:** its sign-in `callbackUrl` fix to `layout.tsx:40` / `page.tsx:53` makes the trip link survive sign-in. It still drops `?ut`, hence the research-doc instruction.
- **map plans / i18n P2b:** the `track()` lines sit in the same hot files. Rebase on whichever lands first. Each `track()` is a single line.

## Verdict

**fix-then-ship.** The design is the simplest one that answers the question, and the privacy posture is sound. As written, the metric would have been wrong (no denominator, sessions lasting days, closes counted as clicks), and the migration could have been silently skipped on Preview. All of these are fixed in the plan.
