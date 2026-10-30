# Scrutiny: Mobile map chrome consistency (TP-0118)

Plan: [2026-10-30-mobile-map-chrome-consistency.md](2026-10-30-mobile-map-chrome-consistency.md) · base `f9abe00` · Next 16.2.4
Method: I traced the plan against the code, then ran the dev server (:3210, auth bypass) at 390×844 in `en` and `th`, using Playwright to inspect the DOM and `history.state`.

## 1. Intent and simpler alternative

**Goal:** list and map share one switch in one place, the map-mode bottom stack shares one centre axis and one spacing scale, and the nav stays reachable from the map without breaking #125's Back behaviour.

**Alternatives considered:**

- **Drop C5.** Not viable. With the nav visible (and, in Thai, it already is; see M1), "Calendar from the map → Back" lands in list mode, and the next Back is a dead press.
- **Simpler C5 shape (adopted).** Reopen from `MapPanelToggle`'s existing mount/cleanup effect by calling the existing `openFullMap()`. This needs no new provider effect and no new state.

The direction (same pill in both modes, nav kept, centred stack, header hidden) holds up. I found no hard blocker against it.

## 2. Findings

### Blocker

**B1. C5(b) mount-reopen in the provider never fires on Calendar → Back.** *Applied.*

- **Why:** the headline C5 scenario (C7.5) would fail. The map stays closed, and the dead press is still there.
- **Evidence:** `MapPreviewProvider` is rendered by `app/src/app/trip/[id]/layout.tsx`, which persists across all trip sub-pages. `next.config.ts` has no `cacheComponents`, so `layout-router.js:623` doesn't wrap routes in `<Activity>`. Only the itinerary page (`MapPanelToggle`) unmounts and remounts.
- **Browser check:** after Calendar → Back, `[data-map-toggle]` remounted and `body[data-fullmap]` stayed absent. Traverse keeps custom state (`completeTraverseNavigation`, `preserveCustomHistoryState: true`), and the restore `replaceState` carried `tpFullMap`. So the tag is there for a mount check to read, but the provider never runs a mount check.
- **Fix:** in `MapPanelToggle`'s mount effect, `if (isPhone() && isFullMapEntry(history.state)) openFullMap()`. On a tagged entry, `openFullMap` already sets `fullRef`, `lastMapHref` and `owns`, calls `setFullMap(true)`, and doesn't push.

### Major

**M1. The nav-hide selector is dead in Thai. The plan's premise ("map mode hides the nav") holds in English only.** *Applied (C2 + C7 + critique note).*

- **Evidence:** `globals.css:338` selects `[aria-label='Trip navigation']`. `trip-rail-frame.tsx:85` sets `aria-label={t('nav_trip_aria')}`, which is "เมนูทริป" in th since #123.
- **Browser check (`lang=th`, map mode at HEAD):** the nav is `display: flex`, z-30, at rect y 788–844, and `elementFromPoint` at the bottom hits a nav link. The map section is 844 px and runs under the nav.
- The owner's prod screenshot shows no nav. I could not reproduce that locally. A hide-on-scroll state is the likely cause.
- **Consequences:**
  - Thai users can already reach C5's broken "Calendar from the map" path.
  - Any new CSS hook must not use a localised attribute.
- **Fix:** add a `data-trip-nav` hook, and check C7 in both `en` and `th`.

**M2. C2's height change is under-specified, and the obvious version is off by 56 px.** *Applied.*

- **Evidence:** the `[data-trip-map-section]` rule also forces `min-height: 100dvh !important`. Changing only `height` leaves the section at 100dvh, so the carousel ends up under the nav.
- The `> div > div:not([data-map-toggle])` rule matches nothing. The layout div's children are `NAV, DIV[data-map-toggle], ASIDE, SECTION` (verified), because the itinerary page renders a fragment.
- **Fix:**
  - Keep `pb-14`: delete the `padding-bottom: 0` override and keep `100dvh`. Under border-box, the content box is then 100dvh − 56.
  - Set the section's `height` and `min-height` to `calc(100dvh - var(--mobile-nav-h))`.
  - Delete the dead rule.
  - Add the acceptance check `section.bottom === nav.top`.

**M3. C5(a)'s re-tag misses router commits that don't change the URL.** *Applied.*

