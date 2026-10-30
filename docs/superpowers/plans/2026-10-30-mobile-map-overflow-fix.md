# Mobile map: bottom nav + List/Map pill off-screen — Root cause, fix, and test plan

> **Ticket:** **TP-0119** · regression surfaced by #127 (TP-0118); the defect itself dates from #89 (TP-0076)
> **Owner report (prod, Android Chrome, 2026-10-30):** "map view: วันที่ 1 ไม่มี ui menu และ floating bar, แต่วันที่ 2 มี". Two screenshots: Day 1 has a blank white 56 px strip where the nav should be and no pill; Day 2 has both.
> **Owner instruction:** "ช่วยวางแผนให้ละเอียดและ scrutinize ก่อน คิดวิธี test เองให้เรียบร้อย ห้ามทำลวก ๆ แบบนี้อีก"

---

## 1. What went wrong in our process (so it doesn't repeat)

- #125 / #127 were verified with **desktop Chromium resized to 390×844**. That isn't a mobile browser: there's no mobile layout-viewport behaviour, no touch and no mobile UA. This bug only exists under **mobile viewport semantics**, so every check we ran was blind to it.
- The #125 root cause ("the pill at 16 px sits under the OS gesture strip / Safari toolbar") was **probably wrong**. The same overflow (§2) pushes any `position: fixed; bottom: …` control below the visible area. The owner's original "no way out of the map view" is the same bug, so we added a top-left button to treat a symptom.
- Checks were ad-hoc snippets with no fixed matrix (days × flows × languages × devices). Some invariants, like "the page never scrolls horizontally" and "fixed chrome sits inside the visual viewport", were never asserted.

§5 fixes the process: a committed mobile-emulation e2e suite with explicit invariants, run before any mobile UI PR.

## 2. Root cause (reproduced, measured)

Reproduced on a **production build** (`next build && next start`, `AUTH_BYPASS`, Google) in Playwright Chromium with **mobile emulation**: `isMobile: true`, `hasTouch: true`, Pixel UA, 390×844, DPR 2.

Measurements, Tokyo test trip, map mode:

| state | `document.scrollingElement.scrollWidth` | `innerWidth × innerHeight` (layout viewport) | visual viewport | nav `top` |
|---|---|---|---|---|
| list mode | 390 | 390 × 844 | 390 × 844 | 788 ✓ |
| map, day 1 (2 cards) | **421** | **421 × 909** | 390 × 844 | **853** (off-screen) |
| map, day 2 (6 cards) | **1748** | **1560 × 3376** (Chrome caps the layout viewport at 4×) | 390 × 844 | **3320** |
| map, day 3 (3 cards) | 752 | 752 × 1628 | 390 × 844 | 1572 |

Mechanism:

1. Each stop card (`map-stop-carousel.tsx`) contains `<span className="sr-only">Stop n:</span>`. Tailwind's `sr-only` is `position: absolute`.
2. Its containing block is the nearest *positioned* ancestor. That's the carousel container `div[data-map-carousel]` (`absolute inset-x-0`), **outside** the `<ul>` scroll container (`overflow-x-auto`). The `<li>` and `<ul>` aren't positioned.
3. A scroll container clips only descendants whose containing-block chain passes through it. So these spans **escape the `<ul>`'s clipping** and sit at their static positions: x = 87, 419, 751, … up to 1747 for the 6th card. They add to the document's scrollable overflow.
4. On mobile, Chrome sizes the **layout viewport** to the content width (keeping the aspect ratio): 421 → 421×909, and 1748 → 1748×3376. `position: fixed; bottom: X` elements anchor to the layout viewport's bottom, so the nav (`bottom-0`) and the pill (`bottom-20`) render **below the visible screen**. The 56 px white strip in the owner's Day-1 screenshot is the layout's `pb-14` spacer with no nav on top.
5. Proven by toggling: hiding the `sr-only` spans brings `scrollWidth` back to 390, and so does `li { position: relative }`. Hiding the carousel → 390. `ul { contain: paint }` → 390. `ul { padding-inline: 0 }` → 390, because the spans' static positions then stay inside 390 on a 2-card day.

**Why Day 2 looked fine on the owner's phone** (scrutiny M3, measured):
- The owner's viewport is ≈ **476–480 CSS px** wide. In the 1248 px screenshot, a 320 px card spans 838 px, about 2.62 px per CSS px.
- The last escaped span's right edge is `(W−320)/2 + 54 + 332·(n−1)`, so a day with n cards overflows only when **W < 664·(n−1) − 212**:
  - 1 card: never.
  - **2 cards: only below 452 px.**
  - 3 or more: every phone.
