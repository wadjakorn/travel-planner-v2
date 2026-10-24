# Maps Stage B — Google map renderer, go-live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `MAPS_PROVIDER=google`, the trip map and the pin picker use Google Maps JS (Advanced Markers + Map ID). The Stage A production gate is removed, so Production can run Google search, place details, map and OG together. If Google fails to load, the map falls back to MapLibre. `open` mode stays exactly as it is today.

**Architecture:**
- The server resolves one `MapsConfig` (`lib/maps/config.ts`). Google mode is all-or-nothing: it needs the server key, the signing secret, the browser key and the Map ID. If any of them is missing, the app runs in `open` mode and logs one warning.
- The root layout passes the browser-safe slice of that config (`ClientMapsConfig`) to a client `MapsConfigProvider`. The provider also holds a `degraded` flag, which is set by `gm_authFailure` or by a loader error.
- Each map component keeps its current file name. That file becomes a small selector which `next/dynamic`-imports either `*-maplibre.tsx` or `*-google.tsx`, so the 4 existing `dynamic(() => import(...))` call sites do not change.

**Tech Stack:**
- Next.js 16.2.4 App Router, React 19.2.4, pnpm
- `@vis.gl/react-google-maps` **1.8.3**, the exact version the pre-#57 code used (lock `1.8.3(react-dom@19.2.4)(react@19.2.4)`). Its peer range is `react >=16.8 || ^19`, and React and Next are identical on main, so it is compatible.
- `@types/google.maps` **3.64.0** (devDependency, as before)
- `react-map-gl/maplibre` (unchanged)
- vitest 3 (node env, `src/**/*.test.ts`, no DOM)

**Spec:** [2026-10-22-maps-multi-provider.md](2026-10-22-maps-multi-provider.md) §2, §3, §6.1, §6.3. Stage A plan: [2026-10-23-maps-google-switch-stage-a.md](2026-10-23-maps-google-switch-stage-a.md) (Global Constraints and "Stage B" section). Ops docs: [google-maps-setup.md](../../ops/google-maps-setup.md), [maps-cost-guardrails.md](../../ops/maps-cost-guardrails.md). Billing: [google-places-billing-verification](../../research/2026-10-23-google-places-billing-verification.md).

**Ticket:** TP-0048. Every commit message ends with `[TP-0048]` and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Global Constraints

- **`open` behaves exactly as on `origin/main` (66a8df6):** MapLibre + OpenFreeMap, Geoapify → Photon, Geoapify static map. The default (unset, empty or unknown value) is `open`.
- **No `NEXT_PUBLIC_`.** The server reads `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID` at runtime and sends them down through `MapsConfigProvider`. `GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_URL_SIGNING_SECRET` never leave the server.
- **Google mode is all-or-nothing (Google ToS 14.2, Stage A deferred rule):** `provider:'google'` requires all four of `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_URL_SIGNING_SECRET`, `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID`.
  - In fake mode (`GOOGLE_PLACES_FAKE=1`, which is still ignored when `NODE_ENV=production`), the server key and the signing secret are not required, but the browser key and the Map ID still are.
  - Consequences: Places is never Google without a Google map, and the OG image is always Google whenever Places is Google.
- **The Stage A gate is deleted:** the code no longer forces `open` when `NODE_ENV==='production'`. The new rule is `VERCEL_ENV==='preview'`, which forces `open` with one warning, because the browser key is referrer-locked to production and localhost. Vercel Preview has no Google env vars and no `MAPS_PROVIDER`, so it resolves to `open` anyway, with no warning and no crash.
- **Bundles:** in `google` mode the client must not request `maplibre-gl`, its worker or `tiles.openfreemap.org` until it falls back. In `open` mode it must not request `maps.googleapis.com`.
- **Loader parameters are identical everywhere:** every Google map mounts under the single `GoogleMapsApi` wrapper, with `apiKey` set and no `libraries`, `version` or `solutionChannel` overrides. Different parameters trigger "Maps JavaScript API has already been loaded with different parameters".
- **The fallback is client-only and per page session:**
  - `window.gm_authFailure` or an `APIProvider` `onError` → `markDegraded()` → every seam renders MapLibre until a full reload. vis.gl 1.8.3 never sets `APILoadingStatus.AUTH_FAILURE` itself (checked in `dist/index.modern.mjs`), so we install the handler ourselves.
  - Showing previously saved or just-fetched Google places on MapLibre after a fallback is an **accepted risk** (user decision 2026-10-23, Stage A Global Constraints).
- **Camera parity with MapLibre:** a day frames its pins with padding **48** and max zoom **14**. A single pin uses `centroid`/`deriveZoom`. An active pin pans to itself.
- **Dark mode:** Google uses `colorScheme={theme==='dark' ? ColorScheme.DARK : ColorScheme.LIGHT}`, and MapLibre keeps `mapStyleUrl(theme)`. **No `key={theme}`:** vis.gl already recreates the map when `colorScheme` or `mapId` changes (deps at `dist/index.modern.mjs:1086-1088`); a theme switch costs one load. The app is pinned to light; dark comes only from the `theme=dark` cookie (`app/layout.tsx`).
- **Cost:** vis.gl creates a new `google.maps.Map` (one billed load) every time a `<Map>` mounts, or when its `mapId` or `colorScheme` changes.
  - **Trip map: `reuseMaps`.** Remounts reuse the cached instance instead of creating a new map. That covers React StrictMode's dev double-mount, and a day with no pins (where `persistent-map.tsx` `canRenderMap` unmounts and later remounts the canvas). The result is about one load per page session per colour scheme.
  - **Pin picker: no `reuseMaps`, one load per open.** vis.gl's reuse cache is keyed by `mapId:renderingType:colorScheme` and does not reset other options. The picker shares that key with the trip map but differs in `draggableCursor`, `clickableIcons` and controls, so a reused instance could leak options either way. Picker opens are rare (manual entry only).
  - In google mode the trip map mounts only when its section is visible (Task 3 `useTripMapVisible`), so a phone that never opens the full map pays nothing.
  - Dynamic Maps is free up to 10,000 loads/month; the console quota is 300 loads/day.
- **Secrets in logs:** no command, test or log may print a key or secret. Read them from `app/.env` into shell variables and check output files with `grep -c` (the count must be 0).
- **Production domain:** `https://travel-planner-v2-eight.vercel.app`. **Never** `travel-planner-v2.vercel.app`, which is someone else's app.

## Review Focus

1. **Bad browser key or blocked referrer** (rotated key, new domain, typo): the trip map and the pin picker switch to MapLibre within the same page view. No "Oops! Something went wrong" tile is left behind and nothing throws. → Task 2 `onGoogleAuthFailure` tests; Task 7 Step 6 (invalid key run: **exactly one** `[maps] Google Maps failed to load` console line, which also checks the warn-once guard).
2. **Partial Google env in Production** (for example, Map ID or signing secret not added on Vercel): the whole app stays `open` with exactly one warning naming the missing vars. It never runs Google Places on MapLibre, and never runs Google Places with a Geoapify OG image. → Task 1 `google needs all four` tests.
3. **Preview deployments:** whether `MAPS_PROVIDER` is unset (the normal case) or leaked to Preview, config resolves to `open` with Geoapify static maps (or `null`) and does not throw. → Task 1 `preview stays open` tests; Task 8 pre-check 3.
4. **Server secrets reaching the browser:** the client payload holds only `renderer`, `browserKey` and `mapId`, and `open` mode blanks `serverKey` and `signingSecret`, so no code path can use them. → Task 1 `toClientMapsConfig` and `open blanks server secrets` tests; Task 7 Step 4 (server key count in page HTML = 0).
5. **Wrong bundle or stale camera:** google mode loads MapLibre or OpenFreeMap (double cost, ToS), open mode loads Google, or switching days leaves the camera on the previous day. → Task 3 `toGoogleBounds` test; Task 7 Steps 3 and 5 (resource checks, day switch).
6. **Wrong or raster Map ID** (a typo, a deleted Map ID, or a Raster-type Map ID). Google does **not** call `gm_authFailure` here: the map draws, Advanced Markers do not, and the console logs a Map ID warning. There is no automatic fallback, so this is caught by checks. → Task 7 Step 3 (numbered pins visible, console has no Map ID warning); Task 8 authenticated check (hard pass/fail).

