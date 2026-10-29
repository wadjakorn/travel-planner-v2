# Scrutiny: modal consolidation + form primitives

Plan: [2026-10-29-ds-modal-consolidation.md](2026-10-29-ds-modal-consolidation.md). Traced against `main` @ `6f6f7a2`.

## Intent

Put every live app dialog on the shared `Modal` (focus trap, Esc, focus return, scroll lock, correct z-order), delete the unreachable hotels-view subtree, add an `invalid` state and an `lg` size to `Input`, and replace hand-written "Saving…" with `Button loading`. `Card` gets trimmed and adopted.

### Simpler alternatives considered

- **Patch the four hand-rolled dialogs in place** (z-index, Esc, Enter bug). Rejected. That is four more copies of a focus trap, and `Modal` already has one plus the overlay stack (`modal.tsx:32-58`).
- **Delete `Card` outright** instead of adopting it in 3 error pages. Equally valid and slightly smaller. The plan's choice is fine; not worth a change.
- **Scope:** the plan bundles four concerns. Task 1 (deletion) gates three other plans, so it should ship alone and first (finding 2). The rest can stay one PR.

## Dead-code claim: verified

The task asked for this specifically, so it was checked before relying on it:

- `grep -rnE "hotels-view|hotel-search-picker|hotel-preview-modal|hotel-dates-modal|hotel-manual-form|hotel-edit-launcher|hotel-edit-modal"` across all of `app/` (ts/tsx/js/mjs/json/css, excluding `.next` and `node_modules`) matches **only imports between the 8 files themselves**: `hotels-view.tsx:12-15`, `hotel-search-picker.tsx:14-16`, `hotel-edit-launcher.tsx:5-6`.
- Component names (`HotelsView`, `HotelSearchPicker`, `HotelEditLauncher`, `HotelEditModal`, `HotelManualForm`, `HotelPreviewModal`, `HotelDatesModal`, `HotelDates`) appear only in those files. There is no `dynamic(() => import(...))`, no barrel re-export, and no launcher outside the subtree. `HotelsView`, the root, has zero importers.
- Route: `app/trip/[id]/hotels/page.tsx` is only `redirect(`/trip/${id}/bookings`)`.
- The live hotel flow is `bookings-view.tsx` / `hotel-form-client.tsx` / `hotel-place-picker.tsx`, which shares nothing with the subtree. `place-search-picker.module.css`, `trip-create-form.module.css`, and `sign-in.module.css` are also used by live files, so keeping them is right.
- No orphaned server actions: `addHotelAction`, `addHotelInlineAction`, `updateHotel*`, and `removeHotel*` are all used by live pages and components. `hotelFormFrom` is used inside `lib/places/pick.ts:60`.

**Conclusion:** all 8 files are dead. Deleting them is safe.

## Other verified claims

- 11 `role="dialog"` hits at HEAD, as stated. The four live hand-rolled dialogs are `confirm-dialog.tsx:52`, `day-mode-picker.tsx:116`, `place-search-picker.tsx:359`, and `place-preview-modal.tsx:34`.
- **Bug: day-mode Enter confirms on Cancel.** Real. A window `keydown` listener calls `onConfirm()` on any Enter (`day-mode-picker.tsx:106-109`), and the confirm button also has `autoFocus`.
- **Bug: manual-add sits under the header.** Real. Its scrim is `zIndex: 100` (`place-search-picker.tsx:368`) against `--z-sticky` 1100 (`header.module.css:12`). `place-preview-modal.tsx:42` has the same bug.
- **`pendingText` is invisible under `Button loading`:** true for `SubmitButton` (`ui/button.tsx:94` `opacity-0`). `ActionSubmit` is a raw `<button>` today (`action-form.tsx:93-98`), so its pending text *is* visible now. It only becomes invisible after Task 6 converts it. The decision still holds, because the spinner and disabled state replace it.
- `renderToStaticMarkup` tests in `.ts` files: these match vitest's `include: ['src/**/*.test.ts']` (`vitest.config.ts`).

## Findings

### 1. Blocker: nested `Modal`s leave the page scroll-locked

- **Finding:** each `Modal` saves `body.style.overflow` on open and restores it on cleanup (`modal.tsx:88-99`). Once `ConfirmDialog` is a `Modal` opened over another `Modal`, it saves `'hidden'`. When both unmount in one commit, React runs a deleted subtree's effect cleanups parent-first: the outer restores `''`, then the inner restores `'hidden'`.
- **Why it matters:** after "Discard changes?" → Discard, or after deleting a hotel or transport from inside the Bookings modal, the page can no longer scroll until a reload. These are exactly the Review Focus 1 flows.
- **Evidence:** Discard → `onConfirm={onClose}` (`place-note-modal.tsx:94`) → `setOpen(false)` in `place-note-launcher.tsx:29-38` → `PlaceNoteModal` unmounts with `confirmDiscard === true`, so both `Modal`s are deleted together. Today `ConfirmDialog` doesn't lock scroll, so the bug is new with this plan.
- **Change:** a module-level ref-counted lock, `ui/scroll-lock.ts` (`acquire`/`release`; save on 0→1, restore on 1→0), with a node unit test covering out-of-order release. Task 8 asserts that `overflow` is restored after Discard and after a real delete. **Applied** (Task 2, Touches, Task 8, docs).

