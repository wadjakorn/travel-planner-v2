# Scrutiny: trip navigation labels

Plan: [2026-10-29-nav-labels.md](2026-10-29-nav-labels.md). Reviewed against `main` @ `6f6f7a2`.

## Intent

Put a visible 12 px label under every trip-nav icon (bottom bar and md+ rail), stop showing a dead "Notes — coming soon" item, and make REQUIREMENTS §3 match the nav that shipped.

### Simpler alternatives considered

- **Tooltip-only rail (keep 56 px).** Cheaper, but invisible on touch, and md (768–1023 px) is mostly tablets. The plan rejects it for the right reason.
- **Labels on mobile only.** This keeps the map width on md+ and still fixes the most-used surface. It's a real option, but the review's §4.6 complaint covers the rail too, and the cost is 16 px. **Plan's default kept.**
- **Re-enable Notes instead of hiding it.** See finding 1. Left to the user.

## Findings

### 1. Decision for the user: Notes isn't unbuilt, it was switched off. *Left (documented in the plan).*

- **Evidence:**
  - `app/trip/[id]/notes/page.tsx` is a working page ("Phase 6 Notes & checklists") backed by `notes-view.tsx`, with checklist and remove server actions. a11y-batch even fixes its touch targets.
  - `git show 00dedec` ("force light/en; nav rail items calendar/budget/notes/settings shown but disabled") disabled Notes together with Calendar, Budget and Settings. The other three were re-enabled later.
- **Why it matters:** the plan's premise "until Notes ships" may be false. Re-enabling is the same one-line change, and it resolves the review's complaint by shipping the feature instead of hiding it.
- **Change:** the third option is added under Decision 3. The default stays "hide", because only the owner knows why Notes was held back.

### 2. Major: class collision with `ds-foundations`. *Applied (ownership note).*

- **Evidence:** foundations Task 5 rewrites `trip-rail-frame.tsx:88` to `md:top-(--header-h)` / `md:h-[calc(100dvh_-_var(--header-h))]`. Its font-floor task touches the badge at `trip-rail.tsx:100`. This plan's "exact classes" restate the whole line with `57px` and `text-[10px]` unchanged. If it lands second, it would silently revert foundations, and foundations' own guard test would then fail on the literal `57px`.
- **Change:** whichever plan lands second keeps foundations' `--header-h` forms and badge size. This plan changes only width, alignment and gap.

### 3. Major: the spec line conflicts with `header-share-export`. *Applied (ownership note).*

The header plan ships Share and Export and drops global undo from the spec. This plan writes "Not shipped: undo/redo, Share, Export, Help". The line now has to reflect what's still missing at merge time.

### 4. Nit: `aria-label` hides the badge count. *Applied.*

`TripRailLink` sets `aria-label={label}` (`trip-rail-frame.tsx:114`). Once the label is visible text, that override only removes information: the Bookings count badge isn't announced. The plan now drops `aria-label` so the name comes from the content ("Bookings 3"). `aria-current` stays.

### 5. Nit: `JSX.Element` doesn't compile under `@types/react` 19. *Applied* (→ `React.JSX.Element`).

## Verified (no change needed)

- **Rail width 56 → 72 and the map:**
  - The layout is `flex` → `TripRail` → page `<aside>` (`TRIP_ASIDE_CLASS`, md 400 px, lg 440 px, `trip-aside-class.ts:6`) → `PersistentMap` section `flex-1 min-h-0` (`persistent-map.tsx:130-133`). So the map absorbs the 16 px.
  - Map width: 768 → 296 px (was 312), 820 → 348, 1024 → 512, 1440 → 928. The plan's numbers are correct.
  - No other code assumes a 56 px rail. A grep for `w-14|left-14|pl-14|ml-14|56px` finds only the rail itself, the mobile `100dvh-57px-56px` aside height (bar height, unchanged) and unrelated skeleton widths.
- **dvh / breakpoints:**
  - The rail keeps `md:h-[calc(100dvh-57px)]` and `md:sticky md:top-[57px]`.
  - The mobile bar keeps `h-14`, so `pb-14` (`layout.tsx:81`), the aside `-56px`, the bookings FAB `3.5rem` and the toggle `bottom-20` all still line up.
  - `md` = 768 px matches "Mobile (<768px)" in the new §3 text.
- **Full-map hide** keys on `[aria-label='Trip navigation']` (`globals.css:273`). The plan keeps it on `<nav>`. Removing the link-level `aria-label` (finding 4) doesn't affect it.
- **Mobile height budget:** 4 + 28 + 2 + 16 + 4 = 54 ≤ 56. Five items at 390 px give about 76 px slots, and about 63 px at 320 px. "Itinerary" at 12 px is about 52 px wide, so it fits.
- **`/notes` with Notes removed:** `useRailSegment` returns `'notes'` (in `RAIL_SEGMENTS`), so the frame still renders and no item matches. No layout shift.
- **Line refs:** `trip-rail.tsx:22-29, 58-72, 78-90, 91-105` and `trip-rail-frame.tsx:82-90, 97-127, 130-138` are correct. `REQUIREMENTS.md:17-23` is the §3 header block. §6 "Hotels view" starts at `:236`.

## Cross-plan

- **ds-foundations:** finding 2.
- **header-share-export:** finding 3.
- **map-day-bar-ghost-pins:** its md+ day bar must fit a 296 px map at 768 px. Recorded in this plan's Touches. There is no day-bar scrutiny file yet, so this is also listed in the final report.
- **i18n-extraction:** `trip-rail.tsx` is the lint guard's seed file ("0 literals"). This plan adds no literals because labels come from `tServer()`, so the guard stays green.

**Verdict: ship after the notes (fixes applied).** The plan is small and its layout math is correct. The open question is product-level: hide Notes or re-enable it.

## Cross-plan (appended by the header-share-export scrutiny, 2026-10-29)
- The header plan's Task 5 now edits *this* plan's REQUIREMENTS §3 "Not shipped (open decision)" line if nav-labels lands first. It moves Share and Export into the shipped header list and leaves `Not shipped: global undo/redo (bookings have Undo on delete, §6), Help.` Whether the header's Share/Export PR ships at all is still an open user decision (header scrutiny). If it doesn't ship, this plan's line stands, except that "undo/redo" should read as above once the Undo PR merges.