### Carried-forward decisions (Stage A final-review minors)

- **Per-user share of the global Google budgets: deferred.**
  - Why: the app serves one user or a small invited group (setup doc §7). The failure mode is graceful: one user can exhaust a daily bucket, after which Google stays off until reset and search falls back to Geoapify/Photon at no cost. The fix would also mean threading `userId` into `searchPlaces`/`getPlaceDetail` and adding a second limiter round-trip on every keystroke.
  - Trigger to revisit: the first time `Google budget exhausted` shows up in production logs, or once there is more than one regular non-owner user. The note stays in `maps-cost-guardrails.md` (Task 6).
- **In-app cap on Static Maps: not added.**
  - Why: volume is bounded by the OG route's 24 h ISR per trip, the fetch-level `revalidate: 86400`, the console quota of 200/day and unsigned requests set to 0. An in-app cap would put a DB write into the OG route for a SKU that has 10,000 free per month.
  - Revisit if the console shows more than 50 Static Maps requests/day.
- **`serverKey` and `signingSecret` in non-Google configs: blanked.** Once the gate is gone, the only non-Google return is `open`, and it now carries `serverKey:''` and `signingSecret:''`. This is cheap defence in depth. → Task 1.

---

## File map

| File | Change |
|---|---|
| `app/src/lib/maps/config.ts` (+`config.test.ts`) | Remove the gate; all-or-nothing google; Preview rule; `browser` field; blank secrets in open; `toClientMapsConfig` |
| `app/src/lib/maps/client-config.ts` (+test) | **Create.** `ClientMapsConfig`, `OPEN_CLIENT_CONFIG`, `effectiveRenderer` (no `server-only`) |
| `app/src/lib/maps/google-auth-failure.ts` (+test) | **Create.** `onGoogleAuthFailure(host, cb)` |
| `app/src/components/maps-config-provider.tsx` | **Create.** Context, `degraded`, `useMapRenderer`, `useGoogleMapsConfig` |
| `app/src/app/layout.tsx` | Wrap the body in `MapsConfigProvider` |
| `app/src/components/google-maps-api.tsx` | **Create.** The single `APIProvider` wrapper |
| `app/src/components/use-trip-map-visible.ts` | **Create.** Visibility hook (desktop or mobile full-map) gating the Google trip-map mount |
| `app/src/components/map-renderer-props.ts` | **Create.** `LatLng`, `RealMapCanvasProps`, `PinPickerMapProps` |
| `app/src/components/real-map-canvas.tsx` | Becomes the selector (MapLibre body moves out) |
| `app/src/components/real-map-canvas-maplibre.tsx`, `map-active-focus-maplibre.tsx` | **git mv** from `real-map-canvas.tsx` / `map-active-focus.tsx` |
| `app/src/components/real-map-canvas-google.tsx`, `map-active-focus-google.tsx` | **Create.** Restored from `f093d91^` and adapted |
| `app/src/components/pin-picker-map.tsx` | Becomes the selector |
| `app/src/components/pin-picker-map-maplibre.tsx` | **git mv** from `pin-picker-map.tsx` |
| `app/src/components/pin-picker-map-google.tsx`, `map-pick-dot.tsx` | **Create** |
| `app/src/lib/map-helpers.ts` (+`map-helpers.test.ts`) | `FIT_PADDING`, `FIT_MAX_ZOOM`, `toGoogleBounds`, `isTripMapVisible` |
| `app/src/lib/use-theme.ts` (+`use-theme.test.ts`) | `themeFromAttr`; synchronous initial read |
| `app/src/components/persistent-map.tsx` | Comment only (the call site is unchanged) |
| `app/src/lib/places/__fixtures__/google-*.json`, `google.md`, `google-fake.ts`, `google.test.ts`, `search.test.ts` | Live fixtures (Task 5) |
| `app/src/lib/places/search.test.ts:76-80`, `search.routes.test.ts:6`, `app/src/lib/static-map.test.ts:9-23` | Test configs gain the browser key, Map ID and `browser` |
| `app/package.json`, `app/pnpm-lock.yaml` | `@vis.gl/react-google-maps@1.8.3`, `@types/google.maps@3.64.0` (dev) |
| `docs/ops/maps-cost-guardrails.md`, `docs/ops/google-maps-setup.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md`, `AGENTS.md`, `app/.env.example` | Docs (Task 6) |

---

### Task 1: Config — all-or-nothing google, no production gate

**Files:**
- Modify: `app/src/lib/maps/config.ts` (whole `readMapsConfig` body, `MapsConfig` type)
- Create: `app/src/lib/maps/client-config.ts`, `app/src/lib/maps/client-config.test.ts`
- Test: `app/src/lib/maps/config.test.ts`; update fixtures-of-config in `app/src/lib/places/search.test.ts:76-80`, `app/src/lib/places/search.routes.test.ts:6`, `app/src/lib/static-map.test.ts:9-23`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `MapsConfig` gains `browser: { key: string; mapId: string } | null` (non-null iff `provider === 'google'`). `googlePlaces` stays, and now always equals `provider === 'google'`.
  - `readMapsConfig(env?: Env, warn?: (m: string) => void): MapsConfig` (same signature)
  - `toClientMapsConfig(cfg: MapsConfig): ClientMapsConfig` (in `config.ts`)
  - `client-config.ts`:
    - `export type ClientMapsConfig = { renderer: 'google' | 'maplibre'; browserKey: string; mapId: string }`
    - `export const OPEN_CLIENT_CONFIG: ClientMapsConfig = { renderer: 'maplibre', browserKey: '', mapId: '' }`
    - `export function effectiveRenderer(cfg: ClientMapsConfig, degraded: boolean): 'google' | 'maplibre'`: `'google'` only when `cfg.renderer==='google'` and `browserKey` and `mapId` are both non-empty and `!degraded`

Resolution rules (in order):
1. Parse `MAPS_PROVIDER`; unknown values warn as today.
2. Google requested and `env.VERCEL_ENV === 'preview'` → `open`, and warn `MAPS_PROVIDER=google ignored on Vercel Preview; using open`.
3. Google requested → `missing` = the env var names, in this order, that are empty after trim: `GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_URL_SIGNING_SECRET` (both skipped when `fake`), then `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID`. If `missing` is non-empty → `open`, and warn `` `MAPS_PROVIDER=google needs ${missing.join(', ')}; using open` ``.
4. Otherwise → `google`, with `googlePlaces:true`, `browser:{ key, mapId }`, and `staticMap` = `'google'` if the server key and secret are both set, else the Geoapify fallback (reachable only in fake mode).
5. Every `open` result → `browser:null`, `google.serverKey:''`, `google.signingSecret:''` (caps and `fake` unchanged).

Delete the `provider === 'google' && isProd` branch and its comment, and the separate `SIGNING_SECRET is missing` warning (it is now part of rule 3). `isProd` still gates `fake`.

