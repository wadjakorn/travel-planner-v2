# Home Trip Cards Implementation Plan

> **Ticket:** TP-0088

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D13 — avatars: size fix only here; real-member avatars = separate follow-up ticket.**
> - **D14 — SKIPPED for now (sort-select removal + static-map cover + console quota/API change).** Ask the user again before implementing this plan.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised after scrutiny (2026-10-29)**, see [2026-10-29-home-trip-cards.scrutiny.md](2026-10-29-home-trip-cards.scrutiny.md). The server-proxied, 24 h server-cached `/trip/[id]/cover-map` route is gone. Caching Google Static Maps images on our servers is not permitted (Google Maps Platform ToS §3.2.3(a)(i) and (b)), and the Service Specific Terms grant Maps Static API no caching exception. Covers are now a **signed Static Maps URL that uses the referrer-locked browser key**, put straight into `<img src>`. That is Google's documented client pattern. It needs no route, no proxy and no server cache.

**Goal:** Make each trip card on Home say something about the trip, and make the grid say what comes next. The cover becomes a static map of the trip's stops, with the gradient as fallback. Delete moves into a ⋯ menu. Trips are grouped Upcoming / No dates / Past, and the nearest upcoming trip is shown larger. Avatars become readable.

**Architecture:** The home page loads each trip's stop coordinates in one query. For each card it builds a signed Google Static Maps URL through `lib/static-map.ts`, with a new `key: 'browser'` option. That option signs with `GOOGLE_MAPS_URL_SIGNING_SECRET`, but puts `GOOGLE_MAPS_BROWSER_KEY` in the URL. The browser key is already public and referrer-locked. The Places-capable server key never reaches the browser, and unsigned requests are already set to 0 in the console. The browser fetches the image from Google directly. Any caching is the browser obeying Google's own response headers. We store nothing. In open mode there is no browser-safe static provider (`GEOAPIFY_API_KEY` is server-only), so cards keep the gradient. Grouping is a pure helper next to `tripStatus` in `lib/trip-card-art.ts`.

**Tech Stack:** Next.js 16 App Router (server page), React 19, Google Maps Static API, vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §4.2 (Home), A7 in §5 (min 12px text), §10 HOME-01. Screenshot `docs/design-review/shots/01-home.png`.

**Touches:** `app/src/components/trip-card.tsx`, `app/src/components/trips-browser.tsx`, `app/src/lib/static-map.ts`, `app/src/lib/trip-queries.ts`, `app/src/components/skeletons.tsx` (`TripGridSkeleton` only), `app/src/app/(home)/page.tsx`; deletes `trip-delete-button.tsx`. No `globals.css`, no map renderer, no new route. **Console:** add Maps Static API to the browser key's API restrictions.

## Decision needed

1. **Sort select.** **Default:** remove it ("Recently added / Date / Name", `trips-browser.tsx:79-88`). The groups give the one order that matters, and search stays. *Alternative:* keep it and sort within each group (more states to test, little value).
2. **Static Maps console quota.** Today it is 200/day, sized for OG images only (`docs/ops/google-maps-setup.md` §7). With no server cache, every cold image load is a billed request. **Default:** raise it to **400/day**. That allows at most 12,000 requests a month, which is at most **$4/month** above the 10,000 free (Static Maps $2.00/1,000, `docs/research/2026-10-23-google-places-billing-verification.md:88`). Over quota, Google answers 403, `onError` falls back to the gradient, and nothing breaks. The quota is shared with the OG image.
3. **Route line on the cover.** **Default:** draw a straight polyline through the stops in visit order, using the `path=` parameter in the same request. It costs nothing extra and needs no Directions call. *Alternative:* markers only, like the OG image.
4. **Avatars.** The avatar stack draws `trips.collaborators`, a decorative jsonb that only the demo seed fills (`seed.ts:37`). Real trips never show avatars, and the in-trip header draws real members (`trip/[id]/layout.tsx:49-60`). **Default:** do the spec's size fix only (cheap). *Alternative:* switch the card to real members, at the cost of one memberships⋈users query for all trip ids. That fits better with the header but is a larger change. Defer it to a follow-up.

## Global Constraints

