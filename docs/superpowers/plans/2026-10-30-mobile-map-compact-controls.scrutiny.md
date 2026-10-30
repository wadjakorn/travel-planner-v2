# Scrutiny: mobile map compact controls (TP-0122)

Plan: [2026-10-30-mobile-map-compact-controls.md](2026-10-30-mobile-map-compact-controls.md). Code: worktree at `7da4cd3`.

**Method:** production build at `localhost:3210`, Playwright mobile emulation (`isMobile`, touch, Pixel UA, `lang` cookie, `th-TH` / `en-US` locale), 320×568, 360×640, 390×664, 412×839, 476×638. The proposal was injected as CSS/DOM, so measurements describe the layout, not a React implementation. Numbers below are measured unless marked "traced" (read from code) or "arithmetic".

**Verdict: fix-then-ship.** The design holds and every headline saving is real. The biggest problem was the test plan: its "fails on main" proof would have failed for the wrong reason, without running a single new invariant. Blocker and majors are fixed in the plan. Four decisions are left for the owner.

## Intent and simpler alternatives

Goal: give the map more of a short phone screen while keeping the nav and #127's same-control-same-place rule.

- **Do nothing / cards only:** compacting the card alone saves 16 of the 78 px. Merging the rows saves the other 62, so the merge is the change that matters.
- **Compact two-segment pill:** the closest thing to #127's control. Plan's reason for rejecting it was wrong on the numbers (F11), but the conclusion holds at 360 and for D10.
- **Drop the toggle on the map (active nav tab already closes it, flow 4):** smaller, but it breaks #127's rule. Not recommended.

No simpler option meets the constraints. The plan's shape stands.

## Blocker

### F1. The "fails on main" proof was vacuous — applied
- **Finding:** §6 selects `[data-map-toggle] button`. On main that resolves to the List segment, which is inert in list mode (`map-panel-toggle.tsx:52`).
- **Evidence:** tapped on main: `body[data-fullmap]` stays unset; tapping `>> nth=-1` opens the map. So `openMap` would time out in every map flow and I3/I4/I7 would never run. Separately, flow 1 stops at its first failing assert, so I4 and I7 could not both show as failing.
- **Why it matters:** the suite would report red on main and be read as proof that the invariants work, when none had run.
- **Fix:** `>> nth=-1`, `expect.soft`, a dedicated `flow 9`, and report the failing assertion names.

## Major

### F2. `fitPadding` bottom 150 hides what the plan says it protects — applied (162)
- **Finding:** §3.4 said the pin body grows upward, so 16 px headroom is enough. False for two cases.
- **Evidence:** active drop label ends 25.4 px below the coordinate (`map-pin.module.css:171`, measured). A stay square is centred on its coordinate (`map-pin.ts:29`), 20 px below it. On phones `activeSafeArea` returns the padding unchanged because `hidePinCard` is on (`map-camera.ts:69`), so a revealed pin can sit exactly on that boundary. With 16 px, the label goes 9 px and the square 4 px under the card. Main has 28 px (240 − 212).
- **Fix:** 162 keeps main's headroom. Day-fit gain becomes +29 / +26 / +29 / +17% instead of +33 / +30 / +33 / +19%. §3.5 and the preview threshold (652) are updated. An active stay's label (47.4 px) reaches under the card today and still will.
- **Not measured:** the refit itself. `fitPadding` can't be injected into a production bundle; this is measured extents plus arithmetic.

### F3. At 320 the day text truncates on every day, not "as a last resort" — applied
- **Evidence:** the slot is 60 px; text needs 72–94 (th `วัน 2 · จ 13` 72, `วัน 10 · พฤ 28` 92; en 84, 94), including at 320 for Day 2.
- **Fix:** below 360 show `dayChip(day, t, false)` ("วัน 10", "D10"), no ellipsis. Measured at 320 th/en: fits, edges aligned. Full text fits at 360 in the longest cases.

