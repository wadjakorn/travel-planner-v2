# TP-0150 — TP-0141 follow-ups: note tap target + segment-row invariant

> 2026-11-04 · ticket **TP-0150** (epic TP-0138) · stacked on PR #150 (`feat/tp-0141-legs-arrive`)
> Worktree `../travel-planner-v2-tp-0150` · branch `fix/tp-0150-legs-followups`
> Status: **plan v2 · scrutinized (verdict fix-then-ship; all findings folded in, see §3)**

Two small fixes found by the TP-0141 final review. Both land in one PR that merges right after #150.

---

## 1. The note's tap box overlaps Navigate's (coarse pointers)

### Problem
- The leg note button (`components/segment.tsx:91`) uses `.tp-hit`. That class adds an invisible `::after` (`app/globals.css:448-459`), `max(100%, 44px)` tall and centred on the element.
- The note is one ~17 px line, so the box reaches ~13 px above it. With the 8 px row gap (`.segment { gap: 8px }`), that is ~5 px into the chip.
- The chip holds Navigate, which is also `.tp-hit` (`segment.tsx:156`). The two boxes' centres are ~30 px apart, but the rule in `globals.css:441-443` is "callers keep neighbours' expanded boxes apart (centre-to-centre ≥ 44 px)".
- The note comes later in the DOM, so a tap in the overlap toggles the note instead of opening Navigate.

### Fix
Remove `.tp-hit` from the note button. Instead, give the button itself a real 44 px box on coarse pointers, inside `.segment`'s existing `@media (pointer: coarse)` block in `components/itinerary-list.module.css`:

```css
@media (pointer: coarse) {
  .segNote { min-height: 44px; display: flex; align-items: flex-start; margin-top: 4px; }
}
.segNoteText { min-width: 0; } /* explicit, not relying on overflow:hidden's auto min-width */
```

- `align-items: flex-start` keeps the text 8 px (+4) under its chip instead of floating ~21 px below it; the extra height falls inside the note's own row.
- `margin-top: 4px` covers the worst cases found in review: a viewer chip without the picker (~28 px, Navigate box reaches exactly 8 px below) and a chip that wraps Navigate onto a second line (box reaches ~10 px below). "Fix location" (`segment.tsx:118`) is the same `.tp-hit` and is covered by the same gap.

- The `.segNoteText` span keeps the one-line ellipsis. `display:flex` with `min-width:0` on the span keeps the 360 px no-overflow behaviour. When expanded, the text wraps and the box grows past 44 px.
- **Geometry after the fix:** Navigate's `::after` reaches ≤ ~10 px below the chip in the worst (wrapped) case, which is less than the 8 + 4 = 12 px gap. The note box starts at the gap and does not extend up, so the boxes no longer overlap. Centre-to-centre ≈ chip/2 + 8 + 22 ≈ 48 px ≥ 44.
- **Cost:** on touch screens, a leg that has a note is ~27 px taller (the note line is now 44 px). Desktop and fine pointers are unchanged. Legs without a note are unchanged.
- Remove the now-wrong comment at `segment.tsx:96`.

### Test
Update the existing e2e `TP-0141: a long leg note stays one line on a phone` (`app/e2e/mobile-layout.spec.ts`). It currently asserts the `::after` height ≥ 44. Change it to:
- assert `button.getBoundingClientRect().height ≥ 44` on coarse pointers, and measure the one-line check on the inner `.segNoteText` span (not the button, which is now 44 px for every note);
- **new:** assert the note box does not intersect Navigate's expanded box. Compute Navigate's box as its rect grown to 44 × 44 around its centre, then check the vertical gap between the two boxes is ≥ 0.

- **new:** a leg on a viewer-width chip whose Navigate wraps (long Thai mode label / `tiny-320`) — same no-intersection assertion.

Run only these tests on `small-android`, `pixel-7` and `tiny-320` (one build).

---

## 2. Segment-row invariant after remove / reorder (pre-existing bug)

### Problem
REQUIREMENTS.md:57 says each day has `len = places.len − 1` segment rows. Two paths break it.