- Cover precedence: a user `cover` URL (`isImageCover`) wins, then the static map, then the existing gradient + glyph (`coverGradient`/`coverGlyph`). The glyph never draws over a map.
- **Only browser-key URLs reach HTML.** `GOOGLE_MAPS_API_KEY` (the server key, which is also the Places key) must never appear in a cover URL. The cover URL is `https://maps.googleapis.com/maps/api/staticmap?…&key={browserKey}&signature=…`.
- **No server-side caching or rehosting of the map image.** Render a plain `<img>`, never `next/image`, because the Vercel image optimizer would fetch and store it. Add no proxy route and no `fetch` with `revalidate`.
- Cover map request: `COVER_MAP_SIZE = { width: 640, height: 256, scale: 2 }` (5:2), with at most 12 markers (the existing `MAX_MARKERS`) and `path` on.
- **Aspect-locked cover:** the cover box is `aspect-[5/2]` (not a fixed height) for both normal and featured cards, so the 5:2 image is never cropped. Featured is larger only through its `sm:col-span-2` width. This guarantees the Google logo and copyright (bottom of the image) stay visible.
- Google attribution: nothing may overlay the bottom 28 px of a map cover. The status chip stays top-left and the ⋯ trigger top-right.
- Groups, in order: **Upcoming** (ongoing + upcoming, `startDate` ascending), **No dates** (server order), **Past** (`endDate ?? startDate` descending). Empty groups are not rendered. Search filters before grouping. The first Upcoming card is `featured`.
- "Today" is a UTC `YYYY-MM-DD` computed once on the server page and passed down, the same rule `trip-card.tsx:79` uses today. No per-card `new Date()`.
- Avatars: 28 px (`h-7 w-7`), initials `text-xs` (12 px, per A7), overlap `-ml-2`, at most 3 plus a "+N" chip.
- Menu copy: trigger `aria-label="Trip actions for {title}"`; items **"Trip settings"** and **"Delete trip…"**. The confirm dialog copy stays as it is (`trip-delete-button.tsx:46-47`).
- Colors only via tokens (`bg-surface`, `text-foreground`, `text-danger`, …). Replace the `bg-white/85 text-zinc-600` on the old trash button.

## Cost (cover map)

