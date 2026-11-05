# TP-0112: confirm before deleting a place

## Problem

The trash button on a place row (`components/sortable-place-item.tsx`) is a `<form action={removeAction}>` containing a submit button, so one tap deletes the place permanently. That happens in two places:
- `PlaceRow`, around line 290;
- `StaticItem`, around line 400.

Places have no soft delete or restore path, which makes a mis-tap on mobile costly.

## Options

| | Confirm dialog | Soft delete + Undo toast |
|---|---|---|
| Work | One new client component; reuses `ConfirmDialog` (TP-0097) | A soft-delete path, plus restore that re-inserts at the old idx, rebuilds legs and restores leg notes, plus a toast, plus purging old rows |
| Risk | Low | High: positional legs and `place_day_idx_unique` both apply to soft-deleted rows (`leg-service.ts` notes this) |
| Consistency | Same as trip delete (`trip-delete-button.tsx`) and booking delete | No existing pattern for places |

**Choice:** the confirm dialog. Undo would need its own design and is not worth it for a low-frequency action.

## Change

- New `components/place-delete-button.tsx` (client):
  - Renders the same trash icon button (`type="button"`, the same aria-label `place_remove_from_day_aria`, `data-place-delete={id}`).
  - It opens `ConfirmDialog`:
    - title `place_delete_confirm_title` = "Remove “{name}” from this day?"
    - message `place_delete_confirm_body` = "Its travel leg goes too. This can't be undone."
    - confirm label `place_delete_confirm_action` = "Remove"
  - On confirm it builds a `FormData` (`placeId`) and runs `removeAction(fd)` inside `useTransition`, with `busy` while the action is pending. It closes the dialog when the action finishes; a redirect unmounts the row anyway.
- In both call sites in `sortable-place-item.tsx`, the `<form>` + `SubmitButton` is replaced by `<PlaceDeleteButton …/>`.
- New en/th messages.
- e2e `mobile-layout.spec.ts:1995` removes through the row's form. Change it to click `[data-place-delete=…]` and then the dialog's Remove button. This runs with the end-of-batch e2e.

## Tests

- Unit (vitest + testing-library, if the repo has component tests): click → dialog opens → Cancel does not call the action → Remove calls the action with the right `placeId`. Check `components/*.test.tsx` for the existing setup.
- typecheck, lint, and the i18n key-parity test, if one exists.
