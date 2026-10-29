# Usability Research + Map Telemetry Implementation Plan

> **Ticket:** TP-0101

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D15 — SKIPPED for now (toggle-count rule / whether to build telemetry).** Ask the user again before implementing this plan.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the review's 5-person usability test (protocol and script are written in [`docs/research/2026-10-29-map-usability-test.md`](../../research/2026-10-29-map-usability-test.md)) and ship the smallest first-party telemetry that records 11 events (10 map events + a `trip_view` denominator), carries no PII, and answers §12's "do mobile users toggle List↔Map more than twice per session?".

**Architecture:** A client `track(name, props)` validates against a closed event schema, queues events, and flushes them with `navigator.sendBeacon` to `POST /api/telemetry`. The route re-validates with the same pure sanitizer and inserts the rows into a new `ui_event` table: no user id, a random per-tab session id, and an optional usability-test code. A daily cron prunes rows older than 90 days. No third-party SDK.

**Tech Stack:** Next.js 16 route handler, Drizzle/Postgres (Neon), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §9 (method, tasks A/B/C, SEQ, telemetry list), §12 (step A telemetry `fullmap_toggle`, `carousel_swipe`, `navigate_click` for 2–3 weeks; step B threshold "> 2 ครั้งต่อ session"), M13 (log degraded mode to telemetry). REQUIREMENTS §17 Telemetry ("Opt-out per `settings.privacy`"), §18 Privacy.

**Touches:** `components/persistent-map.tsx`, `components/map-stop-carousel.tsx`, `components/place-search-picker.tsx`, `components/use-poi-preview.ts`, `components/map-panel-toggle.tsx`, `components/segment.tsx`, `components/maps-config-provider.tsx` (one `track` line in `onDegrade`), `db/schema.ts`, `vercel.json`. **Depends on `2026-10-29-map-degraded-notice.md`** (lands first): it owns the `markDegraded(reason)` signature, the three call sites (`google-maps-api.tsx:15`, `google-map-error-boundary.tsx:29,76`), and `DegradeReason` in `lib/maps/degraded.ts`. Each edit is one `track()` line, but they overlap with the map plans and with i18n P2, so rebase on whichever lands first.

**Migration order (cross-plan, scrutiny):** `2026-10-29-budget-correctness.md` merges first and takes the next index (one idempotent backfill, `0022` at HEAD `6f6f7a2`). This plan takes the index after it (**`0023`** if nothing else lands in between; always "next free at generate time", never hand-numbered). Generate it only **after budget-correctness has merged** (rebase on `main`, then `pnpm db:generate --name ui_event`), and don't push a branch containing the migration before then. If another migration lands first anyway, follow budget's rule: delete this sql + snapshot + journal entry and re-run `db:generate`. Reason: Preview builds run `drizzle-kit migrate` against one shared Preview DB (`app/package.json` `vercel-build`, TP-0050), and drizzle applies only migrations whose journal timestamp is newer than the last one applied. If this branch's later-generated migration reached the Preview DB first, budget's earlier-timestamped `0022`/`0023` would be silently skipped there forever (non-fatal `|| echo WARNING`).

## Why first-party (analytics options checked)

| Option | Verdict |
|---|---|
| `@vercel/analytics` `track()` | **No.** Not installed (`app/package.json`), and "Custom Events are available on Enterprise and Pro plans" (vercel.com/docs/analytics/custom-events). This project is on Hobby (`2026-10-23-maps-google-resync-stage-c.md:380`). The dashboard only shows aggregates too, so per-session toggle counts (§12) are impossible. |
| PostHog / GA / Plausible | Third-party script, cookie/consent surface, and a new vendor for ~10 events from a handful of testers. Overkill. |
| `console.log` → Vercel runtime logs | Hobby log retention is far shorter than the 2–3 weeks §12 needs. |
| Reuse `audit_log` via `writeAudit` (`lib/audit.ts`) | **No.** `trip_id` is `NOT NULL` with an FK and `user_id` is stored (`db/schema.ts:592-611`), so every event would be tied to a user and a trip, which is the opposite of the no-PII rule. It is also the user-facing per-trip activity feed (REQUIREMENTS §17 "Audit log"), and map clicks would flood it. *(scrutiny addition)* |
| **`ui_event` table + `sendBeacon` (chosen)** | No dependencies, owned data, and SQL can answer per-session questions (queries in the research doc §7). Cost: one tiny Neon insert per batch. |

