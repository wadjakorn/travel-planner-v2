# Scrutiny: 2026-10-30-mobile-map-overflow-fix.md (TP-0119)

Reviewer: outsider pass, 2026-10-30. Worktree `travel-planner-v2-map-bug` @ `4ba5c41` (= origin/main). Prod build at `:3210` (`MAPS_PROVIDER=google AUTH_BYPASS=true`).
Every number below was re-measured independently, in a fresh Playwright context with mobile emulation (`isMobile`, `hasTouch`, Android UA) unless noted. Nothing was copied from the plan.

## Intent

The goal: on phones, the map's stop carousel must stop widening the document. When it does, Chrome grows the layout viewport, and the fixed bottom nav and the List/Map pill end up below the screen. The plan also adds a regression test that would have caught this.

**Simpler alternative?** The one-word source fix (`relative` on the `<ul>`) is already the smallest correct change. Two other options exist: `relative` on each `<li>`, or dropping the `sr-only` prefix in favour of `aria-label` on the button. Neither is simpler, and the `<ul>` option covers future absolute children too. A global `html { overflow-x: clip }` would be smaller, but the plan rightly rejects it: the sweep below shows it would have hidden two *other* live overflow bugs. **The approach stands.** The issues are in the containment layer, the test feasibility, and the scope.

## Root cause: independently confirmed

| state (390×844, DPR 2, isMobile, Chromium 151) | doc scrollWidth | innerWidth × innerHeight | nav top | pill bottom |
|---|---|---|---|---|
| list | 390 | 390 × 844 | 788 | 764 |
| map day 1 (2 cards) | 421 | 421 × 909 | 853 | 829 |
| map day 2 (6 cards) | 1748 | **1560** × 3376 | 3320 | 3296 |
| map day 3 (3 cards) | 752 | 752 × 1628 | 1572 | 1548 |
| map day 4 (4 cards) | 1085 | 1085 × 2346 | 2290 | 2266 |

- The `sr-only` right edges are at 88, 420, 752, 1084, 1416, 1748, one per card at a step of 332 px (320 card + 12 gap). This confirms the escape mechanism.
- Trace: `map-stop-carousel.tsx:185` `sr-only` → containing block = `div[data-map-carousel]` (`:123`, `absolute`). The `<ul>` at `:153` and the `<li>` at `:164` aren't positioned, and the `truncate` span's `overflow:hidden` doesn't clip it either, because that span isn't positioned. The chain continues to `section[data-trip-map-section]` (`persistent-map.tsx:173`, `relative`), which doesn't clip.
- It reproduces with the real `@playwright/test`-era stack too: playwright-core **1.64.1** + cached **chromium-1248** (Chrome 156), `devices['Pixel 7']`. Map day 1 gives sw 431, innerWidth 431, nav bottom 878 vs visualViewport 839.

### Fixes tested by injecting CSS before the map opens

| variant | d1 sw / iw / navTop | d2 sw / iw / navTop | section scrollWidth (d2) |
|---|---|---|---|
| none | 421 / 421 / 853 ✗ | 1748 / 1560 / 3320 ✗ | 1748 |
| `[data-map-carousel] ul{position:relative}` | 390 / 390 / 788 ✓ | 390 / 390 / 788 ✓ | **390** |
| section `overflow:hidden` only | 390 / 390 / 788 ✓ | 390 / 390 / 788 ✓ | **1748** (escape still there, now hidden) |
| section `overflow:clip` only | 390 / 390 / 788 ✓ | 390 / 390 / 788 ✓ | 1748 |

Both layers work. The carousel still scrolls (`ul.scrollLeft` 1660 after `scrollIntoView` on the last card, `ul.scrollWidth` 2050 unchanged), and the section was not scrolled in any variant.

### Day 1 broken vs Day 2 fine on the owner's phone: explained

- **Viewport width.** The owner's screenshots are 1248 px wide. A stop card (CSS 320 px) spans 205→1043 = 838 px, so the scale is ≈2.62 px per CSS px, and the viewport is **≈476–480 CSS px wide**. The card's left edge (≈78–80 CSS px = `EDGE_PAD` = (W−320)/2) agrees.
- **When a day overflows.** The last `sr-only` right edge is `(W−320)/2 + 54 + 332·(n−1)`. That exceeds W only when **W < 664·(n−1) − 212**:
  - n = 1: never.
  - **n = 2: only when W < 452.**
  - n ≥ 3: every phone.
- **The Okinawa trip.** Day 1 has 5 stops, so it overflows. Day 2 shows only 2 located pins (2 and 3), so it doesn't overflow at ~480 px.
- **Confirmed in emulation.** On the Tokyo 2-card day, width 412 overflows (431). Widths 451, 453 and 480 don't: sw equals W, and the nav is on screen. The same widths on the 6-card day all overflow.
- So the plan's "not explained by emulation, where every multi-card day overflows" is wrong. Every multi-card day overflows **only on viewports < 452 px**, and both test viewports are below that.

## Findings

### Blocker

