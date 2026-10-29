# UX Copy + Glossary Implementation Plan

> **Ticket:** TP-0085

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D9 — all four as proposed:** TH Itinerary = "แผนเที่ยว"; trash button "Remove {name} from this day"; hotel kind shown as "Stay"; budget category "Hotels" → "Stays".


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the review's §8 copy table and one glossary (Stay / Transport / Place; Delete = permanent, Remove = detach). Fix the Thai dictionary's wording collisions, so the app says the same thing the same way everywhere it already has copy.

**Architecture:** This is copy only, with no behavior change. The glossary becomes a REQUIREMENTS §14 subsection, the source of truth for future strings and for the i18n extraction plan. Existing i18n keys are fixed in `messages/{en,th}.json`, guarded by a parity + collision test. Hard-coded strings in the components named below are reworded in place; they are **not** moved into the dictionaries. That is the i18n extraction plan's job (review §10 `p3e`), and the strings it inherits are listed at the end. One small pure helper (`bookingsEmptyCopy`) makes the filter-aware empty state testable.

**Tech Stack:** Next.js 16, React 19, TypeScript, JSON dictionaries (`lib/i18n.ts`, `lib/i18n-client.ts`), vitest (node env).

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §8 (copy table + translation note), §6 ("ศัพท์" row), §4.4 (budget banner), §4.3 (bookings).

**Touches:** `app/src/messages/en.json`, `app/src/messages/th.json`, `place-preview-card.tsx` (1 line), `budget-view.tsx` (2 string lines: `:69` category label, `:129` plural; **not** the banner, which `2026-10-29-budget-correctness.md` owns), `expense-form.tsx:76` (category label), `bookings-view.tsx`, `lib/booking-format.ts`, `hotel-form-client.tsx`, `transport-form-client.tsx`, `expense-form.tsx`, `day-header.tsx` (2 attrs), `notes-view.tsx` (1 attr), `sortable-place-item.tsx` (3 aria-labels), `place-form.tsx` + `place-manual-form.tsx` (1 `<option>` each), `trip/[id]/booking/hotel/{new,[bookingId]/edit}/page.tsx` (metadata), `trip/[id]/settings/page.tsx` (2 lines: `:38`, `:314`), `REQUIREMENTS.md` §14, `AGENTS-INDEX.md`.
Owned elsewhere: the §8 budget empty-state banner (`budget-view.tsx:261-272`) is rewritten by `2026-10-29-budget-correctness.md` (owner-only `Alert action`, the same §8 copy). This plan does not touch it, because the old `canEdit` link 404s for editors (`settings/page.tsx:84`) and two plans rewriting the same block would conflict.
Overlaps (string-level rebases only): `2026-10-29-a11y-batch.md` touches `bookings-view.tsx` toast descriptions (`:170-183`), `notes-view.tsx` classes and `sortable-place-item.tsx`. `2026-10-29-itinerary-rows.md` touches `sortable-place-item.tsx` and owns the §8 rows inside `segment.tsx` / `place-row.tsx`. `2026-10-29-a11y-pin-picker.md` touches `place-manual-form.tsx`. `2026-10-29-header-share-export.md` rewrites the same `runDelete` toast (`bookings-view.tsx:168`) to add Undo; it uses this plan's wording (`Booking deleted`, `Couldn't delete booking`), so whichever lands second keeps those strings.

## Decision needed

1. **Thai "Itinerary".** Today `itinerary` = "แผนเดินทาง". The glossary's Transport is "การเดินทาง", so the two read almost the same, which is the same kind of collision as notes/save. **Default: "แผนเที่ยว"**, the word the Thai landing already uses (`th.json:72` alt text, `:78` bookings body). Alternative: keep "แผนเดินทาง".
2. **Place trash button.** The action deletes the place row (`removePlaceAction` → `place-service.removePlace`). For the user, though, it takes a stop off the day. **Default: Remove** (`Remove {name} from this day`), per review §8 "Remove = เอาออกจากวัน". Alternative: `Delete {name}`. Note: this button is a one-tap **hard** delete with no confirm (`sortable-place-item.tsx:196`, `place-service.ts:206`). "Remove" reads as lower stakes than it is; the follow-up "place delete: confirm or soft-delete + undo" (header plan Decision 2) matters more once this label ships.
3. **Place kind `hotel` option label** in the place forms: **Default "Stay"**. The value stays `hotel` because it is an enum in the DB/API.

## Global Constraints

- Glossary (verbatim from §8; it applies to every string this plan touches):

  | Concept | EN | TH | Rule |
  |---|---|---|---|
  | Hotel booking | Stay / stays | ที่พัก | Never "Hotel" in UI copy (`hotel` stays as a code/enum value) |
  | Transport booking | Transport; count = "transport bookings" | การเดินทาง | Never "Ride" in UI copy |
  | Itinerary stop | Place / places | สถานที่ | "Stop {n}" only as a map ordinal |
  | Itinerary | Itinerary | แผนเที่ยว | (Decision 1) |
  | Trip notes | Notes | โน้ต | "บันทึก" is reserved for Save |
  | Save | Save | บันทึก | |
  | Delete | Gone for everyone: trip, day, stay, transport, expense, note, checklist item | ลบ | Dialog title, confirm button and toast all say Delete |
  | Remove | Take out of a container: place from a day, member from a trip | เอาออก | |

- §8 copy (EN, exact):
  - preview: `Add it to see hours, phone and photos.`
  - budget empty: `No budget yet.` + `Set a budget` + `to track what's left.`: implemented by `2026-10-29-budget-correctness.md` Task (no-budget alert), not here.
  - bookings empty: title `No bookings yet`, body `Add a stay or transport — once it has a date, it shows on your itinerary and map.`