### 2. Major: Task 1 should ship first, alone

- **Finding:** three plans spend work on the dead files. a11y-pin-picker rewrites `hotel-manual-form.tsx` and `hotel-edit-modal.tsx`. a11y-batch edits `hotels-view.tsx` and `hotel-search-picker.tsx` error copy (`a11y-batch.md:217-218,238`). i18n P3 translates ~39 literals in 7 of the dead files (`i18n-extraction.md:145`) and deletes only `hotels-view.tsx`.
- **Change:** split Task 1 into its own PR and land it before those plans, so they drop hunks instead of rebasing onto a deletion. **Applied** (header note and cross-plan notes).

### 3. Minor: the baseline regenerate in Task 1 is now required

- Hex-codemod's guard is now exact (hex scrutiny finding 1), so the deleted files' baseline entries fail as stale. **Applied.**

### 4. Minor: `initialFocusRef` left out of effect deps

- "Keep `[open]` as the only effect dependency" triggers `react-hooks/exhaustive-deps` (warn-level; `pnpm lint` has no `--max-warnings`). Use `[open, initialFocusRef]`. A ref object is stable, so behavior doesn't change. **Applied.**

### 5. Minor: shared `srcFiles` helper

- It is now owned by ds-foundations Task 1 (`app/test/src-files.ts`). This plan creates it only if foundations hasn't landed. **Applied.**

### 6. Nits: left as is

- Manual-add grows from a 560px panel to `Modal` md (720px). Consider `size="sm"` (480) plus internal scroll, or accept the change. Check it in the Task 8 screenshot.
- `<Button className={signInStyles.btn}>` (place-note, manual-add): `.btn` sets no height, so Button's `h-10` applies. That is 40px against today's ~47px. It matches the existing `place-form.tsx:325` precedent; just eyeball it in Task 8.
- The dialog guard only catches overlays that declare `role="dialog"`/`aria-modal`. A bare `position: fixed` scrim would slip through. That's acceptable; the AGENTS-INDEX recipe fix (`:398-399`, `ModalShell` doesn't exist) is the real prevention.
- `ConfirmDialog` passes `title` to `Modal` as `aria-label` and also renders a visible `<h2>`. `aria-labelledby` would be cleaner but isn't required.

## Cross-plan resolutions

- **a11y-pin-picker:** drop the `hotel-manual-form.tsx` and `hotel-edit-modal.tsx` hunks. Only `place-manual-form.tsx` is a live `PinPickerMap` consumer; the live hotel flow has no pin picker. Already applied by the a11y-pin-picker scrutiny (its finding 1); that scrutiny also resolves the `!pos` vs "keep `disabled` exactly" overlap on `place-manual-form.tsx` (its finding 3), and the pin-picker resolution wins.
- **a11y-pin-picker (submit button):** whichever plan lands second leaves `place-manual-form.tsx` with `<Button type="submit" loading={submitting} disabled={submitting}>` (no `!pos`). **Applied to Task 6.**
- **a11y-batch:** drop the `hotels-view.tsx` and `hotel-search-picker.tsx` rows (error copy). When a11y-batch lands it removes `pin-card.tsx` and `map-preview-marker.tsx` from `dialog-guard.test.ts` `ALLOWED` (popups become `role="group"`). **Noted in Task 2.** `place-search-picker.module.css` is no longer "shared with hotel-search-picker" after Task 1. Its A17 task is skipped once Task 5 here lands, as the plan notes.
- **i18n-extraction P3:** don't translate the 7 dead files. P3's "delete hotels-view" moves here (Task 1).
- **itinerary-rows:** edits `day-mode-picker.tsx`. Task 3 here deletes `ConfirmModal` (`:92-184`) and leaves the `<select>`. That's a trivial rebase.
- **ds-hex-codemod:** excludes `trip-settings-form.tsx`/`trip-create-form.tsx` because Task 5 here owns those lines (`text-red-600` → `text-danger`, `text-zinc-500` → `text-muted`). Consistent.

- **Coordinator confirmation (a11y/rows scrutinies):** the dead-file check was reproduced independently, and the a11y plans dropped their hunks on the dead files. itinerary-rows lands before ds-hex-codemod and owns the day collapse bar.

## Verdict

**Fix-then-ship.** The dead-code deletion is verified safe, and the two real bugs it cites (Enter-confirms-on-Cancel, dialogs under the header) are confirmed. The one blocker, a scroll lock that sticks with nested modals, was introduced by the plan itself, and the plan now includes the fix and a test for it. No decision is left for the user beyond the plan's own defaults.