- [ ] **Step 1: Write the failing tests** in `config.test.ts`. `KEYS` becomes `{ GOOGLE_MAPS_API_KEY:'S', GOOGLE_MAPS_URL_SIGNING_SECRET:'X', GOOGLE_MAPS_BROWSER_KEY:'B', GOOGLE_MAPS_MAP_ID:'M' }`.
  - Delete `Stage A gate: google in production is forced to open`.
  - Replace `google with a key but no secret falls back…` with the `google needs all four` cases below.
  - `google with all four in production turns everything on`: `{ MAPS_PROVIDER:'google', ...KEYS, NODE_ENV:'production' }` → `provider:'google'`, `googlePlaces:true`, `staticMap:'google'`, `browser` equal to `{ key:'B', mapId:'M' }`, `warn` not called.
  - `google needs all four`: `it.each(['GOOGLE_MAPS_API_KEY','GOOGLE_MAPS_URL_SIGNING_SECRET','GOOGLE_MAPS_BROWSER_KEY','GOOGLE_MAPS_MAP_ID'])`. Drop that var from `KEYS` and add `GEOAPIFY_API_KEY:'G'`, `NODE_ENV:'production'`. Expect `provider:'open'`, `googlePlaces:false`, `staticMap:'geoapify'`, `browser:null`, `warn` called once, and the message containing the dropped name.
  - `google without a key stays off and warns once` keeps its assertions. The message now names all four vars; still assert `/GOOGLE_MAPS_API_KEY/`.
  - `preview stays open`:
    - (a) `{ NODE_ENV:'production', VERCEL_ENV:'preview', GEOAPIFY_API_KEY:'G' }` → `open`, `staticMap:'geoapify'`, `browser:null`, `warn` not called.
    - (b) the same plus `MAPS_PROVIDER:'google', ...KEYS` → `open`, `warn` once, matching `/Preview/`.
    - (c) `{ VERCEL_ENV:'preview' }` with nothing else → `staticMap:null`, and the call does not throw.
  - `open blanks server secrets`: `read({ ...KEYS })` gives `cfg.google.serverKey === ''`, `cfg.google.signingSecret === ''` and `cfg.browser === null`. The same holds for the Preview case (b).
  - `toClientMapsConfig`:
    - From the all-four production config → `{ renderer:'google', browserKey:'B', mapId:'M' }`.
    - From `read({})` → equals `OPEN_CLIENT_CONFIG`.
    - With the server key `'server-secret-S'` and the signing secret `'signing-secret-X'`, `JSON.stringify(result)` must `not.toContain` either value.
  - Fake mode:
    - `turns google on without a key…` adds `GOOGLE_MAPS_BROWSER_KEY:'B', GOOGLE_MAPS_MAP_ID:'M'` → `provider:'google'`, `staticMap:null`, no warning.
    - New: `fake still needs the browser key and map id`: `{ MAPS_PROVIDER:'google', GOOGLE_PLACES_FAKE:'1', NODE_ENV:'development' }` → `open`, warn matching `/GOOGLE_MAPS_BROWSER_KEY, GOOGLE_MAPS_MAP_ID/`.
    - `is ignored in production` keeps its assertions.
- [ ] **Step 2: Write `client-config.test.ts`**: `effectiveRenderer`
  - `({renderer:'google',browserKey:'B',mapId:'M'}, false)` → `'google'`
  - the same with `degraded=true` → `'maplibre'`
  - `({renderer:'google',browserKey:'',mapId:'M'}, false)` → `'maplibre'`
  - `({renderer:'google',browserKey:'B',mapId:''}, false)` → `'maplibre'`
  - `(OPEN_CLIENT_CONFIG, false)` → `'maplibre'`
- [ ] **Step 3: Run tests to verify they fail.** Run `cd app && pnpm vitest run src/lib/maps` → FAIL (`toClientMapsConfig` / `client-config` missing; production google test still gated).
- [ ] **Step 4: Implement** `client-config.ts`, then the rules above in `config.ts`.
- [ ] **Step 5: Update the other configs** so they still mean google:
  - `search.test.ts:76-80`: add `GOOGLE_MAPS_BROWSER_KEY:'B', GOOGLE_MAPS_MAP_ID:'M'` to both `gcfg` and `fakeCfg`.
  - `search.routes.test.ts:6`: use `{ MAPS_PROVIDER:'google', GOOGLE_MAPS_API_KEY:'S', GOOGLE_MAPS_URL_SIGNING_SECRET:'X', GOOGLE_MAPS_BROWSER_KEY:'B', GOOGLE_MAPS_MAP_ID:'M' }`.
  - `static-map.test.ts` `cfg()` literal: add `browser: null`.
- [ ] **Step 6: Run the full suite and typecheck.** Run `cd app && pnpm test 2>&1 | tail -3 && pnpm typecheck 2>&1 | tail -3` → all tests pass, no TS errors.
- [ ] **Step 7: Commit.** `feat(maps): google mode needs all four Google vars; drop Stage A production gate [TP-0048]`

### Task 2: Client maps context and auth-failure fallback

**Files:**
- Create: `app/src/lib/maps/google-auth-failure.ts`, `app/src/lib/maps/google-auth-failure.test.ts`, `app/src/components/maps-config-provider.tsx`
- Modify: `app/src/app/layout.tsx` (import `MAPS_CONFIG`, `toClientMapsConfig`; wrap the content of `<body>`, outermost inside `<body>`)

**Interfaces:**
- Consumes: `ClientMapsConfig`, `OPEN_CLIENT_CONFIG`, `effectiveRenderer` (Task 1); `MAPS_CONFIG`, `toClientMapsConfig` (Task 1).
- Produces:
  - `onGoogleAuthFailure(host: { gm_authFailure?: () => void }, cb: () => void): () => void`
  - `'use client'` `MapsConfigProvider({ value, children }: { value: ClientMapsConfig; children: React.ReactNode })`
  - `useMapRenderer(): 'google' | 'maplibre'`, which is `effectiveRenderer(value, degraded)`
  - `useGoogleMapsConfig(): { browserKey: string; mapId: string; markDegraded: () => void }`
  - The default context value (no provider in the tree) is `OPEN_CLIENT_CONFIG` with `degraded:false`, so any tree without the provider renders MapLibre.

Behaviour:
- `markDegraded` is a stable `useCallback` guarded by a `useRef<boolean>`: if `ref.current` is already true it returns; otherwise it sets `ref.current = true`, calls `console.warn('[maps] Google Maps failed to load; using MapLibre')` and then `setDegraded(true)`. The warning never sits inside a state updater (StrictMode runs updaters twice), so it is logged once per page session even when both `gm_authFailure` and `onError` fire.
- When `value.renderer === 'google'`, the provider installs `onGoogleAuthFailure(window, markDegraded)` in a `useEffect` and returns its cleanup. It runs at the root. Child effects run before parent effects, so `APIProvider` may inject the script before this handler is installed. That is still safe: Google only calls `gm_authFailure` after the script has loaded and checked the key, a network round trip after this effect has run.

- [ ] **Step 1: Write the failing tests** (`google-auth-failure.test.ts`, plain objects, no DOM):
  - `calls cb and any previous handler`: `host = { gm_authFailure: prev }`; install; `host.gm_authFailure!()` → `cb` and `prev` each called once.
  - `cleanup restores the previous handler`: after cleanup, `host.gm_authFailure === prev`. With no previous handler, `host.gm_authFailure` is `undefined`.
  - `cleanup leaves a later handler alone`: install, then set `host.gm_authFailure = other`, then cleanup → still `other`.
