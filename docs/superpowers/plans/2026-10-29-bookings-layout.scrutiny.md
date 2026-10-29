# Scrutiny: bookings layout

Plan: [2026-10-29-bookings-layout.md](2026-10-29-bookings-layout.md). Traced against HEAD `6f6f7a2`.

## Intent

Turn the half-empty two-column ticket grid into one date-ordered column, and stop "Add booking" floating over tickets on desktop (spec §4.3, bullets 2–3).

### Simpler alternatives considered (mandatory pass)

- **CSS masonry / `columns`:** these flow column-first, so reading and focus order would no longer match time order. The current JS split exists to avoid exactly that (`bookings-view.tsx:97-101`). Rejected.
- **Keep two columns and only fix the FAB:** this leaves the spec's main complaint (half-empty rows) in place.
- **The plan's approach is already the minimal one.** It deletes code (`useMediaQuery`, `evens`/`odds`, the column wrapper, `.ticketCols`) and moves one element. Nothing smaller solves both bullets.
- **Merge with home-trip-cards?** No. The only shared file is `skeletons.tsx`, and there the plans touch different functions. They share no concept. Keep them separate.

## Findings

### M1. Major: "under the Total" doesn't happen with the described DOM move (applied)

- **Finding:** the plan put the `<details>` "after the `.total` block" inside `.headRow`.
- **Why it matters:** `.headRow` is `display:flex; align-items:flex-end; justify-content:space-between` (`bookings-view.module.css:24-29`). A third flex child sits to the *right* of the Total, not under it, and the Total is pushed toward the middle.
- **Change:** wrap the Total and the `<details>` in a `.headActions` column (flex, `align-items: flex-end`). Below 768 px it is `display: contents`, so mobile is unchanged. **Applied.**

### m1. Minor: skeleton keeps the old half-width column

- `BookingsSkeleton` still has `md:max-w-[552px]` per group (`skeletons.tsx:~208`), which mimics the old column. The plan only mentioned the 52rem cap. **Applied:** Task 1 now removes it.

### m2. Minor: the Touches line under-reports overlap

- `bookings-view.tsx` / `.module.css` are also edited by header-share-export (`runDelete` :159), ux-copy-glossary (:168, :278-283), a11y-batch (:170-183), ds-foundations (`.bpName`/`.stayTitle`), and i18n P3. All of those are string or class edits. **Applied:** the Touches line now lists them and says to land this structural PR first.

### Verified claims

- `useMediaQuery` has exactly one importer, `bookings-view.tsx:22`, so `lib/use-media-query.ts` can be deleted (grep). AGENTS-INDEX has no row for it. ✓
- `.ticketCols` / `.ticketCol` are at L141-149, and `.addBar` is at L431-450 (the 768 px override is at L444-449). ✓
- `PageContainer` accepts `className` and appends it after `.container` (`ui/page-container.tsx:12-14`). Module order is not guaranteed, so `.wrap .column` (two classes) is the right specificity fix. ✓
- Fixed positioning of the moved `<details>` on mobile: no ancestor between it and `.wrap` sets `transform`, `filter` or `contain`. `.head` only sets `background`, `padding` and `border`. The original location shares the same outer ancestors. ✓
- Mobile clearance: the pill top is about 56 (nav) + 14 + 46 ≈ 116 px above the viewport bottom. The list ends 56 (layout `pb-14`) + 96 (wrap) = 152 px above it, so the last ticket clears the pill. The plan's `+ env(safe-area-inset-bottom)` keeps that on notched phones. ✓
- The native `<details>` has no Escape or outside-click close at HEAD (`onToggle` only, L420-424), so the added effect is needed. ✓

## Verdict

**fix-then-ship** (the fixes are applied, so it is ready). The plan is small, deletes more than it adds, and its risky spot (fixed inside the header DOM) holds up when traced. The one real gap was the header placement (M1).