### F4. A content-sized switcher makes the row look misaligned and moves the `›` — applied
- **Evidence:** the gap to the button ranged 8–60 px by width and day. Left-anchored, the `›` moves up to 20 px between day labels.
- **Why it matters:** the owner has already rejected misaligned elements, and `›` is tapped repeatedly.
- **Fix:** the switcher fills its slot. Measured at 320/360/476, th/en: gap 8, both outer edges Δ0.

### F5. The plan's arithmetic ignores the `<ul>`'s `pb-1` — applied
- **Evidence:** `map-stop-carousel.tsx:158`. Copying today's `mb-2` as `mt-2` gives a 12 px gap, stack 138, and fails the plan's own I4 (8±2). `pb-1` must stay because it keeps the ring from clipping. The empty-day `<p>` has no `pb-1`.
- **Fix:** `mt-1` after the strip, `mt-2` after the `<p>`. Measured: 8 in both.

### F6. The DOM reorder breaks the spec's selectors, unmentioned — applied
- **Evidence:** `SEL.daySwitcher/prevDay/nextDay` use `[data-map-carousel] > div:first-child` (`mobile-layout.spec.ts:23-25`). After the reorder the first child is a `ul` or `p`, so they match nothing.
- **Fix:** `data-map-day-switcher`.

### F7. `tiny-320` as written can't pass — applied
- **Evidence:** overflow at 320 (scrollWidth): `/calendar` 331, `/bookings` 359, `/budget` 400, `/notes` th 335, en 357. `knownOverflow` doesn't cover `/calendar` or Thai `/notes`. Flow 3 runs `expectPhoneChrome` on Calendar. All are unrelated to this plan.
- **Fix:** `grepInvert: /flow 3|flow 6/`, numbers passed to TP-0120.

### F8. I7 named a viewport no project has, and the owner's viewport isn't tested — applied
- **Evidence:** projects are 412×839, 390×664, 360×740, no 360×640 and no 476×638. The 0.68 ratio passes on main at Pixel 7 (571/839 = 0.681).
- **Fix:** absolute check (≤ 192 px) on all phone projects; add `owner-phone`.

### F9. Flow 8 and I6 could pass without testing anything — applied
- **Evidence:** the fixture trip's days have 2, 6, 3, 4, 3 cards, so flow 8 always skips. Trip `917a10c7` has an empty day at index 3. I6's "when the logo is present" means a stale selector passes silently.
- **Fix:** flow 8 scans trips. I6 requires `.gm-style` and `.gm-style img[alt="Google"]`; both selectors found the right elements in th and en (`title` is localized, `alt` is not).

## Nits

- **F10 (applied)** Unit-test list wrong: `map-camera.test.ts:75,86` contain no 240, and `:96` was missing. Correct: `71,82,96`.
- **F11 (applied)** §4 used the stale 171 and full-size pill. Measured: full pill 213; no icons at `px-3` 137 th, 112 en; `dayChip` switcher 162 (D10 182). 307 misses the 296 column; D10 at 327 misses 320. Conclusion stands, reasoning changed.
- **F12 (applied)** Other small numbers: pill 213 not 215, switcher 174 not 171. Possibly font timing in the original prototype.
- **F13 (applied)** "Tab order follows what you see" is only true inside the carousel. Focusables on main: nav → toggle → Google controls → switcher → cards. New order puts all cards before the switcher.
- **F14 (applied)** Right-edge formula replaced by a centred `CARD_WIDTH` wrapper with `pointer-events-none`. On phones both give Δ0 (measured at every width with the `right` formula, at 476/360/320 with the wrapper). With a classic scrollbar the formula would be off by half the scrollbar (arithmetic). **Could not reproduce:** headless Chromium kept `clientWidth` = `innerWidth` even with a forced scrollbar. Phones use overlay scrollbars, so this affects narrow desktop windows only.
- **F15 (applied)** `min-width` → fixed 98 so the switcher's width calculation stays true. Widest label at `px-3`: 91.
- **F16 (applied)** Plan's prototype images pre-date the fixes. Added a corrected image, kept the old ones with a note.
- **F17 (left)** En switcher loses the word "Day" ("D2 · Mon 13"). Consistent with the desktop bar, as the plan intends.

