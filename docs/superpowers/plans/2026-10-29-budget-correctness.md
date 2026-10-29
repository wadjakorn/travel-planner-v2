# Budget Correctness Implementation Plan

> **Ticket:** TP-0082

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D11 — dedupe via "Merge into booking"** (no FK).
> - **D12 — travelers stored in `budget_config`** (no new column).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised after scrutiny (2026-10-29)**, see [2026-10-29-budget-correctness.scrutiny.md](2026-10-29-budget-correctness.scrutiny.md). Both schema changes were removed. The travelers count now lives in the existing `budget_config` jsonb, so the REST API and import get it with no extra wiring. Double counting is fixed by merging the logged copy into its booking (soft-deleting it with the existing action) instead of adding an expense→booking FK. The original designs are kept below as the alternatives in **Decision needed**.

**Goal:** Make the Budget page's numbers trustworthy. Per-person uses the trip's real headcount, the same headcount the trip hub shows. A logged payment that duplicates a booking cost can be merged away in one confirmed tap. The page explains how its total relates to the Bookings total. Tiny shares read "<1%" instead of "0%". The "No budget set" notice stops looking like a success message.

**Architecture:** The headcount has one source, a new optional `travelers` key in the existing `trips.budget_config` jsonb (`TripBudgetConfig`). This adds no DDL. When the key is absent, the count falls back to owner + editors, the rule the budget page uses today. A shared helper in `lib/trip-travelers.ts` gives the hub and the budget page the same number. `parseBudgetConfig` (web form) and `parseBudgetConfigInput` (REST trip PATCH and import `budget`) both validate the new key. Agents can set it through the same `budget` object they already send. Double counting is handled by the pure `buildBudgetSummary`. It returns **merge suggestions**, which are one-to-one exact-amount matches between a logged hotel/transport expense and a booking of the matching kind. It also returns `bookings + other expenses` subtotals. A suggestion's button opens a confirm dialog and then calls the existing `removeExpenseAction` (a soft delete). The booking already carries that amount, so the total drops by exactly the duplicate. Nothing is deduplicated without a user tap.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle/Postgres (one data-only custom migration), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §4.4 (Budget: "ให้กด 'รวมกับ booking' ได้"), §0 item 10, §8 ("Budget ว่าง" copy row). Screenshot `docs/design-review/shots/20-budget.png`.

**Touches:** `app/src/db/schema.ts` (type only, no column), `app/drizzle/` (+1 data-only custom migration), `app/src/lib/budget-config.ts`, `app/src/lib/expense-queries.ts`, `app/src/components/budget-view.tsx` (+ module css), `app/src/components/budget-settings-form.tsx`, `app/src/components/alert.module.css`, `app/src/app/trip/[id]/page.tsx` (1 line), `app/src/app/trip/[id]/budget/page.tsx`, `app/src/lib/api/import-warnings.ts`. It does **not** touch `expense-form.tsx`, `expense-service.ts`, `globals.css` or any map file.

## Decision needed