| Layer | Hit when | Billed requests |
|---|---|---|
| Browser HTTP cache (Google's own response headers) | The same device already loaded this exact URL and it is still fresh. The URL changes only when the sampled stops change. | 0 |
| `loading="lazy"` | The card never scrolls into view | 0 |
| Miss | Anything else | 1 Static Maps request (free up to 10,000/month, then **$0.002**) |

Hard ceiling: the console quota. At 400/day that is ≤ 12,000/month, so ≤ **$4/month** in the worst case. Example: 20 active users × 5 trips × ~1.5 cold loads/day ≈ 150/day ≈ 4,500/month, which is $0. Record the observed `Cache-Control` of the Static Maps response in Task 5 and put it in `maps-cost-guardrails.md`.

## Review Focus

1. **A trip with no geocoded stops, open mode, or google mode without a signing secret.** It must show the gradient, with no broken-image icon and no grey box. Tests `coverMapUrl returns null without usable points` / `... outside google mode` (Task 2). The `onError` fallback is checked manually (Task 5).
2. **The server key leaking into HTML.** Test `cover URL carries the browser key, never the server key` (Task 1). Manual: `curl` the home page and grep for the server key value (Task 5).
3. **Provider over quota, or a 403 from a referrer mismatch.** `<img onError>` → the gradient. The page still renders.
4. **An ongoing trip, a trip with only a start date, and a trip ending today.** Each must land in Upcoming (featured if nearest), not Past. Tests in Task 4.
5. **Featured card at 390 px and at 1440 px.** The Google logo is fully visible and no marker is cropped (aspect-locked box).

---

### Task 1: `static-map.ts`: browser-key signing, shared sampling, route path

**Files:**
- Modify: `app/src/lib/static-map.ts` (export `usableStaticPoints`; a `path` option for Google; a `key: 'server' | 'browser'` option, default `'server'`, so the OG output is unchanged; `COVER_MAP_SIZE`)
- Test: `app/src/lib/static-map.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const COVER_MAP_SIZE: { readonly width: 640; readonly height: 256; readonly scale: 2 };
  export function usableStaticPoints(points: LatLng[]): LatLng[]; // filter(isValidPoint) then sample(…, MAX_MARKERS)
  export type StaticMapOptions = { width?; height?; scale?; markerColor?; path?: boolean; key?: 'server' | 'browser' };
  ```
  Google path: `path=color:0x{MARKER}CC|weight:3|lat,lng|…`, inside the signed query. With `key: 'browser'`, `buildGoogleUrl` uses `cfg.browser?.key` (returning `null` when it is absent) and still signs with `cfg.google.signingSecret`. The signature is per project, not per key, so the browser key must be in the same GCP project. The Geoapify builder ignores `key: 'browser'` and returns `null` for it, because its key is server-only.

- [ ] **Step 1: Failing tests**
  - `usableStaticPoints` drops `(0,0)` and NaN, and keeps the first and last when there are more than 12.
  - Google cfg with `path: true`: the URL has exactly one `path` param that starts `color:0x` and contains every usable point in order. The signature still verifies: recompute `sign()` over the URL minus `&signature=…` with the test secret, the same way the existing google test does.
  - `cover URL carries the browser key, never the server key`: `key: 'browser'` → `key=<browserKey>` is present and the server key string is absent. With `cfg.browser = null` → `null`.
  - `key: 'browser'` on a geoapify cfg → `null`.
  - `path` and `key` omitted: the URL is byte-identical to today's OG output.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/static-map.test.ts`. Expected: new cases FAIL.
- [ ] **Step 3:** Implement. Leave `fetchStaticMapDataUri` (OG) untouched. Its server-side caching is a separate, pre-existing question (see the scrutiny follow-up).
- [ ] **Step 4:** Re-run. Expected: all PASS (the existing OG cases unchanged).
- [ ] **Step 5:** Commit `feat(static-map): browser-key signed URL + optional route path [TP-0088]`

### Task 2: Cover points + per-card URL

**Files:**
- Create: `app/src/lib/trip-cover-map.ts`, `app/src/lib/trip-cover-map.test.ts`
- Modify: `app/src/lib/trip-queries.ts` (+ `loadTripCoverPoints`, next to `loadTripsForUser` L56)
- Modify: `app/src/app/(home)/page.tsx`. Load points **after** `loadTripsForUser`, because the ids come from it: `const points = await loadTripCoverPoints(trips.map(t => t.id))`. Pass `coverMapUrl` per item and `todayIso` to `TripsBrowser`.

**Interfaces:**
- Consumes: Task 1 `buildStaticMapUrl`, `COVER_MAP_SIZE`.
- Produces:
  ```ts
  export async function loadTripCoverPoints(tripIds: string[], exec?: IdemExecutor): Promise<Map<string, LatLng[]>>
  // places ⋈ days, places.deletedAt IS NULL, lat/lng NOT NULL, ORDER BY days.tripId, days.idx, places.idx; [] ids → empty Map, no query
  export function coverMapUrl(points: LatLng[], cfg?: MapsConfig): string | null
  // cfg.provider === 'google' && cfg.staticMap === 'google' → buildStaticMapUrl(points, { ...COVER_MAP_SIZE, path: true, key: 'browser' }, cfg); otherwise null
  ```
  `TripsBrowser` items gain `coverMapUrl: string | null`. `TripsBrowser` gains the prop `todayIso: string`.

- [ ] **Step 1: Failing tests** (`trip-cover-map.test.ts`, with a `MapsConfig` literal as in `static-map.test.ts`)
  - `coverMapUrl returns null without usable points`: `[]` and `[{lat:0,lng:0}]` → `null`.
  - `coverMapUrl returns null outside google mode`: an open cfg with a geoapify key → `null`.
  - Google cfg + 2 points → starts with `https://maps.googleapis.com/maps/api/staticmap?`, contains `size=640x256`, `scale=2`, `path=`, and `key=<browserKey>`.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/trip-cover-map.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the helper, the query and the page wiring.
- [ ] **Step 4:** Re-run (PASS); `pnpm typecheck` (tail -3).
- [ ] **Step 5:** Commit `feat(home): static-map cover URLs per trip [TP-0088]`

### Task 3: Card: map cover, ⋯ menu, avatars

**Files:**
- Create: `app/src/components/trip-card-cover.tsx` (`'use client'`; image → map → gradient, with an `onError` fallback)
- Create: `app/src/components/trip-card-menu.tsx` (`'use client'`; replaces the trigger in `trip-delete-button.tsx` and reuses its `ConfirmDialog` + `useTransition` flow)
- Delete: `app/src/components/trip-delete-button.tsx`. Its only importer is `trip-card.tsx:5`, verified by grep.
- Modify: `app/src/components/trip-card.tsx` (props `coverMapUrl`, `todayIso`, `featured`; L86-93 → `TripCardMenu`; L100-127 → `TripCardCover` + status chip; L141-159 avatar sizes)

**Interfaces:**
- Consumes: `coverMapUrl` from Task 2.
- Produces:
  ```ts
  export function TripCardCover(p: { title: string; coverKey: string; imageUrl: string | null; mapUrl: string | null }): JSX.Element
  export function TripCardMenu(p: { tripId: string; title: string; onDelete: (fd: FormData) => Promise<void> }): JSX.Element
  // TripCard props add: coverMapUrl?: string | null; todayIso: string; featured?: boolean
  ```

- [ ] **Step 1:** `TripCardCover`. The cover box is `relative aspect-[5/2] overflow-hidden`; this replaces `h-36`. While a map is loading, the background is `bg-surface-2` with no glyph. The image is `<img src={mapUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover">`. With the 5:2 box and the 5:2 image, `object-cover` crops nothing. `onError` flips to the gradient + glyph markup that sits at `trip-card.tsx:100-118` today. The hover scale stays only on user image covers, so the Google logo is never pushed out of frame.
- [ ] **Step 2:** `TripCardMenu`. The trigger is a `More` icon button: `h-8 w-8 rounded-full bg-surface/90 text-foreground shadow-sm backdrop-blur`, with `aria-haspopup="menu"` and `aria-expanded`. If the a11y-batch `.tp-hit` utility exists at implementation time, add it as well (it gives a 44 px hit area). The menu (`role="menu"`, `z-[var(--z-dropdown)]`, opens below-right) holds a `Link` to `/trip/{id}/settings` (`role="menuitem"`) and a "Delete trip…" button (`role="menuitem"`, `text-danger`) that opens the `ConfirmDialog`. Escape and an outside `pointerdown` close the menu and return focus to the trigger. ArrowDown/ArrowUp move between items, and focus lands on the first item when the menu opens. Use `account-menu.tsx` as the behaviour reference. Do not create a `ui/` primitive for a second menu (YAGNI; extract one when a third menu appears).
- [ ] **Step 3:** Avatars per Global Constraints. The overflow chip uses the same size.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint` (tail -3).
- [ ] **Step 5:** Commit `feat(home): map covers, ⋯ trip menu, larger avatars [TP-0088]`

### Task 4: Upcoming / No dates / Past groups + featured card

**Files:**
- Modify: `app/src/lib/trip-card-art.ts` (+ `groupTrips`)
- Create: `app/src/lib/trip-card-art.test.ts`
- Modify: `app/src/components/trips-browser.tsx` (remove `SortKey`, the sort state and the `Select` at L27, L36, L48-57, L79-88; render the groups; pass `todayIso` and `featured`)
- Modify: `app/src/components/skeletons.tsx` `TripGridSkeleton` (L76-105: drop the sort-select bar; add a group-label bar; the first card is `sm:col-span-2`; covers become `aspect-[5/2]`)

**Interfaces:**
- Consumes: `tripStatus` (`trip-card-art.ts:47`).
- Produces:
  ```ts
  export function groupTrips<T extends { startDate?: string | null; endDate?: string | null }>(
    trips: T[], todayIso: string,
  ): { upcoming: T[]; undated: T[]; past: T[] }
  ```

- [ ] **Step 1: Failing tests** (`trip-card-art.test.ts`, today `2026-10-29`)
  - Ongoing `{2026-10-27..2026-10-31}`, upcoming `{2026-11-01..02}` and `{2026-12-10..12}`, past `{2026-04-12..16}` and `{2026-10-02..06}`, undated `{null,null}`. Expect `upcoming` = [ongoing, Nov, Dec], `past` = [Oct 2–6, Apr], `undated` = [undated].
  - A trip ending today (`{2026-10-25..2026-10-29}`) → upcoming (ongoing). A start-only trip `{2026-11-05, null}` → upcoming. A start-only trip `{2026-10-01, null}` → past.
  - Input order is not mutated (`Object.freeze` the input array).
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/trip-card-art.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `groupTrips`. In `TripsBrowser`, each non-empty group is a `<section aria-labelledby>` with an `h2` (`text-sm font-semibold uppercase tracking-wide text-muted`): "Upcoming", "No dates", "Past". Each uses the existing grid `grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3`. The first Upcoming card gets `featured`, and its wrapper gets `sm:col-span-2`. "No trips match" stays as is.
- [ ] **Step 4:** Re-run (PASS); `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [ ] **Step 5:** Commit `feat(home): group trips upcoming/past, nearest first and larger [TP-0088]`

### Task 5: Verify in the real app

- [ ] Console prerequisite: the browser key's API restrictions include **Maps Static API** (setup doc §4). `http://localhost:3210/*` is already in its referrer list.
- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Use Playwright at 1440×900 and 390×844 on `/`.
- [ ] The section order is Upcoming → (No dates) → Past. The first upcoming card spans two columns on desktop and is full width on mobile. Mount Fuji & Kamakura (Apr 2026) is under Past.
- [ ] Covers: trips with stops show a map with markers and a line, and the Google logo is fully visible bottom-left at both widths, on the featured card too. "osaka" (1 stop) shows a single-marker map. A trip with no geocoded stops shows the gradient.
- [ ] Network: each visible card makes one `maps.googleapis.com/maps/api/staticmap` request with `key=` equal to the browser key, returning `200 image/png`. Record that response's `Cache-Control` header for the cost doc. A reload is served according to that header. `curl` the page with the dev session cookie and grep for the server key **value**: it must be absent. There is no `/_next/image` request for covers.
- [ ] Force a failure (temporarily remove Maps Static API from the browser key, or set a garbage `GOOGLE_MAPS_BROWSER_KEY` locally): the cards show the gradient + glyph with no broken-image icon. Restore afterwards.
- [ ] `MAPS_PROVIDER=open`: every card shows the gradient, and no static-map request is made.
- [ ] ⋯ menu: keyboard Tab to the trigger, Enter opens, ArrowDown moves, Escape closes and focus returns. "Delete trip…" opens the confirm dialog, and Cancel is prominent. Non-owner (shared) trips show no ⋯.
- [ ] The avatar initials on Mount Fuji read clearly at 28 px.

### Task 6: Docs

**Files:** `AGENTS-INDEX.md`, `REQUIREMENTS.md`, `docs/ops/maps-cost-guardrails.md`, `docs/ops/google-maps-setup.md`

- [ ] `AGENTS-INDEX.md`. Components: `trip-card.tsx` "Trip grid card (map cover, ⋯ menu)", plus `trip-card-cover.tsx` and `trip-card-menu.tsx`; remove `trip-delete-button` (L154). Lib: `static-map.ts` (L336, which is already stale because it says Geoapify only) becomes "Signed Google / Geoapify static map: OG data-URI (server key) + home cover URL (browser key)"; add `trip-cover-map.ts`. `trip-queries.ts` + `loadTripCoverPoints`. `trip-card-art.ts` + `groupTrips`.
- [ ] `REQUIREMENTS.md` §3: under "Signed in, `/` is the trip grid", add "grouped Upcoming / No dates / Past, nearest upcoming first and larger; cards show a static map of the trip's stops (google mode); destructive actions live in a ⋯ menu."
- [ ] `maps-cost-guardrails.md`: the Static Maps row "Used for" becomes "OG map (server key) + home trip-card covers (browser key, signed, loaded by the browser)". Replace the "Google Static Maps has no in-app cap" bullet with this plan's cost table and the observed `Cache-Control`. Add: "Never proxy or server-cache Static Maps images (ToS §3.2.3)." Update the "In-app cap on Google Static Maps" revisit note to "revisit above 150/day".
- [ ] `google-maps-setup.md`: §2 table, Maps Static API use "OG + home covers". §4 browser key, API restrictions: **Maps JavaScript API + Maps Static API**. §7 quota row: Static Maps 200 → 400 (if Decision 2 is accepted), with the reason "OG + home covers".
- [ ] Commit `docs: home map covers + grouping [TP-0088]`
