# Scrutiny: Leg detail sheet design (2026-11-05)

Reviewed: `docs/superpowers/specs/2026-11-05-leg-detail-sheet-design.md` against `app/src` at main `88f0e31`. Read-only review.

## 1. Intent

**Goal (one sentence):** let users view and edit a leg's mode, duration and free-text note from one sheet, opened from the list's between-stops bar or from a route line on the map, so agents and users stop inventing fake `transit` "places" just to have somewhere to put travel notes.

### Simpler-alternative pass

| Alternative | Cost | Verdict |
|---|---|---|
| **A. Keep the inline `SegmentModePicker`; turn the existing `segNote` button (plus a "+ note" affordance for editors when empty) into a launcher for a `LegNoteModal` cloned from `place-note-modal.tsx` (note + duration only), saving via `setPlaceArrive`.** | Smallest. Mode stays one tap. None of the ~13 e2e tests that drive the inline picker change. | Cheaper and lower risk, but it ignores the user's explicit choice of layout A (one-line bar, picker inside the sheet, §6 item 1). Keep it as the fallback if the e2e migration (M5) turns out too expensive. |
| **B. Unified sheet for all 4 kinds** (the spec) | For `hotel arrival/departure` legs the sheet is only a mode picker plus Navigate inside a modal. It exists so the bar can be one line everywhere. | Acceptable given the user's choice. It is not over-engineered, but the hotel-leg variant is the least useful part. |
| **C. Smaller map path:** show the note in the phone carousel connector (`map-stop-carousel.tsx:290`, which already renders per-leg Navigate with `leg.slot`) instead of a modal on arc tap | Needs the same `MapLeg` data extension as the spec (B1). It also avoids a scrim over the map and history/back problems (N2). | Worth considering for phone. Desktop would still need the arc tap. |

Conclusion: the direction is sound and matches what the user asked for. The spec understates the map work and leaves the write path ambiguous. Neither needs a rethink, but both must be fixed in the spec before planning.

## 2. Trace summary

- **Where legs render:** `page.tsx:184` `augmentDayWithHotels` maps `dayLegs()` into `AugmentedSeg`. That step drops the leg kind: `start` and hotel legs become `synthetic` rows with a pre-bound `setModeAction`, and `null` legs render nothing. The rows flow to `days-accordion` → `sortable-place-list` → `SortableItem`/`StaticItem` → `Segment`. Every kind reaches the list (start, hotel departure, hotel arrival, segment). Hotel stops are synthetic `DisplayPlace`s with id `hotel-<id>-begin|end`.
- **`dayLegs` (`day-augment.ts:127`):** there are 5 outcomes, not 4. `start` is produced only when `r>0` and for the *last* begin hotel. `hotel departure` covers earlier begin hotels **and every leg on a day with 0 real places** (begin → end hotel). `hotel arrival` uses `endHotels[k].arrivalMode`. `null` means a real-place gap with no segment row.
- **Write services:** `setPlaceArrive` (`leg-service.ts:290`) runs in one transaction: `resolvePlaceWrite` → `lockDay` → `liveOrder` → `writeArrive`. Position 0 writes `day.start_*`; position ≥1 upserts `segment[idx=p-1]`. A `null` arrive at position 0 clears **start_mode too**. `setSegmentMode` (`segment-service.ts:41`) is positional by a client-supplied `idx`, has no transaction and no day lock. `setHotelLegMode` writes the hotel row.
- **Map:** `routeArcs` (`map-route.ts:117`) → `RouteArc{key:"a>b", toId, toPin, mode, color}`. Renderers call `onSelect(toId)` and `PersistentMap.selectLeg(toId)` only selects the stop. `MapLeg` is `{from,to,mode,slot}` (pin positions). There is no kind, hotelId, note or duration.
- **canEdit:** computed twice, `page.tsx:61` for the list and `layout.tsx:98` for `PersistentMap`. Viewers and pre-hydration editors get `StaticItem` (`sortable-place-list.tsx:215`), which renders `Segment` **without** `dayId`, `idx` or `setModeAction`.

## 3. Findings