1. **Where the headcount lives.** Today the hub (`app/src/app/trip/[id]/page.tsx:97`) shows `collaborators.length + 1`. `collaborators` is a decorative `{initials,color}` jsonb that only the seed fills, so the demo shows "4 travelers". The budget page (`app/src/app/trip/[id]/budget/page.tsx:56-83`) counts editor memberships + owner, which gives 1. Neither is the real headcount: a family of 4 with one account is 4 travelers and 1 member. **Default:** add an optional `travelers` (an integer from 1 to 99) to `TripBudgetConfig`, edited in the budget settings form ("Travelers"). If it is absent, the count falls back to owner + editors. A one-off data migration sets it to `jsonb_array_length(collaborators) + 1` on trips whose `collaborators` is non-empty (seeded demos only), so those keep the 4 they show today. Why jsonb and not a column: per-person is the only consumer, the form that edits it is the budget form, and `budget` already flows through REST trip PATCH, import and `GET /trips/:id`. A column would also need trip-service, the PATCH route, the import trip section and the API docs wired, plus a DDL migration on the shared Preview DB. *Alternative A:* a nullable `trips.travelers` integer column with `CHECK 1..99`. It is cleaner typing, but it is a DDL migration and needs the API wiring above. *Alternative B:* count members only (no data change). The demo hub would then read "1 traveler", and per-person stays wrong for families. Rejected alternatives: hotel `guests` is per room (the seed says 2 per room on a 4-person trip), and `collaborators` is decorative.
2. **How double counting is removed.** **Default: merge.** The budget page suggests exact-amount pairs, one to one: a logged `hotels`/`transport` expense and a booking of the matching kind, in the same currency. The suggestion's **"Merge into booking"** button asks for confirmation, then soft-deletes the logged expense with the existing `removeExpenseAction`. The booking keeps the cost. Nothing changes without a tap. This needs no schema, service, API or form change. The expense form already tells users that booking costs count (`expense-form.tsx:266-277`). What it loses: the duplicate row's label, note and `at` (`paidBy` and splits are not shown anywhere in the UI today). *Alternative: link.* Two nullable FK columns `expense.hotel_booking_id` / `transport_booking_id`, so a linked expense counts inside its booking. Lossless and reversible, but it is a DDL migration plus a link write path in the service, the actions, the form, three pages and the REST API. If you choose it, the link fields must stay **out of** `parseExpenseInput`, which the importer shares (`lib/api/import-sections.ts:102` → `import-service.ts:104-107` inserts with no ownership check). See scrutiny finding B3.
3. **Info alert tone.** **Default:** neutral. `.info` uses `--muted` (grey dot and tint), with no new token. `tone="info"` is used only by this banner (`budget-view.tsx:263`), so the change has no other visible effect. *Alternative:* add a blue `--info` token pair to `globals.css`. That adds a hue and touches a hot file.

## Global Constraints

- Headcount resolution, exactly: `travelers = budgetConfig?.travelers ?? (count(tripMemberships where role = 'editor' and userId <> ownerId) + 1)`. Viewers never count.
- `TripBudgetConfig.travelers?: number`, an integer from 1 to 99. In the web form, blank means absent (fall back to members). In the JSON API, `budget.travelers` is optional, and `null` or absent means absent. `parseBudgetConfig` / `parseBudgetConfigInput` return `null` only when amount, caps **and** travelers are all unset. A config holding only `travelers` keeps `basis: 'total'` and `amount: null`.
- The REST `budget` object is replaced wholesale on PATCH, as caps are today. A PATCH without `travelers` clears it. Document this.
- Merge suggestion rule: an expense in category `hotels`/`transport`, a booking of the matching kind with a cost, the same effective currency (both equal to the trip currency), and `|expense.amount − booking.costAmount| < 0.005`. Matching is **one-to-one**: a booking absorbs at most one expense, and an expense gets at most one suggestion. Order: expenses by `at` ascending, then id. For each expense, pick the unused booking whose date (`parseLooseDate`) equals the expense `at` date (UTC ISO), then the earliest booking date, then id.
- Share formatting: `0 → "0%"`, `0 < x < 1 → "<1%"`, `99 < x < 100 → ">99%"`, otherwise `Math.round(x) + "%"`. No clamping above 100, for "% used" or "of cap".
- Copy (EN). No-budget alert: **"No budget yet."**. For the owner, the alert action is **"Set a budget"** (`/trip/{id}/settings?s=budget`), followed by "to track what's left." Reconciliation line: `{bookings} in bookings + {other} other expenses`. Suggestion: `“{expense label}” ({amount}) looks like the same payment as {booking label}` + button **"Merge into booking"**. Confirm dialog: title **"Merge into booking?"**, message `“{expense label}” will be removed. {booking label} already counts {amount}.`, confirm label **"Merge"**.
- The only migration is data-only, idempotent, and has no DDL. Preview builds auto-migrate the shared Preview DB (TP-0050).
- Comments only for WHY. No new hex outside token files. "Traver Planel" stays as is.

## Review Focus