- [ ] **Step 2: Run the test to verify it fails.** Run `cd app && pnpm vitest run src/lib/maps/google-auth-failure.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `google-auth-failure.ts`, then `maps-config-provider.tsx`, and wire `layout.tsx`: `<MapsConfigProvider value={toClientMapsConfig(MAPS_CONFIG)}>`. `MAPS_CONFIG` is a module constant evaluated once per server instance from runtime env, so changing any of these env vars needs a new deployment (Task 8 redeploys). The layout is dynamic (`cookies()`), so nothing is baked in at build time.
- [ ] **Step 4: Run tests, typecheck and lint.** Run `cd app && pnpm test 2>&1 | tail -3 && pnpm typecheck 2>&1 | tail -3 && pnpm lint 2>&1 | tail -3` → all pass.
- [ ] **Step 5: Commit.** `feat(maps): MapsConfigProvider with degraded fallback flag [TP-0048]`

### Task 3: Trip map — renderer selector and Google canvas

**Files:**
- `git mv app/src/components/real-map-canvas.tsx app/src/components/real-map-canvas-maplibre.tsx`
- `git mv app/src/components/map-active-focus.tsx app/src/components/map-active-focus-maplibre.tsx` (update the import in the MapLibre canvas)
- Create:
  - `app/src/components/real-map-canvas.tsx` (selector)
  - `app/src/components/real-map-canvas-google.tsx`
  - `app/src/components/map-active-focus-google.tsx`
  - `app/src/components/google-maps-api.tsx`
  - `app/src/components/map-renderer-props.ts`
  - `app/src/components/use-trip-map-visible.ts`
- Modify:
  - `app/src/lib/map-helpers.ts` (+ `map-helpers.test.ts`)
  - `app/src/lib/use-theme.ts` (+ create `use-theme.test.ts`)
  - `app/src/components/persistent-map.tsx:19` (comment only: "map renderers are client-only")
  - `app/package.json`, `app/pnpm-lock.yaml`

**Interfaces:**
- Consumes: `useMapRenderer`, `useGoogleMapsConfig` (Task 2); `Pin`, `centroid`, `deriveZoom`, `pinBounds` (`lib/map-helpers.ts`); `PinBadge` (`map-pin-badge.tsx`); `styles` (`map-canvas.module.css`).
- Produces:
  - `map-renderer-props.ts`:
    - `export type LatLng = { lat: number; lng: number }`
    - `export type RealMapCanvasProps = { dayLabel: string; totalDistance?: string | null; totalTime?: string | null; pins: Pin[]; activePlaceId?: string | null; onActivate?: (id: string) => void }` (moved verbatim from today's `real-map-canvas.tsx`)
    - `export type PinPickerMapProps = { center: LatLng; value: LatLng | null; onPick: (p: LatLng) => void; zoom?: number }`
  - `map-helpers.ts`:
    - `export const FIT_PADDING = 48`
    - `export const FIT_MAX_ZOOM = 14`
    - `export function toGoogleBounds(b: [[number, number], [number, number]]): { south: number; west: number; north: number; east: number }`
  - `use-theme.ts`: `export function themeFromAttr(v: string | null): 'light' | 'dark'`. `useTheme` initialises with `useState(() => typeof document === 'undefined' ? 'light' : themeFromAttr(document.documentElement.getAttribute('data-theme')))`. This is safe because the only callers are `ssr:false` map components. Without it, the Google map would be created light and then recreated dark when the effect corrects the theme, costing two loads.
  - `google-maps-api.tsx`: `GoogleMapsApi({ children })` → `<APIProvider apiKey={browserKey} onError={markDegraded}>`
  - `real-map-canvas-google.tsx`: `export default function RealMapCanvasGoogle(props: RealMapCanvasProps)`
  - `app/src/components/use-trip-map-visible.ts`: `export function useTripMapVisible(): boolean`, built with `useSyncExternalStore(subscribe, getSnapshot, () => false)` (server snapshot `false`).
    - `getSnapshot` = `isTripMapVisible(matchMedia('(min-width: 768px)').matches, document.body.dataset.fullmap)`.
    - `subscribe` listens to the media query's `change` event and to a `MutationObserver` on `document.body` (`attributeFilter: ['data-fullmap']`, set by `map-panel-toggle.tsx:14-17`, shown via `globals.css:227`), and its cleanup removes both. `768px` is Tailwind's `md`, which matches the section's `hidden md:block`.
  - `map-helpers.ts`: `export function isTripMapVisible(wide: boolean, fullmap: string | undefined): boolean` (the pure rule the hook uses).
  - `map-active-focus-google.tsx`: `export function ActiveFocusGoogle({ activePin, pins, pinsSig }: { activePin: Pin | null; pins: Pin[]; pinsSig: string })`
  - The `real-map-canvas.tsx` selector: `export default function RealMapCanvas(props: RealMapCanvasProps)` renders `dynamic(() => import('./real-map-canvas-google'), { ssr:false })` when `useMapRenderer()==='google'`, else `dynamic(() => import('./real-map-canvas-maplibre'), { ssr:false })`. Both `dynamic` calls sit at module scope.

Google canvas (adapt `git show f093d91^:app/src/components/real-map-canvas.tsx`):
- The outer default export renders `<GoogleMapsApi><Inner {...props}/></GoogleMapsApi>`, because `useMap('trip-map')` needs the provider above it.
- `<Map id="trip-map" reuseMaps mapId={mapId} colorScheme=… defaultCenter={centroid(pins)} defaultZoom={deriveZoom(pins)} disableDefaultUI gestureHandling="greedy">`.
  - There is no `process.env` Map ID any more and no `key`. vis.gl recreates the map on a `colorScheme` change; `reuseMaps` covers remounts (Global Constraints, Cost).
  - A reused instance is re-attached and gets `map.setOptions(mapOptions)`, including the center and zoom from the `default*` props, so it does not keep its old camera. `ActiveFocusGoogle` runs on mount and refits the day, so the end state is correct either way.
  - With `reuseMaps`, vis.gl skips `clearInstanceListeners` on unmount (the instance goes back to the cache with its listeners). The `h.remove()` and ResizeObserver cleanups in `ActiveFocusGoogle` are therefore **load-bearing**: without them, a cached map would carry a stale clamp into its next mount.
- **Mount only when visible.** The visibility latch sits in the outer default export, **above** `<GoogleMapsApi>` (`APIProvider` injects the script on mount). It renders nothing until `useTripMapVisible()` first returns true, then latches mounted for the rest of the session (same idea as `persistent-map`'s `everOpened`). A phone that never opens the full map pays no load.
  - After the latch, the map can be hidden again (mobile Map → List; desktop `/trip/<id>/hotels`, where the section is `display:none`). Day changes while hidden are handled in `ActiveFocusGoogle` below (skip the fit at 0×0, refit on resize).
- `AdvancedMarker` per pin with `anchorPoint={AdvancedMarkerAnchorPoint.CENTER}`, `onClick → onActivate`, the hover `div` and `PinBadge`, as in the old code. Google anchors bottom-centre by default, MapLibre `Marker` centres, so this keeps pins on the same spot.
- `InfoWindow` hover/active popup: `pixelOffset={[0,-18]}` (matches MapLibre `offset={18}`), `disableAutoPan`, `headerDisabled`, with the same inline content as the MapLibre popup.
- Zoom buttons: `map.setZoom((map.getZoom() ?? deriveZoom(pins)) + delta)`.
- Overlays (day pill, distance chip) are identical to the MapLibre canvas.

`ActiveFocusGoogle`, with effect deps `[map, activePin, pinsSig]`. This is the one algorithm the tests do not pin down, so here it is in full:

```ts
useEffect(() => {
  if (!map) return;
  if (activePin) { map.panTo({ lat: activePin.lat, lng: activePin.lng }); return; } // no observer on the pan path
  if (pins.length === 0) return;
  const div = map.getDiv();
  let h: google.maps.MapsEventListener | null = null;
  const fit = () => {
    if (div.offsetWidth === 0) return;            // hidden (display:none): fit later
    h?.remove(); h = null;                         // never two clamps armed
    const b = pinBounds(pins);
    if (b) {
      h = google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM);
      });
      map.fitBounds(toGoogleBounds(b), FIT_PADDING);
    } else {
      map.moveCamera({ center: centroid(pins), zoom: deriveZoom(pins) });
    }
  };
  fit();
  let lastW = div.offsetWidth;                     // read before observe
  const ro = new ResizeObserver(() => {
    const w = div.offsetWidth;
    if (lastW === 0 && w > 0) fit();               // shown again: refit once
    lastW = w;
  });
  ro.observe(div);
  return () => { ro.disconnect(); h?.remove(); };  // load-bearing with reuseMaps
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [map, activePin, pinsSig]);
```

- This covers mobile Map → List → switch day → Map, and desktop `/trip/<id>/hotels` (`dayIdx` falls back to 0 while hidden) → back to the itinerary with the same `pinsSig`.
- If `fitBounds` doesn't move the camera, the map still fires one `idle`, so the clamp is consumed and doesn't stay armed until a later user pan. The `eslint-disable` matches `map-active-focus.tsx:35`.
- Drop the old `resize` listener; the MapLibre variant has none.

The MapLibre canvas and its focus also switch their literal `48` and `14` to `FIT_PADDING` / `FIT_MAX_ZOOM`. No behaviour change.

- [ ] **Step 1: Add dependencies.** Run `cd app && pnpm add -E @vis.gl/react-google-maps@1.8.3 && pnpm add -D -E @types/google.maps@3.64.0`. Expected: `package.json` has `"@vis.gl/react-google-maps": "1.8.3"` and `"@types/google.maps": "3.64.0"`, the lockfile resolves `@vis.gl/react-google-maps` to version `1.8.3` (pnpm writes it with peer suffixes, `1.8.3(react-dom@…)(react@…)`; match the `1.8.3` prefix, not a literal), and there are no React peer warnings.
- [ ] **Step 2: Write the failing tests:**
  - `map-helpers.test.ts` `toGoogleBounds`: `toGoogleBounds([[100.49, 13.74], [100.52, 13.76]])` equals `{ south: 13.74, west: 100.49, north: 13.76, east: 100.52 }`; `FIT_PADDING === 48`; `FIT_MAX_ZOOM === 14`.
  - `use-theme.test.ts`: `themeFromAttr('dark')` → `'dark'`; `'light'`, `null` and `'system'` each → `'light'`.
  - `map-helpers.test.ts` `isTripMapVisible`: `(true, undefined)` → true; `(false, '1')` → true; `(false, undefined)` → false; `(false, '0')` → false.
- [ ] **Step 3: Run the tests to verify they fail.** Run `cd app && pnpm vitest run src/lib/map-helpers.test.ts src/lib/use-theme.test.ts` → FAIL (exports missing).
- [ ] **Step 4: Implement** the helpers, `themeFromAttr`, `useTripMapVisible`, the git mv's, the props module, `GoogleMapsApi`, the Google canvas and focus, and the selector.
- [ ] **Step 5: Run tests, typecheck and lint.** Run `cd app && pnpm test 2>&1 | tail -3 && pnpm typecheck 2>&1 | tail -3 && pnpm lint 2>&1 | tail -3` → pass. Also, from `app/`, run `grep -rnE "lib/maps-config['\"]|NEXT_PUBLIC_GOOGLE" src` → no matches.
- [ ] **Step 6: Commit.** `feat(maps): Google trip map renderer behind a selector [TP-0048]`

### Task 4: Pin picker — selector and Google picker

**Files:**
- `git mv app/src/components/pin-picker-map.tsx app/src/components/pin-picker-map-maplibre.tsx`
- Create: `app/src/components/pin-picker-map.tsx` (selector), `app/src/components/pin-picker-map-google.tsx`, `app/src/components/map-pick-dot.tsx`
- Unchanged call sites (verify only): `hotel-edit-modal.tsx:13,240`, `place-manual-form.tsx:15,177`, `hotel-manual-form.tsx:12,170`

**Interfaces:**
- Consumes: `PinPickerMapProps`, `LatLng` (Task 3); `GoogleMapsApi` (Task 3); `useMapRenderer`, `useGoogleMapsConfig` (Task 2); `useTheme` (Task 3).
- Produces:
  - `export function PickDot()` renders the 28 px blue dot (style moved verbatim from today's `pin-picker-map.tsx`), and both pickers use it.
  - `export default function PinPickerMapGoogle(props: PinPickerMapProps)` → `<GoogleMapsApi><Map mapId colorScheme defaultCenter={center} defaultZoom={zoom ?? 12} gestureHandling="greedy" disableDefaultUI zoomControl clickableIcons={false} draggableCursor="crosshair" onClick={e => e.detail.latLng && onPick({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng })}>{value ? <AdvancedMarker position={value} anchorPoint={AdvancedMarkerAnchorPoint.CENTER}><PickDot/></AdvancedMarker> : null}</Map></GoogleMapsApi>`
    - `clickableIcons={false}`, so a POI click does not open Google's own info window.
    - **No `reuseMaps`** (Global Constraints, Cost): one load per picker open.
  - The `pin-picker-map.tsx` selector: `export default function PinPickerMap(props: PinPickerMapProps)`, with the same two-`dynamic` pattern as Task 3.

- [ ] **Step 1: Implement** the git mv, `PickDot` (the MapLibre picker switches to it), the Google picker and the selector.
- [ ] **Step 2: Run tests, typecheck and lint.** Run `cd app && pnpm test 2>&1 | tail -3 && pnpm typecheck 2>&1 | tail -3 && pnpm lint 2>&1 | tail -3` → pass. Also run `git diff --stat origin/main -- app/src/components/{hotel-edit-modal,place-manual-form,hotel-manual-form}.tsx` → empty.
- [ ] **Step 3: Commit.** `feat(maps): Google pin picker behind a selector [TP-0048]`

(No unit test here: the selector and the Google picker are thin JSX over Task 2/3 units that are already tested. Task 7 Step 5 drives the picker in a real browser.)

### Task 5: Live Google fixtures

**Files:**
- Replace: `app/src/lib/places/__fixtures__/google-autocomplete.json`, `google-details-full.json`
- Create: `google-details-basic.json`, `google-details-second.json`
- Delete: `google-details-thipsamai.json`
- Modify: `__fixtures__/google.md`, `google-fake.ts`, `google.test.ts`, `search.test.ts:212-220`

**Interfaces:**
- Consumes: `GOOGLE_MASKS`, `GOOGLE_BIAS` (`lib/places/google.ts:6,11`); `fakeGoogleFetch()` (`google-fake.ts`).
- Produces:
  - `fakeGoogleFetch()` has the same signature. Its `DETAILS` map is keyed by the **live** second suggestion's `placeId`, read from the autocomplete fixture at module load (`suggestions[1].placePrediction.placeId`), never hard-coded.
  - Unknown ids still get the first place's full details.
  - The basic mask is still filtered by `applyMask`.

**Cost:** 4 calls in total.
- One session: 1 Autocomplete request + 1 Place Details **Essentials** (basic mask, same `sessionToken`).
- 2 Place Details **Enterprise** (full mask, no session; the full mask has no Atmosphere field).
- List price ≈ $0.0028 + $0.005 + 2 × $0.020 ≈ **$0.05**. All of this is inside the monthly free tiers (10,000 / 10,000 / 1,000), so the actual cost is **$0**.
- This is one call more than the ≈3 in the brief. The fourth call keeps the "re-pick a different place" fake flow on real data.

- [ ] **Step 1: Capture.** Run from `app/` in one shell:
  - The key never appears in argv echo or in output.
  - Use `"$(python3 -c 'import uuid;print(uuid.uuid4())')"` for `$S`.

```bash
set -euo pipefail; set +x
K=$(grep -E '^GOOGLE_MAPS_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "\"'"); [ -n "$K" ] || { echo "no server key in .env"; exit 1; }
S=$(python3 -c 'import uuid;print(uuid.uuid4())'); F=src/lib/places/__fixtures__
FULL='id,displayName,formattedAddress,location,types,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount'
# The key goes in through a curl config on stdin (-K -), so it never shows in argv / ps.
hdr() { printf 'header = "X-Goog-Api-Key: %s"\n' "$K"; }
hdr | curl -sf -K - -X POST https://places.googleapis.com/v1/places:autocomplete -H "Content-Type: application/json" \
  -d "{\"input\":\"jay fai\",\"languageCode\":\"en\",\"sessionToken\":\"$S\",\"locationBias\":{\"circle\":{\"center\":{\"latitude\":13.75,\"longitude\":100.5},\"radius\":50000}}}" > $F/google-autocomplete.json \
&& P0=$(node -e 'console.log(require("./'$F'/google-autocomplete.json").suggestions[0].placePrediction.placeId)') \
&& P1=$(node -e 'console.log(require("./'$F'/google-autocomplete.json").suggestions[1].placePrediction.placeId)') \
&& hdr | curl -sf -K - "https://places.googleapis.com/v1/places/$P0?languageCode=en&sessionToken=$S" -H "X-Goog-FieldMask: id,formattedAddress,location,types" > $F/google-details-basic.json \
&& hdr | curl -sf -K - "https://places.googleapis.com/v1/places/$P0?languageCode=en" -H "X-Goog-FieldMask: $FULL" > $F/google-details-full.json \
&& hdr | curl -sf -K - "https://places.googleapis.com/v1/places/$P1?languageCode=en" -H "X-Goog-FieldMask: $FULL" > $F/google-details-second.json
grep -c -F -f <(printf '%s\n' "$K") $F/google-*.json || true; unset K S   # pattern from a pipe, not argv
```

  - Expected: each `grep -c` prints `0`. The autocomplete file has at least 2 `placePrediction`s, and both full files have `displayName` and `location`.
  - `set -e` plus the `&&` chain stop at the first failed call (`curl -sf` exits non-zero on a non-2xx). Report which call failed. **Do not retry in a loop.** If the autocomplete returns fewer than 2 suggestions, `P1` fails and nothing else is billed.
  - The FULL mask string must equal `GOOGLE_MASKS.full`; check with `grep -F "$FULL" src/lib/places/google.ts`.
  - Pretty-print each file with `node -e` (2-space JSON) before committing.
- [ ] **Step 2: Update `google.md`.** Replace "Hand-written; replace with live capture in Stage B." with the following:
  - `Live capture 2026-10-24 (TP-0048)`
  - the request shape of each file (input `jay fai`, `languageCode en`, Bangkok bias, which mask, session yes/no)
  - "4 calls, inside free tier"
  - "test data only; do not copy into the DB"
  - Keep the doc URLs. Replace the fake-id paragraph with: "the second suggestion's details are `google-details-second.json`; `google-fake.ts` keys them by that id".
- [ ] **Step 3: Update the tests first.** Replace the `ChIJfake…` literals and the `'Jay Fai'` / `'Thipsamai'` names in `google.test.ts:34-35,117-130` and `search.test.ts:212-220` with the captured values:
  - ids from the autocomplete file
  - `name` = `structuredFormat.mainText.text`
  - `secondary` = `secondaryText.text`
  - `kind` = `kindFromGoogleTypes(types)`, written as the expected literal
  - Add `parses the live basic details`: `googleDetails(P0, { fields:'basic', … fetchImpl: mk(basicFx) })` → `name:''`, `address` = the captured `formattedAddress`, `lat`/`lng` = the captured `location`, `phone:null`, `rating:null`.
- [ ] **Step 4: Run the tests.** Run `cd app && pnpm vitest run src/lib/places 2>&1 | tail -5`. Any failure is parser drift: fix `google.ts` parsers (not the fixture) so they read the live shape. Keep `RawDetails` / `Prediction` as the documented shape, and record each drift fix in `google.md` under "Drift fixed".
- [ ] **Step 5: Rewire `google-fake.ts`** to the new files (`DETAILS[secondId] = detailsSecond`), delete `google-details-thipsamai.json`, then run `cd app && pnpm test 2>&1 | tail -3` → pass.
- [ ] **Step 6: Commit.** `test(places): live Google Places fixtures replace hand-written ones [TP-0048]`

### Task 6: Docs

**Files:** `docs/ops/maps-cost-guardrails.md`, `docs/ops/google-maps-setup.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md`, `AGENTS.md`, `app/.env.example`

- [ ] **Step 1: `maps-cost-guardrails.md`.**
  - Intro: remove the "Until Stage B … forces open" sentence. Add: "google needs all four Google vars or runs open; Preview always open".
  - Services table: add the row `Google Maps JavaScript API | google mode: trip map + pin picker (`real-map-canvas-google.tsx`, `pin-picker-map-google.tsx`) | `GOOGLE_MAPS_BROWSER_KEY` (browser, referrer-locked) + `GOOGLE_MAPS_MAP_ID` | Dynamic Maps 10,000 loads/month free; console quota 300 map loads/day`.
  - Guardrails (google mode): one bullet on the load model (a load = one `google.maps.Map` creation; the trip map uses `reuseMaps`, so remounts (no-pin days, StrictMode in dev) reuse it, giving about one load per page session per colour scheme; it mounts only when visible, so a phone pays nothing until full-map is opened; each pin-picker open is one load; a theme switch is one load) and one on the fallback (`gm_authFailure` / loader error → MapLibre for the page session).
  - Replace "## Stage B to-do" with "## Deferred" and record the per-user budget and Static Maps decisions with their revisit triggers (Review Focus, carried-forward).
- [ ] **Step 2: `google-maps-setup.md`.**
  - §9.2: replace the "`MAPS_PROVIDER` ยังไม่ต้องตั้ง…" paragraph with the Stage B state: `MAPS_PROVIDER=google` is set on **Production only** via `printf google | vercel env add MAPS_PROVIDER production`; Preview has no Google vars and stays `open`; google mode needs all 4 values or it runs `open` and logs a warning. Keep the user's Thai style.
  - §9.3: drop "# เปิดเมื่อโค้ดพร้อม".
  - The line "browser key กับ Map ID ทดสอบจาก curl ไม่ได้…": say they were tested in Stage B (localhost) and at go-live.
  - Checklist: add `- [ ] 11 MAPS_PROVIDER=google (Production) + redeploy`.
- [ ] **Step 3: `ARCHITECTURE.md`.**
  - Row `Maps` (line 16): "MapLibre or Google Maps JS (`MAPS_PROVIDER`)".
  - Row `MAPS_PROVIDER` (line 67): "google needs `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_URL_SIGNING_SECRET`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID`, else open; forced open on Vercel Preview".
  - Add rows for `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID` ("server reads at runtime, sent to the client via `MapsConfigProvider`; not `NEXT_PUBLIC_`").
- [ ] **Step 4: `AGENTS-INDEX.md`.**
  - Line 13 stack: add `@vis.gl/react-google-maps` (google mode).
  - Lines 185-189: describe the selectors, plus new rows for `*-maplibre.tsx`, `*-google.tsx`, `google-maps-api.tsx`, `maps-config-provider.tsx`, `map-renderer-props.ts` and `map-pick-dot.tsx`.
  - Line 296: drop "Stage A production gate"; add `toClientMapsConfig`.
  - Add `maps/client-config.ts` and `maps/google-auth-failure.ts`.
  - Line 368: "Import map renderers only through the selector files (`real-map-canvas.tsx`, `pin-picker-map.tsx`); never import `*-google`/`*-maplibre` directly".
- [ ] **Step 5: `AGENTS.md:43-45`.** Basemap = MapLibre in open mode, Google Maps JS in google mode, chosen by `MapsConfigProvider`.
- [ ] **Step 6: `app/.env.example:87-108`.**
  - Remove the "Forced to open when NODE_ENV=production…" and "arrive in Stage B and are not read yet" lines.
  - Add `GOOGLE_MAPS_BROWSER_KEY=""` (comment: Maps JavaScript API only, HTTP-referrer restricted; the server reads it at runtime and passes it to the browser; not `NEXT_PUBLIC_`) and `GOOGLE_MAPS_MAP_ID=""` (comment: JavaScript vector Map ID, required for Advanced Markers).
  - State: "google needs all four Google values, else open + one warning".
  - Note on `GOOGLE_PLACES_FAKE`: "still needs the browser key and Map ID".
- [ ] **Step 7: Commit.** `docs(maps): Stage B renderer, env and guardrails [TP-0048]`

### Task 7: Verification gates (implementer, real browser key, bounded)

**Budget for the whole task.** Count a load as each `google.maps.Map` creation, not each page view. `pnpm dev` runs React StrictMode, which double-mounts: the trip map absorbs that through `reuseMaps`, but each pin-picker open counts as **2** loads in dev (1 in production). Count with the console's Map loads metric afterwards if it is available; otherwise count picker opens × 2 + trip-map page sessions × colour schemes.
- ≤ **20** Dynamic Maps loads
- ≤ **3** real-Google search sessions (≤ 1 full details + ≤ 2 basic details)
- everything else in fake mode
- Log a running count in the report.

Never print a key. Never use `app/.env`'s `DATABASE_URL`: process env overrides `.env` in Next, so set both DB vars explicitly on every command.

- [ ] **Step 1: Unit tests and build in both modes.** From `app/`, set `D=postgres://u:p@localhost:5432/x` and run:
  - `pnpm test 2>&1 | tail -3` → pass
  - `DATABASE_URL=$D DATABASE_URL_UNPOOLED=$D pnpm build 2>&1 | tail -3` → success
  - `DATABASE_URL=$D DATABASE_URL_UNPOOLED=$D MAPS_PROVIDER=google pnpm build 2>&1 | tail -3` → success
- [ ] **Step 2: Throwaway DB.** This is the recipe that worked for Stage A (`/tmp/tpb`); put the scripts in a new `/tmp/tp-stage-b/`, outside the repo.
  - `docker run -d --rm --name tpb-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=tp -p 127.0.0.1:55499:5432 postgres:16`, then wait for `pg_isready`.
  - `IP=$(docker inspect -f '{{.NetworkSettings.IPAddress}}' tpb-pg)`; `docker run -d --rm --name tpb-neon -p 127.0.0.1:4444:4444 -e PG_CONNECTION_STRING=postgres://postgres:pw@$IP:5432/tp ghcr.io/timowilhelm/local-neon-http-proxy:main`.
  - Migrate: `DATABASE_URL=postgres://postgres:pw@127.0.0.1:55499/tp DATABASE_URL_UNPOOLED=postgres://postgres:pw@127.0.0.1:55499/tp pnpm db:migrate` → applied. Print only the host drizzle used.
  - `/tmp/tp-stage-b/preload.cjs` wraps `globalThis.fetch`: any URL matching `^https?://[a-z]+\.localtest\.me(:\d+)?/sql` is sent to `http://127.0.0.1:4444/sql` with the same init. This is needed because the neon-http driver posts to `https://<host>/sql`.
  - `/tmp/tp-stage-b/start.sh <MAPS_PROVIDER> <GOOGLE_PLACES_FAKE> [browserKeyOverride]`:
    - exports `DATABASE_URL=postgres://postgres:pw@db.localtest.me:55499/tp`, `DATABASE_URL_UNPOOLED=postgres://postgres:pw@127.0.0.1:55499/tp`, `AUTH_BYPASS=true`, `NODE_OPTIONS="--require /tmp/tp-stage-b/preload.cjs"`, `MAPS_PROVIDER=$1`, `GOOGLE_PLACES_FAKE=$2`
    - exports `GOOGLE_MAPS_BROWSER_KEY=$3` only when `$3` is given (the Google keys otherwise come from `app/.env`)
    - runs `exec pnpm dev` on http://localhost:3210, which the browser key's referrer list allows (setup doc §4)
- [ ] **Step 3: google + fake Places.** Run `start.sh google 1`, then use a desktop viewport (≥ 1024 px; the map is `hidden md:block`):
  - Create a trip, then add 2 places on day 1 via the day "add place" picker: pick suggestion 1, then suggestion 2 (live fixtures). Add one hotel through the manual form and drop a pin.
  - Expected:
    - The trip map is Google (Google logo, `maps.googleapis.com` in `performance.getEntriesByType('resource')`), and the numbered `PinBadge`s are **visible** (hard fail otherwise: a bad Map ID draws the map with no markers). The browser console has no `Map ID` / `mapId` warning.
    - No resource matches `/openfreemap|maplibre-gl-worker/`.
    - Hovering a pin shows the popup with name and category/time.
    - Clicking a pin sets `?placeId=` and pans there; clicking again clears it.
    - The zoom ± buttons work.
- [ ] **Step 4: Secrets in HTML.** With the dev server still up: `K=$(grep -E '^GOOGLE_MAPS_API_KEY=' .env | cut -d= -f2- | tr -d "\"'"); X=$(grep -E '^GOOGLE_MAPS_URL_SIGNING_SECRET=' .env | cut -d= -f2- | tr -d "\"'"); { [ -n "$K" ] && [ -n "$X" ]; } || exit 1; curl -s http://localhost:3210/trip/<id> | grep -c -F -f <(printf '%s\n' "$K" "$X"); unset K X` → `0`. The patterns come from a process substitution, so neither value appears in argv.
- [ ] **Step 5: Camera, picker and dark mode.**
  - Add a place on day 2, then switch days: the map refits each day and the zoom never exceeds 14 for close pins.
  - In the hotel manual form and the place manual form, the picker is Google; a click drops the `PickDot`, and a POI click does not open Google's info window.
  - Run `document.cookie='theme=dark; path=/'` and reload: both maps render in the dark scheme (one load each).
  - **Mobile full map:** resize the viewport to 390×844 and reload the trip page.
    - Before toggling: no `maps.googleapis.com` resource is requested (the map is not mounted).
    - Tap the map toggle (`map-panel-toggle`, which sets `body[data-fullmap='1']`): the Google map mounts full-screen and frames the day's pins (not a zoomed-out world view from a 0×0 fit).
    - Toggle back and forth twice: no extra `google.maps.Map` (the map stays mounted).
    - **Hidden day switch:** with the full map open on day 1, go back to the list, switch to day 2, then open the map again. It must frame day 2's pins (not day 1's camera, and not a 0×0 world view).
  - **Desktop sub-page:** with `?day=1` on the itinerary, open `/trip/<id>/hotels` and then go back to the itinerary for day 1. The map frames day 1.
