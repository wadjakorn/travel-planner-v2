# Scrutiny: 2026-10-29-header-share-export.md

Outsider review, traced against `main` @ `6f6f7a2`. **[applied]** = fixed in the plan. **[open]** = left for the user.

## Intent

This answers review §11 Q5 ("Header Share/Export/Undo: build or cut from spec?") in three parts. It builds a header Share (copy the trip link; owners also get Invite) and an Export menu (.ics, CSV). It replaces the spec's global undo/redo with an Undo on the booking-delete toast.

**Simpler alternative pass.**
- **Undo.** This is the most valuable part. REQUIREMENTS §6 already specifies "soft delete with undo", and bookings really are soft-deleted (verified below). The scope is right: one `UPDATE`, two services, two actions, and a toast action.
- **Export.** Both downloads are already reachable: `.ics` from `calendar-view.tsx:144` and trip settings `:302`, CSV from `budget-view.tsx:190`. The header menu adds a third entry point and new UI (a `HeaderMenu` popover). That's cheap, but optional.
- **Share.** "Copy trip link" copies a URL that only existing members can open. For them it is the same URL as in the address bar. Its real use is a co-traveller deep link in a group chat (LINE). On mobile, the expected "Share" is the OS share sheet (`navigator.share`), which the plan doesn't use.
- Taken together, the smallest version that answers Q5 is **Undo now (PR A), plus Share/Export as a separate, optional PR B**. The plan's tasks already separate cleanly, so I marked the split in the plan. **[applied as structure; whether PR B ships at all is open]**

## Trace / verification

- **Soft delete holds.** `removeHotel` sets `deletedAt` at `booking-service.ts:102-112`, and `removeTransport` does the same at `:200-210`. `resolveHotel` filters `isNull(deletedAt)` (`:73-80`), so the restore path must use its own select (the plan does). `revalidateHotels`/`revalidateTransport` (`actions/bookings.ts:93-103`) revalidate `/trip/[id]` too, so the map and itinerary pick up a restored stay. No purge of soft-deleted bookings exists (grep), so restore can't race a cron.
- **Audit.** `writeAudit` takes `AuditAction = 'add'|'update'|'remove'|'reorder'` (`lib/audit.ts:9`). Using `'update'` with `after: { restored: true }` type-checks.
- **Access.** `canManageInvites(role)` is `role === 'owner'` (`trip-access.ts:69-71`). The trip settings page `notFound()`s unless `trip.ownerId === user.id` (`settings/page.tsx:84`), and `?s=people` is read at `:76`, so the owner-only Invite item is consistent. The export routes check `getTripRole` and return 401/404 otherwise (`calendar/export/route.ts:15-19`, `budget/export/route.ts:14-18`). The filenames `trip-<8>.ics` / `expenses-<8>.csv` match Task 4.
- **Dead invite item.** The account-menu item (`account-menu.tsx:123-130`) calls `onInvite?.()`, and nothing passes `onInvite` (grep shows only its own file). Removing it is correct.
- **Toast.** `ToastInput` has no action today, and the timer is a fire-and-forget `setTimeout` (`toast.tsx:64-70,112-118`).
- **What a Share recipient gets.** Trip layout: no session → `redirect('/sign-in')` with **no callbackUrl** (`layout.tsx:40`, same at `page.tsx:53`). No role → `notFound()` (`:47`). Sign-in already honours `?callbackUrl=` through `safeCallbackPath` (`sign-in/page.tsx:31-35`). The invite flow uses it (`invite/[token]/page.tsx:95`), but the trip routes don't.

## Findings

### M1. A shared link opened on a signed-out device loses the trip **[applied]**
- **Evidence.** `layout.tsx:40` / `page.tsx:53` call `redirect('/sign-in')`. After sign-in, `safeCallbackPath(undefined)` → `/`. So the main Share scenario (a member taps the link in LINE on a phone browser that isn't signed in) ends on the trip grid, not the trip.
- **Change.** Both redirects now carry `callbackUrl=/trip/<id>`, with a Task 4 check. The fix is two lines.

### M2. The Undo toast auto-dismisses an interactive control after 8 s **[applied]**
- **Evidence.** The toast region is `aria-live="polite"`, and focus is not moved to it (`toast.tsx:140-160`). A keyboard user has to reach the Undo button before the 8 s timer fires.
- **Why it matters.** WCAG 2.2.1 Timing Adjustable. REQUIREMENTS §18 requires WCAG 2.1 AA.
- **Change.** The timer pauses on hover or focus-within and resumes with the remaining time. The plan also says plainly that the 10-minute server window is a backstop and that users see an 8 s toast.

### M3. The toast wording contradicted the glossary plan on the same line **[applied]**
- This plan used `Booking removed`. The copy/glossary plan changes `bookings-view.tsx:168` to `Booking deleted` (Delete = gone for everyone). Both now say `Booking deleted` / `Couldn't delete booking`, and i18n P3 uses `booking_deleted_toast`.

### M4. REQUIREMENTS §3 is rewritten by two plans **[applied]**
- `2026-10-29-nav-labels.md` turns the §3 header line into "Not shipped: undo/redo, Share, Export, Help". This plan rewrites the same line as shipped. Resolution recorded in Task 5: if nav-labels lands first, this plan edits nav-labels' line and moves Share/Export into the shipped list.

### Nits
- **[applied]** If i18n P0 (`useT`) merges first, drop the `labels` prop and `HeaderLabels`. It is throwaway plumbing that i18n P1 deletes.
- **[applied, documented]** Deletes from the edit form (`removeHotelRedirectAction`, `actions/bookings.ts:193`) get no Undo, because the action redirects. Listed under Not done with a `?deleted=` follow-up sketch.
- Restore runs `isUndoable` before `requireTripAccess`, so a user without access learns "not_found" either way. There's no leak beyond what UUIDs already make infeasible. Fine.
- `isUndoable(..., future deletedAt) → true` ("clock skew"): `deletedAt` comes from the same app server's `new Date()`, so skew can't happen. The test is harmless.

## Open decisions for the user

1. **Ship PR B (Share/Export) at all?** Export duplicates three existing entry points. The Share link only opens for members, and non-members get a bare 404. The alternative is to ship only PR A and keep Share/Export under nav-labels' "Not shipped" line. My lean is to ship PR A now and decide B after the usability test.
2. **If PR B ships, should mobile Share use `navigator.share`**, with the clipboard as fallback? On a phone, "Share" means the share sheet (LINE, Messages). It needs a secure context, and prod is https. The plan currently copies to the clipboard only.
3. **Should a signed-in non-member see something better than 404**, such as "This trip is private — ask the owner for an invite"? That would reveal the trip exists, so it's a product call. The plan keeps the 404.

## Cross-plan

- **ux-copy-glossary:** toast wording aligned (M3).
- **nav-labels:** REQUIREMENTS §3 line ownership (M4). Also flagged by the a11y/nav scrutiny; this plan updates nav-labels' "Not shipped" line and removes what it ships.
- **a11y-batch:** the avatars' 44px `.tp-hit` touch area extends past their visual box. The new header triggers keep ≥ 7px clearance from `AvatarStack` (Global Constraints + Task 4 check). **[applied]**
- **i18n-extraction:** this plan ships before P1. Its new keys (`share_*`, `export_*`) are already in `messages/*.json`, and P1/P3 extract the rest.

## Verdict

**fix-then-ship** (PR A unconditionally). The Undo backend is sound because bookings really are soft-deleted. The shared link was broken for signed-out members and the toast failed WCAG timing; both are fixed in the plan. Whether PR B ships is the user's call.