- `getLang()` stays forced to `en` (`lib/i18n.ts:17-19`). Thai dictionary values are visible today only on the signed-out landing (`tFor(lang)`) and become visible app-wide when i18n is switched on.
- Don't touch dead code: `hotels-view.tsx` is imported nowhere, so `hotel-search-picker`, `hotel-preview-modal`, `hotel-dates-modal`, `hotel-manual-form` and `hotel-edit-modal/-launcher` are unreachable. Their "hotel" copy is left alone; see "Not done".

## Review Focus

1. **en/th drift:** a key added to one dictionary only shows the raw key on the client (`makeT` falls back to the key, `i18n-client.ts:9`). Test: key parity (Task 1).
2. **Thai words shared by two meanings** (notes/save, itinerary/transport) creep back in later edits. Test: collision pairs (Task 1).
3. **Bookings empty state under a filter:** with stays but no transport, the "Transport" filter must not say "No bookings yet". Test `bookingsEmptyCopy('move')` (Task 2).
4. **Glossary leftovers outside the obvious files:** budget category label "Hotels" (`budget-view.tsx:69`, `expense-form.tsx:76`, `trip/[id]/settings/page.tsx:38`) and the missing-cost plural "rides" (`budget-view.tsx:129`). The Task 3 grep covers them.
5. **Destructive verbs out of sync** (dialog says Delete, button says Remove, toast says removed). Verification: `grep -rnE "Remove this|confirmLabel=\"Remove\"|Booking removed" app/src/components` returns nothing (Task 3).

---

### Task 1: Fix the dictionaries + guard test

**Files:**
- Modify: `app/src/messages/th.json`, `app/src/messages/en.json`
- Test: `app/src/lib/i18n-messages.test.ts` (create)

Changes (key: old → new):

| Key | en | th |
|---|---|---|
| `notes` | – | `บันทึก` → `โน้ต` |
| `hotels` | `Hotels` → `Stays` | `โรงแรม` → `ที่พัก` |
| `itinerary` | – | `แผนเดินทาง` → `แผนเที่ยว` |
| `landing_feat_itinerary_title` | – | `แผนเดินทาง` → `แผนเที่ยว` |
| `landing_feat_bookings_body` | `Hotels, transport and expenses in the same place as the plan.` → `Stays, transport and expenses in the same place as the plan.` | `โรงแรม การเดินทาง และค่าใช้จ่าย อยู่ที่เดียวกับแผนเที่ยว` → `ที่พัก การเดินทาง และค่าใช้จ่าย อยู่ที่เดียวกับแผนเที่ยว` |

All 86 keys were reviewed. The rest are already consistent with the glossary. `landing_calendar_alt` / `landing_budget_alt` describe screenshots literally and are left alone.