- [ ] **Step 6: Fallback.**
  - Restart with `start.sh google 1 AIzaSyInvalidKeyForStageBFallback000000` and open the trip map. Expected:
    - the console shows `InvalidKeyMapError`, then **exactly one** `[maps] Google Maps failed to load; using MapLibre` line (count it, and again after also opening the pin picker; still one)
    - the map is MapLibre (`openfreemap` resources appear), and pins and the popup work
    - opening the pin picker also gives MapLibre
  - Nothing throws.
- [ ] **Step 7: google + real Places (≤ 3 sessions).**
  - Run `start.sh google ""`.
  - Run one day "add place" search (`fields=full`) and one hotel search (`fields=basic`), each ending with a pick.
  - Expected: suggestions come from Google (attribution `Google Maps`); the picked place saves with coords and appears on the Google map.
  - Check the server log for `[places] Google breaker` / `budget` warnings: none expected.
- [ ] **Step 8: open mode unchanged.** Run `start.sh open ""`. Expected:
  - the map and pickers are MapLibre with no `maps.googleapis.com` resource
  - Photon/Geoapify attribution
  - pins, popup, focus and day switch behave as on main
- [ ] **Step 9: Clean up and report.**
  - Run `docker rm -f tpb-neon tpb-pg`; leave `/tmp/tp-stage-b`.
  - Report PASS/FAIL per step with the map-load and search counts.
  - The controller opens the PR against `main` (title `feat(maps): Stage B Google map renderer [TP-0048]`).

