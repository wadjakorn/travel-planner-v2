# Scrutiny: budget correctness

Plan: [2026-10-29-budget-correctness.md](2026-10-29-budget-correctness.md). Traced against HEAD `6f6f7a2`.

## Intent

Make the Budget numbers trustworthy: one real headcount for per-person, booking payments counted once, a total that reconciles with Bookings, "<1%" shares, and a no-budget notice that doesn't look like success.

### Simpler alternatives considered (mandatory pass)

The original plan made **two schema changes**: a `trips.travelers` column and two expense→booking FK columns. It also had a link write path that ran through the service, the actions, the form, three pages and the REST API. Both schema changes have a smaller change that is still correct:

- **Travelers lives in `budget_config` jsonb, not a new column.** `TripBudgetConfig` (`db/schema.ts:118-127`) is already the per-trip budget jsonb. The plan already puts the Travelers input in the budget settings form. Per-person is the only consumer. `budget` already flows through REST PATCH (`api/v1/trips/[tripId]/route.ts:63` → `parseBudgetConfigInput`), import (`import-sections.ts:80`) and GET (`trip-queries.ts:254`). One parser change therefore covers the web form, the API and import, with no DDL. Other derivations were checked and rejected: hotel `guests` is per room (the seed has 2 per room on a "4-traveler" trip, `seed-trip.ts:56`); `collaborators` is decorative and seed-only (only `seed.ts:37` writes it, and the importer writes `[]`); members alone miss families that share one account.
- **Dedupe by merging, not linking.** Spec §4.4 asks for "รวมกับ booking" (merge with booking). The booking already holds the amount, so merging = soft-deleting the logged copy with the existing `removeExpenseAction` (`actions/expenses.ts:129`). This removes the FKs, the CHECKs, `expense-booking-link.ts`, the service and action changes, the form select, `editable-expense` and three page edits. It also makes the pairing tie-break irrelevant to the totals. The cost: the duplicate row's label, note and `at` are lost. `paidBy` and splits are not surfaced anywhere in the UI (`grep paidBy` finds only services and seed), and "Split bills" is a no-op (`budget-view.tsx:184-188`). The expense form already warns at entry time (`expense-form.tsx:266-277`), so no forward-prevention UI is needed.

Both alternatives are **applied as the plan's defaults**. The original designs stay in the plan's *Decision needed* as alternatives, so the user can revert either one.

## Findings

### B1. Blocker: the link design let the importer write cross-trip FK links (applied by removal)

- **Finding:** Task 4 added `hotelBookingId`/`transportBookingId` to `EXPENSE_FIELDS`, and the ownership check lived in `createExpense`/`updateExpense`.
- **Why it matters:** `parseExpenseInput` (`expense-service.ts:90-107`) is shared with the plan importer (`import-sections.ts:102`). `import-service.ts:104-107` inserts `e.values` directly, with no ownership check. An agent import could link an expense to another trip's booking. The FK checks only that the row exists. That expense would then be excluded from totals, or would leak a booking label through `countedIn`. Agents also can't know booking ids inside an atomic import anyway.
- **Evidence:** the trace from `POST /trips/import` → `parseImportPlan` → `parseExpenseInput` → `tx.insert(expenses).values({...e.values})`.
- **Change:** removed by the merge default. If the user picks the link alternative, keep the link fields out of `parseExpenseInput` and reject them in import. This is noted in Decision 2. **Applied.**

### B2. Blocker: `trips.travelers` was unreachable from the REST API and import (applied)

- **Finding:** with the column design, `GET /trips/:id` would expose `travelers` (via the `...trip` spread, `trip-queries.ts:249`), but `UpdateTripInput` (`trip-service.ts:56-70`), the PATCH route and the import trip section would not accept it. The plan touched none of them.
- **Why it matters:** the API-first agent flow (API-AGENT-UX epic) could create trips with a `per_person` budget, but could never set the divisor. `import-warnings.ts:166-167` already skips `per_person` because "no traveler count" exists.
- **Change:** `budget.travelers` rides on the existing `parseBudgetConfigInput`. `import-warnings` now uses it. The SKILL.md and API.md docs are added to Task 6. **Applied.**

### M1. Major: suggestions were not one-to-one, so the total could under-count (applied)

- **Finding:** the rule allowed "at most one suggestion per expense", but put no limit per booking.
- **Why it matters:** take two logged $540 expenses and one $540 booking. Both expenses get suggested against the same booking. Accepting both removes $1,080 when only $540 was duplicated. This applies to link mode and merge mode alike.
- **Change:** one-to-one greedy matching, in a deterministic order, plus the test `a booking absorbs at most one expense`. **Applied.**