### Blocker

#### B1. The map tap cannot identify the leg or show its note. "Via the existing `onLegSelect`" is not enough (spec §3.3 l.64–67, §5 l.84)
- **Why it matters:** goal 3 (sheet from map) cannot be built from what the renderer passes today. The spec says no data changes are needed ("ข้อมูลและ API มีครบแล้ว", l.23), which is false for the map half.
- **Evidence:** `map-route-google.tsx:91/99` and `map-route-maplibre.tsx:89` call `onSelect(arc.toId)`, and `persistent-map.tsx:108` `selectLeg(id)` only navigates. `MapLeg` (`map-helpers.ts:22`) is `{from,to,mode,slot}`. `MapDay` (`day-augment.ts:243`) has no note, durationMin, leg kind or hotelId. `buildMapLegs` drops `dayLegs` down to `mode`. The display index *can* be derived (`toPin.idx - 2`, since `Pin.idx` = display position + 1), but the kind, ids and note cannot. On top of that, the map lives in `layout.tsx` and the list in `page.tsx`, so a sheet shared by both needs a provider at layout level, not a hook local to the list.
- **Suggested change:** spec a `MapLeg` extension built in `buildMapLegs` from `dayLegs`: `{ i, kind, fromId, toId, hotelId?, hotelLeg?, note, durationMin }`. Change `onLegSelect` to pass `(toId, legKey)` or the leg itself. Put the sheet host and context in the trip layout. Feed `canEdit` from the layout's `canWrite(role)`, and add a list-side `openLeg(descriptor)` that uses the same descriptor type. Change the `map_leg_go` badge label ("Go to {name}"), since the tap now also opens a sheet.

### Major

#### M1. The write path contradicts itself: §5 (l.82) "segment uses the segment service" vs §6.1 (l.100) "must call `writeArrive`/`applyPlaceArrive`"
- **Why it matters:** if the build does mode through `setSegmentModeAction` (positional `idx` from the client, no transaction) and note/duration through `setPlaceArrive` (by `placeId`, locked), a reorder between or during the two writes puts mode and note on **different legs**. The stale check would guard only one of them, and it doubles the audit rows.
- **Evidence:** `segments.ts:26–40` takes `dayId+idx` from FormData. `segment-service.ts:41–60` has no `lockDay`. `writeArrive` already writes mode, note and duration together (`leg-service.ts:236–239`) and inserts a missing row (l.242).
- **Suggested change:** state one rule. For `segment`, `start` and `null` legs, make **one** `setPlaceArrive(userId, toPlaceId, {mode,durationMin,note}, {expectFromId})` call. For hotel legs, call `setHotelLegMode`. Parse the action input with `parseArrive` (convert FormData to an object) so the limits and the trim/empty→null behaviour are identical to the API.

#### M2. Clearing on the start leg: the §6.1 table row "ล้างโน้ต/เวลา → DELETE" is wrong for `start` (l.103)
- **Why it matters:** `DELETE` on the day's first place clears `start_mode` as well (`leg-service.ts:211–217`, route comment l.4–5, API.md:210). That silently resets the user's start mode. Separately, any sheet save on a start leg pins `start_mode` to whatever is displayed. Before the save, that value was inherited (`startMode ?? hotel.departureMode ?? defaultMode`, `day-augment.ts:153`), so a later change to the hotel's `departureMode` no longer reaches that day. This is a silent semantic change.
- **Suggested change:** the sheet never sends `null` or DELETE. It clears by sending `PUT {mode, durationMin:null, note:null}`. Fix the table to say "DELETE: segment keeps its mode; start clears all three". Accept the pinning explicitly in §5, or skip writing `startMode` when it is unchanged and was inherited. That second option is a new service flag, so say so.

