# Scrutiny: TP-0155

**Intent:**
- deleting a day is atomic;
- bookings and expenses keep pointing at the same content, or at nothing.

**Simpler alternative:** only wrap the existing statements in a transaction and skip the shifting.
- That leaves the documented wrong-day bug in place for expenses, hotels and rides.
- The three UPDATEs are cheap. Keep both changes.

**Trace:**
- `resolveDayWrite(userId, dayId, exec)` accepts an exec, so authz runs inside the tx.
- `deriveDayDate` / `rederiveShiftedDays` are pure.
- Callers:
  - `app/actions/days.ts:30` uses the returned `targetIdx`;
  - `app/api/v1/days/[dayId]/route.ts:13` uses the returned `tripId`;
  - the return shape is unchanged.
- **Lock order:** trip days are locked `ORDER BY idx`, the same order as PUT /plan, so the deadlock noted in round-2 N3 goes away.
- **Expense `day_idx = null`:** budget per-day views treat null as "unassigned", the same as a never-assigned expense. **Accepted.**

**Verdict:** ship.