### M2. Major: two migrations, and a numbering collision with telemetry on the shared Preview DB (applied)

- **Finding:** the plan generated `0022` (DDL) + `0023` (backfill), and the telemetry plan also generates the next index.
- **Why it matters:** `drizzle-kit migrate` applies a journal entry only if `when > last created_at` (`node_modules/drizzle-orm/pg-core/dialect.js:62`). Preview DB is shared by every branch, and preview builds migrate non-fatally (`package.json` `vercel-build`, TP-0050). Suppose a branch's migration with a newer `when` lands on Preview first. Then an older-stamped migration merged later is **silently skipped** there. And re-generating a migration that already ran would fail non-idempotent DDL.
- **Change:** the budget plan now has a single **data-only, idempotent** custom migration (guarded by `budget_config->'travelers' IS NULL`). Task 1 Step 3 spells out the renumber rule: the second to merge deletes its sql + snapshot + journal entry and re-runs `db:generate`, never hand-editing indexes. **Applied.**

### M3. Major: the no-budget banner is also rewritten by the ux-copy-glossary plan (cross-plan, resolved)

- **Finding:** `2026-10-29-ux-copy-glossary.md` Task 2 edits the same block (`budget-view.tsx:262-271`), with the same EN copy, but keeps the `canEdit` link. Editors would still be sent to the owner-only settings page, which `notFound()`s.
- **Resolution:** **budget-correctness owns the banner** (structure, `isOwner` action, tone). ux-copy-glossary keeps only the TH strings for it and drops its `budget-view.tsx` banner edit if budget lands first. If copy lands first, budget rebases onto it and still fixes the href. Confirmed by `2026-10-29-ux-copy-glossary.scrutiny.md` M1, which removed the banner from the copy plan (see the appended Cross-plan section below).

### m1. Minor: `.info` tone change is global

- `tone="info"` has exactly one user (`budget-view.tsx:263`), so `alert.module.css:28` → `--muted` has no other visible effect. Verified by grep. No change.

### m2. Minor: `API.md` is stale

- `API.md:181` lists PATCH trip fields without `budget`/`currency`/`sourceUrl`, and `:168` says expenses aren't importable. Both were shipped in TP-0040. The agent-facing contract is `agent-skill/travel-planner-api/SKILL.md:209`. Task 6 now updates SKILL.md first and mirrors `budget` into API.md. Fixing the rest of API.md is out of scope; a follow-up is suggested.

### Verified claims

- Seed totals: bookings $7,144 (hotels 2,020 + transport 5,124), expenses $1,731, total $8,875. After merging Park 380 + Tenseien 540 + Car 88 = $1,008, the total is **$7,867** (`seed-trip.ts:56-160`). ✓
- The hub travelers count is `collaborators.length + 1` (`trip/[id]/page.tsx:97`). The budget count is editors + owner (`budget/page.tsx:56-83`). ✓
- The "Set a budget" link goes to the owner-only settings page, and editors get `canEdit` (`budget-view.tsx:261-272`). ✓ (real bug)
- `pct` is rounded then clamped (`budget-view.tsx:361`), so $22 of $8,875 → "0%". ✓
- `removeExpenseAction` exists, takes `expenseId`, soft-deletes through `removeExpense`, and revalidates the budget path. ✓
- `loadBudgetForTrip` already selects booking `label`/`date` and expense `label`/`at`. No query change is needed for suggestions. ✓

## Left for the user

- Decision 2 (merge vs link) and Decision 1 (jsonb vs column) were applied with the smaller defaults. Revert to the alternatives only if a lossless payment record (merge loses the logged row) or a typed column matters more than the smaller surface.

## Verdict

**fix-then-ship.** Fixes are applied: both schema changes are gone, the importer hole is closed by construction, and suggestions are one-to-one. The biggest original risk was an FK link reachable through the unchecked import path.

## Cross-plan (appended by the telemetry/copy scrutiny, 2026-10-29)
- **Migration order is settled:** budget-correctness merges first and takes the next free index (`0022` at HEAD). `research-usability-telemetry` generates its `ui_event` migration only after this plan is on `main`, using the next free index (`0023`). It never pushes a migration-bearing branch before that, so its newer `when` can't reach the shared Preview DB ahead of budget's backfill.
- **Banner ownership confirmed:** `ux-copy-glossary` has dropped its `budget-view.tsx` banner edit. It now changes only `budget-view.tsx:69` (category label `Hotels` → `Stays`) and `:129` (`rides` → `transport bookings`). These are string-level edits in lines this plan's Task list doesn't own (`:174` and the hero/category blocks are different lines), so the conflict, if any, is a trivial rebase.
