# TP-0134: let a viewer read a long note on the trip day

## Problem
- With `canEdit` false, `sortable-place-list.tsx:213` renders `StaticItem`.
- `StaticItem` renders `<PlaceRow>` without `active`, so `place-row.tsx:187` only ever shows the **first line** of a note, ellipsized.
- Editors open a row by selecting it (`SortableItem`), which passes `active` and shows the full note in the expanded body. Viewers have no way to do that.

## Change (smallest)
- **Viewer rows can expand.** In `StaticItem`, when `!canEdit`:
  - The row body becomes a disclosure: `role="button"`, `tabIndex=0`, `aria-expanded`.
  - Tap, click, Enter or Space toggles a local `open` state, which is passed to `PlaceRow` as `active={open}`.
  - The expanded body is the same one editors see (full note, address, hours, website, links).
- **Links keep working.** Clicks that start on an `a` / `button` / `input` inside the row don't toggle, so links in the expanded body still work.
- **Selection is unchanged.** The state is local, not the URL `?placeId=`, so a viewer's tap does not move the map. The map's own pin tap still selects as it does today.
- The pre-hydration render of `StaticItem` for editors (`!mounted`) does not change: `expandable` is `!canEdit`.

## Out of scope
- The ticket's second point, "stop cards don't show notes", covers the phone map carousel for everyone, not just viewers. That card was redesigned in TP-0152, so changing it needs its own UI decision.

## Tests
- typecheck and lint.
- No new e2e. The suite has no viewer fixture: the C3 viewer test skips whenever the dev user can edit the seeded trip. Verify manually on Preview with a shared, view-only trip.
