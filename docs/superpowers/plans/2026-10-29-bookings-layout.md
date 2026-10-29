# Bookings Layout Implementation Plan

> **Ticket:** TP-0081

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the Bookings page out as one readable timeline column instead of a half-empty two-column grid. Stop the "Add booking" button from floating over ticket content on desktop.

**Architecture:** This is a CSS and markup change inside `bookings-view.tsx` and its module. The `useMediaQuery('(min-width: 1024px)')` split into even/odd columns goes away. The page content is capped at a narrow column so the tickets stay ticket-shaped. The `<details>` "Add booking" disclosure moves into the header DOM. On mobile, CSS keeps it fixed above the bottom nav (unchanged behaviour). From 768 px up it sits inline in the header and its chooser opens downward.

**Tech Stack:** React 19 client component, CSS modules.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §4.3 (bullets 2–3). Screenshot `docs/design-review/shots/20-bookings.png`.

**Touches:** `app/src/components/bookings-view.tsx`, `app/src/components/bookings-view.module.css`, `app/src/components/skeletons.tsx` (`BookingsSkeleton` width only). Deletes `app/src/lib/use-media-query.ts`. It conflicts with nothing in the map, budget or home plans. Other plans touch the same two files at string or class level: header-share-export (`runDelete` toast), ux-copy-glossary (empty block, toast copy), a11y-batch (toast descriptions), ds-foundations (`.bpName`/`.stayTitle` line-height and font sizes), and i18n P3. **Land this one first.** It is the only structural edit (it removes the column wrapper and moves the `<details>` block), and the others then rebase trivially. (Scrutiny: [2026-10-29-bookings-layout.scrutiny.md](2026-10-29-bookings-layout.scrutiny.md).)

## Global Constraints

- Content column: `max-width: 52rem` (832 px) on the page container for this view only, centred. The header, filter and list all share it. `--page-max` is not changed (`globals.css` "Absolute" comment).
- List order stays true time order. One column at every width (the reason for the old JS split, `bookings-view.tsx:97-100`, disappears with it).
- "Add booking": below 768 px, a fixed pill above the bottom nav (current `.addBar` rules, `bookings-view.module.css:431-450`). From 768 px up, it renders inline at the right of `.headRow`, **under** the Total. `.headRow` is a row (`align-items: flex-end; justify-content: space-between`, L24-29), so a plain sibling would sit *beside* the Total. Wrap the Total block and the `<details>` in a new `.headActions` (`display: flex; flex-direction: column; align-items: flex-end; gap: 8px`). The chooser opens below (`top: calc(100% + 6px); right: 0`). Same `<details>`/`<summary>` element, so it still works without JS. When `total` is 0, `.headActions` holds only the button.
- Mobile clearance: the last ticket must clear the pill when scrolled to the end. `.wrap` `padding-bottom` becomes `calc(96px + env(safe-area-inset-bottom))`.
- No new colors. Tokens only.

## Review Focus

1. **The fixed pill inside the header DOM on mobile.** `position: fixed` breaks if any ancestor gets `transform`, `filter` or `contain`. Check at 390×844 that the pill is pinned while scrolling (Task 2).
2. **The chooser now sits mid-page on desktop.** It must open below the button, inside the viewport, above the filter bar (`z-index: var(--z-dropdown)`). A native `<details>` does **not** close on Escape or on an outside click, and nothing at HEAD handles either. Task 2 adds both, because a menu stuck open over the list is the new failure mode.
3. **A day with 4+ bookings.** It now stacks vertically. Ticket width at 52rem must not stretch the dashed route line awkwardly. Check visually against the 1440 screenshot.
4. **The Undated group and gap-night notes.** They render unchanged in a single column (no more column wrapper).
5. **Keyboard order.** "Add booking" now comes before the filter in tab order on every width. That is acceptable and consistent. Confirm focus is visible on the summary.

---

### Task 1: Single-column timeline