1. **Removing the last place** (`place-service.ts` `removePlace`, ~L300-312).
   - The code deletes segment `idx = k` and shifts the higher ones down.
   - When k is the last position there is no row k. Row k-1, the leg into the removed place, survives as an orphan at `idx = n_after - 1`.
2. **Partial reorder lists** (`reorderPlaces` ~L354-365).
   - Places missing from `order` keep `idx + 1_000_000`. They are "parked".
   - After that, raw idx no longer equals live position. `removePlace` and `ensureSegmentForAppendedPlace` (L68-88, `prevIdx = max(idx)`) then delete or create rows at the wrong idx.
   - Legs touching parked places have no row, so the leg UI is missing (`sortable-place-item.tsx:306` renders nothing for a null leg).
   - Leg notes already use live position (TP-0141), so they stay correct. Only rows and modes go wrong.

### Fix
Add one helper and call it at the end of both writers:

```ts
// lib/services/leg-service.ts
/** Restore the day invariant inside the caller's tx (day already locked):
 *  places.idx = 0..n-1 in current idx order; segment rows exactly idx 0..n-2
 *  (missing → insert mode = day.default_mode ?? 'drive', distance/time ''; extra → delete).
 *  Existing rows keep their mode/note/duration (positional, TP-0141 §1.4). */
export async function normalizeDayLegs(tx: IdemExecutor, dayId: string): Promise<void>;
```

- **Compaction:**
  - Read places `ORDER BY idx` (non-deleted).
  - For each place whose idx ≠ its position i, set `idx = -(i + 1)`, then flip the parked negatives to `-idx - 1`. This is the same two-phase trick `removePlace` uses, so it never violates unique `(day_id, idx)`.
  - Place `updatedAt` is not touched by compaction.
- **Rows:**
  - `DELETE … WHERE day_id = $1 AND idx >= n - 1`. This also removes the orphan from §2.1 and anything parked high.
  - Then insert the missing idx in `[0, n-2]`.
- **Split into two steps** (review Major 1: the existing raw-idx delete/shift in `removePlace` is only correct when raw idx = live position):
  - `compactPlaces(tx, dayId)`: the compaction above.
  - `syncLegRows(tx, dayId)`: the row trim/fill above. Inserts use `ON CONFLICT (day_id, idx) DO NOTHING` (review Major 5: `setSegmentMode`/`ensureSegmentForAppendedPlace` run on neon-http without the day lock; a concurrent user value must win instead of rolling the whole remove/reorder back).
  - `normalizeDayLegs` = `compactPlaces` + `syncLegRows` (kept for callers that need both).
- **Call sites** (all inside the existing tx, after `lockDay`):
  - `removePlace`: `readLegSnapshot` → **`compactPlaces`** → re-read the place's idx (now = live position) → existing delete/shift (unchanged) → **`syncLegRows`** → `applyLegRealign`.
  - `reorderPlaces`: `readLegSnapshot` → existing two-phase writes → **`compactPlaces`** (parks become contiguous) → **`syncLegRows`** → `applyLegRealign`.
  - The snapshot comes from `liveOrder` + positional rows before any write, so it stays valid; `applyLegRealign` then maps notes onto the final rows (including newly inserted ones).
- **Soft-deleted places** (review Minor 1): `place_day_idx_unique` covers all rows but `liveOrder` filters `deletedAt`. Nothing soft-deletes places today; `compactPlaces` orders and renumbers **all** of the day's rows by idx (so it can never violate the index), and the row count uses live places. Documented as latent in a code comment.
- **Not changed:**
  - `addPlace` without `arrive` (neon-http, no tx). A day still holding legacy parked places is fixed on its next reorder or remove.
  - `setSegmentMode`.
  - Import, which already writes `n − 1` rows (TP-0141).
- **No data migration.** Bad days self-heal on the next reorder or remove. A one-off backfill is out of scope (unknown size, prod-only).