#### M3. The stale-sheet check is feasible but needs a service change and has gaps the spec does not cover (§5 l.83, §6.1 l.105)
- **Evidence:** inside `setPlaceArrive`'s transaction the day is locked and `liveOrder` is read, so checking `order[pos-1] === fromId` is cheap. It needs a new optional precondition parameter, though; wrapping the existing function is not enough. The check splits by kind:
  - **`start`:** `fromId` is a hotel and not in `liveOrder`. The only check available is `order[0] === toId`. Hotels are not locked by `lockDay`, so a hotel date change while the sheet is open goes undetected. That is low risk.
  - **Hotel legs:** no positional identity, so no check is possible. Mode-only, so acceptable.
  - **Optimistic reorder:** `sortable-place-list.tsx:188` reorders `places` locally but `segments` stays the server prop until revalidation. In that window the bar shows the wrong note for the pair. A sheet opened then sends a pair the server has not committed yet, which produces a spurious "plan changed" error, or a wrong-leg write if the check is skipped.
- **Suggested change:** spec a `ServiceError('conflict', …)` with an explicit code mapped to the "plan changed" message. Disable opening the bar or sheet while `pendingMoveId != null`. List the per-kind check rules.

#### M4. The viewer, pre-hydration and "No location" paths are not covered (goal 4, l.31; §3.1)
- **Evidence:**
  - `sortable-place-list.tsx:215`: `!mounted || !canEdit` → `StaticItem`, which renders `Segment` without `dayId`, `idx` or `setModeAction` (`sortable-place-item.tsx:417–427`).
  - `AugmentedSeg` (`page.tsx:154`) has no `kind`, `hotelId` or `leg`.
  - The `missing` branch of `Segment` (`segment.tsx:99–124`) is a different chip with a "Fix location" link. The code comment there notes that the leg note is "often the only travel info" on such legs, yet the spec does not say whether that chip opens the sheet.
- **Suggested change:** carry a leg descriptor (`kind`, `toPlaceId`, `fromId`, `hotelId`, `hotelLeg`) on `AugmentedSeg`. Make `StaticItem` open the read-only sheet. State that the "No location" chip opens the sheet too, with Navigate hidden and "Fix location" kept as a sibling.

#### M5. Removing the inline picker breaks a large set of e2e tests, and the §7 test plan ignores it (l.114)
- **Evidence:** `app/e2e/mobile-layout.spec.ts`:
  - The `legsOf` helper reads `[role=group] button[aria-pressed]` (l.1861).
  - TP-0141 tests use the picker or expand the note in place: l.1924, 1957, 1982, 2005 (`aria-expanded` expand-in-place), and the TP-0150 tap-box geometry tests l.2061 and 2081, which encode the current note-versus-Navigate layout.
  - The sync/fresh-data tests click inline mode buttons: C0 revalidation l.2175, l.2233 "selecting while a save is in flight", l.2351, l.2382, l.2483 "two days saving at once", l.2511 "one tap during a save".
  - Map L2 (l.2940, "second tap keeps it") will now hit the modal scrim on the second tap.
  - Several of these are **concurrency** tests built on a one-tap save with the map still interactive. Behind a modal with a scrim they need redesign, not just new selectors.
- **Suggested change:** add an e2e migration section to the spec: which tests are rewritten through the sheet, which are retired (expand-in-place, tap-box geometry), and which concurrency scenarios still matter. Budget for it in the plan.

#### M6. A hotel leg's mode belongs to the hotel, not the leg, and the §5 leg taxonomy is inaccurate (l.79)
- **Evidence:**
  - `setHotelLegMode` writes `hotelBookings.arrivalMode/departureMode` (`segment-service.ts:79–81`). That value drives the arrival leg on **every night** of the stay (`day-augment.ts:162`). A sheet titled "A → Hotel · Day 3" that changes days 1–5 is misleading.
  - `hotel departure` is not "only when hotels overlap" (เฉพาะกรณีโรงแรมซ้อน). It is also the only leg on a day with 0 places (b=1, r=0, e=1 → `i<b` branch).
  - `dayLegs` also returns `null` legs (a gap with no segment row). The map still draws a line for those (`mode:null`, no badge), and the spec does not say what the sheet shows for them.
- **Suggested change:** show a caption in hotel-leg sheets ("applies to every day of this stay"). Correct the taxonomy to 5 cases. Have `null` legs open an editable segment sheet (`writeArrive` inserts the row) that defaults to `day.defaultMode ?? 'drive'`.