- The Okinawa Day 1 has 5 stops, so it overflows. Day 2 has 2 located stops, so it doesn't at ~480 px.
- Emulation confirms it on the Tokyo 2-card day: 412 overflows, while 451, 453 and 480 don't.
- So the fixture must contain a day with **≥ 3 located stops** to catch the bug at any width (§5).

**History:** the `sr-only` prefix has been in the carousel since #89 (TP-0076). Before #127 the map hid the nav, so only the pill (#89 → #125) was affected. #127 put the nav back on the map, so the bug now hides both.

## 3. Fix

Two layers.

1. **Source fix (`map-stop-carousel.tsx`):** add `relative` to the `<ul>` scroll container. A positioned scroll container becomes the containing block for every absolutely positioned descendant, so they're clipped and scroll with the strip. Use the `<ul>`, not each `<li>`: one place covers any future absolute child (badges, rings). Comment why.
2. **Containment at the map boundary (`globals.css` full-map block):** add `overflow: clip` to `body[data-fullmap='1'] [data-trip-map-section]`.
   - Use `clip`, **not `hidden`** (scrutiny M1). `hidden` makes the section a programmatic scroll container, so a future escape plus `scrollIntoView` or focus could slide the whole map sideways with no way back. `clip` clips without scrolling.
   - The map section is a viewport onto the map, so nothing in it should ever widen the page. Its absolute children (the carousel and the canvas overlays) stay clipped to it; `fixed` descendants (none today) wouldn't be.
   - Verify nothing intentionally spills out: the md+ day bar is hidden below md, and the Google/MapLibre popups live inside the canvas.
   - **This layer hides the overflow from the document-level I1** (measured: with the layer alone, document sw = 390 while section scrollWidth = 1748). The suite must therefore also assert **I1b** (§5) on the section itself, or the next escape inside the map goes unnoticed.
   - **Alternative considered and rejected:** a global `html { overflow-x: clip }`. It's broader, hides future overflow bugs instead of surfacing them (the e2e invariant below would stop catching them), and risks sticky/scroll behaviour on every page. Keep the invariant test as the guard instead.
3. **Audit other `sr-only` / `absolute` content inside horizontal scroll containers.** The e2e suite (§5) checks every trip page in both modes. `grep` found `sr-only` in `place-search-picker.tsx:319`, `calendar-view.tsx:150`, `calendar-trip-range.tsx:113`, `trip-rail-frame.tsx`, `route-progress.tsx` and the two canvases. Fix only what the suite or measurement flags; list the result in the PR.
   - **Already flagged by the scrutiny sweep** (scrutiny M2; 6 seeded trips × all sub-pages, isMobile). These are page-level overflows unrelated to `sr-only`, with the same nav-off-screen effect:
     - **Budget:** overflows on 3/6 trips at 360 *and* 390 (sw 399–433), including the fixture trip. One trip's budget page is also 434 at 412.
     - **Bookings:** overflows on 2/6 trips at 360 (sw 383/387, `.chooser`).
     - Every other page is clean.
   - **Decided:** follow-up ticket **TP-0120**, the next PR. The exact failing cases are marked `test.fail()` (see As built), so they flip loudly once fixed.
   - **Audit result:** every other `sr-only` / absolute use above is clean. The suite measures no overflow on itinerary, calendar, settings and home on any device, or on bookings and notes above the widths listed in As built. Only the carousel escaped a scroll container; the Budget, Bookings and Notes overflow is ordinary content width, not `sr-only`.