- [x] **Step 1: Write the failing test**

```ts
import en from '@/messages/en.json';
import th from '@/messages/th.json';

type K = keyof typeof en;
it('th has exactly the en keys', () => expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort()));
it('no empty values', () => {
  for (const d of [en, th]) for (const [k, v] of Object.entries(d)) expect(v, k).not.toBe('');
});
it('glossary terms (th)', () => {
  expect(th.notes).toBe('โน้ต');
  expect(th.hotels).toBe('ที่พัก');
  expect(th.transport).toBe('การเดินทาง');
  expect(th.itinerary).toBe('แผนเที่ยว');
});
it('distinct meanings never share a Thai word', () => {
  const pairs: [K, K][] = [['notes', 'save'], ['itinerary', 'transport'], ['hotels', 'bookings']];
  for (const [a, b] of pairs) expect(th[a], `${a} vs ${b}`).not.toBe(th[b]);
});
```

- [x] **Step 2:** `cd app && pnpm vitest run src/lib/i18n-messages.test.ts` → FAIL (`notes`, `hotels`, `itinerary`).
- [x] **Step 3:** Apply the table above.
- [x] **Step 4:** Re-run → PASS.
- [x] **Step 5:** Commit `fix(i18n): Thai notes ≠ save, itinerary ≠ transport, stays wording [TP-0085]`

### Task 2: §8 copy table — preview, budget, bookings empty state

**Files:**
- Modify: `app/src/lib/booking-format.ts` (add `BookingFilter`, `bookingsEmptyCopy`)
- Test: `app/src/lib/booking-format.test.ts` (create)
- Modify: `app/src/components/bookings-view.tsx:27` (`type Filter = BookingFilter`), `:278-283` (empty block)
- Modify: `app/src/components/place-preview-card.tsx:77`

**Interfaces:**
- Produces: `export type BookingFilter = 'all' | 'stay' | 'move'` and `export function bookingsEmptyCopy(filter: BookingFilter): { title: string; body: string }`.

- [x] **Step 1: Write the failing test**

```ts
it.each([
  ['all', 'No bookings yet', 'Add a stay or transport — once it has a date, it shows on your itinerary and map.'],
  ['stay', 'No stays yet', 'Add a stay — once it has dates, it shows on your itinerary and map.'],
  ['move', 'No transport yet', 'Add a flight, train, car or ferry — once it has a date, it shows on your itinerary.'],
])('%s', (f, title, body) => expect(bookingsEmptyCopy(f as BookingFilter)).toEqual({ title, body }));
```

(Transport has no coordinates and never appears on the map, per `lib/day-augment.ts:103-107`. Its body therefore says "itinerary" only.)

- [x] **Step 2:** `pnpm vitest run src/lib/booking-format.test.ts` → FAIL.
- [x] **Step 3: Implement + wire.**
  - `bookings-view.tsx` empty block: render `bookingsEmptyCopy(filter)` into the existing `emptyTitle` / `<p>`.
  - `place-preview-card.tsx:77`: `Add it to see hours, phone and photos.` This is shared by the search modal, the map preview popup and the POI preview.
  - Budget banner: **not here**; `2026-10-29-budget-correctness.md` ships it (owner-only action; editors no longer get a link that 404s).