#### M7. API parity for hotel legs is not "the same service", and the field is unvalidated on PATCH (§6.1 l.102)
- **Evidence:** `PATCH /hotels/:id` → `patchHotel` (`hotel-link.ts:159`) → `updateHotel` (`booking-service.ts:97`) → `pick(body, HOTEL_FIELDS)` with **no enum check** on `arrivalMode`/`departureMode`. Only `parseHotelFields` validates them (`hotel-input.ts:67`), and that runs on create. An invalid value probably reaches the DB enum and returns 500 instead of 400. The audit also differs: `updateHotel` writes no `after`, while `setHotelLegMode` writes `{leg,mode}`.
- **Suggested change:** before documenting the fields in API.md and SKILL.md, validate `MODE_FIELDS` in `patchHotel`, with a test. Relax the "same service" wording for hotel legs, or route PATCH mode-only bodies through `setHotelLegMode`.

### Nit

- **N1. "durationMin wins in API output too" (§6.1 l.106) has nothing to act on.** The API returns raw `segments[].time`/`durationMin` and `arrive` (no `time`), so there is no "displayed time" in the API. The only renderer is `segment.tsx:148` (`time || approx` → flip). Drop the API clause or define a derived field, which would be scope creep.
- **N2. Phone Back with the sheet open over the full map.** `Modal` owns no history entry, while the phone full map does (`persistent-map.tsx:96`). Back would close the map with the sheet still up, or unmount the sheet and lose edits, which violates "แก้แล้ว…หายเงียบๆ". Specify one: Back closes the sheet first, or the discard-confirm runs.
- **N3. Keyboard and focus from the map.** Route badges are `tabIndex={-1}` (`map-route-badge.tsx:35`) and polylines cannot take focus, so the map entry is pointer-only and `Modal` restores focus to `body`. That is acceptable because the list bar is the keyboard path, but write it down.
- **N4. Bar markup.** "The whole bar (except Navigate) is a button" must be built as a sibling `<button>` plus `<a>`; a link nested inside a button is invalid. The row's `onPointerUp` already ignores `button`/`a` targets, so tapping the bar will not also activate the row. Good.
- **N5. Limits.** Use `ARRIVE_NOTE_MAX = 500` (counted after trim) and `ARRIVE_DURATION_MAX = 2880`, integer ≥ 0 (`legs.ts:3–4`). Name them in the spec instead of "ผู้สร้างตรวจ". Decide how `durationMin = 0` displays.
- **N6. Colour.** `--leg` is already set on the row (`sortable-place-item.tsx:197`), so the bar inherits it. Legs with `legSlot == null` (stop without coordinates, or under 10 m) have no colour. Specify a neutral fallback.
- **N7. Guards.** `i18n-messages.test.ts` already enforces en/th parity. The raw-colour ratchet needs 0 raw colours in new files, and `sortable-place-item.tsx` is `STRICT_PALETTE`. `place-note-modal.tsx` uses inline `style={{…}}` numbers, so do not copy that pattern into a new file if the design tokens are expected.
- **N8. Test plan gaps (§7).** Add service and integration tests for:
  - (a) the stale-pair rejection;
  - (b) a start-leg clear keeping `start_mode`;
  - (c) a hotel-leg mode change affecting all nights;
  - (d) a `null` leg save inserting a row;
  - (e) the viewer read-only sheet from **both** list and map;
  - (f) the e2e migration list from M5.

  Run e2e targeted (`pnpm e2e:mobile` grep on 1–2 projects).

## 4. Verdict

**fix-then-ship.** The direction is right. Before writing the plan, revise the spec for the map data model (B1), a single write path with a precondition (M1/M3), start-leg clear semantics (M2), viewer, static and no-location coverage (M4), and an explicit e2e migration (M5).

---

## Re-review (round 2, after the spec revision: new §7 plus inline edits to §1, §5 and §6.1)

### Status per finding

