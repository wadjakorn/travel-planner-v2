# Mobile Map Stop Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In mobile full-map mode, show a swipeable strip of the day's stops (synced with the pins) plus a day switcher, so "go to the next stop" takes 2 taps instead of 4–5.

**Architecture:** A new `MapStopCarousel` is rendered by `PersistentMap` inside the map section and is visible only in mobile full-map mode (CSS: `md:hidden` + `body[data-fullmap='1']`). The URL (`?day=&placeId=`) stays the single source of truth: a settled swipe calls a non-toggling, history-replacing `activate`; a pin tap scrolls the strip to its card. The Google/MapLibre InfoWindow pin card is suppressed while the strip is showing (the strip card *is* the card). Zoom buttons and distance chips are hidden in mobile full-map so nothing overlaps the strip, the List/Map toggle, or the Google logo.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, CSS scroll-snap, `@vis.gl/react-google-maps`, `react-map-gl/maplibre`, vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §12 ("ขั้น A") and §2.2 M7/M8/M9. User decision 2026-10-29: try option A (keep the List/Map toggle).

## Global Constraints

- Mobile only (`< 768px`, Tailwind `md`). Desktop/tablet layout and behavior unchanged.
- Keep the List/Map toggle (`map-panel-toggle.tsx`). No bottom sheet.
- Google logo + "Terms" row (bottom-left/bottom) must stay visible (Maps ToS).
- No new API calls, no new billed loads. Photos in cards: none in v1 (pin card already fetches; don't multiply photo requests per card).
- Touch targets ≥ 44×44 CSS px for every control in the strip.
- Fonts: `var(--font-sans)`; colors via tokens (`bg-surface`, `text-muted`, `border-border`, `bg-brand`) — no new hex.
- Respect `prefers-reduced-motion` (no smooth scroll when set).
- Copy (EN, i18n is forced to `en` today): `Navigate`, `Previous day`, `Next day`, `No places with a location on this day.`

## Review Focus

1. **Swipe → URL churn:** each settled swipe must `router.replace` (not `push`) — Back must leave the trip page, not walk through every card. Test: `stopActivateHref` builds the same URL; component uses `replace` (Task 2 step).
2. **Pin tap while strip shows** must scroll the strip to that card, and a swipe-induced activation must not re-trigger a scroll loop. Test in Task 2 (`indexOfPin`) + manual check in Task 4.
3. **Day with 0 located pins / day switch at bounds:** strip shows the empty message; `‹` disabled on day 0, `›` disabled on last day. Test `dayNav` (Task 1).
4. **Search preview open on mobile:** the preview InfoWindow and the strip coexist; strip must not hide the preview's "Add to Day" button — preview focus offset (`PREVIEW_OFFSET_Y`) keeps the card above center; verify manually (Task 4).
5. **Navigate link for a stop without a Google id** (manual coords, hotel booking) must still produce a usable directions URL (lat,lng destination). Test in Task 1 (`stopNavUrl`).

---

### Task 1: Pure helpers — day nav + per-stop navigate URL

**Files:**
- Create: `app/src/lib/map-carousel.ts`
- Modify: `app/src/lib/gmaps.ts` (add `gmapsNavigateUrl`)
- Test: `app/src/lib/map-carousel.test.ts`, `app/src/lib/gmaps.test.ts`

**Interfaces:**
- Consumes: `Pin` from `@/lib/map-helpers`; `gmapsDirectionsUrl` from `@/lib/gmaps` (Place shape: `{ name, address, lat, lng, placeIdExternal }`).
- Produces:
  - `dayNav(dayIdx: number, dayCount: number): { prev: number | null; next: number | null }`
  - `stopNavUrl(pin: Pin): string` — directions **to** the stop from the user's current location. **Do not** use `gmapsDirectionsUrl([place])`: with one place it sets origin = destination (scrutiny 2026-10-29). Add `gmapsNavigateUrl(p: Place, travelmode = 'driving'): string` to `lib/gmaps.ts` — `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=…` with **no `origin`** (Google uses the device location) plus `&destination_place_id=` for Google ids; same `enc`/`placeIdOf` rules as `gmapsDirectionsUrl` (extract them to module scope). `stopNavUrl` = `gmapsNavigateUrl({ name, lat, lng, placeIdExternal: googleId })`.
  - `stopActivateHref(tripId: string, dayIdx: number, placeId: string | null): string` — `/trip/${tripId}?day=${dayIdx}` plus `&placeId=` when set.
  - `indexOfPin(pins: Pin[], id: string | null): number` — `-1` when absent.

- [ ] **Step 1: Write failing tests**

```ts
describe('dayNav', () => {
  it('first day has no prev', () => expect(dayNav(0, 5)).toEqual({ prev: null, next: 1 }));
  it('last day has no next', () => expect(dayNav(4, 5)).toEqual({ prev: 3, next: null }));
  it('single day has neither', () => expect(dayNav(0, 1)).toEqual({ prev: null, next: null }));
});
describe('stopNavUrl', () => {
  it('uses coords when no google id', () => {
    const u = stopNavUrl({ id: 'a', idx: 1, kind: 'sight', lat: 35.1, lng: 139.2, name: 'X', googleId: null });
    expect(u).toContain('destination=35.1%2C139.2');
  });
  it('uses the google place id when present', () => {
    const u = stopNavUrl({ id: 'a', idx: 1, kind: 'food', lat: 35, lng: 139, name: 'Tsuta', googleId: 'ChIJabc' });
    expect(u).toContain('destination_place_id=ChIJabc');
  });
});
it('stopActivateHref', () => {
  expect(stopActivateHref('t1', 2, 'p9')).toBe('/trip/t1?day=2&placeId=p9');
  expect(stopActivateHref('t1', 0, null)).toBe('/trip/t1?day=0');
});
it('indexOfPin', () => {
  const pins = [{ id: 'a' }, { id: 'b' }] as Pin[];
  expect(indexOfPin(pins, 'b')).toBe(1);
  expect(indexOfPin(pins, null)).toBe(-1);
});
```

Also in `app/src/lib/gmaps.test.ts`:

```ts
it('gmapsNavigateUrl has no origin', () => {
  const u = gmapsNavigateUrl({ name: 'X', lat: 1, lng: 2 });
  expect(u).not.toContain('origin=');
  expect(u).toContain('destination=1%2C2');
});
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/map-carousel.test.ts` → FAIL (module not found)
- [ ] **Step 3:** Implement the four functions in `app/src/lib/map-carousel.ts`.
- [ ] **Step 4:** Re-run → PASS
- [ ] **Step 5:** Commit `feat(map): carousel helpers (day nav, stop navigate url) [TP-0076]`

### Task 2: `MapStopCarousel` component + `PersistentMap` wiring

**Files:**
- Create: `app/src/components/map-stop-carousel.tsx`
- Modify: `app/src/components/persistent-map.tsx` (render the strip; add non-toggling replace activation; pass `hidePinCard`)
- Modify: `app/src/components/map-renderer-props.ts` (add `hidePinCard?: boolean` to `RealMapCanvasProps`)
- Modify: `app/src/components/real-map-canvas-google.tsx`, `app/src/components/real-map-canvas-maplibre.tsx` (when `hidePinCard`, don't render the active pin's card/popup; hover tooltip unaffected)

**Interfaces:**
- Consumes: Task 1 helpers; `useMapPreview().fullMap`; `MapDay` from `@/lib/day-augment`.
- Produces:
  ```ts
  export function MapStopCarousel(props: {
    tripId: string;
    days: MapDay[];          // for the day switcher label + bounds
    dayIdx: number;
    activePlaceId: string | null;
    onSelect: (placeId: string) => void;   // settled swipe / card tap → replace, never toggles off
  }): JSX.Element | null
  ```

Behavior (decided):
- Root: `<div data-map-carousel className="absolute inset-x-0 z-[55] md:hidden" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>` — renders `null` unless `fullMap` is true.
- Header row (left-aligned, 44px tall): `‹` button (`aria-label="Previous day"`), label `Day {idx+1} · {label} {num}`, `›` button (`aria-label="Next day"`); buttons `disabled` per `dayNav`. Day change → `router.replace(stopActivateHref(tripId, n, null), { scroll: false })`.
- Strip: `<ul role="list">` horizontal, `overflow-x-auto snap-x snap-mandatory`, `scroll-padding-inline: 16px`, cards `snap-center`, width `calc(100vw - 64px)` max 320px, gap 12px, `bg-surface border border-border rounded-2xl shadow-[var(--shadow-md)] p-3`.
- Card content: index circle (same color as the pin via `KIND_COLOR`, 28px) · name (1 line, ellipsis) · `category · time` (`text-muted`, 1 line) · `Navigate` link (`stopNavUrl(pin)`, `target="_blank"`, ≥44px tall, brand color). Structure per card: `<li>` containing a `<button type="button">` (index + name + meta; click → `onSelect(pin.id)`) and, as a **sibling** (never nested inside the button), the Navigate `<a>`. Active card: `ring-2 ring-[var(--brand)]` and `aria-current="true"`.
- Settled swipe: an `IntersectionObserver` (root = strip, threshold 0.6) tracks the most-visible card; after scrolling stops (`scrollend`, fallback 150 ms debounce on `scroll`) call `onSelect(pin.id)` if different from `activePlaceId`.
- External activation (pin tap / URL change): `useEffect` on `activePlaceId` → `cards[indexOfPin].scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })`. Guard against loops with a ref holding the id the strip itself just selected (skip scrolling for that id).
- No pins: header + a single card-shaped `<p>` "No places with a location on this day."

`PersistentMap` changes:
- New `select(id)` (non-toggling): same as `activate` but `router.replace` and never clears to `''`. Pin taps keep using `activate`. (Each settled swipe is one RSC round-trip of the page, same as a pin tap today; the transition coalesces rapid swipes. Accepted for v1 — `window.history.replaceState` would skip the server but leave the hidden list's active row stale.)
- Render `<MapStopCarousel …/>` as a sibling of the canvas inside the `<section>` (also when the day has no pins, so the day switcher still works — i.e. render it whenever `everOpened`).
- `hidePinCard={fullMap && !isWide}` where `isWide` = `matchMedia('(min-width: 768px)')` via a tiny `useSyncExternalStore` (or reuse `useTripMapVisible`'s query constant — export `WIDE_QUERY` from `use-trip-map-visible.ts`).

- [ ] **Step 1:** Implement `map-stop-carousel.tsx` per the behavior above.
- [ ] **Step 2:** Wire into `persistent-map.tsx`; add `hidePinCard` to props and both renderers.
- [ ] **Step 3:** `cd app && pnpm typecheck && pnpm lint` → no errors (tail -3).
- [ ] **Step 4:** Commit `feat(map): mobile stop carousel synced with pins [TP-0076]`

### Task 3: Declutter mobile full-map (no overlaps)

**Files:**
- Modify: `app/src/app/globals.css` (mobile full-map block, ~L270–290)
- Modify: `app/src/components/map-panel-toggle.tsx` (bottom offset in full-map)

Decided values (mobile, `body[data-fullmap='1']` only):
- Hide the canvas zoom stack and distance chips: add `data-map-zoom` / `data-map-dist` attributes on those wrappers in both renderers and `display:none !important` them in the full-map block (pinch-zoom remains).
- Toggle: `bottom: calc(16px + env(safe-area-inset-bottom))` in full-map (currently `bottom-20` for the bottom nav, which is hidden in full-map). Implement as `bottom-20 [body[data-fullmap='1']_&]:bottom-[calc(16px+env(safe-area-inset-bottom))]` or a CSS rule on `[data-map-toggle]` in the same block — prefer the CSS rule (keeps all full-map rules together).
- Carousel sits at `72px` above the bottom (Task 2), i.e. above the 44px toggle + 16px + 12px gap.

- [ ] **Step 1:** Add the attributes + CSS rules.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test` → all pass (tail -3).
- [ ] **Step 3:** Commit `fix(map): no overlapping controls in mobile full-map [TP-0076]`

### Task 4: Verify in the real app (390×844 + 1440×900)

- [ ] Run `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210` (3210 is in the browser-key referrer allowlist).
- [ ] Mobile 390×844, trip with ≥3 located stops: Map → strip visible, Google logo visible, no overlap with toggle. Screenshot.
- [ ] Swipe to card 2 → pin 2 active, camera pans, **no InfoWindow card**; browser Back leaves the trip page in ≤ 1 step from the itinerary entry (replace, not push).
- [ ] Tap pin 3 → strip scrolls to card 3.
- [ ] `›` → day 2 pins + strip; on last day `›` disabled; empty day shows the message.
- [ ] Search a place, preview on map → preview card's "Add to Day" reachable above the strip.
- [ ] Desktop 1440: unchanged (no strip, pin card still shows on click).
- [ ] MapLibre mode (`MAPS_PROVIDER=open`): strip works the same.
- [ ] Update `AGENTS-INDEX.md` (Map section: `map-stop-carousel.tsx`, `lib/map-carousel.ts`). Commit `docs(index): map stop carousel [TP-0076]`.