1. **Two equal bookings and two equal expenses** (demo: two Park Hotel nights at $380, one logged night). Exactly one suggestion, pointing at the same-date booking. With two logged $380 expenses and only one $380 booking, only one may be suggested. Otherwise both get merged and the total under-counts by $380. Tests `suggestion prefers the booking on the expense date` and `a booking absorbs at most one expense` (Task 3).
2. **An explicit travelers value plus several editors, and a trip with viewers only.** The explicit value wins. Viewers never inflate the count. Tests in Task 2.
3. **The per-person *basis* budget (`target × travelers`).** It must use the same resolved number as the "Per person" stat and the hub. Test `resolvedBudget per_person uses resolveTravelers` (Task 2).
4. **A config holding only `travelers`.** "No budget yet" still shows (`hasBudget` reads amount/caps only, `budget-view.tsx:115-117`), and the API `GET` returns `budget: {amount:null, basis:'total', travelers:4}`. Test `travelers alone keeps a config` (Task 2).
5. **The data migration re-run on the shared Preview DB**, for example after a renumber. It must be a no-op. Guard: `budget_config->'travelers' IS NULL`.

---

### Task 1: Type + seeded-trip data migration

**Files:**
- Modify: `app/src/db/schema.ts` (`TripBudgetConfig` ~L118-127: add `travelers?: number` with a one-line WHY comment: the per-person divisor, which can differ from member accounts)
- Create: `app/drizzle/00NN_trip_travelers_backfill.sql` via `pnpm db:generate --custom --name trip_travelers_backfill` (same pattern as `0019_date_iso_backfill.sql`; `NN` = next free index at implementation time, `0022` at HEAD `6f6f7a2`)

**Interfaces:**
- Produces: `TripBudgetConfig['travelers']: number | undefined`.

- [ ] **Step 1:** Edit the type.
- [ ] **Step 2:** `cd app && pnpm db:generate --custom --name trip_travelers_backfill`, then write:
  ```sql
  -- Seeded demo trips draw N avatar initials and the hub has always said N+1
  -- travelers; keep that number now that it is real data. Idempotent (skips rows
  -- that already carry travelers) so a re-run on the shared Preview DB is a no-op.
  UPDATE "trip"
  SET "budget_config" =
    (CASE WHEN jsonb_typeof("budget_config") = 'object' THEN "budget_config"
          ELSE '{"amount":null,"basis":"total"}'::jsonb END)
    || jsonb_build_object('travelers', jsonb_array_length("collaborators") + 1)
  WHERE jsonb_typeof("collaborators") = 'array'
    AND jsonb_array_length("collaborators") BETWEEN 1 AND 98
    AND ("budget_config" IS NULL OR "budget_config"->'travelers' IS NULL);
  ```
- [ ] **Step 3:** **Migration numbering.** The telemetry plan (`2026-10-29-research-usability-telemetry.md`) also adds a migration. Whichever PR merges second rebases onto `main`, deletes its own `00NN_*.sql`, `meta/00NN_snapshot.json` and journal entry, and re-runs `db:generate`, so it gets the next index **and a newer journal `when`**. Never hand-edit the index. Why: `drizzle-kit migrate` only applies entries whose `when` is greater than the last applied `created_at` (`drizzle-orm/pg-core/dialect.js:62`). An older-stamped entry merged after a newer one is skipped silently on every DB that already ran the newer one, including the shared Preview DB.
- [ ] **Step 4:** `pnpm db:migrate` against the local dev DB, then `pnpm typecheck` (tail -3). Expected: clean. In `psql`, the seeded trip has `budget_config->'travelers' = 4`, and a second `db:migrate` changes nothing.
- [ ] **Step 5:** Commit `feat(budget): travelers in budget config + seeded-trip backfill [TP-0082]`

### Task 2: One headcount for hub + budget + API

**Files:**
- Create: `app/src/lib/trip-travelers.ts`, `app/src/lib/trip-travelers.test.ts`
- Modify: `app/src/app/trip/[id]/budget/page.tsx:46-108` (drop the inline member query; use the helper for `perPerson`, `resolvedBudget`, `travelersCount`)
- Modify: `app/src/app/trip/[id]/page.tsx:97` (`travelers={await loadTravelersCount(trip)}`)
- Modify: `app/src/lib/budget-config.ts` (`parseTravelers` for FormData; `parseBudgetConfig` and `parseBudgetConfigInput` read `travelers`; the "nothing set → null" rule includes it), `app/src/lib/budget-config.test.ts`
- Modify: `app/src/components/budget-settings-form.tsx` (+ `travelers: number | null` and `travelersDefault: number` props; number input `name="travelers"`, `min=1 max=99 step=1`, label "Travelers", placeholder = `travelersDefault`, hint "Used for per-person numbers. Leave blank to count trip members.") and its two call sites, `budget-view.tsx:242` and `app/src/app/trip/[id]/settings/page.tsx:168`
- Modify: `app/src/lib/api/import-warnings.ts:166-167` (`per_person` threshold = `amount × budget.travelers` when present; still skipped when absent)
- Modify: `app/src/lib/seed-trip.ts` + `app/src/app/actions/seed.ts:29-39` (insert `budgetConfig: { amount: null, basis: 'total', travelers: 4 }`)

