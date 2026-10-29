# Map Degraded Notice Implementation Plan

> **Ticket:** TP-0086

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Google Maps fails and the page session falls back to MapLibre, the trip map says so with a small dismissible chip ("Backup map · Google unavailable"), the failure is logged once with its cause, and the map's no-places state has clear copy.

**Architecture:** A pure `degradeOnce` in `lib/maps/degraded.ts` replaces the ref-based warn-once in `MapsConfigProvider`. `markDegraded` now takes a reason (`load_error` / `auth` / `render_error`, the same values the telemetry plan's `map_degraded` event uses) so the single log line says why, and its `onDegrade(reason)` callback is the one hook the telemetry plan adds `track()` to. In `open` mode `markDegraded` is a no-op: there is no Google to lose. A `MapDegradedChip` reads `degraded` from the existing context and renders top-right inside the MapLibre trip canvas, which is the only renderer that can be showing while the session is degraded. Dismissal is kept in a module variable, so it lasts exactly as long as `degraded` does: one page load. A reload retries Google and shows the chip again if it still fails.

**Tech Stack:** React 19, CSS modules, vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md`: §2.2 M13, TL;DR #9, §7.5 ("Google โหลดไม่ได้: chip "แผนที่สำรอง" + fallback MapLibre") and §10 MAP-07.

**Touches:** `components/maps-config-provider.tsx`, `components/google-maps-api.tsx`, `components/google-map-error-boundary.tsx`, `components/real-map-canvas-maplibre.tsx`, `components/map-canvas.module.css`, `components/persistent-map.tsx` (one copy string), `docs/ops/maps-cost-guardrails.md` (log line quote)

**Order vs other plans:** land **before** `2026-10-29-research-usability-telemetry.md`. That plan also changes `markDegraded`'s signature (`maps-config-provider.tsx`, `google-maps-api.tsx:15`, `google-map-error-boundary.tsx:29,76`); after this plan it only adds `track('map_degraded', { reason })` inside `onDegrade` and imports `DegradeReason` instead of declaring its own.

## Global Constraints

- Copy (EN; i18n is forced to `en`, TH from the review in brackets for later): the chip reads `Backup map · Google unavailable` [แผนที่สำรอง · Google ไม่พร้อมใช้งาน]. The dismiss button's `aria-label` is `Dismiss backup map notice`. The no-places placeholder (`persistent-map.tsx:150-154`, currently "Add a spot to see it on the map.") becomes `No places with a location yet. Add one and it shows up here.`
- Log once per page session: `console.warn('[maps] Google Maps unavailable (<reason>); using the backup map', detail?)`. This is the only log line; the existing warn-once rule stays (`google-map-error-boundary.tsx:10`).
- `open` mode never degrades. Today `MapRendererBoundary` calls `markDegraded` for **any** caught render error, including MapLibre's own first catch batch in open mode (`google-map-error-boundary.tsx:54-56,76`; `lib/maps/renderer-boundary.ts:20-21` then re-renders the children). That flips `degraded` and logs "Google Maps failed" on a page that never used Google. With the chip it would also show "Google unavailable" on the open-mode map. `markDegraded` is built only when `value.renderer === 'google'`, otherwise it is a no-op.
- The chip uses `.mapPill` (it already has a dark override) and has `role="status"`. The dismiss hit area is at least 44×44 (A14). The chip sits top-right with `top: calc(16px + env(safe-area-inset-top))`, because mobile full-map hides the header and the map reaches the notch. From `md` up it sits at `top: 68px`, below the single md+ top row (day bar left, "Search places" button right) that `PersistentMap` renders per the day-bar and search-distance plans (their scrutiny files fix 68px as the start of canvas top overlays on md+). No new hex.
- The chip never shows in `open` mode, because `markDegraded` is a no-op there (above).
- No Google calls, no cost impact.

## Review Focus

1. **Several failure signals in one session** (`gm_authFailure`, then the boundary catching the marker throw on the dead map): exactly one log line (the first reason) and one state flip. Test: `degradeOnce` (Task 1).
2. **`APIProvider` `onError` passes an error object.** Wired straight to the new `markDegraded(reason, detail)`, the error would land in `reason`. Every caller wraps it with an explicit reason. Typecheck catches this once `reason` is a string union (Task 2).
3. **Dismiss, then switch days or sub-pages** (the canvas can unmount and remount): the chip stays dismissed for the page session. Manual check in Task 3.
4. **Mobile full-map:** the chip must not cover the carousel, the List/Map toggle or the MapLibre attribution, and must clear the notch. Manual check at 390×844 (Task 3).
5. **Open mode / Google healthy:** no chip and no log, even when MapLibre itself throws once (the renderer boundary's first catch batch). Test: `degradeOnce(..., { enabled: false })` never logs or degrades (Task 1). Manual check in Task 3 with `MAPS_PROVIDER=open`.

---

### Task 1: Pure warn-once + copy

**Files:**
- Create: `app/src/lib/maps/degraded.ts`
- Test: `app/src/lib/maps/degraded.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DegradeReason = 'load_error' | 'auth' | 'render_error'; // = telemetry map_degraded.reason
  export const DEGRADED_LABEL = 'Backup map · Google unavailable';
  export function degradedLogLine(reason: DegradeReason): string; // '[maps] Google Maps unavailable (auth); using the backup map'
  export function degradeOnce(
    log: (line: string, detail?: unknown) => void,
    onDegrade: (reason: DegradeReason) => void,
    o?: { enabled?: boolean },                     // false in open mode → a no-op
  ): (reason: DegradeReason, detail?: unknown) => void;
  ```

- [ ] **Step 1: Write failing tests**
  - `'logs the first reason once and degrades once'`: call `mark('auth')` then `mark('render_error', new Error('x'))`. `log` is called once, with `degradedLogLine('auth')`, and `onDegrade` is called once, with `'auth'`.
  - `'passes the detail through'`: `mark('load_error', err)` → `log` receives `(line, err)`.
  - `'disabled (open mode) never logs or degrades'`: `degradeOnce(log, onDegrade, { enabled: false })('render_error')` → neither is called.
  - `'label copy'`: `DEGRADED_LABEL === 'Backup map · Google unavailable'`.
- [ ] **Step 2: Run** `cd app && pnpm vitest run src/lib/maps/degraded.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(maps): degrade-once with a reason [TP-0086]`

### Task 2: Reasons at every call site + the chip + placeholder copy

**Files:**
- Modify: `app/src/components/maps-config-provider.tsx:7-13,19-30,41-49` (`markDegraded: (reason: DegradeReason, detail?: unknown) => void`, built with `degradeOnce((l, d) => console.warn(l, …), () => setDegraded(true), { enabled: value.renderer === 'google' })` inside a `useState` initialiser, which replaces `warned`. The auth hook calls `() => markDegraded('auth')`. The context default and `useGoogleMapsConfig`'s return type change to the new signature.)
- Modify: `app/src/components/google-maps-api.tsx:15` (`onError={(e) => markDegraded('load_error', e)}`)
- Modify: `app/src/components/google-map-error-boundary.tsx`. Both `componentDidCatch(error)` methods forward `error` to `onError(error)` (the props type becomes `(error: unknown) => void`). Both wrappers become `onError={(e) => markDegraded('render_error', e)}` (`:29`, `:76`).
- Create: `app/src/components/map-degraded-chip.tsx`
- Modify: `app/src/components/real-map-canvas-maplibre.tsx` (render `<MapDegradedChip />` as a sibling of the corner overlays, right after `</Map>` at `:169`; the top-left day chip at `:171-174` may already be gone if the day-bar plan landed)
- Modify: `app/src/components/map-canvas.module.css` (new `.overlayTr` with `top: calc(16px + env(safe-area-inset-top)); right: 16px` and `@media (min-width: 768px) { .overlayTr { top: 68px } }`, added to the shared overlay rule at `:32-39`; new `.chipClose`: 32×32 transparent round button with a `::after { inset: -6px }` hit extension, `position: relative` on the button)
- Modify: `app/src/components/persistent-map.tsx:150-154` (placeholder copy)

**Interfaces:**
- Consumes: Task 1 (`DegradeReason`, `DEGRADED_LABEL`, `degradeOnce`), `useGoogleMapsConfig().degraded`, `Close` from `@/components/icons` (as `pin-card.tsx` uses it).
- Produces: `export function MapDegradedChip(): JSX.Element | null` (`'use client'`). Module-level `let dismissedThisPage = false`, and `useState(() => dismissedThisPage)`. Dismiss sets both. It renders `null` unless `degraded && !dismissed`. Markup: `<div data-map-degraded className={styles.overlayTr}><div className={styles.mapPill} role="status">{DEGRADED_LABEL}<button className={styles.chipClose} aria-label="Dismiss backup map notice"><Close width={14} height={14} /></button></div></div>`.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Gates** `pnpm typecheck && pnpm lint && pnpm test` (tail -3 each) → clean. `markDegraded` now requires `reason`, so `typecheck` must flag any call site still passing the raw error (Review Focus 2).
- [ ] **Step 3: Commit** `feat(map): "Backup map" chip when Google is unavailable; clearer no-places copy [TP-0086]`

### Task 3: Verify in the real app + docs

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Open trip `79efe162-dfb2-46c2-ad46-a34695771b8b` with Playwright at 1440×900. Google map, no chip, no `[maps]` warning.
- [ ] Force degradation: `browser_evaluate(() => window.gm_authFailure?.())`. The map swaps to MapLibre and the top-right chip reads `Backup map · Google unavailable`. The console has exactly **one** `[maps] Google Maps unavailable (auth); using the backup map` line, even though the boundary also catches the marker throw (Review Focus 1).
- [ ] Alternative trigger, for a fresh load: `page.route('**/maps.googleapis.com/**', r => r.abort())` before navigation, via `browser_run_code_unsafe` → the chip appears and the log says `(load_error)`.
- [ ] Dismiss → the chip goes away. Switch days and open Bookings, then return → the chip is still gone. Reload → Google is retried (Review Focus 3).
- [ ] At 1440×900 the chip sits below the top row (day bar / "Search places" button) if those plans have landed (else 68px down), never over them.
- [ ] At 390×844, full-map: the chip is top-right, clears the notch area, and does not overlap the carousel, toggle or attribution. Dark theme renders legibly (Review Focus 4).
- [ ] `MAPS_PROVIDER=open`: no chip, no log (Review Focus 5).
- [ ] A trip with no located places → the placeholder reads `No places with a location yet. Add one and it shows up here.`
- [ ] `AGENTS-INDEX.md`. Map section: add `map-degraded-chip.tsx` ("top-right 'Backup map · Google unavailable' chip in the MapLibre trip canvas while the session is degraded; dismiss lasts the page session"). Maps lib: add `maps/degraded.ts` (`DegradeReason`, `degradeOnce`, `DEGRADED_LABEL`). Update the `maps-config-provider.tsx` and `google-maps-api.tsx` rows: `markDegraded(reason, detail?)`, no-op in open mode.
- [ ] `docs/ops/maps-cost-guardrails.md` "Fallback" bullet (`:153-157`): `markDegraded(reason)` and the new log line text.
- [ ] `REQUIREMENTS.md` §10: add one bullet: "If Google Maps fails to load, the map falls back to MapLibre for the page session and shows a dismissible 'Backup map · Google unavailable' chip."
- [ ] Commit `docs: degraded map notice [TP-0086]`

---

## Notes and dependencies

- **Camera-rules plan (`2026-10-29-map-camera-rules.md`):** independent. After it lands, the placeholder only shows for a trip with no located place at all, and empty days get their own in-map note from that plan. The copy here reads correctly in both states. Both plans touch `map-canvas.module.css`, in different rules (`.overlayTl` vs the new `.overlayTr`), and `persistent-map.tsx`, in different lines.
- **M13 "log to telemetry": owned by `2026-10-29-research-usability-telemetry.md`.** This plan ships first and exposes `onDegrade(reason)`; the telemetry plan adds `track('map_degraded', { reason })` there (inside the same once-guard) and reuses `DegradeReason`, whose values already match its allowlist.
- **Not done: the chip on the manual pin-picker maps** (`pin-picker-map-maplibre.tsx`). These are short-lived form maps, and the trip map is where users notice the style change. Add the chip there later if needed.