## Decision needed

| # | Question | Default (built on) |
|---|---|---|
| 1 | Opt-out (REQUIREMENTS §17 says per `settings.privacy`, but that group only holds `publicTrip` today) | **No settings toggle yet.** Respect `navigator.globalPrivacyControl === true` and `navigator.doNotTrack === '1'` on the client, plus a server kill switch `TELEMETRY=off`. The events carry no identity, and today's users are invited testers. Add a Settings toggle when real users arrive. |
| 2 | Retention | **90 days**, pruned daily. |
| 3 | Who is tracked | **Signed-in users only** (the route drops batches without a session, silently). The trip map is behind sign-in anyway, and this blocks anonymous spam. |

## Global Constraints

- **Event names (closed set):** `trip_view`, `map_pin_click`, `map_day_switch`, `carousel_swipe`, `search_preview_open`, `search_add`, `poi_preview_open`, `poi_add`, `navigate_click`, `fullmap_toggle`, `map_degraded`. `trip_view` is the denominator: without it, a session that never touches the map writes no rows and disappears from §12's "share of sessions".
- **Allowed props (enums/booleans only, nothing free-text):**
  `trip_view {}` · `map_pin_click {renderer: 'google'|'maplibre'}` · `map_day_switch {dir: 'prev'|'next'}` · `carousel_swipe {}` · `search_preview_open {}` · `search_add {}` · `poi_preview_open {ok: boolean}` · `poi_add {ok: boolean}` · `navigate_click {surface: 'carousel'|'segment'}` · `fullmap_toggle {on: boolean}` · `map_degraded {reason: 'auth'|'load_error'|'render_error'}`. Added automatically: `vp: 'mobile'|'desktop'` (`(min-width: 768px)`, same breakpoint as `useIsWide`).