4. **Revisit #125's leftovers once the true cause is fixed.**
   - `MOBILE_FIT_TOP` (72) and the carousel offset are geometry, unaffected.
   - Docs: correct the #125 root-cause paragraph in `2026-10-30-mobile-map-exit-and-route-arcs.md` (add an "Erratum" note pointing here), so nobody relies on the gesture-zone theory.
   - Back closing the map (#125) stays: it's still the right behaviour.

## 4. Unit / static guard (vitest, runs in CI)

`app/src/components/map-stop-carousel.test.ts` (or extend the existing UI guard tests): a source assertion that the carousel's scroll `<ul>` className contains `relative`, with a comment pointing to this plan. It's cheap. It won't catch new instances elsewhere; the e2e does.

## 5. E2E mobile-layout suite (new, committed, required for mobile UI PRs)

**Tooling:** add `@playwright/test` as a devDependency, **pinned exactly to `1.64.1`** (no caret: a minor bump changes the browser revision). That version's Chromium (chromium-1248 + chromium_headless_shell-1248) is already in `~/.cache/ms-playwright`, so nothing new downloads. Verified: playwright-core 1.64.1 launches the cached chromium-1248 and reproduces the bug with `devices['Pixel 7']`.
- **No WebKit project** (scrutiny B1). No Playwright version pairs chromium-1248 with the cached webkit-2287 (that's 1.60.0, whose Chromium is 1223, not cached). WebKit also fails to launch on this host at all (`missing libmanette-0.2.so.0`, a system package).
- iOS Safari stays a real-device check (§6.5).

Files: `app/e2e/mobile-layout.spec.ts` plus `app/playwright.config.ts`. Script: `pnpm e2e:mobile`.
- It runs against `E2E_BASE_URL` (default `http://localhost:3210`) with a server the developer starts: `pnpm build && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm start -p 3210`. Production build, because dev mode differs (strict mode, overlay).
- **Not in CI:** it needs the DB, a Google key on the referrer allowlist and `AUTH_BYPASS`. Document it in `AGENTS.md` (dev section) and the roadmap PLAYBOOK as a **required local gate for any change touching mobile layout / map chrome**.
- The suite must hide the Next dev overlay if it ever runs on `dev`.

**Projects (devices):**
- `pixel-7`: Playwright `devices['Pixel 7']` (Chromium, isMobile, touch; viewport 412×839, screen 412×915).
- `iphone-13-size`: Chromium isMobile + touch at the iPhone 13 viewport, 390×664. It's not WebKit (see Tooling); it covers the width/height only.
- `small-android`: Chromium isMobile, 360×740 (the smallest common width; checks the stack fits).
- All three are below the 452 px threshold (§2), so even a 2-card day overflows there. The fixture rule below makes the check width-independent anyway.
- Run each in `lang=en` and `lang=th` via the cookie, since th labels are longer.

**Fixture:** the AUTH_BYPASS dev user's seeded multi-day trip. Discover it from `/`: the first `a[href^="/trip/"]` that isn't `/trip/new`, and assert it has ≥ 2 days, at least one of them with **≥ 3 located stops**. With 3 or more cards the bug overflows at every phone width; 2 cards overflow only below 452 px (§2). Don't hard-code a UUID.

**Invariants**, as helper assertions run at every checkpoint:
- **I1 no page overflow:** `document.scrollingElement.scrollWidth <= document.documentElement.clientWidth` **and** `window.innerWidth === viewport.width`, so the layout viewport isn't expanded.
- **I1b no clipped escape in the map (map mode):** `[data-trip-map-section].scrollWidth <= clientWidth`. I1 can't see an escape that §3.2's `overflow: clip` hides. Measured: 390 with the fix, 1748 on main.
- **I2 fixed chrome on screen (phone):**
  - The nav `[data-trip-nav]` is visible, its rect is inside `visualViewport` (bottom ≤ vv.height + 1), and it isn't translated (`translate` none/0).
  - In map mode, the pill `[data-map-toggle] [role=group]` sits inside the visual viewport.
- **I3 pill stability:** the pill rect is identical (±1 px) in list mode and map mode.
- **I4 stack geometry (map):**
  - The day switcher, active card and pill centres share one x (±1 px).
  - Vertical order with no overlap: switcher < cards < pill < nav.
  - Gaps: 8, 12, 24 (±2).
- **I5 tappable:** `document.elementFromPoint(centre)` of the pill's List button and of the nav's Calendar link returns that element or a descendant, so nothing covers them. **And** the centre lies inside `visualViewport`. `elementFromPoint` uses layout-viewport coordinates, so on broken main it still hits the off-screen nav (measured), and I5 alone doesn't detect this bug. I2 is the detector.

**Flows** (each starts from a fresh context; checkpoints marked ✓ run I1, plus I2–I5 where relevant):
1. Home → trip (list) ✓ → tap Map ✓ → for **every day** tap Next ✓ (and scroll the carousel to its last card ✓; Playwright has no swipe API, so set the strip's `scrollLeft` or call `scrollIntoView` on the last card, then wait for `scrollend`) → tap Prev back to day 1 ✓.
2. Map open → reload ✓ (reopen on the tagged entry).
3. Map open → tap the Calendar nav → Calendar page ✓ (I1, nav) → Back ✓ (map reopened) → Back ✓ (list, same day) → Back → home ✓.
4. Map open → tap a pin ✓ → tap the active Itinerary nav tab ✓ (closes to the list).
5. List → scroll the aside down 600 px → tap Map within 300 ms ✓ (the hide-on-scroll nav must still be visible).
6. Every trip sub-page in list/normal mode: itinerary, calendar, bookings, budget, notes, settings ✓ (I1 + nav visible). Home `/` ✓ (I1).
7. Desktop sanity project (1280×800, non-mobile): itinerary ✓ (I1, no pill), map day bar visible.

Then **prove the suite catches this bug**: run it on `origin/main` (before the fix) and record the failing assertions (I1/I1b/I2/I3 on flow 1). Run it on the fix branch: all green, with the `test.fail()`-annotated TP-0120 cases failing as expected (§3.3). Paste both summaries into the PR.

## 6. Verification before merge

1. `pnpm typecheck && pnpm lint && pnpm test` (CI parity).
2. `pnpm e2e:mobile` on the prod build: red on main (record it), green on the branch (known `test.fail()` cases excepted, §3.3), all three Chromium projects × en/th.
3. Manual screenshots (Pixel 7 emulation, th) for the owner: map day 1, day 2, and list.
4. Reviewer subagent on the diff.
5. After deploy: the owner checks on the real Android phone, map Day 1 and Day 2. Ask the owner to also try an iPhone if one is available.

## As built (2026-10-30)

**Decisions, taken by the orchestrator (the owner delegated design calls):**
- **Scrutiny M2:** Budget, Bookings and Notes stay in a follow-up, **TP-0120**, as the next PR.
- **N5:** the unit guard parses the `<ul ref={stripRef}>` className. Verified red without `relative`, green with it.

**Known failures, marked exactly as measured** (`knownOverflow()` in the spec, fixture trip): Budget at width ≤ 390 (sw 408–409), Bookings at 360 (366), Notes at 360 in `en` only (364). That is 7 cases, marked `test.fail()`, so an unexpected pass flags that TP-0120 landed. The other 7 phone cases for those pages pass and keep running. Reviewer finding: an earlier `fixme` on all phones hid them.

**Test-suite corrections made on the way:**
- `waitForLoadState('networkidle')` never settled on pages with a live map, so 16 failures in the first baseline were test bugs. It was replaced with `settle()`, which waits until the document size is stable for 800 ms.
- Reviewer findings:
  - I5 now covers both pill buttons.
  - `rect()` and `expectTappable` use locators, so `nth` is honoured.
  - Flow 5 proves hide-on-scroll fired before opening the map.
  - The reload and pin flows settle before asserting.
  - The last-card check polls for centring.

**Results, identical suite against production builds (Pixel 7 / 390×664 / 360×740 / desktop × en, th):**

| build | passed | failed | skipped | time |
|---|---|---|---|---|
| main's code (the two source files from `origin/main` 4ba5c41) | 58 | **30** | 16 | 14.6 min |
| this branch | **88** | **0** | 16 | 7.8 min |

- **Main's 30 failures** = flows 1–5 × 3 phones × 2 languages, and nothing else:
  - `I1 page overflow` at map day 1, after reload, after a pin tap and after a list scroll (6 each).
  - 6 `locator.tap` timeouts on the Calendar nav link, which really can't be tapped.
- **Passed counts** include the 7 expected TP-0120 failures.
- **Skips:** 10 phone flows on desktop, 6 desktop-only flows on phones.

**Mutation checks (injected CSS on the fix build, 480×900, 6-card day):**
- Fix as built: document 480, section scrollWidth 480, nav 844→900 on screen.
- `ul { position: static }` with the clip kept: document 480 but section scrollWidth **1793**, so I1 stays quiet and **I1b catches it**.
- `ul { position: static }` and the clip removed: document **1793**, nav top **3306**, so the original bug returns.

**Behaviour preserved:** the carousel still scrolls and selects (scrollLeft 664 → `placeId` in the URL), and the card's `sr-only` "จุดที่ 2:" is still in the button text.

**Not verifiable here:** real Android/iOS devices (device access is off; WebKit doesn't launch on this host). The owner checks on the phone after deploy (§6.5).

## 7. Out of scope

- No change to the pill or nav design (#127 stands).
- Telemetry or real-device lab: not available here (device access is off).

---

_Scrutinized 2026-10-30. See [the scrutiny](2026-10-30-mobile-map-overflow-fix.scrutiny.md):_
- _Applied: B1, M1, M2 (default), M3, N1–N4._
- _Decided since: M2 (follow-up TP-0120) and N5 (unit guard parses the `<ul>`); see As built._