### Task 8: Go-live runbook (controller only)

All `vercel` commands run from `~/development/travel-planner-v2` (the linked project `travel-planner-v2`).

- [ ] **Pre-merge check (before merging the Task 7 PR).** The Stage A gate is gone, so if `MAPS_PROVIDER=google` is already set in Production, merging would switch Production to Google without the steps below.
  - Run `vercel env ls production | grep -c '^ *MAPS_PROVIDER '` → `0`. If it prints anything else, run `vercel env rm MAPS_PROVIDER production --yes` first.
  - Only then merge. The rest of this task runs after the merge deployment.

- [ ] **Pre-check 1.** The production deployment of the merge commit is **Ready** and serves the new code.
  - Run `vercel inspect https://travel-planner-v2-eight.vercel.app` and record the deployment URL as `$PROD` (used for redeploy and rollback).
  - Confirm the SHA. Plain `inspect` output may not show it, so try `vercel inspect https://travel-planner-v2-eight.vercel.app --format=json` and read the git commit SHA from the metadata (`meta.githubCommitSha`). If that flag or field isn't available, use `vercel ls travel-planner-v2 --prod` (newest Ready production deployment, created after the merge time) and confirm the commit on the Vercel dashboard. If the SHA cannot be matched, stop.
- [ ] **Pre-check 2: Console (ask the user to confirm; we cannot read it).**
  - The browser key's referrers include `https://travel-planner-v2-eight.vercel.app/*`, and the key is restricted to the Maps JavaScript API.
  - The Map ID is JavaScript/Vector.
  - Quotas: Map loads/day 300, Place Details/day 135, Autocomplete/day 300, Static/day 200, unsigned 0.
  - The budget alert exists.