- **Never send or store:** place names, place ids, trip/day ids, user id, email, coordinates, URLs, query text. The server drops unknown keys and non-enum values, so a careless call site cannot leak data.
- **Session id:** `newSessionToken()` (`lib/places/session.ts:7`; works on plain-HTTP dev, unlike `crypto.randomUUID`), stored in `sessionStorage['tp_sid']` (per tab, not linked to the user) together with `tp_sid_at` (last activity, ms). **A new sid is minted after 30 min without an event.** Mobile browser tabs live for days, so a pure per-tab id would merge a whole trip's worth of use into one "session" and inflate the §12 toggle count.
- **Usability code:** `?ut=P1`…`?ut=P9` (regex `^P[1-9]$`) is copied to `sessionStorage['tp_ut']` **when the module first evaluates on the client** (before any `router.replace` rewrites the query, e.g. `stopActivateHref`) and sent with every batch. Any other value is ignored. A signed-out participant loses `?ut` on the `/sign-in` redirect (layouts can't see the query), so the research doc has participants sign in first.
- **Limits:** ≤ 50 events per batch, request body ≤ 16 KB. Flush at 20 queued events, after 15 s, and on `visibilitychange → hidden` / `pagehide`. `client_at` is accepted only within ±24 h of server time, else stored as null. Per-user rate limit `consumeRateLimitKey(\`telemetry:${userId}\`, 120, 600)` (`lib/api/rate-limit.ts:69`). Normal use is ≤ ~45 flushes per 10 min (one per 15 s plus visibility flushes); the worst case for a hostile signed-in user is 120 × 50 = 6,000 rows per 10 min, which the 90-day prune bounds. Users are invite-only, so this is acceptable.
- Telemetry must never throw into UI code: `track()` swallows all errors, and the route returns `204` in every case (including rejects).
- No new dependency. Migration via `pnpm db:generate` (AGENTS-INDEX "New entity").

## Review Focus

1. **A call site passes a place name or id in props.** The sanitizer drops unknown keys and non-enum values. Test `sanitizeEvent({ n:'search_add', p:{ name:'Tsuta Ramen' } })` → props `{}` (Task 1).
2. **Events lost on tab close / navigation** (mobile Safari): flush on `pagehide` and `visibilitychange`. Test `drainQueue` empties the queue in batches of ≤ 50 (Task 3); manual check with DevTools "Preserve log" (Task 5).
3. **Double counting:** `fullmap_toggle` fires when the picker auto-opens the map (`place-search-picker.tsx:166` `setFullMap(true)`), or when clicking the already-selected segment. Track only in `map-panel-toggle.tsx` and only when the state actually changes (Task 4; manual check).
4. **`map_degraded` storms:** after map-degraded-notice, `degradeOnce` calls `onDegrade(reason)` exactly once per page load and never in open mode. Track only inside `onDegrade` (Task 4).
5. **Sign-out or expired session mid-batch:** the route returns 204 without inserting, and the client neither retries nor surfaces an error. Route test via the pure `parseBatch` + manual check.

---

### Task 1: Event schema + sanitizer (pure, shared by client and server)

**Files:**
- Create: `app/src/lib/telemetry-schema.ts` (no `server-only`, no DOM)
- Test: `app/src/lib/telemetry-schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const UI_EVENTS: { readonly [N in UiEventName]: Readonly<Record<string, readonly string[] | 'bool'>> };
  export type UiEventName = 'trip_view' | 'map_pin_click' | 'map_day_switch' | /* …the 11 names… */ 'map_degraded';
  export type UiEventProps = Record<string, string | boolean>;
  export type UiEventRow = { name: UiEventName; props: UiEventProps; sid: string; ut: string | null; clientAt: Date | null };
  export function sanitizeEvent(raw: unknown): { name: UiEventName; props: UiEventProps; at: number | null } | null;
  export function parseBatch(raw: unknown, now: Date): UiEventRow[];   // [] on any envelope error
  export const UT_RE: RegExp;   // /^P[1-9]$/
  export const SID_RE: RegExp;  // v4 uuid
  ```
  Wire format: `{ sid: string; ut?: string; events: { n: string; p?: object; at?: number }[] }`. `vp` is part of every event's allowed props (`['mobile','desktop']`).

- [ ] **Step 1: Failing tests**
  - `sanitizeEvent({ n:'fullmap_toggle', p:{ on:true, vp:'mobile' } })` → `{ name:'fullmap_toggle', props:{ on:true, vp:'mobile' }, at:null }`.
  - Unknown name `{ n:'page_view' }` → `null`.
  - `{ n:'search_add', p:{ name:'Tsuta Ramen', placeId:'ChIJ…' } }` → props `{}`.
  - `{ n:'map_day_switch', p:{ dir:'sideways' } }` → props `{}` (bad enum value dropped, event kept).
  - `{ n:'poi_add', p:{ ok:'yes' } }` → props `{}` (bool must be boolean).
  - `parseBatch` with 51 events → 50 rows. Bad `sid` → `[]`. `ut:'P3'` → rows `ut:'P3'`; `ut:'alice'` → `ut:null`. `at` 2 days before `now` → `clientAt:null`; `at` = now − 5 s → a `Date`.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/telemetry-schema.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(telemetry): closed event schema + sanitizer [TP-0101]`.

### Task 2: Storage, ingest route, prune cron

**Files:**
- Modify: `app/src/db/schema.ts` (after `rateLimits` :703): `uiEvents = pgTable('ui_event', { id: text pk $defaultFn(randomUUID) /* same as auditLog :596 */, name: text notNull, props: jsonb notNull default {}, sid: text notNull, ut: text, clientAt: timestamp('client_at'), createdAt: timestamp('created_at') notNull defaultNow })`, indexes `ui_event_created_idx (created_at)`, `ui_event_name_created_idx (name, created_at)`
- Create: `app/drizzle/00NN_ui_event.sql` via `pnpm db:generate --name ui_event` (`NN` = next free index, `0023` if budget-correctness's `0022` is the only one ahead), run **after** budget-correctness is on `main` (see Migration order)
- Create: `app/src/app/api/telemetry/route.ts` (`POST` only, `export const dynamic = 'force-dynamic'`)
- Create: `app/src/app/api/internal/prune-ui-events/route.ts` (copy the auth shape of `prune-rate-limit/route.ts`: `Bearer $CRON_SECRET`, delete `created_at < now() - interval '90 days'`, return `{ deleted }`)
- Modify: `vercel.json` (add `{ "path": "/api/internal/prune-ui-events", "schedule": "47 4 * * *" }`; Hobby allows 100 crons)
- Modify: `app/.env.example` (`TELEMETRY=` with "off disables ingest")

**Interfaces:**
- Consumes: Task 1 `parseBatch`; `auth()` (`lib/auth.ts`); `consumeRateLimitKey`.
- Route order: `TELEMETRY === 'off'` → 204. `Number(req.headers.get('content-length') ?? 0) > 16384` → 204 without reading the body. Read `await req.text()`; length > 16384 → 204 (a chunked body has no content-length). No `session.user.id` → 204. Rate limit denied → 204. `parseBatch(JSON.parse(text), new Date())` (JSON error → 204). If rows: `db.insert(uiEvents).values(rows)`, with insert errors caught and logged once as `[telemetry] insert failed`. → 204.

- [ ] **Step 1:** Add the table and run `pnpm db:generate`. Review the SQL (one CREATE TABLE, two indexes, nothing else).
- [ ] **Step 2:** Implement both routes and the cron entry.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3). Local DB: `pnpm db:push` against the dev branch, then `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3210/api/telemetry -d '{}'` → `204`.
- [ ] **Step 4:** Commit `feat(telemetry): ui_event table, ingest route, 90-day prune [TP-0101]`.

### Task 3: Client `track()`

**Files:**
- Create: `app/src/lib/telemetry-client.ts` (client-only module; no React)
- Test: `app/src/lib/telemetry-client.test.ts` (pure parts only; vitest runs in `node`)

**Interfaces:**
- Consumes: Task 1 `UiEventName`, `UI_EVENTS`, `UT_RE`; `newSessionToken` from `@/lib/places/session`.
- Produces:
  ```ts
  export function track(name: UiEventName, props?: UiEventProps): void;          // never throws; no-op on server
  export function telemetryAllowed(nav: { globalPrivacyControl?: boolean; doNotTrack?: string | null }): boolean;
  export function utFromSearch(search: string): string | null;                    // '?ut=P2&x=1' → 'P2'
  export function drainQueue<T>(q: T[], max?: number): T[][];                     // splits into ≤ max (50) batches, empties q
  export function sessionIdFor(prev: { sid: string | null; at: number | null }, now: number, mint: () => string): { sid: string; at: number }; // pure: reuse within SESSION_IDLE_MS, else mint
  ```
- Behavior: at module evaluation on the client (`typeof window !== 'undefined'`), store `utFromSearch(location.search)` into `tp_ut` when present. On each `track`, read `tp_sid`/`tp_sid_at`, mint a new sid when missing or `now − tp_sid_at > 30 min` (`SESSION_IDLE_MS`), update `tp_sid_at`, and read `tp_ut`. Add `vp` and `at: Date.now()`. Push to the module queue. Flush rules per Global Constraints. Each flush posts each batch as `navigator.sendBeacon('/api/telemetry', new Blob([json], { type: 'application/json' }))`, falling back to `fetch(..., { method:'POST', keepalive:true })` when `sendBeacon` is missing or returns false.

- [ ] **Step 1: Failing tests**
  - `telemetryAllowed({ globalPrivacyControl: true })` → `false`; `{ doNotTrack: '1' }` → `false`; `{}` → `true`.
  - `utFromSearch('?ut=P2&x=1') === 'P2'`; `'?ut=P10'` → `null`; `''` → `null`.
  - `drainQueue(Array(120).fill(0))` → batch sizes `[50, 50, 20]`, and the source array is now empty.
  - `sessionIdFor({ sid:'a', at: t }, t + 29*60_000, mint)` → `sid:'a'`; at `t + 31*60_000` → the minted id; `{ sid:null, at:null }` → minted.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(telemetry): client track() with beacon flush [TP-0101]`.

### Task 4: Instrument the 11 events

**Files / exact sites:**
- `components/persistent-map.tsx` `activate` (:87, the pin-click path from `onActivate`) → `if (next) track('map_pin_click', { renderer })` — **only when opening**. `activate` toggles (`next = shownPlaceId === id ? null : id`, :88) and is also the PinCard ✕ close handler (`real-map-canvas-google.tsx:170` `onClose={() => onActivate?.(popupPin.id)}`), so an unconditional track counts every close as a pin click. Read `const renderer = useMapRenderer()` once at the top of the component.
- `components/persistent-map.tsx` mount effect (`useEffect(() => track('trip_view'), [])`): PersistentMap lives in the trip layout, so this fires once per trip visit, not per sub-page.
- `components/map-stop-carousel.tsx`: `goDay` (:107) when `n != null` → `map_day_switch {dir: n < dayIdx ? 'prev' : 'next'}`. `onSettle` right before `onSelect(pin.id)` (:60) → `carousel_swipe` (settled swipes only, not card taps at :162). Navigate `<a>` (:181) `onClick` → `navigate_click {surface:'carousel'}`.
- `components/segment.tsx` Navigate `<a>` (:118) `onClick` → `navigate_click {surface:'segment'}`.
- `components/place-search-picker.tsx`: in `showOnMap` when `shown` is truthy (:166) → `search_preview_open`. In `submitPlace` after `await addAction(fd)` (:96) → `search_add`.
- `components/use-poi-preview.ts`: in `onPoiClick` → `poi_preview_open {ok:false}` on null detail (:70) / `{ok:true}` after `setPreview` (:74). In `add` → `poi_add {ok:true}` after `addPlaceInlineAction` resolves, `{ok:false}` on either failure toast.
- `components/map-panel-toggle.tsx` List/Map `onClick` (:39, :49) → `fullmap_toggle {on}` only when `on !== full`.
- `components/maps-config-provider.tsx`: add `track('map_degraded', { reason })` inside the `onDegrade(reason)` callback that map-degraded-notice passes to `degradeOnce`. Nothing else: the signature, the reason values and the three call sites belong to that plan. In `telemetry-schema.ts`, derive the `map_degraded.reason` enum from `import type { DegradeReason } from '@/lib/maps/degraded'` (keep a `satisfies readonly DegradeReason[]` value list for the runtime check) instead of declaring a second union.

- [ ] **Step 1:** Implement the sites above (one `track` call each, no other logic changes).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [ ] **Step 3:** Commit `feat(telemetry): instrument map events [TP-0101]`.

### Task 5: Verify in the real app

- [ ] `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, open `/trip/79efe162-dfb2-46c2-ad46-a34695771b8b?ut=P1`, Playwright at 390×844 and 1440×900.
- [ ] Mobile: Map toggle, swipe the carousel twice, ‹ / › day, Navigate, List. Then hide the tab (or open `about:blank`). Network shows one `telemetry` beacon, and the DB has `fullmap_toggle×2` (on true/false), `carousel_swipe×2`, `map_day_switch×2`, `navigate_click{surface:carousel}`, all with `ut='P1'` and `vp='mobile'`.
- [ ] Desktop: click a pin → `map_pin_click{renderer:'google'}`; close its card with ✕ → **no** second `map_pin_click`. Every session has one `trip_view` row. Search "ramen", preview a result, then Add → `search_preview_open`, `search_add`. Tap a museum POI and Add → `poi_preview_open{ok:true}`, `poi_add{ok:true}`.
- [ ] Inspect a stored row: `props` holds only allowed keys, and nothing contains a place name or id.
- [ ] `TELEMETRY=off` → still 204 and no rows. DevTools → enable "Send Global Privacy Control" (or set `navigator.globalPrivacyControl` via an init script) → no beacon.
- [ ] Degraded: start with a bad browser key (`GOOGLE_MAPS_BROWSER_KEY=x`, local only) → exactly one `map_degraded{reason:'auth'}` row.

### Task 6: Docs

**Files:**
- Already written (commit with this PR): `docs/research/2026-10-29-map-usability-test.md` (Thai protocol, script, note sheet, SQL).
- Modify: `REQUIREMENTS.md` §17 Telemetry: add "Map UI events (first-party `ui_event` table, no PII, 90-day retention): `trip_view`, `map_pin_click`, `map_day_switch`, `carousel_swipe`, `search_preview_open`, `search_add`, `poi_preview_open`, `poi_add`, `navigate_click`, `fullmap_toggle`, `map_degraded`. Opt-out: Global Privacy Control / Do Not Track; server kill switch `TELEMETRY=off`." Under §4, add a `ui_event` entity row (fields as in Task 2).
- Modify: `AGENTS-INDEX.md`: Entity map row `UiEvent` (`ui_event`, writer `api/telemetry/route.ts`, no reader in app; queries in the research doc). Routes: `api/telemetry/route.ts`, `api/internal/prune-ui-events/route.ts`. Lib: `telemetry-schema.ts`, `telemetry-client.ts`.
- Modify: `ARCHITECTURE.md` "Environment variables": `TELEMETRY`.

- [ ] **Step 1:** Edit the docs.
- [ ] **Step 2:** Commit `docs: map telemetry + usability test protocol [TP-0101]`.

### After merge (research, not code)

- [ ] Let telemetry collect for 2–3 weeks (§12 step A), then run the research doc §7 queries.
- [ ] Recruit and run the 5 sessions per the research doc §2–§5. Fill in the note sheet and write findings into the same doc under a new "ผล รอบ 1" section, including the §12 step-B call (> 2 toggles per session → full bottom sheet).