### Behaviour change (intended, visible)
- **Legacy sparse days** (imported before TP-0141, with no rows) get default-mode rows on their next reorder or remove.
- **What the user sees changes** (review Major 4): today a missing row gives `dayLegs` a `null` leg (`day-augment.ts:158-159`), so the list renders nothing there (`sortable-place-item.tsx:308`) and the map leg has mode `null`. After normalising, those legs gain the chip, mode picker (`day.default_mode ?? 'drive'`) and Navigate link, and the map leg gets a mode. That is the REQUIREMENTS:57 fix, but it is a visible change.
- **API:** for those legs `places[].arrive` changes from `null` to `{ mode, durationMin: null, note: null }` (`arriveForPlaces`, `legs.ts:92-93`).
- **Spec §1.4 is amended in this PR** (review Major 3): "reorder/remove never create or delete rows" becomes "reorder/remove keep surviving rows (same id, same positional mode) and restore `rows = places − 1` by trimming orphans and filling gaps with default-mode rows". REQUIREMENTS:57 gets the same note.

### Tests (integration, `lib/services/leg-service.integration.test.ts`, TEST_DATABASE_URL)
- `remove last place leaves exactly n-1 rows`: start with [a,b,c] and rows 0,1, then remove c. Rows are {0} and row 0 keeps its mode and note.
- `partial reorder compacts parked places and fills their rows`: start with [a,b,c,d] and rows 0..2, then reorder [c,a]. Places are idx 0..3 in order c,a,b,d. There are 3 rows. Rows 0..2 keep their modes positionally. Notes follow their pairs (the existing assertion still holds).
- `remove a parked place from the middle keeps positional modes`: live order c(0), a(1e6), b(1e6+1), d(1e6+2), rows 0..2 with modes drive/walk/transit; remove a. Places contiguous c,b,d; rows {0: drive, 1: transit} (old row 2 shifted to 1), i.e. exactly what removing position 1 of a compact day gives.
- `legacy sparse day gets default rows on reorder`: day.default_mode `walk`, 3 places, no rows. After a reorder there are 2 rows, both `walk`.
- `a day that is already correct is untouched`: no writes; segment ids and modes unchanged.
- `removing down to one place / zero places leaves zero rows`.
- `compaction does not change day.start_*`.
- `syncLegRows uses ON CONFLICT`: insert a row for idx k in a separate committed tx after the snapshot, then run reorder → no error, the concurrently written mode is kept.
- The existing TP-0141 suites (leg-service, places route, import-service) still pass.

---

## 3. Scrutinize log (2026-11-04, outsider review, verdict fix-then-ship)

| finding | severity | resolution |
|---|---|---|
| normalize after `removePlace`'s raw-idx shift drops the wrong row for a parked place | major | compact **first**, re-read idx, then the existing shift; `syncLegRows` at the end |
| geometry fails for viewer chips (no picker) and wrapped Navigate | major | `margin-top: 4px` + `align-items:flex-start`; e2e on `tiny-320` with wrapped Navigate |
| contradicts spec §1.4 "no create/delete rows" | major | spec §1.4 amended in this PR |
| "user sees no change" is false | major | rewritten as a visible, intended change (UI + API `arrive`) |
| new unique-violation race with non-tx writers | major | `ON CONFLICT (day_id, idx) DO NOTHING` + test |
| soft-deleted rows vs unique index | minor | compact all rows; comment |
| e2e one-line check weakened | minor | measure the span, not the button |
| CSS snippet missing `min-width:0` | minor | added |

## Delivery
- **Commits:** two commits on `fix/tp-0150-legs-followups`: `fix(legs): note tap box no longer overlaps Navigate [TP-0150]` and `fix(legs): keep places/segments contiguous after remove/reorder [TP-0150]`. Each ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Docs:** REQUIREMENTS.md:57 gets a parenthetical saying "reorder/remove restore the invariant"; spec §1.4 amended (see above); AGENTS-INDEX gets `compactPlaces`/`syncLegRows`.
- **Verification:** run the affected unit and integration suites, the targeted e2e (one build, one server, `--grep "a long leg note"` on small-android + pixel-7), then `pnpm lint` and `pnpm typecheck` last.
- **PR:** base `feat/tp-0141-legs-arrive`, retargeted to `main` after #150 merges.