- [ ] **Pre-check 3: Env names only.**
  - `vercel env ls production` lists `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_URL_SIGNING_SECRET`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID` and `GEOAPIFY_API_KEY`, and no `MAPS_PROVIDER` (re-confirms the pre-merge check).
  - `vercel env ls preview` lists none of `MAPS_PROVIDER` / `GOOGLE_MAPS_*`.
  - If any production name is missing, stop: the deploy would run `open` with a warning (Task 1 rule 3).
- [ ] **Baseline smoke** (before the flip):
  - `curl -s -o /dev/null -w '%{http_code}\n' 'https://travel-planner-v2-eight.vercel.app/api/places/autocomplete?q=bangkok'` → `401`
  - the same for `/api/places/details?id=ChIJN1t_tDeuEmsRUsoyG83frY4` → `401`
  - `curl -s https://travel-planner-v2-eight.vercel.app/sign-in | grep -o '<title>[^<]*'` → contains `Traver Planel`
  - Renderer marker: `curl -s https://travel-planner-v2-eight.vercel.app/sign-in | grep -c 'renderer[^a-z]*google'` → `0`.
    - Why this works: the root layout serialises `ClientMapsConfig` (`{renderer, browserKey, mapId}`) as `MapsConfigProvider` props into the RSC payload of every page, sign-in included, as `\"renderer\":\"google\"` (or `…\"maplibre\"`). The regex skips the escaped quotes and the colon.
    - The browser key is public by design (referrer-locked), so its presence on sign-in is expected.
