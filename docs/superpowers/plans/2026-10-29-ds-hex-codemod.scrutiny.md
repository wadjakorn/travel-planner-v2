# Scrutiny: legacy palette → tokens codemod (phase 1)

Plan: [2026-10-29-ds-hex-codemod.md](2026-10-29-ds-hex-codemod.md). Traced against `main` @ `6f6f7a2`.

## Intent

Remove raw hex/rgb from the three biggest CSS modules and from `days-accordion.tsx`, replace Tailwind default-palette classes in 8 files, and add a guard so the raw-color count can only fall.

### Simpler alternatives considered

- **stylelint `color-no-hex` with per-file disables.** That needs a new dev dependency and doesn't cover TSX inline styles or Tailwind palette classes. The vitest ratchet is cheaper and covers both. Agree with the plan.
- **A pixel-preserving `--accent-blue`.** The plan rejects this in Decision 1 (two accents, against review §6). Agree. The blue→teal swap is a visible change, so it correctly stays a user decision.
- **New `days-accordion.module.css`.** Not needed. See finding 2.

## Verified claims

- **Contrast of the new families:** `#8a5a00` on `#fff7e6` 5.56. `#6b5400` on `#fffbea` 7.00. `--warning #b45309` on `#fff7e6` 4.71. A5 fixes: `#86868b` 3.62 and `#c7c7cc` 1.68 → `--muted` 5.05. `#b07000` 4.07 → `--warning` 5.02. All correct.
- **Palette counts:** the 8 named files hold exactly 55 named-hue classes, and 77 exist in total (the other 22 are in `calendar-view` 16, `persistent-map` 4, `trip-settings-form` 2).
- **Line refs:** `days-accordion.tsx:140-215,294-307` with three `<Spinner color="#0071e3">` calls (`:173,215,307`). `spinner.tsx:18-19` defaults. `.segMode_*` at `itinerary-list.module.css:104-114` (`#2563eb/#16a34a/#7c3aed`). `.placeActive` at `:386`. Google glyph `#ea4335` at `itinerary-sidebar.module.css:231`. Sidebar dark rules start at `:306`. Picker dark rules at `:259-344` (single-quoted `[data-theme='dark']`).
- **`MODE_COLOR` already exists** (`lib/map-helpers.ts:29`).

## Findings

### 1. Major: the "ratchet" doesn't ratchet

- **Finding:** the guard asserts per-file `count ≤ baseline`, and the modal plan says "stale entries pass". When a file drops from 10 to 5 and nobody regenerates, it can climb back to 10 without failing.
- **Why it matters:** the plan's core promise ("may only decrease", REQUIREMENTS §15 enforcement line) doesn't hold. The baseline turns into a high-water mark.
- **Change:** require exact equality. Above the baseline fails as "new raw color", and below it fails as "baseline stale, tighten it". Both messages print the regenerate command. Added a test for the stale case. The JSON has one line per file, so parallel PRs conflict only on the files they actually touched. **Applied.** Consequence: plans that remove colors after this lands must regenerate in the same PR (see Cross-plan).

### 2. Major: Task 5 duplicates itinerary-rows Task 6, the hard way

- **Finding:** `2026-10-29-itinerary-rows.md` Task 6 rebuilds the same day collapse bar (`days-accordion.tsx:187-231`) with Tailwind token classes and removes the same `onMouseEnter`/`onMouseLeave`. This plan moved it into a new `days-accordion.module.css` with a hand-written `@media (hover: hover)`.
- **Why it matters:** two plans would restyle one button two different ways, and the second to land fights the first.
- **Simpler:** Tailwind v4 already wraps `hover:` in `@media (hover: hover)` (stated at `globals.css:300-304`), so token utilities give the touch-safe hover with no new file.
- **Change:** Task 5 now uses token utilities and creates no module file. If itinerary-rows landed first, keep its collapse-bar markup. **Applied** (Task 5, Touches, Review Focus 3, docs task).

### 3. Major: the `itinerary-list.module.css` overlap is not a "trivial rebase"

- **Finding:** itinerary-rows Task 3 restructures `itinerary-list.module.css:163-276` (`.placeThumb`, active wrap, deletes `.kindChip`, shrink rules). This plan rewrites ~98 color lines in the same file.
- **Why it matters:** a hand-merge of overlapping hunks invites lost color or lost layout.
- **Change:** land **after** itinerary-rows. The guard enumerates what's left, so re-applying the mapping table on top of the restructure is mechanical. **Applied** (Depends on, Task 2 note).