**Interfaces:**
- Produces:
  ```ts
  export function resolveTravelers(explicit: number | null | undefined, editorCount: number): number
  export function resolveBudgetTarget(cfg: TripBudgetConfig | null, travelers: number, realDays: number): number | null
  export async function loadTravelersCount(trip: { id: string; ownerId: string; budgetConfig: TripBudgetConfig | null }): Promise<number> // skips the DB when explicit
  export function parseTravelers(v: FormDataEntryValue | null): number | undefined // blank → undefined; non-integer or outside 1..99 → throws Error('Travelers must be a whole number from 1 to 99')
  ```
  `resolveBudgetTarget` is the `resolvedBudget` ternary moved verbatim out of `budget/page.tsx:97-108`, so it can be tested. `parseBudgetConfigInput` throws `ServiceError('bad_request', '"budget.travelers" must be a whole number from 1 to 99')`.

- [ ] **Step 1: Failing tests** (`trip-travelers.test.ts`, `budget-config.test.ts`)
  - `resolveTravelers(null, 0) === 1`; `resolveTravelers(null, 3) === 4`; `resolveTravelers(4, 0) === 4`; `resolveTravelers(2, 5) === 2` (explicit wins).
  - `resolvedBudget per_person uses resolveTravelers`: `resolveBudgetTarget({amount:500,basis:'per_person'}, resolveTravelers(4,0), 5) === 2000`; `per_day` with `realDays 0` → `null`; `total` → `500`.
  - `parseTravelers`: `''` → `undefined`; `'4'` → `4`; `'0'`, `'100'`, `'2.5'`, `'abc'` → throw.
  - `travelers alone keeps a config`: FormData `{amount:'', basis:'total', travelers:'4'}` → `{amount:null, basis:'total', caps:undefined, travelers:4}`; with `travelers:''` → `null` (unchanged behaviour).
  - `parseBudgetConfigInput({travelers: 4})` → `{amount:null, basis:'total', caps:undefined, travelers:4}`; `{travelers: 0}` and `{travelers: 2.5}` → throw `bad_request`; `{amount: 100}` → no `travelers` key.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/trip-travelers.test.ts src/lib/budget-config.test.ts`. Expected: FAIL (module missing / new cases).
- [ ] **Step 3:** Implement. `loadTravelersCount` runs the editor-count query that currently sits in `budget/page.tsx:56-70` and keeps its WHY comments (viewers excluded, owner excluded from the count). `saveTripBudgetAction` (`actions/budget.ts:60`) needs no change, because `parseBudgetConfig` carries `travelers`. Map its thrown `Error` to `actionError(message)`, the same way the currency error is handled.
- [ ] **Step 4:** Re-run the tests. Expected: PASS. Then `pnpm typecheck && pnpm lint` (tail -3).
- [ ] **Step 5:** Commit `fix(budget): one travelers count for hub, budget and API [TP-0082]`

### Task 3: Merge suggestions + subtotals (pure)

**Files:**
- Modify: `app/src/lib/expense-queries.ts` (`BudgetSummary`, `buildBudgetSummary`)
- Test: `app/src/lib/expense-queries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // BudgetSummary gains:
  fromBookings: number;        // sum of included booking rows; equals the Bookings page total
  fromExpenses: number;        // sum of included expense rows; fromBookings + fromExpenses === totalSpent
  suggestions: MergeSuggestion[];
  export type MergeSuggestion = {
    expenseId: string; expenseLabel: string; amount: number;
    category: 'hotels' | 'transport';
    bookingId: string; bookingLabel: string;
  };
  ```
  Totals logic is unchanged. Suggestions are advisory until the user merges.

- [ ] **Step 1: Failing tests.** Fixtures are shaped like the seed: hotels Park Hotel 380 on 2026-04-12 and on 2026-04-15, Hoshinoya 720, Tenseien 540. Expenses: "Park Hotel · Night 1" 380 at 2026-04-12, "Hakone Tenseien · Night 1" 540, "Taxi Shibuya" 28 transport, "Car rental · Times" 88 transport, with a car booking of 88.
  - `fromBookings + fromExpenses === totalSpent`, and `fromBookings` equals the sum of the trip-currency booking costs (7144 with the seed fixture).
  - `suggestion prefers the booking on the expense date`: suggestions contain `{expenseId:'park-night-1', bookingId:'park-1'}` (the 04-12 booking, not 04-15), plus Tenseien and Car rental. "Taxi Shibuya" has no suggestion. Exactly 3 suggestions.
  - `a booking absorbs at most one expense`: two expenses of 540 and one Tenseien booking of 540 → exactly one suggestion (the earlier `at`).
  - `no suggestion across categories` (a food expense of 380 → none), `no suggestion across currencies` (a JPY booking on a USD trip → none), and `no suggestion for a booking without cost`.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/expense-queries.test.ts`. Expected: the new cases FAIL.