- **Evidence:** `router.refresh()` and server-action revalidation go through `navigateToKnownRoute` with `preserveCustomHistoryState: false` (`refresh-reducer.js:69-70`, `segment-cache/navigation.js:382`). They leave `pathname` and `searchParams` unchanged, so the `[pathname, searchParams]` effect doesn't re-run.
- **Browser check:** a pending in-map commit stripped a manual re-tag before the Calendar click. Back then landed on an untagged entry.
- **Does it fight `HistoryUpdater`?** No. `HistoryUpdater` is a `useInsertionEffect` keyed on `appRouterState`. Our state carries `__NA`, so the patched `replaceState` passes straight through without dispatching (`app-router.js:268-272`).
- **Fix:** also re-tag from a document capture-phase `click` listener on same-origin anchors (the same pattern as `route-progress.tsx:47-65`). It runs before `<Link>`'s handler, so the map entry is tagged at the moment of leaving.

**M4. Tapping the already-pressed Map segment double-pushes.** *Applied.*

- **Evidence:** the plan says "`openFullMap` already skips a second push via the tag". After any in-map commit the tag is gone. Browser: a day switch turned `tpMapList,tpFullMap` into none. `openFullMap` would then `replaceState(LIST_KEY)` onto the map entry and push another one.
- **Fix:** the pressed segment gets no `onClick`, and `openFullMap` returns early when `fullRef.current`. The C5 reopen path runs with `fullRef` false, so the guard doesn't affect it.

### Nits

- **N1. Hide-on-scroll.** *Applied.*
  - By trace, a carousel swipe can't hide the nav: the handler reads the `<ul>`'s `scrollTop`, which is 0, and `y <= 0` → shown. A map pan fires no scroll event.
  - Residual case: opening the map within 900 ms of a downward list scroll leaves the nav translated, with a blank 56 px strip.
  - Fix: a CSS guard, `body[data-fullmap='1'] [data-trip-nav] { translate: none !important }`. This replaces the plan's "ignore carousel scroll events".
- **N2. Carousel gap was 16 px, not 12.** *Applied.* The `<ul>` has `pb-1`, so `bottom: 90` puts the card at 94. Use `bottom: 86` for a 12 px gap.
- **N3. C3 wrapper pointer events.** *Applied.* The full-width `flex justify-center` wrapper must inherit `pointer-events: none`, or it swallows map pans across the row.
- **N4. C4 arithmetic was wrong, but the number is fine.** *Applied.* Bottom padding protects the pin tip, not the pin body (which grows upward). The stack measures 126 px, and 86 + 126 = 212, so 240 still leaves a 28 px margin. `previewPadding` returns null below a 730 px section. At 390×844 the section is 788, so that's fine.
- **N5. Reopen paints one list frame (passive effect).** *Noted in the plan.* Switch to `useLayoutEffect` if C7 shows a visible flash.
- **N6. Tapping the active "แผนเที่ยว" tab in map mode** pushes `/trip/[id]`, which drops `?day` and `placeId`. The map stays open on day 1. *Left for owner* (in the plan's Review focus).
- **N7. Forward onto a map entry** from the same page doesn't reopen the map. This is existing behaviour. *Noted, accepted.*
- **N8. Stale comments** in `globals.css`, `map-helpers.ts` and `map-stop-carousel.tsx`. *Applied (C6).*

## 3. Checks that held

- **Pill geometry:** `bottom-20` (80) minus nav 56 leaves a 24 px gap above the nav. The pill is 54 px tall (p-1 ×2, 44 px buttons, 2 px border), so its top sits 78 px above the nav.
- **Centring:** the card centre is `EDGE_PAD`-based (`100vw`), the pill is `left-1/2 -translate-x-1/2`, and `onSettle` picks the card by its centre. They share one axis.
- **Unused after C1:** `ChevronLeft` and `map_back_to_list_aria` have no users other than `map-panel-toggle.tsx`, so they can be deleted.
- **Callers:** `openFullMap` is used only by the toggle and `place-search-picker.tsx:182`.

**Verdict: fix-then-ship.** The plan's direction is sound. As written, C5's reopen sat in a component that never remounts, so its headline scenario would fail. The fix is applied, along with M1–M4.