### 4. Minor: the scan set pollutes the baseline with non-UI hex

- **Finding:** the scan counts seed data (`lib/seed/days.ts` 19, `lib/seed-trip.ts` 11: DB thumb and avatar colors), Satori `opengraph-image.tsx` (which can't use CSS vars), and the parity-tested token mirrors in `lib/map-helpers.ts`. The map plans change those mirror values (`MODE_COLOR`, new `ROUTE_*_COLOR`), so with an exact baseline every map PR would have to regenerate.
- **Change:** an `EXEMPT` list (globals, opengraph-image, seeds), plus `// hex-ok: mirrors --map-…` on mirror lines. **Applied.**

### 5. Minor: counts are off

- `itinerary-list` is 98 raw, not 88 (88 hex + 10 rgba). Sidebar is 61, not 59. Picker is 61, not 52. The plan says ~290 remain in one place and ~170 in another; the real figure is ≈310 (555 outside globals and tests, minus ~240), and ≈260 after the modal plan deletes the hotels-view subtree (54). **Applied.**

### 6. Nit: left as is

- `countRaw` ignores 4-digit hex, `hsl()`/`oklch()`, and named colors (`white`, `text-white`, `bg-black/…`). That's fine for phase 1. Tighten it when the baseline nears zero, before dark mode is enabled.
- Decision 2 deletes dark blocks while dark mode is unreachable (`layout.tsx:40-47`). Correct, but the ~260 colors left mean dark mode needs this ratchet near zero first. The README note covers that.

## Cross-plan resolutions

- **ds-foundations:** a hard dependency. Use the shared `app/test/css-tokens.ts` / `src-files.ts` helpers (foundations scrutiny finding 3).
- **itinerary-rows:** rows lands first. Rows Task 6 owns the collapse-bar markup, and this plan only removes leftover raw colors. Agreed by the itinerary-rows scrutiny (see its finding 3 and the note appended below).
- **map-pin-redesign / map-route-lines:** `--map-route-{walk,drive,transit}` are defined by whichever plan lands first, in one map token block in `:root`. The second skips them. No duplicate declarations: `map-tokens.test.ts` parses `:root` and would read the last one. Mirror lines in `lib/map-helpers.ts` carry `hex-ok`. New pin and route CSS modules start at zero raw colors.
- **map-hover-sync:** its pin shadow `rgba(0,0,0,0.35)` raises the raw count in whatever file it lands in. Use `var(--shadow-md)`/`--shadow-lg`, or regenerate the baseline and justify it in the PR.
- **map-search-distance:** don't add the dark override at `place-search-picker.module.css:304` if this plan landed first (Task 4 deletes the file's dark rules).
- **modal-consolidation:** its Task 1 must regenerate the baseline (now **required**, since the baseline is exact). Applied in that plan.
- **Any plan removing raw colors after this lands** (map-pin-redesign, a11y-batch, bookings-layout, home-trip-cards): regenerate `raw-color-baseline.json` in the same PR. The failure message says how.

## Verdict

**Fix-then-ship.** The mapping table is sound, and the ratios check out. The guard needed exact equality to deserve the name "ratchet", and Task 5 collided with itinerary-rows. Both are fixed in the plan. Decision 1 (blue/purple → brand teal) stays the user's call.

## Cross-plan (appended by the itinerary-rows scrutiny, 2026-10-29)
- Confirmed from the rows side: rows lands first and owns the `days-accordion.tsx` collapse-bar markup. The codemod follows and removes only leftover raw colours, then re-applies its table on rows' `itinerary-list.module.css` restructure. The rows plan's Touches now says this.

## Cross-plan (appended by the home/calendar scrutiny, 2026-10-29)
- `home-trip-cards` **deletes `trip-delete-button.tsx`**. If home lands first, drop the `trip-delete-button.tsx:39` item. If the codemod lands first, home regenerates the baseline when it deletes the file.
- `calendar-trip-range` removes the 4 amber classes in `calendar-view.tsx` (`:210,248,335,380`), which settles the "needs a design call" exclusion: brand tint for trip days, `bg-surface-2` for off-trip days. Its Touches line now says to regenerate `raw-color-baseline.json` if the codemod has landed.
