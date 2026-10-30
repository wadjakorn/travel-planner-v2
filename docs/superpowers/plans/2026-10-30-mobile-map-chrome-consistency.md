# Mobile map chrome consistency — Critique + Implementation Plan

> **Ticket:** **TP-0118** · follows #125 (TP-0116) / #126 (TP-0117)
> **Origin:** owner on prod (Android Chrome), 2026-10-30, two screenshots (list mode, map mode):
> "หน้า trip มี floating, แต่หน้า map ไม่มี · หน้า map: layout แปลกมาก, ตัว horizontal slide nav มันเยื้องกันกับตัวเปลี่ยนวันที่"
> Owner asked us to work the problem through with the design skills and make the UI consistent ("คุณเป็นคนเปลี่ยน ui เป็นแบบนี้เอง ทำให้มัน consistency"). The direction below is ours to own.

---

## Design critique (design:design-critique framework)

### Overall impression

#125 fixed the "no way out" bug by adding a **second, different control** for the same job. List mode has a centred, floating `[รายการ | แผนที่]` segmented pill above the bottom nav. Map mode drops the pill and the nav and shows a white `‹ รายการ` chip top-left. The user switches between two views of one screen and the switch control jumps corners and changes shape. Map mode also stacks three bottom elements, each on a different horizontal alignment.

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| The mode switch changes **form and location** between modes: a segmented pill at bottom-centre vs a back chip at top-left. Spatial memory breaks, and it reads as "two features". | 🔴 | **One** control, identical in both modes: the same pill at the same pixel position, with the pressed segment flipping. This is the Airbnb / Google Maps "Map ⇄ List" pattern users already know. |
| Map mode hides the trip's bottom nav, so Calendar / Bookings / Budget are unreachable from the map. List mode has them. | 🟡 | Keep the bottom nav in map mode. The owner's Android screenshot shows the nav strip at `bottom: 0` is fully visible and tappable, so the "gesture zone" concern that pushed us to the top-left does not apply to the nav. The real #125 problem was a control at 16 px *with no nav under it*. **Scrutiny M1 (verified):** this hiding only works in English. The rule selects `[aria-label='Trip navigation']`, and since #123 that label is localised (`nav_trip_aria` = "เมนูทริป" in th). At HEAD with `lang=th` at 390×844, the nav is `display: flex`, z-30, painted over the map's bottom 56 px and tappable. So the "Calendar from the map" path (C5) is already reachable in Thai today, and the map section runs under the nav. Never select on a localised attribute again: see C2. |
| The `‹ รายการ` chip is styled as a navigation "back", but it does a mode switch. That's wrong affordance. | 🟢 | It goes away; OS / browser Back still closes the map (kept from #125). |

### Visual hierarchy

- **What draws the eye first (map mode):** the large white `‹ รายการ` chip top-left, then the route. It should be the route and pins, with the controls quiet at the bottom.
- **Reading flow at the bottom (map mode):** the day switcher is anchored **left** (`mx-4`), the stop card is **centred** (snap-center, `EDGE_PAD = (100vw − card)/2`) with the next card peeking on the right, and in list mode the pill is **centred**. The eye zig-zags between three left edges: 16 px, ≈35 px and centred.

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| List/Map switch | Two components and two positions | One `MapPanelToggle` pill, same place in both modes (`fixed bottom-20`, centred) |
| Bottom nav | Shown in list mode, hidden in map mode | Shown in both, with the "แผนเที่ยว" tab active in both |
| Map bottom stack alignment | Day switcher left, cards centred, pill centred | **One centre axis**: day switcher centred over the active card, card centred, pill centred. The carousel picks the active card by its **centre** (`onSettle` geometry), so centre is the natural axis. |
| Vertical rhythm | Carousel offset `82px + env()` was tuned to clear the old 16 px pill; with the nav back it would collide | A single spacing scale from the bottom: nav (56) → 24 → pill (≈54) → 12 → cards → 8 → day switcher |
| Header | Hidden in map mode | Keep it hidden: the map is the immersive surface, and the top edge stays free for the degraded chip. This is the only intentional difference, and Back restores it. |

### Accessibility

- Touch targets: the pill segments are `min-h-11` (44 px) ✓; the day switcher arrows are 44 px ✓.
- Focus: one component, so the focus-swap code added in #125 becomes unnecessary (the pressed button stays the same element).
- The pill keeps `role="group"` + `aria-pressed` in both modes, so screen readers hear one consistent control.

### What works well

- The teal arcs and badges read calmly; the route is legible on the map (TP-0117).
- The stop cards are clean, and the active ring and number badge match the pins.
- Back closes the map (TP-0116), which should stay.

### Priority recommendations

