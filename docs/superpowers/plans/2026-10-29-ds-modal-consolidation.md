# Modal Consolidation + Form Primitives Implementation Plan

> **Tickets:** Task 1 (delete dead tree) = **TP-0078** · rest = **TP-0097** — use the matching key in commit messages instead of TP-XXXX.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every app dialog runs on the shared `Modal` primitive (focus trap, Esc, return focus, scroll lock, correct stacking). `Input` gets an `invalid` state wired to `aria-describedby`, plus an `lg` size. Submit buttons use `Button loading` instead of hand-written "Saving…". The unused `Card` sub-components go, and `Card` itself gets real consumers.

**Architecture:** Grepping `role="dialog"` at HEAD `6f6f7a2` finds 11 hits:
- 1 is `Modal` itself.
- 2 are map popups (`pin-card.tsx:18`, `map-preview-marker.tsx:45`). These are **out of scope**: the a11y-batch plan (Decision 1, A11) turns them into `role="group"` with Esc and focus return.
- 4 live in an **unreachable** subtree. `hotels-view.tsx` has no importer, because `/trip/[id]/hotels` redirects to Bookings (`app/trip/[id]/hotels/page.tsx`). Those 4 are deleted, not migrated.
- The 4 live hand-rolled dialogs get rebuilt on `Modal`. To support them, `Modal` gains three small props: `initialFocusRef`, `role`, `describedBy`.

The plan also adds a source guard: `role="dialog"`/`aria-modal` may only appear in `ui/modal.tsx` (plus the two map popups until the a11y-batch plan lands).