| # | Status | Note |
|---|---|---|
| B1 map data | **Resolved** | §7.1 extends `MapLeg` from `dayLegs`, makes `onLegSelect` pass the leg descriptor, puts the host in the layout, takes edit rights from the layout's `canWrite`, and renames `map_leg_go`. Leftover: §3.3 l.66 still says "ผ่าน `onLegSelect` ที่มีอยู่". §7 overrides it, but fix the text to avoid misreading. |
| M1 single write path | **Resolved** | §5 l.82: one `setPlaceArrive` call carrying mode, duration and note, parsed with `parseArrive`; hotel legs use `setHotelLegMode`. |
| M2 start-leg clear and pinning | **Partly. The new flag introduces a contradiction (R1)** | The clear-via-PUT rule (§6.1 l.103) is right. The "don't pin `start_mode`" flag (§7.2) conflicts with the code. See R1. |
| M3 stale check | **Partly (R2, R3)** | The per-kind rules are right. The name `expectFromId` fits only one kind. The error mechanism does not survive production builds. |
| M4 list, viewer, static path, no-location chip | **Resolved, with one wording gap (R4)** | |
| M5 e2e migration | **Resolved** | §7.6 lists the tests and requires the migration to be budgeted in the plan. |
| M6 hotel legs and the 5 cases | **Resolved** | §5 l.79 now lists 5 kinds, and `null` legs open an editable sheet. §7.5 adds the "applies to every day of this stay" caption. That caption covers `departureMode` too, which is also per hotel. |
| M7 PATCH hotel validation | **Resolved, with one nit (R5)** | |
| N1 time rule in the API | **Resolved** | §6.1 l.106. **But** §3.1 l.48 still says `time` wins, then `durationMin`, which contradicts §5 l.81 (R6). |
| N2 phone Back | **Partly (R7)** | |
| N3 keyboard | **Resolved** | Accepted in §7.8. |
| N4 bar markup | **Resolved** | §7.4. |
| N5 limits | **Resolved** | §7.9. A `0` is hidden on the bar; also say what the sheet field shows for it (an empty field or `0`). |
| N6 colour | **Resolved** | `--border-strong` and `--muted` exist (`globals.css:31/34`). |
| N7 guards | **Resolved** | §7.11. |
| N8 tests | **Resolved, but one test asserts the R1 behaviour** | See R1. |

### Problems introduced by the fixes