- [ ] **Flip:** `printf google | vercel env add MAPS_PROVIDER production --yes`, then `vercel redeploy $PROD --target production`, and wait for Ready.
- [ ] **Smoke after the flip:**
  - Repeat the baseline: still 401 / 401 / title.
  - **Positive check:** the renderer marker grep now prints a count of at least `1`. If it prints `0`, the deploy is running `open` (most likely a missing var), so go to the log check.
  - Logs:
    - Run `vercel logs --environment production --since 10m --query "MAPS_PROVIDER"`. There must be **no** `MAPS_PROVIDER=google needs` / `ignored on Vercel Preview` line.
    - Run `vercel logs <new deployment url> --follow` for about 2 minutes while the user opens the app. There must be no `Google breaker` / `budget exhausted` lines.
- [ ] **Authenticated check:**
  - If the controller has a signed-in browser session, run ≤ 2 searches (1 place, 1 hotel) and open one trip map.
  - Otherwise, hand the user this manual check:
    1. Open a trip on desktop: the map shows the Google logo. **The numbered pins must be visible (hard pass/fail):** a map with no pins means a wrong or raster Map ID, which does not trigger the fallback, so roll back. Check DevTools Console for any `Map ID` / `mapId` warning. Hover shows the popup; a click focuses the pin.
    2. Add a place: the results footer says `Google Maps`; picking saves the place and it appears on the map.
    3. Open the hotel manual form: the picker is Google and a click drops the dot.
    4. Share-preview a public trip (optional): the OG image renders.
- [ ] **Rollback** (any failure, or the user asks):
  - **Primary:** `vercel env rm MAPS_PROVIDER production --yes`, then `vercel redeploy <current prod url> --target production`.
    - Wait until it is **Ready**: the command waits by default, so never pass `--no-wait`. Confirm with `vercel inspect <new deployment url>` (status Ready).
    - A normal redeploy keeps production-domain auto-assignment on, so there is no promote step.
    - Verify: `vercel inspect https://travel-planner-v2-eight.vercel.app` shows the new deployment URL; the renderer marker grep → `0`; the baseline smoke passes; a trip map shows MapLibre.
  - **Emergency only** (the redeploy is failing and Production is broken), and only if the flip deployment is still the newest production deployment:
    - Run `vercel rollback $PROD --yes`. `$PROD` is the pre-flip deployment: same code, no `MAPS_PROVIDER`.
    - Vercel then turns off automatic assignment of the production domains. Once a fixed deployment is Ready, run `vercel promote <that url>` and confirm the alias with `vercel inspect https://travel-planner-v2-eight.vercel.app`.
- [ ] **Watch for 1 week:**
  - `vercel logs` for `Google breaker open` / `Google budget exhausted` / `[maps] Google Maps failed to load` (the last is client-side; ask the user to report it).
  - Daily: `select key, count, window_start from rate_limit where key like 'gplaces:%'` vs console Metrics, and console Map loads vs 300/day.
  - Tick setup-doc checklist item 11.
