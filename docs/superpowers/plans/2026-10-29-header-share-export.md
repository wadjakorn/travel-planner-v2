# Header Share / Export (+ booking-delete Undo) Implementation Plan

> **Ticket:** TP-0091

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **TP-0091 scope (orchestrator, 2026-10-29):** Task 2 + the `toast.tsx` / `bookings-view.tsx` / `bookings/page.tsx` parts of Task 3 + **the sign-in `callbackUrl` fix on the two trip `/sign-in` redirects** (moved here from PR B — it's a standalone bug fix, not part of the Share question) + the Undo checks of Task 4 + the matching Task 5 docs. **Skip** Task 1 (menu model) and the HeaderMenu/Share/Export parts of Task 3.
> - **D10 — ship PR A only** (Undo on the "Booking deleted" toast + return URL on trip redirects). PR B (Share/Export in the header) is NOT to be implemented now.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The trip header gets the Share and Export entries that REQUIREMENTS §3 lists. Share copies the trip link and, for the owner, opens the existing invite UI. Export offers the existing `.ics` and CSV downloads. "Undo/redo" is replaced by the narrower Undo that REQUIREMENTS §6 already specifies for booking deletes.

**Architecture:** One small disclosure popover (`HeaderMenu`) is used twice in the client `Header`. The trip layout (server) passes the trip id, an owner flag and the translated labels. Menu contents come from a pure `lib/trip-share.ts`, so they are unit-tested. Undo extends `ToastInput` with an optional action button and adds `restoreHotel`/`restoreTransport` services. Bookings are already soft-deleted (`deletedAt`), so a restore just clears the column within a short window.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle, vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §4.6 bullet 3 + §11 Q5. REQUIREMENTS §3 (header), §6 ("Delete = confirmation; soft delete with undo"), §12 ("Copy trip link"), §16 (Undo/Redo, Toasts: copy-link).

**PR split (scrutiny):** ship as **two PRs**. They share nothing but `toast.tsx`. **PR A, Undo:** Task 2 + the `toast.tsx` / `bookings-view.tsx` / `bookings/page.tsx` parts of Task 3. **PR B, Share/Export:** Task 1 + the header parts of Task 3 + the sign-in `callbackUrl` fix. PR A is specified by REQUIREMENTS §6 and is independently valuable; PR B carries the open product question (Decision 3 / scrutiny).

**Touches:** `components/header.tsx`, `app/trip/[id]/layout.tsx` (+ the `/sign-in` redirect), `app/trip/[id]/page.tsx` (`/sign-in` redirect only), `components/toast.tsx`, `components/account-menu.tsx`, `components/bookings-view.tsx`, `messages/en.json` + `th.json`. Shared with the i18n plan (`2026-10-29-i18n-extraction.md`, Phases 1/3 also edit `header.tsx`, `account-menu.tsx`, `bookings-view.tsx`, `toast.tsx`). **Ship this first**: the extraction phases then pick up the new strings.

## Decision needed

| # | Question | Default (built on) |
|---|---|---|
| 1 | Undo/Redo in the header (REQUIREMENTS §3, §16) | **Drop the global undo/redo stack from the spec.** It needs inverse operations for every mutation (reorder, segment mode, hotel dates, …) and a cross-tab history. That is weeks of work for a feature no one has asked for. Instead, build the **minimal Undo that §6 already specifies**: an "Undo" button on the "Booking deleted" toast (server accepts the restore for 10 minutes; the toast itself shows for 8 s, paused while hovered/focused). Bookings are soft-deleted, so restore is a single `UPDATE`. |
| 2 | Place delete (one tap, **hard** delete, no confirm: `sortable-place-item.tsx:196`, `place-service.ts:199` `removePlace`) | **Out of scope here.** It is the riskiest delete in the app, but undo there needs soft delete plus idx/segment re-insertion. Open a follow-up ticket: "place delete: confirm or soft-delete + undo". |
| 3 | What "Share" means without public links (`publicTrip` is unbuilt) | **Copy trip link** for every member (the link only opens for members; the menu says so). What a recipient gets: a signed-in member opens the trip; a signed-in **non-member gets a plain 404** (`layout.tsx:47` `notFound()`, by design: it doesn't leak that the trip exists); a **signed-out member** is sent to `/sign-in` and, at HEAD, lands on `/` afterwards because the redirect carries no `callbackUrl` (`layout.tsx:40`, `page.tsx:53`). This plan fixes the last case (Task 3). **Invite collaborator** (existing key) for the owner only → `/trip/[id]/settings?s=people`. Invite links can't be shown again because only the hash is stored (`invite-link-reveal.tsx:3-5`), so Share can't copy an invite link directly. |

## Global Constraints

- Labels come from existing keys `share`, `export`, `invite_collaborator` plus these new keys (EN / TH), added to both `messages/en.json` and `messages/th.json`:
  `share_copy_link` "Copy trip link" / "คัดลอกลิงก์ทริป" · `share_members_only` "Only people on this trip can open it" / "เปิดได้เฉพาะคนในทริปนี้" · `share_link_copied` "Trip link copied" / "คัดลอกลิงก์ทริปแล้ว" · `share_copy_failed` "Couldn't copy the link" / "คัดลอกลิงก์ไม่สำเร็จ" · `export_ics` "Calendar (.ics)" / "ปฏิทิน (.ics)" · `export_csv` "Expenses (CSV)" / "ค่าใช้จ่าย (CSV)"
- Header strings reach the client `Header` as a `labels` prop built with `tServer()` in the layout. There is no client i18n provider yet; the i18n plan adds one later. **If i18n P0 (`useT()`) has merged before this PR, use `useT()` in `Header`/`HeaderMenu` and skip the `labels` prop and `HeaderLabels` type entirely.**
- Undo toast copy stays English literals in `bookings-view.tsx` (the i18n plan's Phase 3 extracts that file): delete toast `Booking deleted` / `Couldn't delete booking` (glossary, `2026-10-29-ux-copy-glossary.md`: Delete = gone for everyone; the copy plan changes the same line), action label `Undo`, success `Booking restored`, failure `Couldn't restore booking`.
- `UNDO_WINDOW_MS = 10 * 60_000`. A toast with an action defaults to `duration: 8000`, and **its timer pauses while the toast is hovered or has focus inside** (resumes with the remaining time on leave/blur). An auto-dismissing interactive control otherwise fails WCAG 2.2.1 Timing Adjustable for keyboard and screen-reader users (REQUIREMENTS §18 is WCAG 2.1 AA). The 10-minute server window is the backstop, not the UX.
- Export hrefs are exactly `/trip/${tripId}/calendar/export` and `/trip/${tripId}/budget/export`. Both routes already exist and allow any member (`calendar/export/route.ts`, `budget/export/route.ts`). The CSV covers expenses only (known gap, AGENTS-INDEX), hence the label "Expenses (CSV)".
- Touch targets ≥ 44px. Below `sm` the triggers are icon-only, with the label as `aria-label`. Keep **≥ 7px clearance between the last menu trigger and the `AvatarStack`**: `2026-10-29-a11y-batch.md` gives the avatars a 44px `.tp-hit` touch area that extends past their visual box and would otherwise overlap the Export trigger (cross-plan, a11y scrutiny). Use tokens only, no new hex.
- Disclosure pattern (button `aria-expanded` + `aria-controls`, plain links/buttons inside), **not** `role="menu"`. Esc closes and returns focus to the trigger; an outside click closes.

## Review Focus

1. **Clipboard unavailable** (plain-HTTP dev over Tailscale, permission denied). We must not claim success. Show the error toast `share_copy_failed` with the URL as the description, following the `invite-link-reveal.tsx:22-34` rule. Manual check in Task 4.
2. **Undo after the window or on a booking that is already restored.** The server refuses and the client shows "Couldn't restore booking". Test `isUndoable` at the boundaries (Task 2).
3. **Viewer or editor opens Share.** They see no "Invite collaborator", because the settings page 404s for non-owners (`settings/page.tsx` `trip.ownerId !== user.id`). Test `shareMenuItems(id, false)` (Task 1).
4. **A viewer clicks Undo.** `restoreHotel` must call `requireTripAccess(..., 'write')`. Viewers can't delete, so the toast never appears for them, but the action must still guard. Covered by service code path; assert in Task 2 review.
5. **Two menus open at once / menu open on navigation.** Opening one closes the other, and a route change closes both. Manual check in Task 4.

---

### Task 1: Pure menu model

**Files:**
- Create: `app/src/lib/trip-share.ts`
- Test: `app/src/lib/trip-share.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ShareItem =
    | { kind: 'copy'; labelKey: 'share_copy_link'; path: string }      // path = `/trip/${id}`
    | { kind: 'link'; labelKey: 'invite_collaborator'; href: string };  // `/trip/${id}/settings?s=people`
  export type ExportItem = { labelKey: 'export_ics' | 'export_csv'; href: string };
  export function shareMenuItems(tripId: string, canInvite: boolean): ShareItem[];
  export function exportMenuItems(tripId: string): ExportItem[];
  export function absoluteTripUrl(origin: string, path: string): string; // trims trailing '/' on origin
  ```

- [ ] **Step 1: Failing tests**
  - `shareMenuItems('t1', true)` → two items, `[0]` = `{ kind:'copy', path:'/trip/t1' }`, `[1].href === '/trip/t1/settings?s=people'`.
  - `shareMenuItems('t1', false)` → exactly one item, kind `copy`.
  - `exportMenuItems('t1')` hrefs `['/trip/t1/calendar/export', '/trip/t1/budget/export']`, in that order.
  - `absoluteTripUrl('https://x.app/', '/trip/t1') === 'https://x.app/trip/t1'`.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/trip-share.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(header): share/export menu model [TP-0091]`.

### Task 2: Restore service + actions (Undo backend)

**Files:**
- Create: `app/src/lib/undo.ts`
- Test: `app/src/lib/undo.test.ts`
- Modify: `app/src/lib/services/booking-service.ts` (next to `removeHotel` :102 and `removeTransport` :200)
- Modify: `app/src/app/actions/bookings.ts` (next to `removeHotelAction` :183 / `removeTransportAction` :201)

**Interfaces:**
- Produces:
  ```ts
  // lib/undo.ts
  export const UNDO_WINDOW_MS: number; // 600_000
  export function isUndoable(deletedAt: Date | null, now: Date, windowMs?: number): boolean;
  // booking-service.ts
  export async function restoreHotel(userId: string, id: string): Promise<{ tripId: string }>;
  export async function restoreTransport(userId: string, id: string): Promise<{ tripId: string }>;
  // actions/bookings.ts ('use server')
  export async function restoreHotelAction(formData: FormData): Promise<ActionResult>;      // reads 'bookingId'
  export async function restoreTransportAction(formData: FormData): Promise<ActionResult>;
  ```
- Service: select `{ tripId, deletedAt }` by id **without** the `isNull(deletedAt)` filter that `resolveHotel` (:73) applies. If the row is missing or `!isUndoable(deletedAt, new Date())`, throw `ServiceError('not_found', 'Nothing to undo')`. Then `requireTripAccess(userId, tripId, 'write')`, `set({ deletedAt: null })`, `touchTrip`, and `writeAudit({ action: 'update', entityType: 'hotel'|'transport', entityId: id, after: { restored: true } })` (the audit `action` column is free text, but keep to the 4 documented verbs).
- Action: wrap in `toActionResult(fn)` (`lib/action-result.ts`) and call the existing `revalidateHotels`/`revalidateTransport`.

- [ ] **Step 1: Failing tests** (`undo.test.ts`)
  - `isUndoable(null, now)` → `false`.
  - deleted 9:59 ago → `true`; exactly 10:00 ago → `false`; deleted 1 s **in the future** (clock skew) → `true`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `undo.ts`, the two services, the two actions. **Step 4:** run → PASS; `pnpm typecheck` (tail -3).
- [ ] **Step 5:** Commit `feat(bookings): restore soft-deleted booking within 10 min [TP-0091]`.

### Task 3: UI: HeaderMenu, Share/Export, toast action, Undo wiring

**Files:**
- Create: `app/src/components/header-menu.tsx` (+ styles in `header.module.css`)
- Modify: `app/src/components/header.tsx` (new optional props; render two menus before `AvatarStack` when `trip` is set)
- Modify: `app/src/app/trip/[id]/layout.tsx` (pass `trip={{ id: tripId, canInvite: canManageInvites(role) }}` and `labels`; import `canManageInvites` from `@/lib/trip-access`, `tServer` from `@/lib/i18n`)
- Modify: `app/src/components/icons.tsx` (add `Download`, same `IconProps` shape as `Share` :34)
- Modify: `app/src/components/toast.tsx` (`ToastInput.action?: { label: string; onAction: () => void }`; carry it on `Toast`; render a text button before the dismiss ✕; clicking it runs `onAction` then `dismiss(id)`; default `duration` 8000 when `action` is set; pause/resume the timer on `pointerenter`/`pointerleave` and `focusin`/`focusout` of the `<li>`: store `remaining` per toast instead of a fire-and-forget `setTimeout` (today `toast.tsx:112-118`))
- Modify: `app/src/app/trip/[id]/layout.tsx:40` and `app/src/app/trip/[id]/page.tsx:53`: `redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/trip/${tripId}`)}`)` (same shape as `invite/[token]/page.tsx:95`; `sign-in/page.tsx` already honours it via `safeCallbackPath`). Without it a copied trip link opened on a signed-out phone loses the trip.
- Modify: `app/src/components/account-menu.tsx` (delete the dead "Invite collaborator" item :123-130 and the `onInvite` prop; `Header` never passes it, so the item does nothing today. Share replaces it)
- Modify: `app/src/components/bookings-view.tsx` (`runDelete` :159; new props `restoreHotelAction`, `restoreTransportAction`)
- Modify: `app/src/app/trip/[id]/bookings/page.tsx` (pass the restore actions)
- Modify: `app/src/messages/en.json`, `app/src/messages/th.json` (keys in Global Constraints)

**Interfaces:**
- Consumes: Task 1 `shareMenuItems`, `exportMenuItems`, `absoluteTripUrl`; Task 2 restore actions; `useToast` (`toast.tsx:79`).
- Produces:
  ```ts
  export type HeaderLabels = Record<'share'|'export'|'invite_collaborator'|'share_copy_link'|'share_members_only'|'share_link_copied'|'share_copy_failed'|'export_ics'|'export_csv', string>;
  // Header props gain: trip?: { id: string; canInvite: boolean }; labels?: HeaderLabels
  export function HeaderMenu(props: { label: string; icon: React.ReactNode; children: React.ReactNode }): JSX.Element;
  ```

Decided behavior:
- Share → "Copy trip link" button (with the muted 12px hint `share_members_only` under it): `navigator.clipboard.writeText(absoluteTripUrl(location.origin, item.path))`. On success, toast `share_link_copied`. On throw or missing clipboard, error toast `share_copy_failed` with `description` = the URL. Then close the menu. "Invite collaborator" is a plain `next/link` to the href (settings is a page, not an overlay).
- Export → two `<a href download>` (not `next/link`, which would prefetch). The menu closes on click.
- `bookings-view` delete success: `toast({ variant:'success', title:'Booking deleted', action:{ label:'Undo', onAction: () => undo(kind, id) } })`; the error toast title becomes `Couldn't delete booking`. `undo` builds `FormData{bookingId}`, calls the matching restore action inside `startDelete`, and toasts `Booking restored` on `ok`, else `Couldn't restore booking` with `result.message`.

- [ ] **Step 1:** Implement the files above.
- [ ] **Step 2:** `cd app && pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [ ] **Step 3:** Commit `feat(header): Share + Export menus; Undo on booking delete [TP-0091]`.

### Task 4: Verify in the real app

- [ ] `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, trip `79efe162-dfb2-46c2-ad46-a34695771b8b`, Playwright at 1440×900 and 390×844.
- [ ] Desktop: Share and Export appear left of the avatars with icon + label. Share → "Copy trip link" → toast "Trip link copied", and the clipboard holds `http://localhost:3210/trip/79efe162-…`. As owner, "Invite collaborator" lands on settings → People.
- [ ] Open Export → `.ics` downloads `trip-79efe162.ics`, CSV downloads `expenses-79efe162.csv`.
- [ ] Open Share, then click Export → only Export is open. Press Esc → closed and focus is back on the Export trigger. Navigate to Bookings with a menu open → closed.
- [ ] Mobile 390: icon-only triggers ≥ 44px, no header overflow with the trip title hidden, and the menu stays inside the viewport. With a11y-batch merged, tapping the Export trigger's right edge opens Export, not the avatar (≥ 7px gap to `.tp-hit`).
- [ ] Clipboard failure: over `http://wadjakorn-bmax:3210` (non-secure context) → error toast showing the URL.
- [ ] Bookings: delete a stay → confirm → toast "Booking deleted" with "Undo" → click → the stay is back, with toast "Booking restored". Delete again, Tab to the toast's Undo and wait 10 s → the toast is still there (timer paused on focus). Move focus away and wait → it expires and the stay stays deleted. Account menu no longer shows "Invite collaborator".
- [ ] Sign out, open the copied `/trip/<id>` link → `/sign-in?callbackUrl=%2Ftrip%2F<id>` → after sign-in you land on the trip, not `/`.
- [ ] Non-trip pages (`/`, `/settings`): no Share/Export.

### Task 5: Docs

**Files:**
- Modify: `REQUIREMENTS.md` §3 header line → `brand · breadcrumb · saved-indicator · collaborator avatars · Share (copy trip link; owner: invite) · Export (.ics, expenses CSV) · account dropdown`. **Cross-plan:** `2026-10-29-nav-labels.md` rewrites the same §3 header line to `… Not shipped (open decision …): undo/redo, Share, Export, Help.` If nav-labels has landed, edit *its* line: move Share and Export into the shipped list and leave `Not shipped: global undo/redo (bookings have Undo on delete, §6), Help.` §16 Undo/Redo bullet → `**Undo** — "Undo" on the toast after deleting a booking (10-minute window; bookings are soft-deleted). No global undo/redo stack.`
- Modify: `AGENTS-INDEX.md`: Components table: `header-menu.tsx` (disclosure popover used by the header's Share/Export); update the `header.tsx` row ("logo, Share/Export menus on trip pages, account-menu"). Lib table: `trip-share.ts`, `undo.ts`. Server actions table: `bookings.ts` adds `restoreHotelAction`, `restoreTransportAction`. Toast row/notes: `action` option.

- [ ] **Step 1:** Edit both files.
- [ ] **Step 2:** Commit `docs: header share/export + booking undo [TP-0091]`.

## Not done (scrutiny additions)

- **Undo from the edit form.** `hotel-form-client` / `transport-form-client` delete through `removeHotelRedirectAction` (`actions/bookings.ts:193`), which redirects to the list, so a client toast can't carry an Undo across the redirect. Only list deletes get Undo. If it matters, pass `?deleted=<kind>:<id>` on the redirect and let `bookings-view` raise the Undo toast. That's a follow-up.
- **Place delete** stays a one-tap hard delete (Decision 2). Follow-up ticket.