**R1 (major): the "don't pin `start_mode`" flag (§7.2) contradicts the code and the parity rule in §6.1.**
- **`writeArrive` cannot express it today.** `writeArrive(exec, dayId, position, arrive: ArriveInput|null)` at position 0 always writes `startMode: arrive.mode` (`leg-service.ts:211–216`). The flag has to reach `setPlaceArrive` → `applyPlaceArrive` → `writeArrive`. For position > 0 it must be ignored or rejected, and nothing in the spec says which.
- **It hides the note from the API and MCP.** On a day with `start_mode = NULL`, saving only a note or duration leaves `startMode` null. But `dayStartView` returns `null` whenever `startMode === null` (`legs.ts:70`). It is used by `legDayView` (`legs.ts:113`, which feeds `loadApiTrip` → `GET /trips/:id` `days[].start` and the first place's `arrive`) and by `readArriveView` (`leg-service.ts:286`). So the web list shows the note (`dayLegs` reads `d.startNote` directly, `day-augment.ts:154`), but the API reports `start: null` and `arrive: null`. `setPlaceArrive` also returns `arrive: null` to the action. That breaks §6.1's own parity test (l.107): action and route give the same result.
- **The API cannot send the flag.** `parseArrive` requires `mode`, so the API has no "leave mode inherited" option. That breaks "ทุกอย่างที่แผ่นแก้ได้ ต้องทำได้ผ่าน REST API".
- **The client cannot tell when to send it.** `DayLeg` `start` carries only the resolved `mode` (`day-augment.ts:153`). The descriptor needs a `modeInherited: d.startMode == null` bit, which neither §7.1 nor §7.4 lists.
- **The benefit is small.** `setDayDefaultMode` already hard-overwrites `start_mode` (`segment-service.ts:100`). Pinning only stops a later hotel `departureMode` change from flowing into that one day.
- **Suggested change (pick one):**
  - **(a, recommended)** Drop the flag. Accept that saving the start leg makes its mode explicit, the same as `PUT /arrive` does today, and say so in §5. Also drop the matching N8 test ("บันทึกแบบไม่เปลี่ยน mode ไม่ตรึง `start_mode`").
  - **(b)** Keep the flag, but then also change `dayStartView` so it returns `{mode: effective, …}` when there is a note or duration with a null `startMode`. That needs the hotel's `departureMode` and the day default inside `legDayView`. Also add an API equivalent: `mode` optional in `parseArrive` for the first place. That is noticeably larger scope.

**R2 (minor): the `expectFromId` name and shape don't fit `start`.**
- For `start` the check is `order[0] === toId`. The "from" is a synthetic `hotel-<id>-begin` id that never appears in `liveOrder`.
- The check is still needed: `applyPlaceArrive` writes at `indexOf(toId)`, so if `toId` is no longer first, a start-leg save would silently land on a segment row.
- **Suggested change:** a discriminated precondition such as `expect?: { at: 'start' } | { after: placeId }`. Map a missing `toId` (`not_found` from `placeDay`, `leg-service.ts:259`) to the same "plan changed" message.

**R3 (major): "`ServiceError('conflict','leg_changed')` → show 'แผนของวันนี้เปลี่ยนไปแล้ว…'" cannot work if the action throws.**
- In production Next strips a thrown action's message down to a digest (`lib/action-result.ts:3–6`, `lib/action-errors.ts:1–4`). The client can never see `leg_changed`.
- **Suggested change:** the sheet action returns `ActionResult` (`{ok:false, message}`), or a typed `{ok:false, code:'leg_changed'}`, following the repo contract in `action-result.ts`. It must not throw. Put this in §7.3 and §8: the single action is the natural place for it.

**R4 (nit): the `StaticItem` path is fine once the descriptor rides on the segment, so say so.**
- `StaticItem` renders `Segment` without `dayId` or `idx` (`sortable-place-item.tsx:417–427`). Under §7.4 it does not need them, because the descriptor arrives on the `segment` prop (`AugmentedSeg`).
- State that `Segment` takes `leg` (the descriptor) instead of `dayId`/`idx`/`setModeAction`, and that `StaticItem` passes it through.
- `StaticItem` is used for viewers and for editors before mount (`sortable-place-list.tsx:215`). Before hydration no click can open anything anyway, so "read-only" there in effect means viewers. Gate it on `canEdit`, not on which component renders the bar.
- The `pendingMoveId` guard lives only in the sortable list. The map opens from server data, so it is unaffected, and the server check covers it.

**R5 (nit): §4 l.73 still says "same service as the API … audit แบบเดียวกัน".** §6.1 l.102 now accepts a different service and audit for hotel legs. Align §4 with that exception.

**R6 (minor): §3.1 l.48 contradicts §5 l.81 on time precedence.** §3.1 says `time` wins, then `durationMin`; §5 says `durationMin` wins over `time`. Fix l.48.

**R7 (minor): "Back closes the sheet first" (§7.7) needs a history design.**
- `Modal` owns no history entry.
- The phone full map already manages history: push vs replace in `persistent-map.tsx:96`, plus the C0 tests "selections do not stack" and "Back closes the map on the last one".
- An arc tap both selects the stop (push or replace) and would push a sheet entry. Specify the order (select with replace, then push the sheet entry). Specify what closing the sheet by ✕ or the scrim does to that entry (`history.back()`). Specify whether a sheet opened from the **list** also pushes an entry, for consistency.
- Add a C0-style e2e for it.

### Re-review verdict

**fix-then-ship.** Everything from round 1 is resolved except M2, M3 and N2, which are partly done. Before the plan, resolve R1 (drop the no-pin flag, recommended) and R3 (the action returns a result instead of throwing). Fix R2, R6 and R7 in the spec text, along with the stale §3.1 and §3.3 lines and §4 l.73 (R5).
