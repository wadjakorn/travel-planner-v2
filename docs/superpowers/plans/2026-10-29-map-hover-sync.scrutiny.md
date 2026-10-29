# Scrutiny: map ↔ list hover sync

Plan: [2026-10-29-map-hover-sync.md](2026-10-29-map-hover-sync.md). Traced against `main` @ `6f6f7a2`.

## Intent

Link the list and the map on hover and keyboard focus. Hovering a row lifts its pin, hovering a pin highlights its row, and hovering another pin no longer replaces the open card (M6). The active row also gets `aria-current` (A19).

### Simpler alternatives considered

- **Put hover in `MapPreviewProvider`.** The plan rejects this with the right reason: the provider's value fans out to every picker, the toggle, the carousel and `use-poi-preview`, so every pointer move would re-render all of them. **Agree.**
- **CSS-only (`:has()` across the list and map DOM).** This would need a selector generated per id, and Google marker content is not stable to target. **Not viable.**
- **Keep the canvases' local `hoveredPlaceId` next to the store (as planned).** That leaves two sources of truth. One of them misses the day-switch clear (finding 2). Making the store the only hover state is simpler *and* fixes the bug. **Applied.**
- **Fix only M6 (`popupId` split) and skip the sync.** This is the cheap 30% of the work. M14 and MAP-06 are explicitly in scope, so it was not taken.

## Findings

### 1. Major: the row highlight is invisible in dark mode. **Applied.**

- **Finding:** `.placeLinked { background: var(--surface-2); border-color: var(--border) }` "needs no dark override".
- **Why it matters:** in dark mode, hovering a pin gives no visible row cue, so half of the feature disappears.
- **Evidence:** `:global([data-theme="dark"]) .place { background: #1c1c1e; border-color: #2c2c2e }` (`itinerary-list.module.css:332-336`) has specificity 0,2,0. That beats `.placeLinked` (0,1,0) whatever the source order.
- **Change (applied):** use `.place.placeLinked`, placed after the dark block. Added a dark-theme check to Task 4.

### 2. Major: duplicate hover state leaves a stale tooltip across a day switch. **Applied.**

- **Finding:** the canvases keep a local `hoveredPlaceId` (`real-map-canvas-google.tsx:69`, `-maplibre.tsx:37`) next to the new store. Only the store is cleared on a day change.
- **Why it matters:** hover a pin, switch day with the keyboard (the pin unmounts with no `pointerleave`), then come back. The tooltip and the new lift reappear on a pin nobody is hovering. That is exactly Review Focus 1, and the plan only fixed the row side of it.
- **Evidence:** today `popupId = hoveredPlaceId ?? activePlaceId` (`:78`) with no reset path apart from `pointerleave`. Under the plan, `highlight = … || pin.id === hoveredPlaceId` and `tipId` both read that stale state.
- **Change (applied):** the canvases delete their local state. `PersistentMap` passes `hover` (either source, shown day only, via `usePlaceHoverFor`). The tooltip shows only for `source === 'map'`, and the lift shows for both. The existing day-change `clearPlaceHover('map')` now covers both sides.

### 3. Major: this plan defined a second pin hover look that conflicts with the pin redesign. **Applied.**

- **Finding:** the plan put scale and shadow inline on `PinBadge`, with `zIndex` 900/800/unset. The pin plan (`2026-10-29-map-pin-redesign.md`) deletes `PinBadge` and owns the hover look in `.pin:hover .shape`. Under reduced motion it removes the transform, while this plan said "scale applies instantly". It also gives **every** marker an explicit `zIndex` through `pinZIndex`, because mixing set and unset `zIndex` on Google markers is undefined.
- **Why it matters:** whichever plan lands second would end up with two hover styles, inconsistent reduced-motion behaviour, and partly unset `zIndex`.
- **Change (applied):** this plan depends on pin-redesign landing first. `MapPin` gains `highlight` → `data-highlight`, which joins the existing hover selector, so there is one look and one reduced-motion rule. `pinZIndex(active, highlight)` gives 100/50/10. A fallback for the reverse order is spelled out in Task 2. This matches the orchestrator note "order pin-redesign first".

### 4. Nit: the highlight flickered when moving onto row actions. **Applied.**