- [x] **Step 4:** Tests PASS; `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [x] **Step 5:** Commit `feat(copy): bookings empty state and preview line [TP-0085]`

### Task 3: Apply the glossary — Stay / Transport, Delete vs Remove

**Files (exact old → new; line numbers at HEAD `6f6f7a2`):**

| File:line | Old | New |
|---|---|---|
| `bookings-view.tsx:168` | `'Booking removed'` | `'Booking deleted'` |
| `bookings-view.tsx:181` | `"Couldn't remove booking"` | `"Couldn't delete booking"` |
| `bookings-view.tsx:240` | `{rideCount === 1 ? 'ride' : 'rides'}` | `{rideCount === 1 ? 'transport booking' : 'transport bookings'}` |
| `bookings-view.tsx:456` | `'Remove this ride?' : 'Remove this stay?'` | `'Delete this transport booking?' : 'Delete this stay?'` |
| `bookings-view.tsx:459` | `will be removed from your bookings.` | `will be deleted from your bookings.` |
| `bookings-view.tsx:462` | `confirmLabel="Remove"` | `confirmLabel="Delete"` |
| `bookings-view.tsx:476-477` | `'Edit hotel'` / `'Add hotel'` | `'Edit stay'` / `'Add stay'` |
| `hotel-form-client.tsx:239` | `'Edit hotel' : 'Add hotel'` | `'Edit stay' : 'Add stay'` |
| `hotel-form-client.tsx:475` | `Delete hotel` | `Delete stay` |
| `hotel-form-client.tsx:494` | `'Add hotel'` | `'Add stay'` |
| `hotel-form-client.tsx:503` | `changes to this hotel` | `changes to this stay` |
| `hotel-form-client.tsx:510-512` | `Remove this stay?` / `will be removed from your bookings.` / `Remove` | `Delete this stay?` / `will be deleted from your bookings.` / `Delete` |
| `transport-form-client.tsx:474` | `changes to this ride` | `changes to this transport booking` |
| `transport-form-client.tsx:481-483` | `Remove this ride?` / `will be removed…` / `Remove` | `Delete this transport booking?` / `will be deleted from your bookings.` / `Delete` |
| `expense-form.tsx:352-354` | `Remove this expense?` / `will be removed from your budget.` / `Remove` | `Delete this expense?` / `will be deleted from your budget.` / `Delete` |
| `day-header.tsx:119-120` | `title="Remove this day"` / `aria-label="Remove day"` | `Delete this day` / `Delete day` |
| `notes-view.tsx:264` | `aria-label="Remove item"` | `aria-label="Delete item"` |
| `sortable-place-item.tsx:201,310` | `` `Remove ${place.name}` `` | `` `Remove ${place.name} from this day` `` |
| `sortable-place-item.tsx:241` | `` `Edit hotel booking ${name}` `` | `` `Edit stay ${name}` `` |
| `place-form.tsx:86`, `place-manual-form.tsx:118` | `<option value="hotel">Hotel</option>` | `<option value="hotel">Stay</option>` |
| `trip/[id]/booking/hotel/new/page.tsx:12` | `title: 'Add hotel'` | `title: 'Add stay'` |
| `trip/[id]/booking/hotel/[bookingId]/edit/page.tsx:12` | `title: 'Edit hotel'` | `title: 'Edit stay'` |
| `budget-view.tsx:129` | `` `${n} ${n === 1 ? 'ride' : 'rides'}` `` | `` `${n} ${n === 1 ? 'transport booking' : 'transport bookings'}` `` |
| `budget-view.tsx:69`, `expense-form.tsx:76`, `trip/[id]/settings/page.tsx:38` | category `label: 'Hotels'` | `label: 'Stays'` (the `id: 'hotels'` value is data and stays) |
| `trip/[id]/settings/page.tsx:314` | `Removes the itinerary, bookings, expenses and invites for everyone on it.` | `Permanently deletes the itinerary, bookings, expenses and invites for everyone on it.` |

Unchanged on purpose: `ConfirmDialog` default `confirmLabel='Delete'` (`confirm-dialog.tsx:25`), the trip delete copy (already Delete), `Delete note`, `Delete transport` / `Delete expense` footer buttons (already Delete), and the bookings chooser `Stay` / `Transport` (already the glossary).

- [x] **Step 1:** Apply the table.
- [x] **Step 2: Verify.** `grep -rnE "Remove this|confirmLabel=\"Remove\"|Booking removed|(Add|Edit) hotel'|'rides'|label: 'Hotels'" app/src/components app/src/app --include=*.tsx` → hits only in the dead hotel chain (`hotels-view.tsx`, `hotel-*-modal.tsx`, `hotel-manual-form.tsx`, `hotel-search-picker.tsx`). The code value `kind: 'ride'` is not copy and stays. Then `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [x] **Step 3:** Commit `fix(copy): glossary — stay/transport, delete vs remove [TP-0085]`

### Task 4: Glossary in REQUIREMENTS, index, browser check