- [ ] **Step 3:** Implement inside `buildBudgetSummary`, after `included` is built: index the included booking rows per category, then walk the included expense rows in the order above and use each booking at most once. `loadBudgetForTrip` needs no select change, because `label` and `date` are already selected.
- [ ] **Step 4:** Re-run. Expected: PASS, and the existing cases still PASS.
- [ ] **Step 5:** Commit `feat(budget): merge suggestions + bookings/other split [TP-0082]`

### Task 4: Budget view: reconciliation, merge, shares, neutral info

**Files:**
- Create: `app/src/lib/budget-share.ts`, `app/src/lib/budget-share.test.ts`
- Create: `app/src/components/budget-merge-button.tsx` (`'use client'`; `ConfirmDialog` + `useTransition`, the same flow as `trip-delete-button.tsx`)
- Modify: `app/src/components/budget-view.tsx` (props `fromBookings`, `fromExpenses`, `suggestions`, `mergeAction`; hero L274-281; category note L414-422; `pct` L361; hero `pctUsed` L118/L309; no-budget alert L261-272; header meta L174 unchanged, now reading the resolved count)
- Modify: `app/src/components/budget-view.module.css` (`.heroSplit`, `.suggest`)
- Modify: `app/src/components/alert.module.css:28` (`.info { --tone: var(--muted); }`)
- Modify: `app/src/app/trip/[id]/budget/page.tsx` (pass the new summary fields + `removeExpenseAction` as `mergeAction`; it is already imported at L14)

**Interfaces:**
- Consumes: Task 3 `BudgetSummary` fields; the existing `removeExpenseAction(formData)` (`actions/expenses.ts:129`, field `expenseId`, revalidates `/trip/{id}/budget`).
- Produces: `formatShare(part: number, whole: number): string`; `sharePct(part: number, whole: number): number` (unrounded, `whole <= 0 → 0`); `BudgetMergeButton(p: { suggestion: MergeSuggestion; currency: string; action: (fd: FormData) => Promise<void> })`.

