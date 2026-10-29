# Scrutiny: 2026-10-29-ux-copy-glossary.md

Outsider review, traced against `main` @ `6f6f7a2`. **[applied]** = fixed in the plan. **[open]** = left for the user.

## Intent

Make the app use one vocabulary: Stay / Transport / Place, with Delete meaning gone and Remove meaning detached. Ship the review's §8 copy rows, and fix the two Thai words that each carry two meanings (บันทึก for both notes and save, แผนเดินทาง vs การเดินทาง for itinerary vs transport). This is copy only.

**Simpler alternative pass.** Could the i18n extraction do this instead? It could, but then extraction would carry the old wording into keys, and the Thai drafts would inherit the collisions. A small copy PR first is the right order, and both plans say so. The plan rewords strings in place and deliberately doesn't move them into the dictionaries, which keeps it small. One helper (`bookingsEmptyCopy`) exists only to make the filter-aware empty state testable; that's proportionate. Scope is correct.

## Trace / verification

- Line refs checked at HEAD. All match within ±1: `bookings-view.tsx:27,168,181,240,278-283,456-462,476-477`, `hotel-form-client.tsx:239,475,494,503,510-512`, `transport-form-client.tsx:474,481-483`, `expense-form.tsx:352-354`, `day-header.tsx:119-120`, `notes-view.tsx:264`, `sortable-place-item.tsx:201,241,310`, `place-form.tsx:86`, `place-manual-form.tsx:118`, the hotel page metadata `:12`, and `trip/[id]/settings/page.tsx:314`.
- Dictionary values match the plan's "old" column (`th.json:4,6,10,35,73,78`).
- `lib/booking-format.ts` is pure, with no `server-only`, and is already imported by client components. Adding `bookingsEmptyCopy` there is safe.
- The `day-augment.ts:103-107` claim holds: transport has no coordinates and appears in the list only.
- The `removePlaceAction` → `place-service.removePlace` path is a hard `db.delete` (`place-service.ts:206`).

## Findings

### M1. The budget banner change conflicts with the budget plan and ships a link that 404s **[applied]**
- **Evidence.** Task 2 kept `{canEdit ? <Link href=…settings?s=budget>Set a budget</Link> : null}` with the href unchanged. `trip/[id]/settings/page.tsx:84` returns `notFound()` for anyone but the owner, so editors would get a dead link. `2026-10-29-budget-correctness.md` already rewrites the same block (`budget-view.tsx:261-272`): an owner-only `Alert action`, the same §8 copy, and a neutral tone.
- **Why it matters.** Two PRs would rewrite one block, and the first one to land would ship the 404 link.
- **Change.** Removed the banner from this plan. Touches, Global Constraints, Review Focus 4, Task 2 and Task 4 now point to the budget plan as owner.

### M2. The glossary sweep missed 4 visible strings **[applied]**
- **Evidence.** `grep "'Hotels'"` finds the budget category label at `budget-view.tsx:69`, `expense-form.tsx:76` and `trip/[id]/settings/page.tsx:38`, all user-visible. `budget-view.tsx:129` builds `` `${n} ${n === 1 ? 'ride' : 'rides'}` ``. The plan's own Task 3 grep (`'rides'`) would have hit `budget-view.tsx:129` and contradicted its "hits only in the dead chain" expectation.
- **Change.** Added rows to the Task 3 table (category label `Stays`; the `id: 'hotels'` value stays because it's data) and extended the verify grep with `label: 'Hotels'`.

### M3. The cross-plan toast wording was out of sync **[applied]**
- The header plan's Undo toast said `Booking removed`, while this plan changes the same line (`bookings-view.tsx:168`) to `Booking deleted`. Resolution: the glossary wins. The header plan now says `Booking deleted` / `Couldn't delete booking`, and i18n P3 uses `booking_deleted_toast`. Recorded in all three plans.

### Nits
- **[applied]** The plan said 86 keys, not 87. `th.json:71-72` → `:72` (+ `:78`) for "แผนเที่ยว".
- **[applied]** Decision 2 now notes that "Remove {name} from this day" sits on a one-tap **hard** delete with no confirm. The softer verb lowers the perceived stakes, which makes the follow-up (confirm, or soft delete + undo) more urgent. The wording stays per §8.
- The `i18n-messages.test.ts` parity test is shared with the i18n plan: i18n P0 extends it rather than duplicating it. That edit is in the i18n plan.
- `bookingsEmptyCopy` returns English strings from `lib/`. i18n P3 will have to switch it to returning keys. That's a cheap change and not worth pre-empting.

## Open decisions

The plan's three decisions are reasonable defaults and are left to the user: TH "แผนเที่ยว", the place trash label "Remove … from this day", and the place-kind option "Stay". Budget category "Hotels" → "Stays" follows the glossary rule "never Hotel in UI copy". Revert that one row if the user sees a spending category as different from a booking type.

## Cross-plan

- **budget-correctness** owns the no-budget banner. Both plans touch `budget-view.tsx` (string-level only here: `:69`, `:129`), so whichever lands second does a trivial rebase.
- **header-share-export** uses the "Booking deleted" wording (M3).
- **i18n-extraction** goes after this plan and extends `lib/i18n-messages.test.ts`.

## Verdict

**fix-then-ship.** The copy is right, but the budget banner block belonged to the budget plan, and as written it would have shipped a link that 404s for editors.