**Files:**
- Modify: `app/src/components/bookings-view.tsx` (remove the `useMediaQuery` import L22, `twoColumns` L97-101, `evens`/`odds` L58-63, the column wrapper at L308-310 and its closing tags; render `g.items` directly)
- Modify: `app/src/components/bookings-view.module.css` (delete `.ticketCols`/`.ticketCol` L141-149; add `.column` with `max-width: 52rem`, applied as `<PageContainer className={styles.column}>`, with selector specificity `.wrap .column` so it beats `page-container.module.css`)
- Modify: `app/src/components/skeletons.tsx` (`BookingsSkeleton` L195-225: `PageContainer` gets the same 52rem cap, and the per-group `md:max-w-[552px]` (the old half-width column) is removed, so skeleton tickets are full-column width like the page)

- [ ] **Step 1:** Make the edits. `bookings-view.tsx` is the only importer of `app/src/lib/use-media-query.ts` at HEAD. Delete that file too, after re-checking with `grep -rn useMediaQuery app/src` and its row in `AGENTS-INDEX.md` if there is one.
- [ ] **Step 2:** `cd app && pnpm typecheck && pnpm lint && pnpm test` (tail -3). Expected: clean. There is no unit-testable logic here; `bookings-merge.test.ts` must still pass unchanged.
- [ ] **Step 3:** Commit `fix(bookings): single-column timeline [TP-0081]`

### Task 2: "Add booking" in the header on desktop

**Files:**
- Modify: `app/src/components/bookings-view.tsx` (move the `{canEdit && <details …>}` block from L416-449 into a new `.headActions` wrapper inside `.headRow` that also wraps the `.total` block at L227-236)
- Modify: `app/src/components/bookings-view.module.css` (`.addBar` mobile rules unchanged; `@media (min-width: 768px)` → `.addBar { position: relative; inset: auto; padding: 0; pointer-events: auto; }`, `.add { box-shadow: none; min-height: 40px; }`, `.chooser { top: calc(100% + 6px); bottom: auto; left: auto; right: 0; transform: none; z-index: var(--z-dropdown); }`; `.headRow` gets `flex-wrap: wrap` so `.headActions` drops under the title on narrow tablets; new `.headActions` rule per Global Constraints; below 768 px `.headActions` is `display: contents`, so the fixed pill is unaffected)

- [ ] **Step 1:** Make the edits. Keep the WHY comment about `<details>` being the no-JS path. Add one `useEffect` keyed on `chooser`: while it is open, `keydown` Escape and a `pointerdown` outside the `<details>` (ref) call `setChooser(false)`, and Escape returns focus to the `<summary>`.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` (tail -3).
- [ ] **Step 3: Verify**: `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, `/trip/79efe162-dfb2-46c2-ad46-a34695771b8b/bookings`.
  - 1440×900: one centred column of tickets. "Add booking" sits at the header's right, under "Total $7,144". Opening it shows Stay / Transport below it. Scroll the whole list: nothing floats over any ticket.
  - 390×844: the pill is fixed above the bottom nav while scrolling. At the end of the list the last ticket's footer (fare / ref row) is fully visible above the pill. The chooser opens upward.
  - Escape closes the chooser. Tab reaches the summary with a visible focus ring.
- [ ] **Step 4:** Commit `fix(bookings): add-booking button no longer covers tickets on desktop [TP-0081]`

### Task 3: Docs

- [ ] `AGENTS-INDEX.md` L266 `bookings-view.tsx`: "Consolidated travel-wallet: single-column timeline (stays + rides), filter, gap markers, add chooser (header on desktop, floating on mobile)".
- [ ] `REQUIREMENTS.md` §6: add one line under "### Hotels view", or a new "Layout" line: "Bookings render as one date-ordered column; add-booking is inline in the header on desktop, a floating pill on mobile."
- [ ] Commit `docs: bookings layout [TP-0081]`