- [ ] **Step 1: Failing tests** (`budget-share.test.ts`): `formatShare(0, 8875) === '0%'`; `formatShare(22, 8875) === '<1%'`; `formatShare(95, 8875) === '1%'`; `formatShare(8850, 8875) === '>99%'`; `formatShare(8875, 8875) === '100%'`; `formatShare(11000, 8875) === '124%'`; `formatShare(5, 0) === '0%'`.
- [ ] **Step 2:** `pnpm vitest run src/lib/budget-share.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `budget-share.ts`, then the view:
  - Category meta uses `formatShare(c.amount, denom)`. The bar width uses `Math.min(sharePct(...), 100)` (unrounded, so a $22 row is a sliver, not empty). The hero uses `formatShare(totalSpent, budget)` + " used".
  - Hero: under the total, `.heroSplit` shows `{fmt(fromBookings)} in bookings` (a link to `/trip/{id}/bookings`) ` + {fmt(fromExpenses)} other expenses`.
  - Category note: when `canEdit` and this category has suggestions, render one `.suggest` row per suggestion with the suggestion copy and a `BudgetMergeButton` (`Button size="sm" variant="secondary"`, "Merge into booking"; confirm → `FormData{expenseId}` → `action`). Otherwise, when `fromBooking > 0 && fromExpense > 0`, show the neutral note: "Includes {b} from bookings and {e} logged separately. If one of them is a booking payment, delete the logged copy so it counts once." Remove the text "check for double counting".
  - No-budget alert: `<Alert tone="info" action={isOwner ? {href:`/trip/${tripId}/settings?s=budget`, label:'Set a budget'} : undefined}>` with the body **No budget yet.**, plus " to track what's left." only when the action is shown. Why: the old inline link sent editors to a settings page that `notFound()`s for non-owners (`settings/page.tsx`). Editors already get the inline form above (`budget-view.tsx:241`).
- [ ] **Step 4:** Re-run (PASS); `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [ ] **Step 5:** Commit `fix(budget): explain the total, merge duplicates, <1% shares, neutral no-budget notice [TP-0082]`

### Task 5: Verify in the real app

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Use Playwright at 1440×900 and 390×844 on trip `79efe162-dfb2-46c2-ad46-a34695771b8b`.
- [ ] The hub cover line and the Budget header both say **4 travelers** (after the backfill). Per person = total / 4.
- [ ] Budget hero before merging: `$8,875`, split `$7,144 in bookings + $1,731 other expenses`. Bookings page total `$7,144` (the same number).
- [ ] The Hotels card shows two suggestions (Park Hotel 380 → the Apr 12 booking, Tenseien 540). Transport shows one (Car rental 88). Merge all three, confirming each dialog (Cancel on the first attempt leaves everything unchanged). The total becomes **$7,867**, split `$7,144 + $723`, and the three rows are gone from the recent list.
- [ ] The Activities card reads `<1% of total`. The no-budget alert has a grey dot and tint (not teal). As owner, "Set a budget" goes to settings. As an editor, there is no link and no dangling "to track what's left".
- [ ] In Settings → Budget & currency, set Travelers to 2. The hub and budget both say 2. Clear it, and both fall back to the member count.
- [ ] API: `PATCH /api/v1/trips/{id}` with `{"budget":{"amount":1000,"basis":"per_person","travelers":3}}` → `GET` returns `budget.travelers === 3`, and the hub says 3 travelers. `{"budget":{"travelers":0}}` → 400.
- [ ] Mobile 390: the hero split wraps without overflow, and the merge button is ≥ 44px tall or sits inside a ≥ 44px row.

### Task 6: Docs

**Files:** `AGENTS-INDEX.md`, `REQUIREMENTS.md`, `API.md`, `agent-skill/travel-planner-api/SKILL.md`

- [ ] `AGENTS-INDEX.md`. The Budget config row adds `budgetConfig.travelers` → `lib/trip-travelers.ts`. The lib table adds `trip-travelers.ts` and `budget-share.ts`, and updates `expense-queries.ts` (merge suggestions, bookings/other split). Components add `budget-merge-button.tsx`.
- [ ] `REQUIREMENTS.md` §7 Budget: add bullets for "Per person divides by the trip's travelers (budget settings; blank = owner + editors)", "Total = bookings + other expenses, shown as a split", "A logged payment that exactly matches a booking is suggested for merging (one to one); merging deletes the logged copy after confirmation, never automatically", and "Shares under 1% read <1%".
- [ ] `agent-skill/travel-planner-api/SKILL.md` (the agent-facing contract; `API.md` L181 is stale and lacks `budget` entirely): the `budget` object gains `travelers?` (1–99, the per-person divisor). Note that PATCH replaces the whole object. Add one line: "Hotel/transport costs entered on bookings already count toward the budget. Do not also log them as expenses." Mirror the `budget` field in `API.md` §PATCH trips.
- [ ] Commit `docs: budget travelers + merge duplicates [TP-0082]`