**B1. The §5 tooling pin is impossible as written.** No Playwright version uses both chromium-1248 and webkit-2287. WebKit can't run on this host at any version.
- *Why it matters:* the "required local gate" can't be installed as specified. Following it means either a browser download, which is forbidden, or a broken project.
- *Evidence (`browsers.json` of every playwright-core on the box):*
  - 1.64.1 → chromium-1248 / webkit-2370
  - 1.60.0 → chromium-1223 / **webkit-2287**
  - 1.63.0 → chromium-1243 / webkit-2359

  `~/.cache/ms-playwright` holds chromium-1243, chromium-1248 (plus both headless shells) and webkit-2287. Launching webkit-2287 via playwright-core 1.60.0 fails with `Host system is missing dependencies … libmanette-0.2.so.0`, which needs a system package. playwright-core 1.64.1 launched cached chromium-1248 fine and reproduced the bug.
- *Change:* pin `@playwright/test` to **exactly `1.64.1`**, with no caret, because a minor bump changes the browser revision. Drop the WebKit `iphone-13` project from the gate, and add a Chromium project at the iPhone 13 viewport (390×664) instead. WebKit/iOS stays the owner's real-device check (§6.5). **Applied.**

### Major

**M1. Layer 2 (`overflow: hidden` on the map section) blinds the suite's I1 to the exact bug class it is meant to guard.**
- *Why it matters:* the plan rejects `html { overflow-x: clip }` because it "hides future overflow bugs". Layer 2 does the same inside the map: with only layer 2, document sw = 390 even though the spans still escape (section scrollWidth 1748). `overflow: hidden` also makes the section a programmatic scroll container, so a future escape plus `scrollIntoView` or focus could slide the whole map sideways with no way back.
- *Evidence:* the variant table above.
- *Change:*
  - Use `overflow: clip`. Both work on the measured browsers, and `clip` doesn't create a scroll container.
  - Add invariant **I1b**: in map mode, `[data-trip-map-section].scrollWidth <= clientWidth`. This detects an escape even while it's clipped. Verified: 390 with the `<ul>` fix, 1748 without.

  **Applied.**

**M2. The plan's own suite can't go green on the fix branch, because other pages already overflow.**
- *Why it matters:* flow 6 runs I1 on every trip sub-page. The sweep below finds pre-existing overflows that this fix doesn't touch, so the §6.2 "green on the branch, all projects" step fails, and the same nav-off-screen bug is live on those pages.
- *Evidence (sweep: 6 seeded trips × itinerary/calendar/bookings/budget/notes/settings, plus home and map day 1):*
  - At 360: **budget** overflows on 3/6 trips (sw 399/425/433), and **bookings** on 2/6 (383/387, `.chooser`).
  - At 390: budget is still 399–433. Trip 3dbe00da's budget is 434 at 412.
  - The fixture trip (first link, 79efe162) budget overflows at 360 and 390.
  - Every other page/trip combination: 390 ✓.
- *Change:* name these in the plan as known findings. Default: a follow-up ticket for budget/bookings, with those flow-6 cases annotated `test.fail()` carrying the ticket ID, so they flip loudly once fixed. The owner may instead fold them into this PR. **Applied (default written; scope choice left for owner).**

**M3. Wrong Day-1-vs-Day-2 analysis (§2).**
- *Why it matters:* the plan says emulation can't explain it. It can, and the explanation tells us which fixtures and viewports catch the bug.
- *Evidence:* see "Day 1 broken vs Day 2 fine" above.
- *Change:* replace the paragraph. Require that the fixture has a day with **≥ 3 located stops**, which overflows at every phone width, rather than "≥ 2", which catches only below 452 px. **Applied.**

### Nit

- **N1.** §2 table: day 2 `innerWidth` is **1560**, not 1748. Chrome caps the layout viewport at 4× (min page scale 0.25). The 1748 is the scrollWidth. **Applied.**
- **N2.** Device sizes: Playwright `Pixel 7` viewport is **412×839** (915 is the screen height), and `iPhone 13` is **390×664**. **Applied.**
- **N3.** I5 (`elementFromPoint`) does **not** detect this bug. It uses layout-viewport coordinates, so on broken main the Calendar link at y≈881 still hit-tests true, and I measured `navHit: true` in the base variant. I2 is the detector. I5 now also requires the point to lie inside `visualViewport`. **Applied.**
- **N4.** "Swipe the carousel": Playwright has no swipe API. Set the strip's `scrollLeft` (or call `scrollIntoView` on the last card) and wait for `scrollend`. **Applied.**
- **N5.** §4's source-string unit guard is brittle: it passes if `relative` lands on any class string in the file. Assert on the `<ul>`'s className specifically (regex anchored on `snap-x`), or drop it and lean on I1b. **Left for owner.**
- **N6.** The vitest `include` is `src/**/*.test.ts`, so `app/e2e/*.spec.ts` won't leak into `pnpm test`. However, `tsconfig.json` includes `**/*.ts`, so `@playwright/test` must be installed for `pnpm typecheck` to pass. That's fine because it's a devDependency; just note it. No change needed.

## Verdict

**Fix-then-ship.** The root cause and the `<ul relative>` fix are confirmed. The plan as written can't be executed (B1), and its containment layer would blind its own test (M1). Both are fixed in the plan. The remaining owner decision is M2's scope: budget/bookings overflow in this PR or a follow-up.