- [x] `REQUIREMENTS.md` §14 i18n: add `### Glossary` with the Global Constraints glossary table plus one line: "New UI copy uses these terms; the en/th dictionaries are checked by `lib/i18n-messages.test.ts`." §3/§6 structure is owned by `2026-10-29-nav-labels.md`; don't edit them here.
- [x] `AGENTS-INDEX.md`: `booking-format.ts` row gains `bookingsEmptyCopy`. Add `lib/i18n-messages.test.ts` to the Misc i18n row ("en/th parity + glossary guard").
- [ ] Browser (`cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, trip `79efe162-dfb2-46c2-ad46-a34695771b8b`, 390×844 and 1440×900):
  - Bookings: header `N stays · N transport bookings`. Filter → Transport on a trip with only stays shows `No transport yet`. Delete a booking: the dialog title, button and toast all say Delete.
  - Budget: the category list reads `Stays`, not `Hotels`; a stay with no cost reads `1 transport booking …` / `1 stay …` in the missing-cost note.
  - Search a place → preview line `Add it to see hours, phone and photos.`
  - Signed out `/` → switch to ไทย: feature title `แผนเที่ยว`, bookings feature body starts `ที่พัก`. No overflow at 390px.
- [x] `pnpm typecheck && pnpm lint && pnpm test` (tail -3). Commit `docs: copy glossary in REQUIREMENTS §14 [TP-0085]`

## Left for the i18n extraction plan

These strings stay hard-coded English after this plan. Extract them with these keys' Thai values (from §8 and the glossary):

| EN (final) | TH | Where |
|---|---|---|
| `No location for {name}` · `Fix location` | `ยังไม่มีตำแหน่งของ {name}` · `แก้ตำแหน่ง` | `segment.tsx` (itinerary-rows plan) |
| `Not matched to a map place` · `Find on map` | `ยังไม่ได้จับคู่กับสถานที่บนแผนที่` · `ค้นหาบนแผนที่` | `place-row.tsx` (itinerary-rows plan) |
| `Add it to see hours, phone and photos.` | `เพิ่มเข้าทริปเพื่อดูเวลาเปิด เบอร์โทร และรูป` | `place-preview-card.tsx` |
| `No budget yet.` · `Set a budget` · `to track what's left.` | `ยังไม่ได้ตั้งงบ` · `ตั้งงบ` · `เพื่อดูว่าเหลือเท่าไร` | `budget-view.tsx` (shipped by the budget-correctness plan) |
| `No bookings yet` / `No stays yet` / `No transport yet` + bodies | `ยังไม่มีการจอง` / `ยังไม่มีที่พัก` / `ยังไม่มีการเดินทาง` · `เพิ่มที่พักหรือการเดินทาง` | `lib/booking-format.ts` |
| `Delete this stay?` / `Delete this transport booking?` / `Delete this expense?` / `Delete` | `ลบที่พักนี้?` / `ลบการเดินทางนี้?` / `ลบค่าใช้จ่ายนี้?` / `ลบ` | booking/expense forms, `bookings-view.tsx` |
| `Remove {name} from this day` | `เอา {name} ออกจากวันนี้` | `sortable-place-item.tsx` |
| Map day label `‹ Day 1 · Sat 12 ›` | `‹ วันที่ 1 · ส. 12 ›` | owned by `2026-10-29-map-day-bar-ghost-pins.md` (`persistent-map.tsx`) |
| Distance chip (see Not done) | `เดินทาง 8.4 กม. · 1 ชม. 12 น.` | `real-map-canvas-*` |

Also for that plan: about 520 hard-coded strings (§8 note). It should also handle `<html lang>` (A8) and Thai line-height/min 13px (A7).

## Not done (with reason)

- **Distance chip "… travel today"** (§8 row): "today" repeats the I4 bug. The chip shows the selected trip day, not today. The visible chip lives in both hot map renderers, and `2026-10-29-a11y-batch.md` already gives it a spoken label. Recommend visible copy `8.4 km · 1h 12m` + `aria-label="Travel on Day {n}: …"` (no "today"), done there or in the i18n plan.
- **Legacy hotel flow copy** (`hotels-view.tsx` chain): dead code. Recommend deleting the chain in a cleanup PR instead of rewording it.
- **Budget banner color + copy** (review §4.4): owned by `2026-10-29-budget-correctness.md` (neutral `.info` tone, §8 copy, owner-only action).
