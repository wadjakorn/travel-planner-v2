# UI polish: shared page container, button primitive, overlay forms

Date: 2026-08-05
Branch: `feat/ui-polish-overlays` (worktree `../travel-planner-v2-ui-polish`, based on `origin/main` @ 08178ba)

## Problem

Three unrelated rough edges in the trip UI:

1. **Calendar has no content container.** `calendar-view.tsx` renders into a bare
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

## Current state (verified)

- `budget-view.module.css` — `.head/.body` capped at `max-width: 1100px; margin: 0 auto`.
- `bookings-view.module.css:495` — `.head, .filter, .list` capped at 640px **inside a
  mobile media query only**; unbounded on desktop.
- `calendar-view.tsx:102` — no max-width at all.
- `hotel-form-client.tsx`, `transport-form-client.tsx`, `expense-form.tsx` are all
  **client components** that receive their server action as a prop. `hotel-form.tsx` and
  `transport-form.tsx` are thin server wrappers.
- `actions/bookings.ts` already has the no-redirect pattern: `addHotelInlineAction`,
  `updateHotelInlineAction` (revalidate only). The rest redirect.
- `confirm-dialog.tsx` already exists as the shared destructive-confirm modal.

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

Calendar fluidity ("large → show more, small → show less") is handled by the grid, not
the container: cells stay `1fr`, `min-height` steps up at `md`/`lg`, and the per-cell
event chip cap rises from 2 to 3–4 at `lg`. The existing `< md` dot-grid + agenda layout
is untouched.

**Accepted regressions:** budget content widens 1100 → 1200px; bookings becomes bounded
on desktop instead of full-bleed.

### B. Shared button primitive

New `components/ui/button.tsx`:

- `variant`: `primary | secondary | ghost | danger`; `size`: `sm | md`
- `loading?: boolean` → renders the existing spinner (`spinner.module.css`), sets
  `aria-busy`, disables the button, and pins the rendered width so swapping
  label ↔ spinner does not reflow.
- Separate `<ButtonLink>` for anchors/`<Link>` — a link must not render as `<button>`.

Global CSS additions (`globals.css`), shared because they must apply to every
interactive control, not just `<Button>`:

- all hover rules under `@media (hover: hover) and (pointer: fine)`
- one `:focus-visible` ring for the whole app
- `:active` press affordance (small translate/scale)
- transitions limited to `background-color, border-color, box-shadow, transform`
- `@media (prefers-reduced-motion: reduce)` drops the transform

Pending state has two sources:

- form submits — `submit-button.tsx` is refactored to feed `useFormStatus().pending`
  into `<Button loading>`
- non-form actions (delete, seed demo, optimize route, month nav, CSV/ICS export) —
  wrapped in `useTransition()`, `isPending` → `loading`

Rollout is per-view (calendar → bookings → budget → itinerary → notes → settings → trip
grid), deleting each view's now-redundant button CSS as it is converted. No app-wide
regex replace.

Explicitly out of scope: design-system package, icon-button variant (use `size="sm"` +
`aria-label`), input/select primitives.

### C. Overlay add/edit

**`components/ui/modal.tsx`** — portal, scrim, focus trap, focus restore on close, `Esc`
and scrim-click to close, `aria-modal` with a labelled title, body scroll lock without
scrollbar-induced layout shift. Centered panel ≥ md; full-height bottom sheet below.

**Dirty guard.** `useDirtyForm` snapshots the form's `FormData` on mount and flips a
dirty flag on `input`. Every close path (Esc, scrim, close button) routes through one
handler that, when dirty, opens the existing `confirm-dialog` ("unsaved changes —
discard?") with Cancel prominent. A `beforeunload` handler covers tab close/refresh.

**Edit data is preloaded, never fetched on open.**

- Bookings: `loadHotelsForTrip` / `loadTransportForTrip` selects are widened to every
  field the forms need (`ref`, `cancellation`, `contact`, `notes`, `placeIdExternal`,
  cost fields, attachment fields, …) and the full rows are passed into `BookingsView`.
- Budget: full expense rows plus the `days` list (the page already queries `dayRows`)
  are passed into `BudgetView`.

Cost: a slightly larger initial payload per page load, in exchange for zero network on
open/close — which is the stated requirement.

**No-redirect actions.** Add `addTransportInlineAction`, `updateTransportInlineAction`,
`addExpenseInlineAction`, `updateExpenseInlineAction` and inline delete variants,
following the existing `addHotelInlineAction` shape: `revalidatePath` only, no
`redirect`. Forms gain an optional `onDone?: () => void` (close the modal) and
`onCancel?: () => void` alongside the existing `cancelHref`, so the standalone routes
keep working unchanged.

**Routes stay.** `/booking/hotel/new`, `/booking/transport/[id]/edit`,
`/expense/[id]/edit`, etc. remain as deep links and the no-JS fallback. Nothing is
deleted.

Out of scope: URL sync (`?edit=<id>`). Client state only, per the chosen approach; it can
be layered on later without reworking the modal.

## Known risk

`hotel-form-client` and `transport-form-client` embed their own overlays (Places picker,
`hotel-preview-modal`). Nesting them inside the new modal needs z-index and focus-trap
verification in a real browser, not just a type check.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build` in `app/`
- Manual browser pass per section:
  - A: calendar/bookings/budget line up at 1440px and 2560px; calendar mobile agenda intact
  - B: hover only on pointer devices; spinner appears on submit, delete, export; keyboard focus ring visible everywhere
  - C: open/close add + edit for hotel, transport, expense with the network panel open —
    zero requests on open and on cancel; dirty guard fires; nested Places picker usable;
    save closes the modal and the list reflects the change