**Tech Stack:** React 19, `react-dom` portals, Tailwind v4 (`aria-invalid:` variant), vitest (node env; primitives tested via `react-dom/server` `renderToStaticMarkup`, which was checked to work with the repo's `jsx: react-jsx` tsconfig).

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §5 A17, §6 component table (Input "ไม่มี invalid / ไม่มี lg", Modal "3 vs dialog ทำเอง 10", Card "0 — ลบทิ้งหรือนำไปใช้"), and §6 "ลำดับที่ควรทำ" (4). This scope also asks for "`Button loading` instead of hand-written Saving…".

**Touches:**
- **Deletes** `hotels-view.tsx`, `hotels-view.module.css`, `hotel-search-picker.tsx`, `hotel-preview-modal.tsx`, `hotel-dates-modal.tsx`, `hotel-manual-form.tsx`, `hotel-edit-launcher.tsx`, `hotel-edit-modal.tsx`.
- **Creates** `ui/scroll-lock.ts` (+ test), `ui/dialog-guard.test.ts`, `ui/primitives.test.ts`.
- **Modifies** `ui/modal.tsx`, `ui/input.tsx`, `ui/card.tsx`, `ui/index.ts`, `ui/README.md`, `confirm-dialog.tsx`, `day-mode-picker.tsx`, `place-search-picker.tsx` (manual-add block `:357-397` only), `place-preview-modal.tsx`, `place-preview-card.tsx` (Add button `:79-106` only), `place-note-modal.tsx`, `place-manual-form.tsx` (submit button only), `google-refresh-button.tsx`, `action-form.tsx`, `submit-button.tsx`, `trip-create-form.tsx`, `trip-settings-form.tsx`, `budget-settings-form.tsx`, `budget-view.module.css` (`.settingsForm > .addBtn` only), `app/error.tsx`, `app/not-found.tsx`, `app/trip/[id]/error.tsx`, plus one `pendingText` attribute removed in each of `app/settings/page.tsx`, `app/trip/[id]/settings/page.tsx`, `app/sign-in/page.tsx`, `place-form.tsx`, `transport-form-client.tsx`, `hotel-form-client.tsx`, `expense-form.tsx`, `optimize-strip.tsx`, `trip-grid-empty.tsx`.

**Ship Task 1 first, as its own PR.** The dead-subtree deletion is independent of every other task here, and three other plans (a11y-pin-picker, a11y-batch, i18n P3) currently spend work on those files. Landing it first lets them drop those hunks instead of rebasing onto a deletion. Tasks 2–9 then ship as the second PR.

**Cross-plan notes:**
- `2026-10-29-a11y-pin-picker.md` edits `hotel-manual-form.tsx` and `hotel-edit-modal.tsx`, both dead code that this plan deletes. Those hunks should be dropped. That leaves `place-manual-form.tsx` as the only live `PinPickerMap` consumer (`grep -rln PinPickerMap app/src/components`: the two dead hotel files, `place-manual-form.tsx`, and the picker's own files). The live hotel flow (`hotel-form-client.tsx` → `hotel-place-picker.tsx`) has no pin picker, so "three forms" in that plan is one.
- `2026-10-29-i18n-extraction.md` P3 deletes only `hotels-view.tsx` and still budgets ~39 literals for the other 7 dead files (`hotel-dates-modal` 7, `hotel-edit-launcher` 1, `hotel-edit-modal` 10, `hotel-manual-form` 11, `hotel-preview-modal` 3, `hotel-search-picker` 7). Drop them from P3.
- `2026-10-29-a11y-batch.md` edits `hotels-view.tsx` and `hotel-search-picker.tsx` (error copy), which are dead and deleted here. It also edits `place-note-modal.tsx`, `day-mode-picker.tsx`, `place-search-picker.tsx`, and `app/{,trip/[id]/}error.tsx` in different hunks, and its Task 7 (A17) is skipped once this plan's Task 5 lands.
- `2026-10-29-itinerary-rows.md` edits `day-mode-picker.tsx`.

No `globals.css`, no map renderer.

## Decision needed

1. **Delete the dead `hotels-view` subtree** instead of migrating its 4 dialogs. **Default: delete.** No file imports `HotelsView` (`grep -rn HotelsView app/src` matches only its own definition), and the route redirects. Nothing outside the subtree imports the 7 other files. `lib/places/pick.ts` `hotelFormFrom` stays because `pick.ts:60` uses it internally and `pick.test.ts` tests it.
2. **`Card`: use it, and delete the unused parts.** **Default: keep `Card`, delete `CardHeader`/`CardBody`/`CardTitle`** (0 consumers). Adopt `Card` in the 3 identical "centred message" surfaces: `app/error.tsx:20`, `app/not-found.tsx:7`, `app/trip/[id]/error.tsx:23`. They all share `rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-sm)]`. Change the `Card` base to `rounded-2xl` with no shadow. Every other card-like surface in the app is a semantic element (`<article>`, `<a>`) or a module-styled layout, so forcing `Card` onto those would be a fork, not reuse.
3. **The day-mode "Override" confirm uses the shared destructive `ConfirmDialog`** (Cancel prominent and focused). **Default: yes, and no new `tone` prop.** The action overwrites every segment's individual mode ("This replaces individual settings"), which is data loss. The current `ConfirmModal` (`day-mode-picker.tsx:92-184`) also has a bug: its window-level `Enter` listener confirms even when focus is on Cancel (`:106-109`).
4. **Drop `pendingText` from `SubmitButton`/`ActionSubmit`.** **Default: yes.** Under `Button loading` the label is `opacity-0` (`ui/button.tsx:94`), so the pending text is never visible. It only changes the accessible name and the button width, and that contradicts the documented "loading preserves width and accessible name" (`ui/README.md`).

## Global Constraints

- `Modal` stays the only overlay shell: portal to `document.body`, scrim at `--z-modal`, `onRequestClose` is a request (`ui/modal.tsx:3-5`). No new hand-rolled `position: fixed` scrims.
- A nested `Modal` opened later stacks above an earlier one because it is portaled later at the same z-index. The overlay stack (`modal.tsx:36`) makes only the topmost one answer Esc. `ConfirmDialog` no longer needs `--z-toast` or `useTopmostOverlay`.
- Mobile (<768px): every `Modal` is a bottom sheet (`modal.module.css:1-20`). That now includes `ConfirmDialog`, which is expected.
- Copy stays as it is today (titles, labels, messages). The new date-error id texts are the existing strings.
- Map popups (`pin-card.tsx`, `map-preview-marker.tsx`) are **not** touched. They are not modal (the map stays interactive), and the a11y-batch plan owns them.

## Review Focus

1. **A `ConfirmDialog` over an open `Modal`.** Examples: place-note "Discard changes?" (`place-note-modal.tsx:89`), and hotel/transport delete inside the Bookings `Modal` (`hotel-form-client.tsx:500,508`, `transport-form-client.tsx:471,479`). The confirm must paint above, take Esc alone, and on close return focus inside the still-open underlying Modal. Task 8 checks this.
2. **The initial focus on a destructive confirm is Cancel, not the first focusable (Delete).** Pressing Enter right after the dialog opens must cancel. Pinned by `initialFocusRef` (Task 2) and Task 8.
3. **The manual-add dialog used to sit *under* the sticky header.** Its scrim had `zIndex: 100` (`place-search-picker.tsx:368`) and the header has `--z-sticky` 1100 (`header.module.css:12`). After migration the scrim must cover the header and rail at 1440. Task 8 screenshots it.
4. **A map inside a `Modal`** (manual-add `PinPickerMap`). The Tab trap must still cycle through the form fields. Esc inside the map closes the dialog, not just the map's own UI. Clicking the map must not count as a scrim click. `Modal` closes on `mousedown` only when `target === currentTarget` (`modal.tsx:145-149`). Task 8 checks all three.
5. **The `ActionSubmit` → `Button` switch changes look or width on the budget-settings form.** That form used module class `.addBtn`, a 980px pill on brand. With `variant="primary" size="sm" className="self-end rounded-full"` it must stay right-aligned and must not grow taller than 32px. Task 8 screenshots it.

---

### Task 1: Delete the dead hotels-view subtree

**Files:**
- Delete: `app/src/components/{hotels-view.tsx,hotels-view.module.css,hotel-search-picker.tsx,hotel-preview-modal.tsx,hotel-dates-modal.tsx,hotel-manual-form.tsx,hotel-edit-launcher.tsx,hotel-edit-modal.tsx}`
- Keep: `app/src/app/trip/[id]/hotels/page.tsx` (redirect), `place-search-picker.module.css` (the live place picker still uses it), `trip-create-form.module.css`, `sign-in.module.css`.

- [x] **Step 1:** `grep -rlnE "hotels-view|hotel-search-picker|hotel-preview-modal|hotel-dates-modal|hotel-manual-form|hotel-edit-launcher|hotel-edit-modal|HotelDates\b" app/src` should list only the 8 files themselves. If anything else matches, stop and report.
- [x] **Step 2:** Delete the files. If the hex-codemod plan already landed, run `UPDATE_RAW_COLOR_BASELINE=1 pnpm vitest run src/components/raw-color-guard.test.ts` (**required**: the baseline is exact, so deleted files' entries fail as stale). Then `pnpm typecheck && pnpm lint && pnpm test` (tail -3); all should be green.
- [x] **Step 3: Commit** `chore: delete unreachable hotels-view subtree (route redirects to Bookings) [TP-XXXX]`

### Task 2: `Modal` props + dialog guard

**Files:**
- Modify: `app/src/components/ui/modal.tsx:11-18` (Props), `:86-99` (scroll lock), `:102-111` (focus effect), `:151-158` (panel attrs)
- Create: `app/src/components/ui/dialog-guard.test.ts`, `app/src/components/ui/scroll-lock.ts`, `app/src/components/ui/scroll-lock.test.ts`

**Why the scroll lock changes (blocker for nested dialogs).** Each `Modal` saves `document.body.style.overflow` on open and restores it in its effect cleanup (`modal.tsx:88-99`). Once `ConfirmDialog` is a `Modal`, the inner one saves `'hidden'` (set by the outer). When both unmount in the same commit, React runs a deleted subtree's effect cleanups parent-first, so the outer restores `''` and then the inner restores `'hidden'`: the page stays unscrollable. That is exactly the "Discard changes?" path: Discard → `onConfirm={onClose}` (`place-note-modal.tsx:94`) → the launcher sets `open=false` (`place-note-launcher.tsx:29`) → `PlaceNoteModal` and its still-open `ConfirmDialog` unmount together. A ref-counted lock doesn't depend on cleanup order.

**Interfaces:**
- Produces `Modal` props (in addition to the existing ones):
  - `initialFocusRef?: React.RefObject<HTMLElement | null>`: focused on open instead of the first visible focusable. The fallback chain is `initialFocusRef.current ?? first ?? panel`.
  - `role?: 'dialog' | 'alertdialog'`: default `'dialog'`.
  - `describedBy?: string`: rendered as `aria-describedby` on the panel.
- Produces `scroll-lock.ts` (module-level, no React): `createScrollLock(body: { style: { overflow: string; paddingRight: string } }): { acquire(gapPx: number): void; release(): void }`, plus the app instance `export const bodyScrollLock` bound lazily to `document.body`. `acquire` saves `overflow`/`paddingRight` and applies the lock only when the count goes 0 → 1; `release` restores the saved values only when the count goes 1 → 0, and never goes below 0. `Modal`'s scroll-lock effect calls `bodyScrollLock.acquire(gap)` / `release()`.
- Consumes (test helper): `srcFiles(exts: string[]): { rel: string; text: string }[]` from `app/test/src-files.ts`, which ds-foundations Task 1 creates. If foundations hasn't landed, create it here with the same signature (`readdirSync(<app/src>, { recursive: true })`, `rel` relative to `app/src`, excludes `*.test.ts`, path via `new URL('../src/', import.meta.url)` as `lib/places/photon.test.ts:68` does). Task 6 reuses it.

- [ ] **Step 1: Write the guard**

```ts
// a11y-batch removes the two map-popup entries when it lands (popups → role="group").
const ALLOWED = new Set([
  'components/ui/modal.tsx',
  'components/pin-card.tsx',          // map popup, a11y-batch plan → role="group"
  'components/map-preview-marker.tsx' // same
]);
// Shrinks to [] as Tasks 3–4 land; delete PENDING at the end of Task 4.
const PENDING = new Set([
  'components/confirm-dialog.tsx', 'components/day-mode-picker.tsx',
  'components/place-search-picker.tsx', 'components/place-preview-modal.tsx',
]);
it('only Modal renders an ARIA modal dialog', () => {
  const hits = srcFiles(['.tsx'])                       // app/src/**, excluding *.test.ts
    // exact role="dialog" or aria-modal: a hand-rolled overlay sets one of these;
    // ConfirmDialog's role="alertdialog" prop on <Modal> must not match.
    .filter((f) => /role=["']dialog["']|aria-modal/.test(f.text))
    .map((f) => f.rel)
    .filter((r) => !ALLOWED.has(r));
  expect(hits.sort()).toEqual([...PENDING].sort());
});
```

- [ ] **Step 2:** Run `cd app && pnpm vitest run src/components/ui/dialog-guard.test.ts`. It should PASS right away, since it documents the current state after Task 1. Then temporarily remove one PENDING entry and confirm the test fails. This proves the guard can fail.
- [ ] **Step 3: Scroll-lock test first** (`scroll-lock.test.ts`, stub body object, node env):
  - `acquire, acquire, release` → still `'hidden'`; second `release` → original `''` restored.
  - Release order doesn't matter: `acquire(A), acquire(B), release(A-first), release(B)` → `''` (the joint-unmount case).
  - `release` with count 0 is a no-op.
  - Run → FAIL (no module). Implement `scroll-lock.ts`, switch `Modal` to it → PASS.
- [ ] **Step 4:** Add the three props. `role={role}`, `aria-describedby={describedBy}`. Initial focus works as in Interfaces. Effect deps are `[open, initialFocusRef]` (a `useRef` object is stable, so this doesn't re-run, and it keeps `react-hooks/exhaustive-deps` quiet).
- [ ] **Step 5:** Run the gates (tail -3).
- [ ] **Step 6: Commit** `feat(ui): Modal initialFocusRef / role / describedBy, ref-counted scroll lock, dialog guard [TP-XXXX]`

### Task 3: `ConfirmDialog` on `Modal`; day-mode confirm uses it

**Files:**
- Modify: `app/src/components/confirm-dialog.tsx`. Keep its public props unchanged (`open, title, message?, confirmLabel?, busy?, onConfirm, onCancel`) so its 8 call sites don't change.
- Modify: `app/src/components/day-mode-picker.tsx:75-86` (use `ConfirmDialog`), and delete `ConfirmModal` (`:92-184`).
- Modify: `dialog-guard.test.ts` (remove both from `PENDING`)

**Interfaces:**
- Consumes `Modal` (`initialFocusRef`, `role`, `describedBy`) from Task 2.
- `ConfirmDialog` renders:
  - `<Modal open={open} onRequestClose={onCancel} title={title} size="sm" role="alertdialog" describedBy={message ? msgId : undefined} initialFocusRef={cancelRef}>`
  - Inside it, `<div className="p-5">` with the current `<h2>`, `<p id={msgId}>`, and buttons: confirm is `variant="dangerQuiet" loading={busy}`, Cancel is `variant="primary"` with `ref={cancelRef}`, both `rounded-full`, in the same order as today.
  - `msgId = useId()`.
  - Remove `useTopmostOverlay`, the window keydown listener, `onClick` scrim handling, and `style={{ zIndex: 'var(--z-toast)' }}`.
- day-mode-picker: `<ConfirmDialog open={pendingMode !== null} title="Override day mode?" message={…same…} confirmLabel="Override" onCancel={…} onConfirm={…} />`.

- [ ] **Step 1:** Remove `confirm-dialog.tsx` and `day-mode-picker.tsx` from `PENDING`, then run the guard. It should FAIL (both still hand-roll).
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Guard → PASS. Gates.
- [ ] **Step 4: Commit** `refactor(ui): ConfirmDialog built on Modal; day-mode override uses it [TP-XXXX]`

### Task 4: Place preview + manual-add dialogs on `Modal`

**Files:**
- Modify: `app/src/components/place-preview-modal.tsx`. Make it `<Modal open onRequestClose={onClose} title={name} size="sm"><PlacePreviewCard …same props… /></Modal>`, and delete its Escape `useEffect` (`:21-27`) and the scrim/panel divs (`:33-60`).
- Modify: `app/src/components/place-search-picker.tsx:357-397`. Make it `<Modal open={showManual} onRequestClose={() => setShowManual(false)} title="Add place manually"><div className="p-6"><PlaceManualForm …same props… /></div></Modal>`, and import `Modal` from `@/components/ui`.
- Modify: `dialog-guard.test.ts`. Remove the last two `PENDING` entries, then delete `PENDING` and assert `hits` is `[]`.

- [ ] **Step 1:** Edit the guard → FAIL.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Guard → PASS. Gates.
- [ ] **Step 4: Commit** `refactor(ui): place preview + manual-add dialogs on Modal (focus trap, Esc, above header) [TP-XXXX]`

### Task 5: `Input` invalid state + `lg` size (A17)

**Files:**
- Modify: `app/src/components/ui/input.tsx`
- Modify: `app/src/components/ui/index.ts` (export `inputClasses`, `type FieldSize`)
- Modify: `app/src/components/trip-create-form.tsx:18-21,67-99,101-108`
- Modify: `app/src/components/trip-settings-form.tsx:46-78`
- Test (create): `app/src/components/ui/primitives.test.ts`

**Interfaces:**
- `type FieldSize = 'md' | 'lg'` (`md` → `h-10`, `lg` → `h-11`).
- `inputClasses(opts?: { size?: FieldSize; className?: string }): string`. Today's `baseField`, plus `aria-invalid:border-danger aria-invalid:focus-visible:ring-danger aria-invalid:focus-visible:border-danger`. Styling hangs off the attribute, so callers that pass a raw `aria-invalid` (as the a11y-pin-picker plan does) get it too.
- `Input`: `Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: FieldSize; invalid?: boolean }`.
- `Select`: same with `HTMLSelectElement`.
- `Textarea`: `React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }`.
- `invalid` renders `aria-invalid="true"`. An explicit `aria-invalid` prop wins when `invalid` is undefined. A false `invalid` renders no attribute.

- [ ] **Step 1: Failing tests**

```ts
import { createElement as h } from 'react';
import { renderToStaticMarkup as html } from 'react-dom/server';
import { Input, Select, Textarea, inputClasses } from './input';

it('invalid marks the field and keeps the description link', () => {
  const out = html(h(Input, { invalid: true, 'aria-describedby': 'd1' }));
  expect(out).toContain('aria-invalid="true"');
  expect(out).toContain('aria-describedby="d1"');
});
it('valid fields carry no aria-invalid', () => {
  expect(html(h(Input, {}))).not.toContain('aria-invalid');
  expect(html(h(Input, { invalid: false }))).not.toContain('aria-invalid');
});
it('Textarea and Select accept invalid', () => {
  expect(html(h(Textarea, { invalid: true }))).toContain('aria-invalid="true"');
  expect(html(h(Select, { invalid: true }))).toContain('aria-invalid="true"');
});
it('sizes', () => {
  expect(inputClasses()).toContain('h-10');
  expect(inputClasses({ size: 'lg' })).toContain('h-11');
  expect(inputClasses({ size: 'lg' })).not.toContain('h-10');
  expect(html(h(Input, { size: 'lg' }))).toContain('h-11');
});
it('invalid styling keys off the attribute', () => {
  expect(inputClasses()).toContain('aria-invalid:border-danger');
});
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/components/ui/primitives.test.ts` → FAIL.
- [ ] **Step 3: Implement `input.tsx`.** Then wire the callers:
  - **trip-create-form:**
    - `fieldCls` becomes `inputClasses({ size: 'lg' })` (used by `PlaceAutocomplete inputClassName`).
    - The three `className="h-11"` Inputs become `size="lg"`.
    - The date message `<p>` (`:101-108`) gets `id="tcf-dates-msg"` and `aria-live="polite"`.
    - Both date Inputs get `invalid={dateError}` and `aria-describedby="tcf-dates-msg"`.
  - **trip-settings-form:**
    - The `:69-77` messages share `id="trip-dates-msg"` and `aria-live="polite"`.
    - Both date Inputs get `invalid={dateOrderError}` and `aria-describedby="trip-dates-msg"`.
    - `text-red-600` becomes `text-danger` and `text-zinc-500` becomes `text-muted`, since this plan owns these lines and the hex-codemod plan excludes this file.
- [ ] **Step 4:** Tests PASS. Gates.
- [ ] **Step 5: Commit** `feat(ui): Input invalid state + lg size; trip date errors announced (A17) [TP-XXXX]`

### Task 6: `Button loading` replaces hand-written pending labels

**Files:**
- Modify: `app/src/components/action-form.tsx:83-99`. `ActionSubmit` renders `<Button type="submit" loading={pending} disabled={disabled} {...rest}>{children}</Button>`. Its props become `Omit<ButtonProps, 'type' | 'loading'>`, so `variant`/`size` pass through.
- Modify: `app/src/components/submit-button.tsx`. Remove `pendingText` and always render `children`.
- Remove the `pendingText` attribute (only) from:
  - `app/trip/[id]/settings/page.tsx:225`
  - `app/settings/page.tsx:109-114`. Also drop `className={buttonClasses('primary')}`, since `primary` is now the default.
  - `app/sign-in/page.tsx:71,103`
  - `place-form.tsx:325`
  - `transport-form-client.tsx:464`
  - `hotel-form-client.tsx:493`
  - `expense-form.tsx:336`
  - `optimize-strip.tsx:20`
  - `trip-grid-empty.tsx:34`
  - `trip-create-form.tsx:116-118`. Also change `className={buttonClasses('primary','md')}` to the default.
  - `trip-settings-form.tsx:92-97`. Also drop the `pending ? 'Saving...' :` ternary and `className`, so it renders `Save changes`.
- Modify: `budget-settings-form.tsx:150-157`. Make it `<ActionSubmit size="sm" className="self-end rounded-full">Save budget</ActionSubmit>` and reword the comment to say the spinner + disabled state covers the slow relabel. In `budget-view.module.css`, delete only the `.settingsForm > .addBtn` rule (`:72-74`).
- Raw buttons:
  - `place-note-modal.tsx:82-84` and `place-manual-form.tsx:211-218` become `<Button type="submit" loading={submitting} className={signInStyles.btn} …>Save|Add place</Button>`. Keep `disabled` as today for `place-note-modal`. For `place-manual-form`, a11y-pin-picker removes `!pos`: whichever plan lands second ends with `<Button type="submit" loading={submitting} disabled={submitting} …>`. This is the same `className` precedent as `place-form.tsx:325`, so the look doesn't change.
  - `google-refresh-button.tsx:52-54` becomes `<Button type="submit" variant="outline" size="sm" loading={pending} className="self-start">Update from Google</Button>`.
  - `place-preview-card.tsx:103-105` (Add) becomes `<Button type="button" size={compact ? 'sm' : 'md'} loading={adding} onClick={onAdd} className="bg-foreground text-background">{addLabel ?? 'Add to day'}</Button>`. This keeps today's black "Add" (`addBtn`, `:44-51`, `#1d1d1f`) in the map popup and the search modal; `cn`/tailwind-merge drops `bg-brand`. Delete the `addBtn` object. The Close/Maps buttons (`btn`) stay as they are; the hex-codemod follow-up owns them.
- Test: `primitives.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('nobody passes pendingText any more', () => {
  expect(srcFiles(['.tsx']).filter((f) => /pendingText/.test(f.text)).map((f) => f.rel)).toEqual([]);
});
it('no hand-written pending labels on raw buttons', () => {
  const re = /\?\s*['"](Saving|Adding|Updating|Creating|Sending)…?\.{0,3}['"]/;
  expect(srcFiles(['.tsx']).filter((f) => re.test(f.text)).map((f) => f.rel)).toEqual([]);
});
```
(`srcFiles` is imported from `app/test/src-files.ts` (Task 2).)

- [ ] **Step 2:** Run → FAIL (lists the files above).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Gates.
- [ ] **Step 5: Commit** `refactor(ui): Button loading everywhere; drop invisible pendingText [TP-XXXX]`

### Task 7: `Card`: trim to what's used, adopt it

**Files:**
- Modify: `app/src/components/ui/card.tsx`. Keep only `Card`, with classes `bg-surface text-foreground border border-border rounded-2xl`. Delete `CardHeader`, `CardBody`, `CardTitle`.
- Modify: `app/src/components/ui/index.ts:4`. Export only `Card`.
- Modify: `app/src/app/error.tsx:20`, `app/src/app/not-found.tsx:7`, `app/src/app/trip/[id]/error.tsx:23`. Change `<div className="rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-sm)]">` to `<Card className="p-8 shadow-[var(--shadow-sm)]">`.
- Test: `primitives.test.ts`

- [ ] **Step 1: Failing test**

```ts
import * as card from './card';
it('Card is the only card export and carries the surface classes', () => {
  expect(Object.keys(card)).toEqual(['Card']);
  const out = html(h(card.Card, { className: 'p-8' }));
  expect(out).toContain('rounded-2xl');
  expect(out).toContain('border-border');
  expect(out).toContain('p-8');
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + gates.
- [ ] **Step 5: Commit** `refactor(ui): Card trimmed to one primitive and adopted by error/not-found [TP-XXXX]`

### Task 8: Browser verification

- [ ] Run `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Use Playwright on trip `79efe162-dfb2-46c2-ad46-a34695771b8b` at 390×844 and 1440×900.
- [ ] **Place note** (row → note):
  1. Type in the note, then press Esc. The "Discard changes?" confirm appears above the note modal, and focus is on **Cancel**.
  2. Press Enter. The confirm closes, the note modal stays open, and focus is back in the textarea.
  3. Press Esc, then click Discard. Both close and focus returns to the note button. `getComputedStyle(document.body).overflow` is back to `visible` (no stuck scroll lock), and the itinerary scrolls.
- [ ] **Bookings:**
  1. Open a hotel (edit) and click Delete. The confirm is above the Bookings modal. Tab cycles only Delete ↔ Cancel.
  2. Press Esc. Only the confirm closes.
  3. Delete for real. After the Bookings modal closes, `document.body.style.overflow === ''` and the page scrolls.
- [ ] **Day mode:** choose "All Walk". The confirm opens with Cancel focused. Enter cancels, and the select shows the previous value. Choose again and click Override; the segments update.
- [ ] **Manual add** (Add place → Manual Add):
  1. At 1440 the scrim covers the header and rail (screenshot).
  2. Tab cycles through the form, and pin-picker map clicks don't close the dialog.
  3. Esc closes it and focus returns to "Manual Add".
  4. At 390 it is a bottom sheet.
- [ ] **Search preview modal** (390, tap a result row): it renders as a bottom sheet. Esc/Close returns focus to the row. Add shows the Button spinner.
- [ ] **Forms:**
  1. On `/trip/new`, set an end date before the start date. Both date fields show a red border, `aria-invalid="true"`, and `aria-describedby` that resolves to the error text.
  2. Do the same on trip settings.
  3. The budget-settings Save shows a spinner, stays right-aligned, and is 32px tall (screenshot).
  4. On a Google place, "Update from Google" shows a spinner.
- [ ] **Errors:** visit `/trip/00000000-0000-0000-0000-000000000000`. The not-found/error card looks identical to the pre-change screenshot.

### Task 9: Docs

- `AGENTS-INDEX.md`:
  - `:44` HotelBooking row: remove `hotel-search-picker`, `hotel-manual-form`, `hotel-dates-modal`, `hotel-preview-modal`, `hotel-edit-modal`, `hotel-edit-launcher`, `hotels-view (legacy, redirects)`.
  - Delete rows `:186` and `:256-260`.
  - `:155` and `:281` `confirm-dialog.tsx`: "built on `ui/modal.tsx` (`role="alertdialog"`, Cancel gets initial focus); stacks above an open `Modal` by portal order".
  - `:166` Card: "`Card` — surface container (error/not-found)".
  - `:168` Input: "`Input`/`Textarea`/`Select` (`invalid`, `size` md|lg), `inputClasses()`, `Label`".
  - `:173` Modal: add `initialFocusRef`, `role`, `describedBy`; scroll lock is ref-counted (`ui/scroll-lock.ts`) so nested modals are safe.
  - `:191` `submit-button.tsx`: "pending = `Button loading`; no pendingText".
  - **Fix the stale recipe** `:398-399`: change "Use `<ModalShell …>`" (no such component exists) to "Use `Modal` from `@/components/ui` (`open`, `onRequestClose`, `title`, `size`); confirmations use `ConfirmDialog`. `dialog-guard.test.ts` rejects hand-rolled `role="dialog"`".
- `app/src/components/ui/README.md`:
  - Update the Primitives import line (no CardHeader/Body/Title).
  - Input bullet: `invalid` + `aria-describedby` example, plus `size="lg"`.
  - Modal bullet: the new props and nested stacking.
  - Button bullet: "submit buttons get `loading` from `SubmitButton`/`ActionSubmit`; don't hand-write 'Saving…'".
- `REQUIREMENTS.md`: no change (no behavior or spec change).
- [ ] Commit `docs(ui): Modal/Input/Card/ConfirmDialog docs; fix stale ModalShell recipe [TP-XXXX]`

---

## Self-review

- **Spec coverage:**
  - Modal ×10 → 1 Modal + 2 map popups (out of scope, a11y-batch) + 4 dead (Task 1) + 4 live (Tasks 3–4); guard in Task 2.
  - A17 + Input lg → Task 5.
  - Card → Task 7 (Decision 2).
  - Button loading → Task 6.
- **Not covered here:** raw `<button>` ×80 vs `Button` ×29 (§6 table). Converting every raw button is a restyle, not a primitive fix. Only the pending-state buttons move here.
- **Type consistency:** `initialFocusRef`/`role`/`describedBy` (Task 2) are used verbatim in Task 3. `FieldSize`/`inputClasses` (Task 5) are used in trip-create-form. `ActionSubmit` props are `Omit<ButtonProps,'type'|'loading'>`.