## Claims checked and confirmed

| Claim | Result |
|---|---|
| §1 arithmetic and 268 breakdown | Correct. Main stack measured 268. `dayfit` values correct |
| 476×638 is the owner's phone | Holds: screenshot 1248 px wide, map 1527 px tall; at DPR 2.625 that is 475×582, plus nav 56 = 638 |
| §3.5 stack, %, clear-map columns | Correct. 190 measured at all five sizes |
| 28 / 134 | Correct. Row→nav 28, card→row 8, stack 190 |
| 54 px card keeps 44 tap targets and both lines in Thai | Holds. Button 44, Navigate link 44, card 54. Thai lines 22.4 + 19.2 = 41.6 (`--leading-body` 1.6) |
| Google logo 26 tall, row 2 px above; attribution 14 tall, clear | Holds at 320–476, th and en. Logo `[5,556,71,582]` at 476. Attribution with `th-TH` locale also clear |
| Column alignment at all widths, long text, D10 | Holds: Δ0 for both edges, all sizes, th and en |
| `pb-24` clearance | Holds: 24 px clear at the end of the list |
| `map_view_aria` deletion | Safe: only used at `map-panel-toggle.tsx:46` (grep of `src`, `e2e`) |
| WCAG 2.5.3 name contains visible word | Holds for all four strings |
| Focus survives the switch | Holds if one unkeyed button (traced; on main focus stays on the tapped button, measured) |
| DOM reorder vs `onSettle`, scroll code | No impact (traced): `onSettle` uses the strip's own rect, `scrollIntoView` is `block: 'nearest'`, the switcher stays in a fixed child slot so its focus survives day changes (only the `ul` is keyed) |
| `hidePinCard` interplay | No active card on phones; `activeSafeArea` returns the padding (traced) |
| Preview safe areas with new padding | Fine (traced): card sits above the pin. Short screens use the same centred fallback as today (390×664: 76 < `MIN_SAFE`) |
| Empty day | 48 tall, gap 8, edges Δ0, stack 184 |

## MapLibre degrade

Forced by blocking Google's map hosts; `.gm-style` absent, `.maplibregl-map` present. There is no logo. Attribution starts expanded (340×44 at 360, 2 lines) and is overlapped by the row, as it is by main's pill (`[73,506,286,560]`). Not a regression. Collapsed, the `i` button still receives taps at 320 and 360, though the toggle overlaps it by 2 px horizontally. See the owner decision below.

## Left for the owner

1. **Single button vs #127's segmented control.** The plan replaces the pressed-state pill. It keeps "same place, same control" but is a visible change to something the owner just approved. The plan's prototype is the way to judge it.
2. **Button colour in list mode (Risk 1).** White on a white list; visible in the screenshots thanks to its border and shadow, but quieter than the teal pill. Phone check.
3. **Screen-reader announcement.** Focus stays, but `aria-pressed` is gone and a name change on a focused button may not be announced. Option: an `sr-only` `role="status"` line with two more strings. Not tested with a real screen reader. Recommended if screen-reader use matters here.
4. **MapLibre attribution** is covered on the degrade path, today and after. Fixing it (for example starting collapsed) is separate from this plan.

Also new behaviour, no action proposed: a double tap on the single button opens and immediately closes the map. On main the second tap landed on an inert segment. Both handlers guard against double history entries (`map-preview-context.tsx:88,105`), so the result is a flicker, not a broken stack.

## Not verified

- A real implementation: all layout evidence is injection. The React re-render path, and the fit camera with 162, get verified only when built.
- A real phone, real screen reader, or a classic scrollbar (F14).
- Real D10 data: no fixture trip has ≥ 10 days; text was injected. Plan's manual list now calls this out.
- Exact 475.43 px CSS width: emulation takes integers; I4's ±1 should absorb it.

Evidence screenshots and the injection script: `~/development/_scratch/map-space/scrutiny/` (`review-after.png`, `review-misc.png`, `inject.js`).
