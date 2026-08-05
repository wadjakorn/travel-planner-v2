# UI polish: shared page container, button primitive, overlay forms

Date: 2026-08-05
Branch: `feat/ui-polish-overlays` (worktree `../travel-planner-v2-ui-polish`, based on `origin/main` @ 08178ba)

Revision 2 — incorporates the `/scrutinize` pass (see "Review corrections" at the end).

## Problem

Three unrelated rough edges in the trip UI:

1. **Calendar has no content container.** `calendar-view.tsx:102` renders into a bare
   `px-4 py-5 sm:px-6 sm:py-6` div, so on a wide display the month grid stretches
   edge to edge while `/bookings` and `/budget` sit inside narrower columns. Switching
   tabs makes the content jump.
2. **Actionable buttons have no consistent feedback.** Hover styles are duplicated
   across CSS modules and Tailwind classes, none of them are guarded by
   `@media (hover: hover)` (so a tap on mobile leaves a stuck hover state), and only
   form submits have a pending state — `submit-button.tsx` disables itself without
   showing a spinner. Buttons that trigger navigation or a non-form server action show
   nothing at all.
3. **Add/Edit booking and expense are full route navigations.** Opening the hotel form
   pushes `/trip/[id]/booking/hotel/new`; closing it navigates back to `/bookings`.
   Open-then-cancel costs two RSC round-trips for a no-op.

## Current state (verified against the tree at 08178ba)

- `budget-view.module.css:108` — content capped at `max-width: 1100px; margin: 0 auto`.
- `bookings-view.module.css:495` — `.head, .filter, .list` capped at 640px **inside a
  mobile media query only**; unbounded on desktop.
- `calendar-view.tsx:102` — no max-width at all.
- `hotel-form-client.tsx`, `transport-form-client.tsx`, `expense-form.tsx` are all
  **client components** that receive their server action as a prop. `hotel-form.tsx` and
  `transport-form.tsx` are thin server wrappers.
- `bookings-view.tsx:1` is `'use client'`. **`budget-view.tsx:1` is a server component.**
- `BookingItem` (`lib/bookings-merge.ts:8-10`) already carries the entire
  `HotelBooking` / `TransportBooking` row, because `loadHotelsForTrip` /
  `loadTransportForTrip` use bare `db.select()`.
- `BudgetRow` (`lib/expense-queries.ts:30`) is a *display projection*: `{id, source,
  category, label, amount, currency, at, href}` where `source ∈ expense|hotel|transport`,
  and `recent` is `.slice(0, RECENT_LIMIT)` (`lib/expense-queries.ts:193`).
- `actions/bookings.ts:113,122` define `addHotelInlineAction` / `updateHotelInlineAction`
  (revalidate, no redirect) but **nothing in `src/` calls them**. The only wired inline
  action is `addPlaceInlineAction` (`trip/[id]/page.tsx:140` → `days-accordion.tsx:311`).
- `confirm-dialog.tsx`, `spinner.tsx` / `spinner.module.css` already exist.

## Design

### A. Shared page container

New `components/ui/page-container.tsx` + module CSS, driven by one token `--page-max`
(**1200px**):

```
width: 100%;
max-width: var(--page-max);
margin-inline: auto;
padding-inline: clamp(16px, 3vw, 24px);
```

Adopted by `calendar-view`, `bookings-view`, `budget-view`. The hardcoded 1100px in
`budget-view.module.css` and the 640px mobile-only rule in `bookings-view.module.css`
are removed, not left alongside.

**The 1200px cap is absolute — consistency wins over "more content on huge displays".**
"large → show more, small → show less" is satisfied *inside* the cap by the calendar
grid, not by an unbounded container: cells stay `1fr`, `min-height` steps up at
`md`/`lg`, and the per-cell event chip cap rises from 2 to 3–4 at `lg`. The existing
`< md` dot-grid + agenda layout is untouched. There is no wide variant for calendar.

**Accepted regressions:** budget content widens 1100 → 1200px; bookings becomes bounded
on desktop instead of full-bleed.

### B. Shared button primitive