1. **The same List/Map pill in both modes, with the bottom nav kept in map mode, and the top-left chip removed.**
2. **Centre-align the map's bottom stack** (day switcher centred; one vertical spacing scale).
3. **Make Back from another tab return to the map** if you left from it: re-tag the map history entry so the state survives a nav-tab round trip. Showing the nav makes that path reachable (see A4).

---

## Implementation plan

**Goal:** list ⇄ map is one control in one place, and map mode's bottom stack shares one centre axis and one spacing scale. #125's Back behaviour is preserved.

**Guards:** i18n lint (no new strings expected; `map_back_to_list_aria` becomes unused, so delete it from en + th), raw-colour ratchet, 12 px floor, dialog guard, `map-helpers` / `map-camera` tests.

### Tasks

- [ ] **C1 — `map-panel-toggle.tsx`: one pill for both modes.**
  - Remove the `if (full)` top-left branch and the focus-swap effect/ref (both added in #125).
  - Render the pill in both modes: `aria-pressed={!full}` on List with `onClick={() => closeFullMap()}`, `aria-pressed={full}` on Map with `onClick={() => openFullMap()}`. **The pressed segment gets no `onClick`**, the same as List in list mode today. Also, `openFullMap` returns early when `fullRef.current`. *Scrutiny M4 (verified):* "`openFullMap` already skips a second push via the tag" is false after any in-map router commit. A day switch strips `tpFullMap` (observed: `tpMapList,tpFullMap` → none). A Map tap in map mode would then `replaceState` the list tag onto the map entry and push a second map entry. The early return doesn't affect C5's reopen, which calls `openFullMap` while `fullRef` is false.
  - Keep one DOM tree for both modes (same wrapper/group/buttons, only `aria-pressed` and classes change), so React keeps the focused button and no focus code is needed.
  - Keep `data-map-toggle`, `fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] md:hidden`.
  - Update the header comment.
  - `ChevronLeft` in `icons.tsx`: delete it if this was its only user (grep).
  - i18n: delete `map_back_to_list_aria` from `en.json` / `th.json`.
- [ ] **C2 — keep the bottom nav and its spacer in map mode** (`app/globals.css` full-map block, ≈ lines 334–360):
  - Remove `body[data-fullmap='1'] [aria-label='Trip navigation']` from the `display: none` list. Keep `> header` and `[data-trip-aside]`. Add `data-trip-nav` to the `<nav>` in `trip-rail-frame.tsx` (a stable, non-localised hook; scrutiny M1). Any CSS that targets the nav uses it.
  - Heights (*scrutiny M2*; this replaces the earlier "pick whichever"). Add `--mobile-nav-h: 56px` (`h-14`) in the block.
    - `body[data-fullmap='1'] > div`: **delete** the `padding-bottom: 0 !important` line, so the layout's `pb-14` applies. Keep `height: 100dvh !important`. Preflight is `border-box`, so the content box is `100dvh − 56px`.
    - `[data-trip-map-section]`: set `height` **and `min-height`** to `calc(100dvh - var(--mobile-nav-h))`. The current rule also forces `min-height: 100dvh !important`. Changing only `height` leaves the section 100dvh, and the carousel ends 56 px lower, under the nav.
    - **Delete** `body[data-fullmap='1'] > div > div:not([data-map-toggle])`. It matches nothing: the layout div's children at HEAD are `NAV`, `DIV[data-map-toggle]`, `ASIDE` and `SECTION` (verified in the browser), because the itinerary page renders a fragment.
    - Acceptance (C7): `section.getBoundingClientRect().bottom === nav.getBoundingClientRect().top` (788 at 390×844), and `document.scrollingElement.scrollHeight === innerHeight`.
  - The nav hides on scroll (`trip-rail-frame.tsx`). By trace, a carousel swipe can't hide it: the handler reads the `<ul>`'s `scrollTop` (always 0), and `y <= 0` → shown. A map pan fires no scroll event. The remaining case: opening the map within 900 ms of a downward list scroll leaves the nav translated, with a 56 px blank strip under the map until the idle timer fires. Guard it in CSS: `body[data-fullmap='1'] [data-trip-nav] { translate: none !important; }` (Tailwind v4 `translate-y-*` sets the `translate` property). No JS change.
- [ ] **C3 — map bottom stack on one axis** (`map-stop-carousel.tsx`):
  - Day switcher: `mx-4` → `mx-auto` with a flex wrapper (`flex justify-center`), so it is centred over the centred active card. (`mx-auto` alone does nothing on an `inline-flex` box.) The wrapper must **not** get `pointer-events-auto`. It inherits `none` from the container, so the full-width row doesn't swallow map pans beside the switcher (scrutiny N3).
  - Container `bottom`: from `calc(82px + env(safe-area-inset-bottom))` to the pill clearance measured from the **map section's** bottom edge, which now sits on the nav's top. Pill bottom = 80 px from the viewport bottom = 24 px above the nav; pill height = 4 + 44 + 4 + 2 border = 54 → pill top is 78 px above the section bottom. The `<ul>` has `pb-1`, so the card's bottom edge is container bottom + 4. For a 12 px gap, the container sits at **`bottom: 86px`** (card at 90). Name it in a constant with that arithmetic in a comment. Drop `env()`: the nav already sits on the safe edge.
  - Gap between day switcher and cards: `mb-2` (8 px) stays.
- [ ] **C4 — camera padding** (`lib/map-helpers.ts`): `MOBILE_FIT_TOP` 120 → **72** (the top-left button is gone; 72 was the pre-#125 value), and update the comment above it. Bottom stays **240**. The stack measured at HEAD is 126 px tall (switcher 44 + `mb-2` 8 + `<ul>` 74), so 86 + 126 = 212 above the section bottom, leaving 28 px. Bottom padding protects the pin's *coordinate* (the tip). The pin body grows upward, away from the stack, so no pin-height headroom is needed at the bottom (scrutiny N4). Update `map-helpers.test.ts:71`. `map-camera.test.ts` only uses `bottom: 240` and tops ≥ 330 (`Math.max`), so it should pass unchanged. Run it. Note: `previewPadding` returns null below a 730 px section (370 + 240 + 120). With the nav, 390×844 gives 788 (OK); shorter phones already got null before.
- [ ] **C5 — history: the map entry stays tagged; returning to it reopens the map** (`map-preview-context.tsx`):
  - Problem: with the nav visible, a user in map mode can tap Calendar, which unmounts `MapPanelToggle` → `closeFullMap({ viaHistory: false })`. Back from Calendar then lands on the (stale) map entry in list mode, and the next Back is a "dead" press back to the same-URL list entry.
  - Fix:
    - (a) **Re-tag** helper `retag()`: while `fullRef && owns && isPhone()`, `if (!isFullMapEntry(history.state)) history.replaceState({ ...history.state, [FULLMAP_KEY]: 1 }, '')`. It has no URL argument, and the spread keeps `__NA`, so Next's patched `replaceState` passes it through without dispatching (`app-router.js:268-272`). `HistoryUpdater` is a `useInsertionEffect` keyed on `appRouterState`, so this doesn't loop or fight it. Call `retag()` from two places:
      - the existing `[pathname, searchParams]` effect (after in-map replaces);
      - **a document capture-phase `click` listener** (the same pattern as `route-progress.tsx:47-65`) on same-origin `a[href]`. It runs before `<Link>`'s handler, so the map entry is tagged **at the moment of leaving**. *Scrutiny M3:* `router.refresh()` and server-action revalidation go through `navigateToKnownRoute` with `preserveCustomHistoryState: false` (`refresh-reducer.js:69-70`, `segment-cache/navigation.js:382`). They don't change `pathname` or `searchParams`, so the effect alone misses them. In the browser, a pending in-map commit stripped a manual re-tag before the Calendar click.
    - (b) **Reopen in `MapPanelToggle`'s mount effect, not in the provider.** *Scrutiny B1 (verified):* `MapPreviewProvider` lives in `trip/[id]/layout.tsx`, which persists across `/calendar`, `/bookings` and the other sub-pages. `cacheComponents` is off, so there is no `<Activity>` either. Only the itinerary page, and with it `MapPanelToggle`, unmounts and remounts. A provider mount effect would fire on a hard load or reload only, never on Calendar → Back. Merge it into the existing cleanup effect: `useEffect(() => { if (isPhone() && isFullMapEntry(history.state)) openFullMap(); return () => closeFullMap({ viaHistory: false }); }, [openFullMap, closeFullMap])`. `openFullMap` on a tagged entry already does everything needed: it sets `fullRef` and `lastMapHref`, calls `setFullMap(true)`, skips the push, and sets `owns`. Back is a traverse, which keeps custom state (`completeTraverseNavigation`, `preserveCustomHistoryState: true`). In the browser, the restore `replaceState` carried `tpFullMap`, and the toggle remounted with it in `history.state`. Export `isPhone` from the provider module, or inline the `matchMedia` call. Strict-mode double mount: cleanup closes in place, then the remount reopens the still-tagged entry. Fine.
    - Result: Calendar → Back returns to the map, then Back → list, then Back → home. No dead presses. A reload on the map entry reopens the map. A reload on the list entry doesn't (it carries `tpMapList`, not `tpFullMap`).
    - Known, accepted: (1) the passive mount effect paints one list frame before the map. Use `useLayoutEffect` for the reopen if C7 shows a visible flash. Note that `body[data-fullmap]` is mirrored in a passive effect too. (2) Browser **Forward** onto a map entry from the list (same page, no remount) doesn't reopen. That's the existing "stale tagged entry" behaviour.
  - Review `closeAction` / the tests. `closeAction({ owns: false })` → no close is already covered. No new pure logic beyond `retag`'s guard, so don't add a test that only restates the mount effect.
- [ ] **C6 — docs.**
  - REQUIREMENTS §10: replace the #125 bullet. Mobile full-map keeps the bottom nav, and the List/Map pill is the same control in the same place in both modes. Back closes the map; returning to the map's history entry reopens it.
  - Update the `REQUIREMENTS.md:21` sentence "hidden in full-map mode" for the bottom tab bar.
  - AGENTS-INDEX rows for `map-panel-toggle.tsx` and `map-preview-context.tsx`.
  - Stale code comments: `globals.css` full-map block ("The List/Map pill is not rendered here; … top-left 'List' button"), the `map-helpers.ts` `MOBILE_FIT_TOP` comment, and the `map-stop-carousel.tsx` bottom-offset comment.
- [ ] **C7 — browser check at 390×844 (Google, :3210), in BOTH `lang=en` and `lang=th` (cookie; scrutiny M1), plus a screenshot for the owner:**
  0. The C2 acceptance numbers: the section bottom equals the nav top, and the page doesn't scroll vertically.
  1. List ⇄ Map: the pill doesn't move by a pixel (compare `getBoundingClientRect`), only the pressed segment flips, and the nav is visible in both modes.
  2. Map: the day switcher centre x equals the active card's centre x (±1 px), and that equals the pill's centre x. The vertical gaps are 8 / 12 / 24.
  3. A horizontal swipe on the carousel and a map pan: the nav stays visible.
  4. Back closes the map (TP-0116 scenarios 3–5 still pass: sync to the map's day, double tap, one Back to home).
  5. In map mode tap Calendar → Back: the map is open on the same day. Back → list. Back → home. Repeat after an in-map action that refreshes without a URL change (add the previewed place from a map card) right before tapping Calendar: this exercises the click-capture re-tag.
  5b. Tap the Map segment while already in map mode: `history.length` is unchanged (M4).
  6. md+ 1280: unchanged (no pill, rail on the left).
  7. MapLibre degrade: the degraded chip top-right doesn't collide with anything.

### As built (2026-10-30)

- **C1–C5 as planned.** N6 is decided (ours to own): the active "แผนเที่ยว" tab over the phone full-map calls `closeFullMap()` instead of re-navigating. That is tab root = list. `TripRail` moved inside `MapPreviewProvider` in the trip layout (the provider renders no DOM, so the DOM is unchanged) so `TripRailLink` can read the flag.
- **Dev gotcha:** a `.next` left by an earlier dev run in the same worktree served stale `globals.css`. `rm -rf .next` fixed it.
- **Verified at 390×844, Google :3210:**
  - The pill rect is identical in both modes (101,710 → 289,764).
  - The nav top equals the section bottom (788), and the page doesn't scroll.
  - The day switcher, the active card and the pill all centre at x = 195.
  - Gaps: 8 (switcher → cards), 12 (cards → pill), 24 (pill → nav).
  - A tap on the pressed Map segment doesn't push.
  - Map on Day 2, then Calendar, then Back → map on `?day=1`; Back → list on `?day=1`; Back → home.
  - Reopen the map, then tap the active Itinerary tab → list; Back → home.
  - Thai (`lang=th`): the nav shows over the map, at the same geometry.
  - At 1280: no pill, and the aside and rail are as before.

### Review focus

- C2's CSS height math: the map section must end exactly at the nav's top. An off-by-56 bug would hide the carousel under the nav, or leave a gap.
- C5 mount-reopen lives in `MapPanelToggle`, not in the provider, which never remounts within the trip layout. It must not fire on desktop, and it must not fire when the user legitimately reloads in list mode. Reload on the map entry reopens the map, which is arguably correct (URL + entry = map).
- **Open for the owner (scrutiny N6):** tapping the already-active "แผนเที่ยว" tab in map mode pushes `/trip/[id]` without `?day=&placeId=`. The page doesn't remount, so the map stays open on day 1 and the stack grows. List mode does the same today. Options: leave it, or have that tap call `closeFullMap()` in map mode.
- Removing #125's top button reintroduces a bottom control in map mode. It sits **above the visible nav**, the same as in list mode, which the owner uses without problems. Note this in the PR so it isn't read as a regression of TP-0116.
