# TP-0155: `removeDay` in one transaction and shift `dayIdx` references

## Today
In `lib/services/day-service.ts:139`, `removeDay` runs five or more autocommit statements:

1. DELETE the day; places and segments cascade.
2. Park the later days at negative idx.
3. Flip them back down one position.
4. Re-derive their dates.
5. `touchTrip`.

This causes two problems:
- **No atomicity.** A failure part-way through leaves a gap in idx, and readers can see a half-applied state. The park UPDATE also locks days in physical order, so it can deadlock with PUT /plan, which locks `ORDER BY idx`.
- **Stale references.** `expense.day_idx`, `transport_booking.day_idx` and `hotel_booking.day_idx` are positions, and they are never shifted. After deleting day 3, an expense on day 5 points at what was day 6.

## Rules for references after removing day `k`

| Row | dayIdx = k (the removed day) | dayIdx > k | dayIdx < k |
|---|---|---|---|
| expense | `null` (unassigned; the expense itself is kept) | `dayIdx − 1` | unchanged |
| hotel_booking | `null` | `dayIdx − 1` | unchanged |
| transport_booking **with `fromDate` on a trip with a start date** | `null` | `null` | unchanged |
| other transport rows | `null` | `dayIdx − 1` | unchanged |

**Why dated rides go to `null`** (design question M1, TP-0146 scrutiny):
- `rideOnDay` (`day-augment.ts:218`) falls back to `fromDate` when `dayIdx` is null.
- Every later day's date is re-derived to an earlier calendar date. A ride shifted to `dayIdx − 1` would therefore land on a different date from its own `fromDate`.
- Clearing `dayIdx` lets the ride sit on the day whose date matches. If no day has that date, it simply doesn't show, which is honest.

Soft-deleted rows are shifted too, so that `restore*` doesn't bring back a stale idx.

## Change
- `removeDay(userId, dayId, txDb = dbNode)` runs everything in one transaction:
  1. `resolveDayWrite` (authz).
  2. Lock **all** of the trip's days `FOR UPDATE ORDER BY idx`.
  3. DELETE the day.
  4. Park and flip the later days, using the same two-phase pattern as today.
  5. Re-derive dates.
  6. Apply the three `dayIdx` updates.
  7. `touchTrip(tx)`.
- Audit runs after commit.
- Callers (the web action and `DELETE /days/:id`) don't change.

## Tests
Integration on tp-test-pg:
- idx is contiguous afterwards and dates are re-derived;
- expense and hotel references are shifted, and those on the removed day become null;
- a dated ride gets null and an undated ride is shifted;
- refs earlier than k are untouched;
- a write by a viewer is rejected.