**Revision 3 correction.** `app/src/components/ui/` is an existing design system —
`README.md`, `cn.ts`, `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `skeleton.tsx`,
re-exported from `index.ts` and imported by 18 files. `AGENTS-INDEX.md` does not list the
directory, which is how revisions 1–2 of this spec missed it. There is already a `Button`
with `forwardRef`, `variant: primary|secondary|outline|ghost|danger`,
`size: sm|md|lg|icon`, `loading`, and `asChild` (which styles a child `<Link>`).

**No new button primitive is built. The existing one is extended**, keeping its API and
all 18 call sites working:

- **Correction (rev 3, after implementation).** The claim that Tailwind hover is
  unguarded was wrong: Tailwind v4 wraps every `hover:` utility in
  `@media (hover: hover)` by default — confirmed in this app's built CSS. The Button's
  hover utilities therefore stay exactly as they are. The genuinely unguarded hover is
  the hand-written `:hover` in the CSS modules: 20 files declare it, 2 guard it. Those
  are wrapped in the files this work already touches; the rest is a follow-up.
- `loading` stops reflowing the button: today the spinner is *prepended*, so the control
  changes width mid-action. It becomes an overlay over an `opacity-0` label — opacity,
  not `visibility: hidden`, so the button keeps its accessible name while busy
- `:active` press affordance and a `prefers-reduced-motion` opt-out are added

`ButtonLink` is **dropped from the design** — `asChild` already covers links, and adding
a second way to style a link is the drift this ticket exists to remove.

Global CSS additions (`globals.css`), shared because they must apply to every
interactive control, not just `<Button>`:

- all hover rules under `@media (hover: hover) and (pointer: fine)`
- one `:focus-visible` ring for the whole app
- `:active` press affordance (small translate/scale)
- transitions limited to `background-color, border-color, box-shadow, transform`
- `@media (prefers-reduced-motion: reduce)` drops the transform

Pending state has two sources:

- form submits — `SubmitButton` feeds `useFormStatus().pending` into the existing
  `<Button loading>`
- non-form actions (delete, seed demo, optimize route, month nav, CSV/ICS export) —
  wrapped in `useTransition()`, `isPending` → `loading`

**`SubmitButton` migration order (contract break).** `submit-button.tsx` today spreads
`...rest` onto a raw `<button>`, and every caller passes its own CSS-module `className`.
Swapping the internals to `<Button>` would drop or double those classes. Therefore:
build `Button` first; then, **per form, in one commit**, convert that form's
`SubmitButton` call site and delete the module classes it no longer needs. Never land a
changed `SubmitButton` ahead of its call sites.

Rollout is per-view (calendar → bookings → budget → itinerary → notes → settings → trip
grid), deleting each view's now-redundant button CSS as it is converted. No app-wide
regex replace.

Explicitly out of scope: design-system package, icon-button variant (use `size="sm"` +
`aria-label`), input/select primitives.

### C. Overlay add/edit

**`components/ui/modal.tsx`** — portal, scrim, focus trap, focus restore on close, `Esc`
and scrim-click to close, `aria-modal` with a labelled title, body scroll lock without
scrollbar-induced layout shift. Centered panel ≥ md; full-height bottom sheet below.
Stacking uses the existing `--z-overlay` / `--z-modal` tokens (globals.css:76-77), not a
hand-picked z-index.

**Dirty guard.** `useDirtyForm` snapshots the form's `FormData` on mount and flips a
dirty flag on `input`. Every close path (Esc, scrim, close button) routes through one
handler that, when dirty, opens the existing `confirm-dialog` ("unsaved changes —
discard?") with Cancel prominent. A `beforeunload` handler covers tab close/refresh.

#### C1. Bookings (ship first)

`BookingsView` is already a client component and already holds the full booking rows —
**no query change and no new data plumbing is required.** The work is:

- modal state `{mode: 'add' | 'edit', kind: 'stay' | 'ride', item?: BookingItem}`
- the four `<Link>` triggers (`bookings-view.tsx:250, 285, 318, 321`) become buttons
- `HotelFormClient` / `TransportFormClient` rendered inside `<Modal>` with the row that
  is already in memory as `initial`

#### C2. Budget (ship second)

`budget-view.tsx` is a **server component**, so modal state cannot live there. Add a
client island `components/expense-modal-host.tsx` that wraps the Add-expense trigger and
the recent-entries list, and receives the server actions as props.

`BudgetRow` cannot feed the expense form — it has no `dayIdx` and no `note`. The budget
page therefore loads a **second, editable shape** (`loadEditableExpenses(tripId)` →
`{id, category, label, amount, dayIdx, note, at}`), keyed by id, for the rows the island
may open. Scope is the same `RECENT_LIMIT` window the list shows; rows outside it are not
editable today either.

**Only `source === 'expense'` rows open the modal.** `source === 'hotel' | 'transport'`
rows keep their existing `href` into the bookings page — they are not expenses and have
no expense form.

#### C3. Actions and refresh

Add `addTransportInlineAction`, `updateTransportInlineAction`, `addExpenseInlineAction`,
`updateExpenseInlineAction` and inline delete variants: `revalidatePath` only, no
`redirect`. **Model them on `addPlaceInlineAction`, which is the only inline action with
a proven call path.** The existing `addHotelInlineAction` / `updateHotelInlineAction`
have no callers and must be treated as unverified code — exercise them in the browser
before relying on them.

**Refresh rule, chosen once:** a server action invoked from a client component on the
revalidated route returns a fresh RSC payload for that route; `router.refresh()` on top
of it is a second round-trip for the same data. All overlay flows rely on
`revalidatePath` alone, and the redundant `router.refresh()` at `bookings-view.tsx:112`
is removed in C1 so one rule holds across the view. If a flow is observed not to
repaint, that is a bug to diagnose — not a reason to re-add `router.refresh()` locally.

Forms gain optional `onDone?: () => void` (close the modal) and `onCancel?: () => void`
alongside the existing `cancelHref`, so the standalone routes keep working unchanged.

**Routes stay.** `/booking/hotel/new`, `/booking/transport/[id]/edit`,
`/expense/[id]/edit`, etc. remain as deep links and the no-JS fallback. Nothing is
deleted.

Out of scope: URL sync (`?edit=<id>`). Client state only, per the chosen approach; it can
be layered on later without reworking the modal.

## Known risk

`hotel-form-client` and `transport-form-client` embed their own overlays (Places picker,
`hotel-preview-modal`). Nesting them inside the new modal needs z-index and focus-trap
verification in a real browser, not just a type check.

## Delivery order

Three independent PRs: **A → B → C**. Within C: **C1 (bookings) → C2 (budget)**, so the
modal primitive is proven on the view that needs no new infrastructure before the one
that needs a client island and a new query.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build` in `app/`
- Manual browser pass per section:
  - A: calendar/bookings/budget align at 1440px and 2560px; calendar mobile agenda intact
  - B: hover only on pointer devices; spinner on submit, delete, export; focus ring
    visible on keyboard nav everywhere
  - C: open/close add + edit for hotel, transport, expense with the network panel open —
    **no RSC or navigation request** on open and on cancel (the Places picker's own Maps
    requests are expected and not counted); dirty guard fires; nested Places picker
    usable; save closes the modal and the list reflects the change without a manual
    reload

## Review corrections (from `/scrutinize`, revision 1 → 2)

1. `BudgetView` is a server component — modal state moved to a new client island (C2).
2. Dropped the "widen the booking selects" work: `db.select()` + `BookingItem` already
   carry every field (C1).
3. `BudgetRow` is a truncated, mixed-source projection — added `loadEditableExpenses`
   and restricted the modal to `source === 'expense'` (C2).
4. `addHotelInlineAction` / `updateHotelInlineAction` have no callers; `addPlaceInlineAction`
   is the reference implementation (C3).
5. Named one refresh rule and removed the contradicting `router.refresh()` (C3).
6. `SubmitButton`'s `className` pass-through is a contract — added the per-form migration
   order (B).
7. Verification criterion reworded to "no RSC/navigation request"; Maps traffic excluded.
8. The 1200px cap is absolute; calendar fluidity lives in the grid, not the container (A).
