# Scrutiny: itinerary row polish (I1–I7)

Plan: [2026-10-29-itinerary-rows.md](2026-10-29-itinerary-rows.md). Reviewed against `main` @ `6f6f7a2`.

## Intent

Make an itinerary row readable at a glance:
- one meta line with one ellipsis
- one time format
- a kind tile, with the photo shown on expand
- the trip day's opening hours
- an honest "no location" leg that links to the fix
- 32 px mode controls
- a labelled day-collapse bar

### Simpler alternatives considered

- **Format times on the client.** The rows, pin card and carousel would each need the formatter and `lang`. Formatting once at the server boundary (`page.tsx` + `buildMapDays`) is simpler and touches no hot map file. **Plan's approach kept.**
- **Real photos on collapsed rows (the review's literal I3).** Rejected on cost, correctly (Decision 2).
- **Split into two PRs: data helpers (Tasks 1, 2, 4) and visual (Tasks 3, 5, 6).** Reasonable but optional. Each task already has its own commit. **Kept as one plan.**

## Findings

### 1. Major: `buildMapDays` and `page.tsx` collide with `map-route-lines`. *Applied (ownership + order).*

- **Evidence:** route-lines Task 1 rewrites `lib/day-augment.ts:146-189`:
  - pin `idx` becomes the list position
  - adds `legs`
  - moves `page.tsx`'s leg lookup into `dayLegs`

  It keeps the 3-argument signature (its test calls `buildMapDays(trip, [], 'metric')`). This plan adds a 4th argument and edits the pin `time:` line (`:176`) plus the `page.tsx` days map.
- **Resolution:** route-lines lands **first**. This plan owns the signature change: it appends `lang: ClockLang = 'en'`, which defaults safely so route-lines' tests still compile. It also edits only the `time:` line and the `places`/`rides`/`dayHours` part of the `page.tsx` days map. This is written into the plan's Touches and appended to route-lines' scrutiny file if present.

### 2. Major: an orphan segment would render a mode picker for a leg to nowhere. *Applied.*

- **Evidence:** `sortable-place-list.tsx:202-203` passes `segment={segments[i] ?? null}` and `nextPlace={places[i + 1] ?? null}`. A stale segment row after the last stop gives `to = null`. Today `endpointMissing(null)` is true, so it renders "Route unavailable". The new `missingLocation` returns `null` when an endpoint object is absent, so `Segment` falls through to the normal branch and shows a picker.
- **Change:** `Segment` returns `null` when `!from || !to`.

### 3. Major: `days-accordion.tsx` collides with `ds-hex-codemod`. *Applied (ownership).*

Both plans restyle the same collapse bar (`days-accordion.tsx:187-231`), and the codemod also rewrites colours in `itinerary-list.module.css`, which Task 3 restructures. Agreed with the ds-hex-codemod scrutiny: **this plan lands first** and owns the collapse-bar markup. The codemod follows and only removes leftover raw colours. Written into Touches.

### 4. Decision for the user: time format while `getLang()` is forced to `en`. *Left.*

- **Fact:** `getLang()` always returns `'en'` (`lib/i18n.ts:17-19`), so "follows UI language" means **12-hour for everyone** until i18n P6. That includes users whose settings say Thai.
- **Effect:** hotel check-in/out times, stored `HH:mm` from `<input type="time">` (`hotel-form-client.tsx:332`), and ride times change from `15:00` to `3:00 PM` on this PR. Place times are free text that is already 12-hour in the seed (`lib/seed/days.ts:22`) and the placeholder (`place-form.tsx:158`, "3:00 PM"). REQUIREMENTS §4 also shows "8:30 AM".
- **Assessment:** the default matches the spec and the majority of existing data. The mechanism is right, and P6 flips Thai users to 24-hour with no change here. The open question is product-level: do you want Thai users on 12-hour until P6, or 24-hour everywhere now (one constant in `page.tsx`/`layout.tsx`)? **Recommendation: keep the plan's default.** The decision is now spelled out in the plan.

### 5. Nit: signature and line-ref fixes. *Applied.*

- `JSX.Element` → `React.JSX.Element` for `PlaceRowPhoto` and `Segmented`. `@types/react` 19.2.14 has no global `JSX` namespace.
- `usePinPhoto` is at `use-pin-photo.ts:21`, not `:71`.

### 6. Nit: touch targets of the new segmented control. *Applied (note).*

32 px buttons 2 px apart meet WCAG 2.2 2.5.8. Adding a11y-batch's `.tp-hit` (44 px coarse) would make neighbours overlap, so the plan now says not to. The review's A14 list doesn't include the mode control.

## Verified (no change needed)

- **Photo cost claims** match `docs/ops/maps-cost-guardrails.md:69-76, 94-108`:
  - Place Photo is $7/1k after 1k/month free, bucket `gplaces:photo` 100/day (`lib/maps/config.ts:47`).
  - `photo-ref` is Place Details Essentials IDs Only (unbilled), bucket `gplaces:details:photo` 500/day.
- **Shared cache holds.** `usePinPhoto` (ref) and `usePhotoUri` (image URL) are module-level `createCachedLookup` instances (`use-pin-photo.ts:11`, `use-photo-uri.ts:9`). They're shared by every component in the bundle, and concurrent calls dedupe through `inflight`. Expanding a row also activates its pin, so on md+ the row and the pin card ask for the same key at the same time and bill once. Net new cost on desktop is about $0.
- **No stuck spinner.** `createCachedLookup` `.catch(() => null)` (`lib/map-preview.ts:124`), so a 503 resolves to `null`. `PlaceRowPhoto` returns `null`.
- **Rows/pins/carousel read `time` only for display.** The readers are `place-row.tsx:146,191`, `map-stop-carousel.tsx:148` and `pin.time` in `PinCard`. No sort or parse depends on the raw value. Segment `time` (a duration like "14m") isn't passed through `formatClock`.
- **Hours.** Google `weekdayDescriptions` are joined with `'; '` (`lib/places/google.ts:140,239`). The row splits the same way (`place-row.tsx:204`). Seed rows use `Today · …` (`lib/seed/days.ts:50`).
- **Other refs.** `isoForDay`/`ridesForDay` exist (`lib/day-augment.ts:30,125`). `AppSettings` has no time-format field. `.dayHdr` is at `itinerary-sidebar.module.css:184-190`. `segment-mode-picker.module.css` is imported only by the two pickers.

## Cross-plan

- **map-route-lines:** route-lines first. This plan owns the 4th `buildMapDays` parameter (finding 1).
- **a11y-batch:** recommended order is **this plan first**. a11y-batch then puts `tp-hit` on "Fix location" (Retry is gone), puts its toasts into this plan's `commit(next)`, and skips `ui/segmented.tsx`. Its `.segment` coarse `min-height: 44px` is compatible with this plan's `.segChip` change.
- **ds-hex-codemod:** lands after this plan. This plan owns the collapse bar (finding 3).
- **ds-modal-consolidation:** `day-mode-picker.tsx` hunks don't overlap (render `:49-73` here, `ConfirmModal` `:75-184` there).
- **i18n-extraction:** P0 may add `getLang()` to `layout.tsx`. Reuse it. P2 picks up the new hard-coded copy.

**Verdict: fix-then-ship (fixes applied).** The helpers and cost reasoning are sound. The main risk was merge order on `buildMapDays`/`page.tsx` with route-lines, which is now assigned.

## Cross-plan (from the map-route-lines scrutiny, 2026-10-29)
- Confirmed from the route side: route-lines keeps the 3-argument `buildMapDays` and lands first. `dayLegs` takes `places: unknown[]`, so the `hours` field this plan adds to `page.tsx`'s place type passes through unchanged. Route-lines' mid-leg labels read `segment.time`, which only seed data fills. This plan's `formatClock` does not need to cover segment times.

## Cross-plan (appended by the hover-sync scrutiny)
- hover-sync adds `.place.placeLinked` to `itinerary-list.module.css`. It must stay **after** every `:global([data-theme="dark"]) .place` rule (a bare `.placeLinked` loses to it in dark mode). If this plan adds or moves dark `.place*` rules, keep `.placeLinked` last on rebase. hover-sync also moves its row hover handlers onto the `group relative flex items-start` wrapper in `SortableItem`/`StaticItem` and adds `aria-current` to the `role="button"` div. Those are separate lines from this plan's edits.