- The edit, note and remove buttons are absolute **siblings** of the `role="button"` div (`sortable-place-item.tsx:145,171`), so `pointerleave` fired on the way to them. The handlers now go on the `group relative flex` wrapper (`:122`, `:268`). The focus check uses `e.target`, because focus events bubble.
- `StaticItem` is passed `dayId` but ignores it (`:255-265`). It now destructures it.

## Verified as claimed

- **Keyed by day.** Synthetic hotel ids are `hotel-${id}-begin|end` (`lib/day-augment.ts:75`), and map pin ids are the same display-place ids (`buildMapDays`, `:168-169`). `MapDay.id` is `d.id` (`:180`), the same `dayId` the list passes to rows (`sortable-place-list.tsx:208,244`). So `{dayId, placeId}` is the right key, and `hoverIdFor` filtering stops cross-day hotel bleed.
- **Re-render cost.** Rows subscribe with a boolean selector. `PersistentMap` re-renders once per hover change for the shown day, which is cheap: props only, and markers are keyed.
- **Touch.** Pin handlers are already mouse-only (`real-map-canvas-google.tsx:131-134`), and rows adopt the same gate. Pointer-initiated focus on a `tabIndex=0` div does not match `:focus-visible`, so a tap does not publish.
- **TP-0076 / TP-0077.** `hideCard` (`hidePinCard`) and `preview` are inputs to `pinPopups`. With a search or POI preview open, there are no pin popups, as today (`:78`). The carousel `select`/`activate` paths are untouched.
- **Line refs.** `:69,78-82,122-139,160-192` (Google), `:37,50-54,86-108,131-167` (MapLibre), `place-row.tsx:60-76`, `.placeActive` at `itinerary-list.module.css:386` and `ItemProps.dayId` at `:72` all match `main`.

## Left for the user

- Decisions 1 (tooltip and card both) and 2 (`aria-current`) keep the plan's defaults.

## Cross-plan

- **`map-pin-redesign`:** goes first. This plan extends `MapPin` (`highlight`) and `pinZIndex`. If the pin plan is revised, its hover selector must keep `data-highlight` in mind. Its own closing note already anticipates "a `hovered` prop that sets the same `data-*` hook".
- **`itinerary-rows`:** also edits `place-row.tsx`, `sortable-place-item.tsx` and `itinerary-list.module.css`. Its line 14 already lists this plan as a rebase-only overlap. The `.place.placeLinked` rule must stay after any dark block that the rows plan adds.
- **`map-camera-rules`:** no conflict. The two plans edit different regions.

**Verdict: fix-then-ship (fixes applied).** The biggest issue was that dark mode would have hidden the row highlight, together with the stale-tooltip bug that came from keeping two hover states.

## Cross-plan (appended by the ds-foundations / ds-hex-codemod scrutinies, 2026-10-29)
- If the pin highlight lands in a CSS module (e.g. after map-pin-redesign), the ds-foundations motion guard requires `transition: transform var(--dur-fast) ease-out`, not a literal `120ms`.
- The highlight shadow `rgba(0,0,0,0.35)` adds a raw color. The hex-codemod ratchet is exact, so either use a shadow token (`var(--shadow-md)`/`var(--shadow-lg)`) or regenerate `raw-color-baseline.json` in the same PR. New module files are held to zero raw colors.
- The new `.placeLinked` in `itinerary-list.module.css` must be tokens-only (it is), because hex-codemod Task 2 adds that file to its `STRICT` list.

## Coordinator cross-plan items (folded in)
- **Shared z-scale** (ghost 1, route label 5, pin 10, cluster 15, hover 50, active 100, preview 1000, always explicit): already applied by finding 3 (`pinZIndex(active, highlight)` 100 / 50 / 10). The full scale is now listed in the plan's Notes.
- **Merged "1 · 4" pins (day-bar):** the day-bar plan lands after this one. On rebase, the group reports hover via `groupHoverId(g, activeId)`, and it highlights when any of its pins is the hovered id. This is written into the plan's Notes.
- **Lands after map-pin-redesign; `highlight` on `MapPin`, not `map-pin-badge.tsx`:** applied (Depends on, Task 2).
- **Agreed landing order:** pin-redesign → (camera-rules, hover-sync, route-lines, a11y-batch) → day-bar → search-distance → trip-overview.
