# UI polish: page container, button primitive, overlay forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the calendar the same content container as the other trip pages, give every actionable button consistent hover + loading feedback, and turn booking/expense add-edit into in-page overlays instead of route navigations.

**Architecture:** Three independent slices shipped in order. A adds one `PageContainer` primitive and one `--page-max` token, replacing three ad-hoc width rules. B extends the existing `components/ui/` design-system `Button` (pointer-guarded hover, width-stable loading, press affordance) plus a global interaction layer, and collapses the two ad-hoc pending-button implementations into it. C adds one `Modal` primitive plus a dirty-form guard, then wires the existing client form components into it — bookings first (data already in memory), budget second (needs a client island and a new query shape).

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Tailwind v4 + CSS Modules · vitest (node environment, pure functions only)

## Global Constraints

- Working directory for every command is `app/`. Path alias `@/*` → `app/src/*`.
- Worktree: `/home/wadjakorn/development/travel-planner-v2-ui-polish`, branch `feat/ui-polish-overlays`.
- Tickets: **TP-0019** = Task 1–3, **TP-0020** = Task 4–7, **TP-0021** = Task 8–12. Put the ticket key in every commit subject.
- `--page-max` is **1200px** and is an absolute cap. No wide variant for any page.
- All hover rules live under `@media (hover: hover) and (pointer: fine)`.
- Inline server actions call `revalidatePath` and **never** `redirect`, and are modelled on `addPlaceInlineAction` (`app/src/app/actions/places.ts:68`) — the only inline action in this repo with a proven call path.
- **One refresh rule:** overlay flows rely on `revalidatePath` alone. Do not add `router.refresh()` anywhere in this work.
- Existing standalone routes (`/booking/hotel/new`, `/expense/[expenseId]/edit`, …) are **never deleted** — they stay as deep links and the no-JS fallback.
- **Testing reality:** vitest runs in the node environment with no jsdom and no `@testing-library/react`. Component behaviour is therefore verified by `pnpm typecheck && pnpm lint && pnpm build` plus the manual browser checklist in each task. Only genuinely pure helpers get vitest tests, and this plan extracts logic into pure helpers wherever that is honest rather than contrived. Adding jsdom is explicitly out of scope.
- Update `AGENTS-INDEX.md` in the same commit as any file added under `app/src/`.
- **`app/src/components/ui/` is an existing design system** — `README.md`, `cn.ts`, `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `skeleton.tsx`, barrelled through `index.ts` and imported by 18 files. `AGENTS-INDEX.md` does not list it, which is how the first draft of this plan proposed rebuilding a `Button` that already existed. **Before creating any primitive, read that directory and its README, and extend what is there rather than adding a parallel one.** Use its tokens (`--brand`, `--danger`, `--radius-*`, `--shadow-*`, `--z-overlay`, `--z-modal`) instead of hand-picked values; never write raw hex in a feature component.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `app/src/components/ui/page-container.tsx` | The one content-width wrapper. No page knowledge. |
| `app/src/components/ui/page-container.module.css` | Its width/padding rule. |
| ~~`app/src/components/ui/button.tsx`~~ | **Cancelled** — already exists as part of the `components/ui/` design system. Task 4 extends it in place; `ButtonLink` is dropped in favour of its `asChild`. |
| `app/src/components/ui/modal.tsx` | Portal overlay: scrim, focus trap, Esc, scroll lock. |
| `app/src/components/ui/modal.module.css` | Panel ≥md / bottom sheet <md. |
| `app/src/lib/form-dirty.ts` | Pure `snapshotForm` / `isDirty` over `FormData`. |
| `app/src/lib/form-dirty.test.ts` | vitest for the above. |
| `app/src/components/use-dirty-form.ts` | React hook binding `form-dirty` to a `<form>` + confirm-dialog. |
| `app/src/components/booking-modal-host.tsx` | Client island: not needed — folded into `bookings-view` (already a client component). *See Task 9; this row exists only to record that decision.* |
| `app/src/components/expense-modal-host.tsx` | Client island for budget (its view is a server component). |
| `app/src/lib/editable-expense.ts` | Pure row → form-initial mapper. |
| `app/src/lib/editable-expense.test.ts` | vitest for the mapper. |

**Modified**

| File | Change |
|---|---|
| `app/src/app/globals.css` | `--page-max` token + global interaction layer. |
| `app/src/components/calendar-view.tsx` | Wrap in `PageContainer`; fluid grid. |
| `app/src/components/bookings-view.tsx` | `PageContainer`; buttons; overlay state; drop `router.refresh()` (line 112). |
| `app/src/components/bookings-view.module.css` | Delete the 640px mobile-only rule (line 495). |
| `app/src/components/budget-view.tsx` | `PageContainer`; render the expense island. |
| `app/src/components/budget-view.module.css` | Delete `max-width: 1100px` (line 108). |
| `app/src/components/submit-button.tsx` | Becomes a thin wrapper over `Button`. |
| `app/src/components/spinner.tsx` | `PendingButton` removed (duplicate of `SubmitButton`). |
| `app/src/components/hotel-form-client.tsx` | `onDone`/`onCancel`; `Button`. |
| `app/src/components/transport-form-client.tsx` | Same. |
| `app/src/components/expense-form.tsx` | Same. |
| `app/src/app/actions/bookings.ts` | Transport inline actions; verify hotel inline actions. |
| `app/src/app/actions/expenses.ts` | Expense inline actions. |
| `app/src/lib/expense-queries.ts` | `loadEditableExpenses`. |
| `app/src/app/trip/[id]/budget/page.tsx` | Load + pass editable expenses. |

---

# TP-0019 — Shared page container

### Task 1: `PageContainer` primitive + token

**Files:**
- Create: `app/src/components/ui/page-container.tsx`, `app/src/components/ui/page-container.module.css`
- Modify: `app/src/app/globals.css` (`:root` block, after line 37)

**Interfaces:**
- Consumes: nothing.
- Produces: `PageContainer({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element` — a `<div>`. Server-safe (no `'use client'`).

- [ ] **Step 1: Add the token**

In `app/src/app/globals.css`, inside the existing `:root` block, after the semantic colour tokens:

```css
  /* Content width — one cap for every trip page. Absolute: there is no wide
     variant. Pages that want to show more on a large display do it inside
     this cap (see the calendar grid), not by widening the column. */
  --page-max: 1200px;
```

- [ ] **Step 2: Create the module CSS**

`app/src/components/ui/page-container.module.css`:

```css
.container {
  width: 100%;
  max-width: var(--page-max);
  margin-inline: auto;
  padding-inline: clamp(16px, 3vw, 24px);
}
```

- [ ] **Step 3: Create the component**

`app/src/components/ui/page-container.tsx`:

```tsx
// The one content-width wrapper for trip pages. Every page that has a text
// column uses this so switching tabs does not shift the content edges.
// Server-safe on purpose: it must be usable from server components.

import styles from './page-container.module.css';

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: Props) {
  return (
    <div className={className ? `${styles.container} ${className}` : styles.container}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd app && pnpm typecheck`
Expected: no errors. (Nothing imports it yet — this step only proves the file is valid.)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ui/page-container.tsx app/src/components/ui/page-container.module.css app/src/app/globals.css
git commit -m "feat(ui): PageContainer primitive + --page-max token [TP-0019]"
```

---

### Task 2: Adopt `PageContainer` in bookings + budget

**Files:**
- Modify: `app/src/components/bookings-view.tsx` (root at line 152), `app/src/components/bookings-view.module.css:495`, `app/src/components/budget-view.tsx` (root at line 166), `app/src/components/budget-view.module.css:108`

**Interfaces:**
- Consumes: `PageContainer` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Budget — remove the hardcoded cap**

In `app/src/components/budget-view.module.css`, delete the `max-width: 1100px;` and its `margin: 0 auto;` (around lines 108–110). Leave every other property on that rule intact.

- [ ] **Step 2: Budget — wrap the content**

In `app/src/components/budget-view.tsx`, import `PageContainer` and wrap the children of `<div className={styles.wrap}>` (line 166) in `<PageContainer>`. Keep `styles.wrap` — it owns the flex column and background, not the width.

- [ ] **Step 3: Bookings — remove the mobile-only cap**

In `app/src/components/bookings-view.module.css`, delete line 495 (`.head, .filter, .list { max-width: 640px; … }`) entirely. The container now handles this at every width.

- [ ] **Step 4: Bookings — wrap the content**

Same shape as Step 2, inside `<div className={styles.wrap}>` (line 152). `styles.wrap` keeps `min-height`, `background`, `padding-bottom`.

- [ ] **Step 5: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm build 2>&1 | tail -3`
Expected: build succeeds.

Then `pnpm dev` and check `/trip/<id>/bookings` and `/trip/<id>/budget` at 1440px and 2560px: both columns are 1200px wide and centred, and their left edges line up when you switch tabs. At 375px nothing is clipped and the bookings list is not stuck at 640px.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/bookings-view.tsx app/src/components/bookings-view.module.css app/src/components/budget-view.tsx app/src/components/budget-view.module.css
git commit -m "refactor(ui): bookings + budget use PageContainer [TP-0019]"
```

---

### Task 3: Calendar — container + fluid grid

**Files:**
- Modify: `app/src/components/calendar-view.tsx` (root at line 102; desktop grid cell at line 330)

**Interfaces:**
- Consumes: `PageContainer` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Wrap the calendar**

Replace the root `<div className="px-4 py-5 sm:px-6 sm:py-6">` (line 102) with:

```tsx
    <PageContainer className="py-5 sm:py-6">
```

and its closing tag with `</PageContainer>`. The horizontal padding now comes from the container's `clamp()`; only the vertical padding stays on the page.

- [ ] **Step 2: Make the desktop cell grow with the viewport**

On the desktop grid cell (line 330), replace the fixed `min-h-[88px]` with a stepped minimum so a large display shows more of each day rather than more empty margin:

```tsx
                className={`flex min-h-[88px] flex-col gap-1 rounded-lg border p-1.5 text-xs md:min-h-[104px] lg:min-h-[124px] ${
```

Leave the 7-column grid as `1fr` columns — cells already stretch.

- [ ] **Step 3: Raise the per-cell chip cap at `lg`**

Find the slice that limits how many event chips a cell renders (search `calendar-view.tsx` for `.slice(0,`). Replace the fixed cap with a responsive pair: render the full list, and hide the overflow chips with `hidden lg:flex` on the third and fourth, keeping the existing "+N more" indicator logic driven by the cap that is actually visible at the current breakpoint. If the existing markup makes that awkward, compute two caps (`2` and `4`) and render both lists — one `lg:hidden`, one `hidden lg:block`. Do not introduce a `useEffect`-based width measurement; this must stay CSS-only so it survives SSR.

- [ ] **Step 4: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm build 2>&1 | tail -3`
Expected: build succeeds.

`pnpm dev`, then on `/trip/<id>/calendar`:
- at 2560px the grid is 1200px wide and centred, matching `/bookings`
- at 1440px cells are taller than at 1024px, and a busy day shows more chips
- at 375px the dot-grid + agenda layout is unchanged (this is the `< md` branch — confirm it did not pick up the new classes)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/calendar-view.tsx
git commit -m "feat(calendar): shared content container + fluid grid [TP-0019]"
```

---

# TP-0020 — Button primitive + interaction feedback

### Task 4: Extend the existing `Button` + global interaction layer

> **Revised after Task 4's first dispatch.** `app/src/components/ui/` is an existing,
> live design system (`README.md`, `cn.ts`, `button.tsx`, `card.tsx`, `badge.tsx`,
> `input.tsx`, `skeleton.tsx`, barrelled through `index.ts`) imported by 18 files.
> `AGENTS-INDEX.md` does not list it, which is why the original plan text did not know
> it existed. **Do not create a new button.** Extend the one that is there, keep its
> public API, and break none of its call sites. `ButtonLink` is cancelled — `asChild`
> already styles a `<Link>`.

**Files:**
- Modify: `app/src/components/ui/button.tsx`, `app/src/app/globals.css`, `app/src/components/ui/README.md`

**Interfaces:**
- Consumes: `cn` from `@/components/ui/cn`; the existing tokens in `globals.css`.
- Produces: the **unchanged** public API — `Button` (forwardRef) with
  `variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'`,
  `size?: 'sm' | 'md' | 'lg' | 'icon'`, `loading?: boolean`, `asChild?: boolean`, plus
  `buttonClasses(variant, size, className)`. No new exports, no removed exports, no
  changed prop names or defaults.

Three defects in the current implementation are what this task fixes:

1. Hover lives in Tailwind `hover:` utilities inside `VARIANTS` (`button.tsx:12-21`), so
   it fires on touch and sticks after a tap.
2. `loading` renders `{loading ? <Spinner /> : null}` **before** `children`
   (`button.tsx:~84`) — the button grows by the spinner's width mid-action and shoves
   its neighbours.
3. There is no `:active` affordance and no `prefers-reduced-motion` handling.

- [ ] **Step 1: Move hover behind a pointer guard**

In `app/src/components/ui/button.tsx`, strip the `hover:` utilities out of the `VARIANTS`
map — they are the reason a tap on a phone leaves a button looking selected. Each variant
keeps only its resting appearance:

```ts
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-foreground',
  secondary: 'bg-surface-2 text-foreground border border-border',
  outline: 'border border-input bg-transparent text-foreground',
  ghost: 'bg-transparent text-foreground',
  danger: 'bg-danger text-danger-foreground',
};
```

Then add one stable class to `buttonClasses` so the global layer can target the primitive:
include `'ui-btn'` in the `cn(...)` call alongside the existing base classes. Keep every
other class in that call exactly as it is — `focus-visible:ring-2 …`,
`disabled:pointer-events-none disabled:opacity-50`, the transition, `VARIANTS[variant]`,
`SIZES[size]`, `className`.

- [ ] **Step 2: Stop `loading` from resizing the button**

Still in `button.tsx`, replace the render branch that currently reads
`{loading ? <Spinner /> : null}{children}` with an overlay so the label keeps its box:

```tsx
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={classes}
        {...props}
      >
        <span className="relative inline-flex items-center gap-[inherit]">
          <span className={loading ? 'invisible' : undefined}>{children}</span>
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner />
            </span>
          )}
        </span>
      </button>
```

Leave the `asChild` branch alone: it styles a child element and never renders a spinner.

- [ ] **Step 3: Global interaction layer**

Append to `app/src/app/globals.css`:

```css
/* ── Interaction feedback ──────────────────────────────────────────────────
   Hover lives behind a pointer query: on a touch screen :hover sticks after a
   tap, which reads as a button that is still "selected" long after the user
   moved on. The design-system Button carries .ui-btn; the bare-element rules
   cover the controls that have not been migrated to it yet. */

@media (hover: hover) and (pointer: fine) {
  .ui-btn:not(:disabled):not([aria-disabled='true']):hover {
    filter: brightness(0.97);
  }

  :where(button, a, [role='button']):not(:disabled):not([aria-disabled='true']):hover {
    filter: brightness(0.97);
  }
}

:where(button, [role='button']):not(:disabled):active {
  transform: translateY(1px);
}

@media (prefers-reduced-motion: reduce) {
  :where(button, a, [role='button']) {
    transform: none !important;
    transition: none !important;
  }
}
```

Do **not** add a `:focus-visible` rule here — the design system already defines
`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` in
`buttonClasses`, and a second ring would double up on every migrated control.

- [ ] **Step 4: Update the design-system README**

`app/src/components/ui/README.md` documents the Button's behaviour. Add one line under
the Button bullet recording that hover is pointer-guarded and that `loading` preserves
the button's width. Keep it to a sentence; this file is a reference, not a changelog.

- [ ] **Step 5: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm build 2>&1 | tail -3`
Expected: typecheck clean, lint no worse than the 9 errors / 6 warnings baseline that
exists on `origin/main`, build succeeds.

Then confirm nothing regressed for existing consumers:
`grep -rl "from '@/components/ui'" app/src | wc -l` — the count must be unchanged, and
`pnpm typecheck` passing is what proves the API did not move.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ui/button.tsx app/src/app/globals.css app/src/components/ui/README.md
git commit -m "feat(ui): pointer-guarded hover + width-stable loading on Button [TP-0020]"
```

---


### Task 5: Collapse the two pending buttons into one

**Files:**
- Modify: `app/src/components/submit-button.tsx`, `app/src/components/spinner.tsx`
- Grep first: call sites of `PendingButton`

**Interfaces:**
- Consumes: `Button` from Task 4.
- Produces: `SubmitButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?; size?; pendingText?: React.ReactNode })` — the single submit-with-pending control. `PendingButton` no longer exists.

This repo currently has **two** implementations of "submit button that shows pending": `SubmitButton` (`submit-button.tsx`) and `PendingButton` (`spinner.tsx:28`). Keeping both is how they drifted apart in the first place.

- [ ] **Step 1: Find every `PendingButton` call site**

Run: `cd app && grep -rn "PendingButton" src/`
Write the list down — every one is converted in Step 3.

- [ ] **Step 2: Rewrite `SubmitButton` over `Button`**

`app/src/components/submit-button.tsx`:

```tsx
'use client';

// The submit button. Feeds the surrounding form's pending state into the
// shared Button, so a submit looks the same everywhere in the app. Must be a
// child of a <form> — useFormStatus reads that form's status.

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui';

type Props = React.ComponentProps<typeof Button> & {
  pendingText?: React.ReactNode;
};

export function SubmitButton({ children, pendingText, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...rest} loading={pending} disabled={disabled}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
```

- [ ] **Step 3: Convert `PendingButton` call sites, then delete it**

Replace each `<PendingButton …>` from Step 1 with `<SubmitButton variant="…" …>`, dropping any `spinnerSize`/`spinnerColor`/`spinnerTrackColor`/`pendingChild` props (the primitive owns those now). Then delete the `PendingButton` export and its `PendingButtonProps` type from `spinner.tsx`, keeping `Spinner` itself. Remove the now-unused `useFormStatus` import from `spinner.tsx`.

- [ ] **Step 4: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && grep -rn "PendingButton" src/`
Expected: typecheck and lint clean, grep returns nothing.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/submit-button.tsx app/src/components/spinner.tsx
git commit -m "refactor(ui): one submit-pending button, PendingButton removed [TP-0020]"
```

---

### Task 6: Migrate the three forms to `Button`

**Files:**
- Modify: `app/src/components/hotel-form-client.tsx`, `app/src/components/transport-form-client.tsx`, `app/src/components/expense-form.tsx` and their `.module.css` siblings

**Interfaces:**
- Consumes: `Button`, `SubmitButton`.
- Produces: nothing new.

`SubmitButton` used to spread `...rest` onto a raw `<button>`, so these forms pass their own CSS-module `className`. Now that it renders `Button`, those classes land *after* the primitive's — which means any of them that restate padding, radius, background or font will fight the primitive.

**Do one form per commit.** Do not batch.

- [ ] **Step 1: Hotel form**

In `hotel-form-client.tsx`, for every `SubmitButton` / raw `<button>`: pick the matching `variant` (save → `primary`, cancel → `ghost`, delete → `danger`) and **remove the `className` if the module class only restated button chrome**. Keep it only when it does layout (grid placement, `margin`, `flex: 1`). Then delete the orphaned rules from `hotel-form.module.css`.

- [ ] **Step 2: Verify + commit hotel**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm build 2>&1 | tail -3`, then `pnpm dev` and open `/trip/<id>/booking/hotel/new`: buttons look right, submitting shows the spinner without the footer jumping.

```bash
git add app/src/components/hotel-form-client.tsx app/src/components/hotel-form.module.css
git commit -m "refactor(hotel-form): use shared Button [TP-0020]"
```

- [ ] **Step 3: Transport form**

Repeat Step 1 for `transport-form-client.tsx` + `transport-form.module.css`.

- [ ] **Step 4: Verify + commit transport**

Same checks on `/trip/<id>/booking/transport/new`.

```bash
git add app/src/components/transport-form-client.tsx app/src/components/transport-form.module.css
git commit -m "refactor(transport-form): use shared Button [TP-0020]"
```

- [ ] **Step 5: Expense form**

Repeat Step 1 for `expense-form.tsx` + `expense-form.module.css`.

- [ ] **Step 6: Verify + commit expense**

Same checks on `/trip/<id>/expense/new`.

```bash
git add app/src/components/expense-form.tsx app/src/components/expense-form.module.css
git commit -m "refactor(expense-form): use shared Button [TP-0020]"
```

---

### Task 7: Pending state for non-form actions

**Files:**
- Modify: `app/src/components/bookings-view.tsx` (delete handler ~line 108), `app/src/components/trip-delete-button.tsx`, `app/src/components/trip-grid-empty.tsx`, `app/src/components/optimize-strip.tsx`, `app/src/components/calendar-view.tsx` (month nav), `app/src/components/budget-view.tsx` (CSV export link)

**Interfaces:**
- Consumes: `Button` from `@/components/ui` (use its `asChild` prop to style a `<Link>`; there is no `ButtonLink`).
- Produces: nothing new.

Buttons that call a server action directly, or navigate, currently show nothing between click and result. `useFormStatus` cannot help — there is no form.

- [ ] **Step 1: Establish the pattern in `bookings-view.tsx`**

It already has `useTransition` (imported at line 7) for delete. Convert its delete control to `<Button variant="danger" loading={isPending} onClick={…}>` so the busy state is the primitive's, not bespoke markup.

- [ ] **Step 2: Apply the same pattern to the remaining controls**

For each file in **Files** above: wrap the action call in `startTransition`, feed `isPending` into `loading`. For pure navigations that are slow (month nav, CSV/ICS export) use `<Button asChild><Link …/></Button>` and accept that a link has no pending state — **do not** convert a link into a button to get a spinner. If a navigation genuinely needs feedback, that is a separate ticket.

- [ ] **Step 3: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm build 2>&1 | tail -3`

`pnpm dev`, then with the network throttled to Slow 3G in devtools: click delete on a booking, the seed-demo button, and optimize-route. Each shows a spinner and cannot be double-clicked.

Also confirm on a phone (or devtools device emulation with touch): tap a button, scroll away — it does **not** stay in a hover colour.

- [ ] **Step 4: Commit**

```bash
git add -A app/src/components
git commit -m "feat(ui): pending feedback for non-form actions [TP-0020]"
```

---

# TP-0021 — Overlay add/edit

### Task 8: Dirty-form helper (pure) + `useDirtyForm`

**Files:**
- Create: `app/src/lib/form-dirty.ts`, `app/src/lib/form-dirty.test.ts`, `app/src/components/use-dirty-form.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `snapshotForm(form: HTMLFormElement): string`
  - `serializeEntries(entries: Iterable<[string, FormDataEntryValue]>): string`
  - `isDirty(snapshot: string, form: HTMLFormElement): boolean`
  - `useDirtyForm(): { formRef: React.RefObject<HTMLFormElement | null>; markClean: () => void; requestClose: (close: () => void) => void; confirmOpen: boolean; confirmDiscard: () => void; cancelDiscard: () => void }`

- [ ] **Step 1: Write the failing test**

`app/src/lib/form-dirty.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeEntries } from './form-dirty';

describe('serializeEntries', () => {
  it('is stable regardless of entry order', () => {
    const a = serializeEntries([['b', '2'], ['a', '1']]);
    const b = serializeEntries([['a', '1'], ['b', '2']]);
    expect(a).toBe(b);
  });

  it('distinguishes a changed value', () => {
    const before = serializeEntries([['name', 'Hilton']]);
    const after = serializeEntries([['name', 'Hilton Tokyo']]);
    expect(before).not.toBe(after);
  });

  it('keeps repeated keys distinct from a single joined value', () => {
    const repeated = serializeEntries([['tag', 'a'], ['tag', 'b']]);
    const joined = serializeEntries([['tag', 'a,b']]);
    expect(repeated).not.toBe(joined);
  });

  it('ignores File values, which cannot be compared by value', () => {
    const file = new File(['x'], 'x.pdf');
    const withFile = serializeEntries([['doc', file], ['name', 'A']]);
    const withoutFile = serializeEntries([['name', 'A']]);
    expect(withFile).toBe(withoutFile);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd app && pnpm vitest run src/lib/form-dirty.test.ts`
Expected: FAIL — `Failed to resolve import "./form-dirty"`.

- [ ] **Step 3: Implement the pure helper**

`app/src/lib/form-dirty.ts`:

```ts
// Dirty detection for a <form>, split out from React so it can be tested in
// the node environment (this repo has no jsdom).
//
// Comparison is over a normalised serialisation rather than a deep diff: the
// only question is "did anything change", and a string compare answers it in
// one pass with no allocation per field.
//
// Files are skipped. A File has no stable value to compare and re-selecting
// the same file would otherwise read as a change.

export function serializeEntries(
  entries: Iterable<[string, FormDataEntryValue]>,
): string {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    if (typeof value !== 'string') continue; // File
    pairs.push([key, value]);
  }
  // Sort so DOM order changes (a conditionally rendered field moving) do not
  // read as edits. Ties broken by value to keep repeated keys deterministic.
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export function snapshotForm(form: HTMLFormElement): string {
  return serializeEntries(new FormData(form).entries());
}

export function isDirty(snapshot: string, form: HTMLFormElement): boolean {
  return snapshotForm(form) !== snapshot;
}
```

- [ ] **Step 4: Run the test**

Run: `cd app && pnpm vitest run src/lib/form-dirty.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the hook**

`app/src/components/use-dirty-form.ts`:

```ts
'use client';

// Binds form-dirty to a real <form> and gates every close path through one
// confirmation. The snapshot is taken after mount (not on first render) so
// fields that hydrate with a default value do not count as edits.

import { useCallback, useEffect, useRef, useState } from 'react';
import { isDirty, snapshotForm } from '@/lib/form-dirty';

export function useDirtyForm() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const snapshot = useRef<string>('');
  const pendingClose = useRef<(() => void) | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (formRef.current) snapshot.current = snapshotForm(formRef.current);
  }, []);

  // Warn on tab close / reload — the browser's own dialog, since ours cannot
  // block navigation.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formRef.current && isDirty(snapshot.current, formRef.current)) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const markClean = useCallback(() => {
    if (formRef.current) snapshot.current = snapshotForm(formRef.current);
  }, []);

  const requestClose = useCallback((close: () => void) => {
    if (formRef.current && isDirty(snapshot.current, formRef.current)) {
      pendingClose.current = close;
      setConfirmOpen(true);
      return;
    }
    close();
  }, []);

  const confirmDiscard = useCallback(() => {
    setConfirmOpen(false);
    const close = pendingClose.current;
    pendingClose.current = null;
    close?.();
  }, []);

  const cancelDiscard = useCallback(() => {
    setConfirmOpen(false);
    pendingClose.current = null;
  }, []);

  return { formRef, markClean, requestClose, confirmOpen, confirmDiscard, cancelDiscard };
}
```

- [ ] **Step 6: Verify + commit**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -3`

```bash
git add app/src/lib/form-dirty.ts app/src/lib/form-dirty.test.ts app/src/components/use-dirty-form.ts
git commit -m "feat(ui): dirty-form detection + close guard hook [TP-0021]"
```

---

### Task 9: `Modal` primitive

**Files:**
- Create: `app/src/components/ui/modal.tsx`, `app/src/components/ui/modal.module.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Modal({ open, onRequestClose, title, children }: { open: boolean; onRequestClose: () => void; title: string; children: React.ReactNode })`. Renders nothing when `open` is false. `onRequestClose` is called for Esc, scrim click and the close button — the caller decides whether to actually close (that is where `useDirtyForm.requestClose` plugs in).

- [ ] **Step 1: Module CSS**

`app/src/components/ui/modal.module.css`:

```css
.scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal); /* 1300, already defined in globals.css */
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 0.45);
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 100dvh;
  overflow: auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
}

@media (min-width: 768px) {
  .scrim { align-items: center; }
  .panel {
    max-width: 720px;
    max-height: min(90dvh, 900px);
    border-radius: 16px;
  }
}
```

- [ ] **Step 2: Component**

`app/src/components/ui/modal.tsx`:

```tsx
'use client';

// Overlay host. Owns only the shell — scrim, focus, scroll lock, escape —
// never the content's behaviour. `onRequestClose` is a request, not a command:
// the caller may refuse it (unsaved changes) and the modal stays put.

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './modal.module.css';

type Props = {
  open: boolean;
  onRequestClose: () => void;
  title: string;
  children: React.ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onRequestClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  // Scroll lock. Padding compensates for the scrollbar the lock removes,
  // otherwise the page behind visibly jumps sideways as the modal opens.
  useEffect(() => {
    if (!open) return;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [open]);

  // Focus: move in on open, restore on close.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => restoreTo.current?.focus?.();
  }, [open]);

  // Escape + tab trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onRequestClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onRequestClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(e) => {
        // mousedown, not click: a drag that starts inside the panel and ends
        // on the scrim (text selection) must not close the form.
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Verify**

Run: `cd app && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ui/modal.tsx app/src/components/ui/modal.module.css
git commit -m "feat(ui): Modal primitive — portal, focus trap, scroll lock [TP-0021]"
```

---

### Task 10: Inline server actions for transport and expenses

**Files:**
- Modify: `app/src/app/actions/bookings.ts`, `app/src/app/actions/expenses.ts`

**Interfaces:**
- Consumes: existing `revalidateBookings` / `revalidateTransport` helpers in `bookings.ts` (lines 94–102).
- Produces:
  - `addTransportInlineAction(formData: FormData): Promise<void>`
  - `updateTransportInlineAction(formData: FormData): Promise<void>`
  - `addExpenseInlineAction(formData: FormData): Promise<void>`
  - `updateExpenseInlineAction(formData: FormData): Promise<void>`
  - `removeExpenseAction` already exists and does not redirect (`expenses.ts:107`) — reuse it as-is.

Reference implementation: `addPlaceInlineAction` (`app/src/app/actions/places.ts:68`). `addHotelInlineAction` / `updateHotelInlineAction` already exist (`bookings.ts:113,122`) but **have no callers anywhere in `src/`** — treat them as unverified until Task 11 exercises them in a browser.

- [ ] **Step 1: Transport inline actions**

In `app/src/app/actions/bookings.ts`, immediately after `addTransportAction` and `updateTransportAction`, add the inline twins. Each is the existing action with the trailing `redirect(...)` removed and nothing else changed:

```ts
// Same as addTransportAction but no redirect — the overlay stays on the
// bookings page and repaints from revalidatePath alone.
export async function addTransportInlineAction(formData: FormData) {
  const tripId = /* identical parsing to addTransportAction */ '';
  // ...identical body up to and including revalidateTransport(tripId)
}
```

Do **not** hand-copy the body: extract the shared work into a private `async function persistTransport(formData, mode)` used by both the redirecting and the inline variant, so they cannot drift. Same for the update pair.

- [ ] **Step 2: Expense inline actions**

In `app/src/app/actions/expenses.ts`, apply the same extraction to `addExpenseAction` (line 55) and `updateExpenseAction` (line 82): a private `persistExpense` holding the body, two thin exports — one that ends with `redirect`, one that does not.

- [ ] **Step 3: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -3`
Expected: clean; the existing `expense-queries` tests still pass.

- [ ] **Step 4: Commit**

```bash
git add app/src/app/actions/bookings.ts app/src/app/actions/expenses.ts
git commit -m "feat(actions): inline (no-redirect) transport + expense actions [TP-0021]"
```

---

### Task 11: Bookings overlay (C1)

**Files:**
- Modify: `app/src/components/bookings-view.tsx` (Links at 250, 285, 318, 321; `router.refresh()` at 112), `app/src/components/hotel-form-client.tsx`, `app/src/components/transport-form-client.tsx`, `app/src/app/trip/[id]/bookings/page.tsx`

**Interfaces:**
- Consumes: `Modal` (Task 9), `useDirtyForm` (Task 8), the inline actions (Task 10).
- Produces: `HotelFormClient` and `TransportFormClient` gain `onDone?: () => void` and `onCancel?: () => void` alongside the existing `cancelHref`. When `onCancel` is present the form renders a button instead of a `<Link>`; when `onDone` is present it is called after a successful submit.

`BookingsView` is already `'use client'` and `BookingItem` already carries the complete `HotelBooking` / `TransportBooking` row (`lib/bookings-merge.ts:8-10`) — **no query change and no new data plumbing.**

- [ ] **Step 1: Teach the forms to live in an overlay**

In `hotel-form-client.tsx` and `transport-form-client.tsx`: add the two optional props; render the cancel control as `<Button variant="ghost" onClick={onCancel}>` when `onCancel` is supplied, else the existing `<Link href={cancelHref}>`. Wire `formRef` from `useDirtyForm` onto the `<form>` element, and call `onDone?.()` from the form's `action` wrapper after the server action resolves.

- [ ] **Step 2: Pass the inline actions from the page**

In `app/src/app/trip/[id]/bookings/page.tsx`, import `addHotelInlineAction`, `updateHotelInlineAction`, `addTransportInlineAction`, `updateTransportInlineAction` and pass all four into `<BookingsView>` as props (server actions crossing into a client component, exactly like the existing `removeHotelAction`).

- [ ] **Step 3: Add overlay state to `BookingsView`**

```tsx
type Overlay =
  | { mode: 'add'; kind: 'stay' | 'ride' }
  | { mode: 'edit'; kind: 'stay'; hotel: HotelBooking }
  | { mode: 'edit'; kind: 'ride'; transport: TransportBooking }
  | null;

const [overlay, setOverlay] = useState<Overlay>(null);
```

Convert the four `<Link>` triggers (lines 250, 285, 318, 321) into `<Button>`s that set this state, passing the row that is already in `items`. Render one `<Modal>` whose content switches on `overlay.kind`.

- [ ] **Step 4: Delete the redundant refresh**

Remove `router.refresh()` at `bookings-view.tsx:112`, and the `useRouter` import if nothing else uses it. The delete action already calls `revalidatePath`; the second round-trip bought nothing.

- [ ] **Step 5: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm build 2>&1 | tail -3`

`pnpm dev`, on `/trip/<id>/bookings` with the devtools Network panel open and filtered to Fetch/XHR + Doc:
- click "Add stay" → the modal opens with **no RSC or navigation request** (Google Maps requests from the Places picker are expected and do not count)
- press Esc on the untouched form → closes immediately, no request
- type a name, press Esc → the discard confirmation appears; Cancel keeps the form and its input
- save → exactly one action request, the modal closes, and the new booking is in the list **without a manual reload**
- edit an existing stay → the form is pre-filled with no request at all
- the Places picker inside the modal opens above the scrim and keeps keyboard focus (this is the known z-index/focus-trap risk)
- delete from inside the edit form closes the overlay and removes the row
- repeat all of the above for a transport booking
- with JS disabled, `/trip/<id>/booking/hotel/new` still renders and submits

- [ ] **Step 6: Commit**

```bash
git add app/src/components/bookings-view.tsx app/src/components/hotel-form-client.tsx app/src/components/transport-form-client.tsx "app/src/app/trip/[id]/bookings/page.tsx"
git commit -m "feat(bookings): add/edit as overlays, no route navigation [TP-0021]"
```

---

### Task 12: Budget overlay (C2)

**Files:**
- Create: `app/src/lib/editable-expense.ts`, `app/src/lib/editable-expense.test.ts`, `app/src/components/expense-modal-host.tsx`
- Modify: `app/src/lib/expense-queries.ts`, `app/src/app/trip/[id]/budget/page.tsx`, `app/src/components/budget-view.tsx`, `app/src/components/expense-form.tsx`

**Interfaces:**
- Consumes: `Modal`, `useDirtyForm`, `addExpenseInlineAction`, `updateExpenseInlineAction`, `removeExpenseAction`.
- Produces:
  - `type EditableExpense = { id: string; category: ExpenseCategory; label: string | null; amount: number; dayIdx: number | null; note: string | null; at: string }` (`at` is `YYYY-MM-DD`)
  - `toEditableExpense(row: { id: string; category: ExpenseCategory; label: string | null; amount: number; dayIdx: number | null; note: string | null; at: Date }): EditableExpense`
  - `loadEditableExpenses(tripId: string, limit: number): Promise<EditableExpense[]>`
  - `ExpenseModalHost({ tripId, tripCurrency, days, editable, addAction, updateAction, deleteAction, children })`

`budget-view.tsx` is a **server component** (line 1), so modal state cannot live in it. And `BudgetRow` (`expense-queries.ts:30`) is a display projection with no `dayIdx` and no `note` — it cannot feed the expense form.

- [ ] **Step 1: Write the failing mapper test**

`app/src/lib/editable-expense.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toEditableExpense } from './editable-expense';

describe('toEditableExpense', () => {
  it('renders the date as a YYYY-MM-DD string the form input accepts', () => {
    const row = {
      id: 'e1',
      category: 'food' as const,
      label: 'Ramen',
      amount: 980,
      dayIdx: 2,
      note: null,
      at: new Date('2026-04-12T15:30:00.000Z'),
    };
    expect(toEditableExpense(row).at).toBe('2026-04-12');
  });

  it('keeps a null dayIdx null rather than coercing it to 0', () => {
    const row = {
      id: 'e2',
      category: 'other' as const,
      label: null,
      amount: 10,
      dayIdx: null,
      note: null,
      at: new Date('2026-04-12T00:00:00.000Z'),
    };
    // 0 is a real day ("Day 1"); collapsing null into it would silently
    // re-tag an untagged expense on save.
    expect(toEditableExpense(row).dayIdx).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd app && pnpm vitest run src/lib/editable-expense.test.ts`
Expected: FAIL — cannot resolve `./editable-expense`.

- [ ] **Step 3: Implement the mapper**

`app/src/lib/editable-expense.ts`:

```ts
// The expense shape the form needs, which is not the shape the budget list
// shows. BudgetRow is a display projection (mixed-source, no dayIdx, no note);
// this is the editable row, keyed by id.

import type { ExpenseCategory } from '@/db/schema';

export type EditableExpense = {
  id: string;
  category: ExpenseCategory;
  label: string | null;
  amount: number;
  dayIdx: number | null;
  note: string | null;
  at: string; // YYYY-MM-DD
};

type Row = Omit<EditableExpense, 'at'> & { at: Date };

export function toEditableExpense(row: Row): EditableExpense {
  return { ...row, at: row.at.toISOString().slice(0, 10) };
}
```

- [ ] **Step 4: Run the test**

Run: `cd app && pnpm vitest run src/lib/editable-expense.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Add the query**

In `app/src/lib/expense-queries.ts`, add:

```ts
// Editable rows for the budget overlay. Scoped to the same window the recent
// list shows — a row the user cannot see is a row they cannot open.
export async function loadEditableExpenses(
  tripId: string,
  limit: number,
): Promise<EditableExpense[]> {
  const rows = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      label: expenses.label,
      amount: expenses.amount,
      dayIdx: expenses.dayIdx,
      note: expenses.note,
      at: expenses.at,
    })
    .from(expenses)
    .where(eq(expenses.tripId, tripId))
    .orderBy(desc(expenses.at))
    .limit(limit);
  return rows.map(toEditableExpense);
}
```

Export `RECENT_LIMIT` from this module if it is not already exported, and pass it as `limit` from the page so the two windows cannot drift apart.

- [ ] **Step 6: Build the client island**

`app/src/components/expense-modal-host.tsx`: `'use client'`. Holds `const [openId, setOpenId] = useState<string | 'new' | null>(null)`, renders `children` (the server-rendered budget content) and one `<Modal>` containing `<ExpenseForm>`. Exposes the trigger through a context or a render prop so `budget-view` can hand it the Add button and the clickable rows.

**Only `source === 'expense'` rows open the modal.** Rows with `source === 'hotel' | 'transport'` keep their existing `href` into the bookings page — they are not expenses and there is no expense form for them.

- [ ] **Step 7: Wire the page**

In `app/src/app/trip/[id]/budget/page.tsx`, add `loadEditableExpenses(tripId, RECENT_LIMIT)` to the existing `Promise.all`, and pass the result plus the inline actions and the already-loaded `dayRows` down to the island.

- [ ] **Step 8: Verify**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -3 && pnpm build 2>&1 | tail -3`

`pnpm dev`, on `/trip/<id>/budget` with Network open:
- "Add expense" opens the modal with no RSC/navigation request
- clicking an **expense** row opens it pre-filled, no request
- clicking a **hotel or transport** row still navigates to bookings (unchanged)
- edit + save updates the hero total and the category bars without a manual reload
- dirty guard fires on Esc after typing
- with JS disabled, `/trip/<id>/expense/<id>/edit` still works

- [ ] **Step 9: Commit**

```bash
git add app/src/lib/editable-expense.ts app/src/lib/editable-expense.test.ts app/src/lib/expense-queries.ts app/src/components/expense-modal-host.tsx app/src/components/budget-view.tsx app/src/components/expense-form.tsx "app/src/app/trip/[id]/budget/page.tsx"
git commit -m "feat(budget): expense add/edit as overlay [TP-0021]"
```

---

### Task 13: Index + docs

**Files:**
- Modify: `AGENTS-INDEX.md`

- [ ] **Step 1: Record the new files**

`AGENTS-INDEX.md` does not currently list `app/src/components/ui/` at all — the omission that made this plan propose rebuilding an existing `Button`. Fix the root cause, not just this branch's files: add a "UI primitives (`components/ui/`)" table listing **every** member of that directory — `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `skeleton.tsx`, `cn.ts`, `index.ts` (the barrel), `page-container.tsx`, `modal.tsx` — with a pointer to `components/ui/README.md` as the design-system reference. Then add `expense-modal-host.tsx` to the Components table and `form-dirty.ts`, `editable-expense.ts` to the lib list. Note under the Expense row that `loadEditableExpenses` feeds the overlay while `BudgetRow` feeds the list. Note that `PendingButton` is gone and `SubmitButton` is the only submit control.

- [ ] **Step 2: Commit**

```bash
git add AGENTS-INDEX.md
git commit -m "docs: index the ui primitives and overlay helpers [TP-0021]"
```

---

## Self-review notes

- **Spec coverage.** A → Tasks 1–3. B → Tasks 4–7 (plus the `PendingButton` consolidation, which the spec did not know about; it is in scope because leaving two pending buttons alive defeats the point of the ticket). C1 → Task 11, C2 → Task 12, C3 → Task 10, modal + dirty guard → Tasks 8–9. Delivery order and the single refresh rule are in Global Constraints.
- **Testing honesty.** Only `form-dirty` and `editable-expense` get vitest tests, because they are the only genuinely pure units this work adds. Everything else is verified by build plus a written browser checklist. This is stated up front rather than padded with fake unit tests around React.
- **Known gap carried from the spec.** The nested-overlay risk (Places picker inside the modal) has no automated coverage — it is an explicit manual check in Task 11 Step 5.
