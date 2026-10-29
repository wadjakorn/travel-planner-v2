# Map ↔ List Hover Sync Implementation Plan

> **Ticket:** TP-0096

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering or keyboard-focusing an itinerary row lifts its pin, and hovering a pin highlights its row. Hovering another pin shows a name tooltip without replacing the open pin card, and the active row carries `aria-current`.

**Architecture:** A tiny external store, `lib/maps/hover-store.ts` (same shape as `lib/maps/viewport-store.ts`), holds one `{ dayId, placeId, source }`. Rows read it through `useSyncExternalStore` with a **boolean** selector, so a hover change re-renders only the row or rows whose highlight flips. `PersistentMap` reads the hover for the shown day (either source) and passes it to the renderer as a prop, and the renderer reports pin hovers back through a callback. The store is the **only** hover state: the canvases drop their local `hoveredPlaceId`, so a day switch that clears the store also clears a pin tooltip that lost its `pointerleave`. That keeps the renderers prop-driven, like every other map input. A pure `pinPopups` decides which card and which tooltip show, so the M6 rule is unit-tested.

**Why not `MapPreviewProvider`:** its value is consumed by every search picker (`place-search-picker.tsx`), `PersistentMap`, `MapPanelToggle`, `MapStopCarousel` and `use-poi-preview`. Putting a value that changes on every pointer move into it would re-render all of them on each row crossing, and every row would also have to become a context consumer. Hover is not part of the preview's request-token model either. The external store needs no provider, lets each row subscribe to its own boolean, and follows a pattern the repo already uses and tests (`viewport-store.ts`).

**Tech Stack:** React 19 (`useSyncExternalStore`), `@vis.gl/react-google-maps`, `react-map-gl/maplibre`, CSS modules, vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md`: §2.2 M6 and M14, §5 A19, §7.2 (state table "hover / แถวในลิสต์ถูก hover: scale 1.12, เงา md, 120ms ease-out, ไม่มีเมื่อ reduced-motion"; "active … z-index สูงสุด"), and §10 MAP-06.

**Touches:** `components/real-map-canvas-google.tsx`, `components/real-map-canvas-maplibre.tsx`, `components/persistent-map.tsx`, `components/map-renderer-props.ts`, `components/map-pin.tsx` + `map-pin.module.css` + `lib/map-pin.ts` (from the pin plan; `map-pin-badge.tsx` only if this lands first), `components/sortable-place-item.tsx`, `components/place-row.tsx`, `components/itinerary-list.module.css`, `lib/map-helpers.ts`

**Depends on:** `2026-10-29-map-pin-redesign.md` (MAP-02) merged first. It deletes `map-pin-badge.tsx`, owns the pin hover look (`.pin:hover .shape`, including its reduced-motion rule) and gives every marker an explicit `zIndex` via `pinZIndex`. This plan reuses all three instead of defining a second hover look. If it must land first, see the fallback in Task 2.

## Decision needed

1. **Hover tooltip while a pin card is open.** **Default: show both.** The card stays on the active pin, and a separate small name tooltip appears on the hovered pin (M6: "hover แสดงแค่ tooltip ชื่อ (ไม่แทนที่การ์ด)"). Alternative: no tooltip at all while a card is open, so the hovered pin only scales. That is safer if the tooltip visually collides with the card on close pins, but the user loses the name.
2. **`aria-current` vs `aria-pressed` on the active row.** The row is a toggle `role="button"`, so `aria-pressed` is arguably the more exact ARIA. **Default: `aria-current="true"`** as A19 and this scope specify. Switching later is a one-attribute change.

## Global Constraints

- Pin highlight (§7.2 "hover / แถวในลิสต์ถูก hover"): the list-linked highlight is **the same look as a direct pin hover**, from one CSS rule. `MapPin` gains `highlight?: boolean` → `data-highlight="true"` on its root, and the pin plan's selector becomes `.pin:hover .shape, .pin:focus-visible .shape, .pin[data-highlight='true'] .shape` (scale 1.12, drop-shadow, `transform 120ms ease-out`). Under reduced motion it follows the pin plan's rule: no transform and no transition, so the shadow stays as the cue. §7.2 says "ไม่มีเมื่อ reduced-motion" for this row. Do not add a bounce or keyframe.
- Stacking: **every** pin gets an explicit `zIndex` (Google leaves mixed set/unset `zIndex` ordering undefined; the pin plan's Review Focus 3). Extend the pin plan's `pinZIndex(active)` to `pinZIndex(active: boolean, highlight = false)`: active 100, highlighted 50, default 10. The preview marker stays at 1000 (`real-map-canvas-google.tsx:145`).
- Hover publishes only for `pointerType === 'mouse'`, for both pins (existing) and rows (new). Touch fires a compat enter with no leave (`real-map-canvas-google.tsx:131-134`). Keyboard focus publishes only when `:focus-visible` matches, so a mouse click's focus does not leave a sticky highlight.
- Row highlight from a pin hover uses tokens only (`var(--surface-2)`, `var(--border)`). No new hex.
- The hover tooltip keeps today's markup. Fonts and pin shape belong to the MapPin plan (MAP-02), so do not restyle them here.
- No new Google calls and no billing impact. This is DOM and state only.

## Review Focus

1. **The hovered pin unmounts with no `pointerleave`** (day switch or `router.refresh` after an add): neither the row highlight nor the pin tooltip may stick. Today the canvas's local `hoveredPlaceId` survives a day switch and re-shows the tooltip when the user comes back to that day (`real-map-canvas-google.tsx:69,78`). With the store as the only hover state, `PersistentMap` clears the map-sourced hover on a day change and both disappear. `clearPlaceHover` is tested (Task 1). Manual check in Task 4.
2. **Synthetic hotel rows share an id across days** (`hotel-${id}-begin|end`, `lib/day-augment.ts:75`), and the accordion can show several days at once. Hovering the Day 3 hotel pin must not light up the Day 2 hotel row. The store keys by `dayId`. Test: `hoverIdFor` filters by day (Task 1).
3. **Touch and iOS hover emulation:** tapping a row on mobile must not publish a hover. If it did, the pin would stay scaled after the tap. Rows gate on `pointerType === 'mouse'`. Manual check at 390×844 (Task 4).
4. **Dragging a hovered row:** the highlight is cleared when the drag starts, so no pin stays scaled during or after the reorder. Rows clear when `isDragging` turns true and clear on unmount. Manual check in Task 4.
5. **M6:** hovering another pin while a card is open leaves the card in place and shows the tooltip only on the hovered pin. Hovering the active pin itself shows no extra tooltip. With a search preview open there are no pin popups, as today. Test: `pinPopups` (Task 1).

---

### Task 1: Pure pieces: hover store + popup rule

**Files:**
- Create: `app/src/lib/maps/hover-store.ts`
- Modify: `app/src/lib/map-helpers.ts` (add `pinPopups`)
- Test: `app/src/lib/maps/hover-store.test.ts`, `app/src/lib/map-helpers.test.ts`

**Interfaces:**
- Produces (hover-store):
  ```ts
  export type HoverSource = 'list' | 'map';
  export type PlaceHover = { dayId: string; placeId: string; source: HoverSource };
  export function getPlaceHover(): PlaceHover | null;
  export function subscribePlaceHover(fn: () => void): () => void;
  export function setPlaceHover(h: PlaceHover): void;                      // no notify when equal
  export function clearPlaceHover(source: HoverSource, placeId?: string): void; // only if the current hover matches source (+ placeId when given)
  export function hoverIdFor(h: PlaceHover | null, dayId: string | null | undefined, source: HoverSource): string | null;
  ```
- Produces (map-helpers):
  ```ts
  export function pinPopups(o: { hoveredId: string | null; activeId: string | null; preview: boolean; hideCard: boolean }):
    { cardId: string | null; tipId: string | null };
  ```
  Rules: `preview` → both null. `cardId = activeId && !hideCard ? activeId : null`. `tipId = hoveredId && hoveredId !== activeId ? hoveredId : null`.

- [ ] **Step 1: Write failing tests**
  - hover-store (reset between tests by calling `clearPlaceHover('list')` and `clearPlaceHover('map')`):
    - `'set notifies once; an equal set does not'`
    - `'clear only when the source matches'`: after a `map` set, `clearPlaceHover('list')` keeps it and `clearPlaceHover('map')` clears it.
    - `'clear with a placeId only clears that place'`
    - `'hoverIdFor filters by day and source'`: `{dayId:'d2',placeId:'hotel-1-begin',source:'map'}` → `hoverIdFor(h,'d2','map') === 'hotel-1-begin'`, `hoverIdFor(h,'d3','map') === null`, `hoverIdFor(h,'d2','list') === null`, and `hoverIdFor(null,'d2','map') === null`.
  - pinPopups:
    - `'nothing active or hovered'` → `{cardId:null, tipId:null}`
    - `'hovering another pin keeps the card and adds a tooltip'`: `{hoveredId:'b', activeId:'a'}` → `{cardId:'a', tipId:'b'}`
    - `'hovering the active pin adds no tooltip'` → `{cardId:'a', tipId:null}`
    - `'hover only'` → `{cardId:null, tipId:'b'}`
    - `'mobile strip hides the card'` (`hideCard:true`, active `a`) → `cardId:null`
    - `'a search preview suppresses both'`
- [ ] **Step 2: Run** `cd app && pnpm vitest run src/lib/maps/hover-store.test.ts src/lib/map-helpers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files (module-level `let`, plus a `Set` of listeners, as in `viewport-store.ts`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(map): hover store + pin popup rule [TP-0096]`

### Task 2: Map side: tooltip no longer replaces the card, pins lift on list hover

**Files:**
- Create: `app/src/components/use-place-hover.ts`
- Modify: `app/src/components/map-renderer-props.ts` (`RealMapCanvasProps` gains `hover?: { placeId: string; source: HoverSource } | null` and `onPinHover?: (id: string | null) => void`)
- Modify: `app/src/components/map-pin.tsx` + `map-pin.module.css` (`highlight?: boolean` → `data-highlight`, added to the hover selector), `app/src/lib/map-pin.ts` (`pinZIndex(active, highlight = false)` + one test case `'highlight draws above default, below active'`)
- Modify: `app/src/components/real-map-canvas-google.tsx:69,78-82,122-139,160-192`
- Modify: `app/src/components/real-map-canvas-maplibre.tsx:37,50-54,86-108,131-167`
- Modify: `app/src/components/persistent-map.tsx` (read the list hover, pass the props, clear on a day change)

**Interfaces:**
- Consumes: Task 1 (`setPlaceHover`, `clearPlaceHover`, `subscribePlaceHover`, `getPlaceHover`, `hoverIdFor`, `pinPopups`).
- Produces (`use-place-hover.ts`, `'use client'`):
  ```ts
  export function usePlaceHoverFor(dayId: string | null | undefined): PlaceHover | null; // either source, shown day only
  export function useIsPlaceHovered(dayId: string | null | undefined, placeId: string, source: HoverSource): boolean;
  ```
  Both use `useSyncExternalStore(subscribePlaceHover, () => …, () => null | false)`. The server snapshot is "nothing hovered". `usePlaceHoverFor` returns the store's own object (`h && h.dayId === dayId ? h : null`), so the snapshot is referentially stable.
- `MapPin({ pin, active, highlight })`: `data-highlight={highlight && !active ? 'true' : undefined}`.
- **Fallback if the pin plan has not merged:** put `highlight` on `PinBadge` instead (inline `transform: scale(1.12)`, shadow `0 4px 10px rgba(0,0,0,0.35)`, `transition: transform 120ms ease-out`; the global floor `globals.css:259-268` makes it instant under reduced motion) and give every marker an explicit `zIndex` (100 / 50 / 10). The pin plan then folds it into `MapPin` on rebase.

Decided behaviour:
- Canvases **delete** their local `hoveredPlaceId` state (`real-map-canvas-google.tsx:69`, `-maplibre.tsx:37`). The mouse-only pointer enter and leave handlers call `onPinHover?.(pin.id)` / `onPinHover?.(null)` instead. `const tipSource = hover?.source === 'map' ? hover.placeId : null` (a list hover lifts the pin but shows no tooltip). `const { cardId, tipId } = pinPopups({ hoveredId: tipSource, activeId: activePlaceId ?? null, preview: !!preview, hideCard: !!hidePinCard })`. Render the card popup for `cardId` (`PinCard`, unchanged) and a **separate** tooltip popup for `tipId` (today's inline tooltip markup, or the pin plan's `PinTooltip`). These are two `InfoWindow`s on Google and two `Popup`s on MapLibre, keyed `'card'` / `'tip'`.
- Per pin: `highlight = pin.id === hover?.placeId`. Google: `<AdvancedMarker zIndex={pinZIndex(active, highlight)}>`. MapLibre: `<Marker style={{ zIndex: pinZIndex(active, highlight) }}>`. Pass `highlight` to `MapPin`.
- PersistentMap does three things. It sets `const hover = usePlaceHoverFor(day?.id)` and passes `hover={hover}`. It passes `onPinHover = useCallback((id) => id && day ? setPlaceHover({ dayId: day.id, placeId: id, source: 'map' }) : clearPlaceHover('map'), [day?.id])`. And it runs `useEffect(() => () => clearPlaceHover('map'), [day?.id])`, so a day switch drops a stale pin hover (and with it the tooltip).

- [ ] **Step 1: Implement** the hook, the badge prop and the canvas and PersistentMap changes above. (No new pure logic. Task 1's tests cover the rules.)
- [ ] **Step 2: Gates** `pnpm typecheck && pnpm lint && pnpm test` (tail -3 each) → clean.
- [ ] **Step 3: Commit** `feat(map): pin tooltip no longer replaces the open card; list hover lifts the pin [TP-0096]`

### Task 3: List side: rows publish hover/focus, highlight on pin hover, `aria-current`

**Files:**
- Modify: `app/src/components/sortable-place-item.tsx:84-163` (`SortableItem`) and `:255-283` (`StaticItem`)
- Modify: `app/src/components/place-row.tsx:60-76` (`hovered?: boolean` prop → `data-hover` + class)
- Modify: `app/src/components/itinerary-list.module.css` (new `.placeLinked` next to `.placeActive` at `:386`)

**Interfaces:**
- Consumes: Task 1 (`setPlaceHover`, `clearPlaceHover`), Task 2 (`useIsPlaceHovered`).
- `ItemProps` already has `dayId?: string` (`sortable-place-item.tsx:72`). The hover wiring is a no-op when `dayId` is undefined.
- `PlaceRow` props gain `hovered?: boolean`. It renders `data-hover={hovered ? 'true' : undefined}` and appends `styles.placeLinked` when `hovered && !active`.

Decided behaviour:
- A small helper inside `sortable-place-item.tsx` builds the shared handlers: `rowHoverHandlers(dayId, placeId)` → `{ onPointerEnter, onPointerLeave, onFocus, onBlur }`. Enter (mouse only) and focus (only if `(e.target as Element).matches(':focus-visible')`) call `setPlaceHover({ dayId, placeId, source: 'list' })`. Leave and blur call `clearPlaceHover('list', placeId)`.
- `SortableItem`: put the handlers on the inner `group relative flex items-start` wrapper (`:122`), not on the `role="button"` div. The edit/note/remove buttons are absolutely positioned **siblings** of that div (`:171`), so with the handlers on the div the pin would drop its highlight each time the pointer reaches a row action. Focus events bubble in React, hence `e.target` in the `:focus-visible` check. Add `aria-current={active ? 'true' : undefined}` on the `role="button"` div (`:144-163`). `useEffect`: when `isDragging` turns true, call `clearPlaceHover('list', place.id)`. The unmount cleanup does the same. Pass `hovered={useIsPlaceHovered(dayId, place.id, 'map')}` to `PlaceRow`.
- `StaticItem` (the permanent rendering for viewers, `sortable-place-list.tsx:195`): destructure `dayId` (it is passed but currently ignored, `:255-265`), put the same handlers on its `group relative flex items-start` wrapper (`:268`) and pass `hovered`. Viewers get the sync too. It has no `aria-current` because it has no active state (`PlaceRow` there gets no `active`).
- `.place.placeLinked { background: var(--surface-2); border-color: var(--border); }`, placed **after** the dark-mode block. A bare `.placeLinked` (0,1,0) loses to the existing `:global([data-theme="dark"]) .place { background: #1c1c1e; border-color: #2c2c2e }` (`itinerary-list.module.css:332-336`, 0,2,0), so the highlight would be invisible in dark mode. The tokens swap per theme (`--surface-2` #27272a in dark, visible against #1c1c1e).

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Gates** `pnpm typecheck && pnpm lint && pnpm test` → clean.
- [ ] **Step 3: Commit** `feat(itinerary): row hover/focus syncs with its pin; aria-current on the active row [TP-0096]`

### Task 4: Verify in the real app + docs

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Open trip `79efe162-dfb2-46c2-ad46-a34695771b8b` with Playwright at 1440×900.
- [ ] Hover row 2 → pin 2 scales and sits above its neighbours, with no tooltip. Leave the row → it returns to normal.
- [ ] Hover pin 3 → row 3 gets the linked background and pin 3's tooltip shows.
- [ ] Click pin 1 (card opens), then hover pin 2 → **card 1 stays** and tooltip 2 appears. Hover pin 1 → no extra tooltip (M6).
- [ ] Tab through rows → the focused row's pin lifts. Clicking a row with the mouse leaves no sticky lift after the pointer leaves.
- [ ] Accessibility snapshot: the active row's `role=button` element has `aria-current="true"`, and no other row has it (A19).
- [ ] Hover a pin, then switch day with the keyboard/URL → no row stays highlighted (Review Focus 1). Hover a row and start dragging it → the pin returns to normal (Review Focus 4).
- [ ] Expand two days that share a hotel and hover the hotel pin → only the shown day's hotel row highlights (Review Focus 2).
- [ ] `browser_emulate_media({ reducedMotion: 'reduce' })` → hovering a row gives the pin its shadow with no scale and no transition (same as hovering the pin directly, per the pin plan's reduced-motion rule).
- [ ] Hover a pin (tooltip shows), switch day with the keyboard, switch back → no tooltip and no lifted pin (Review Focus 1).
- [ ] Hover a row, move the pointer onto its edit/remove buttons → the pin stays lifted.
- [ ] Dark theme: a pin hover visibly highlights its row.
- [ ] At 390×844: tap rows and pins → no scaled pin is left behind (Review Focus 3).
- [ ] `MAPS_PROVIDER=open` (MapLibre): repeat the hover, card-and-tooltip and z-order checks.
- [ ] `AGENTS-INDEX.md`. Map section: add `lib/maps/hover-store.ts` ("External store for the list↔map hover link: one `{dayId, placeId, source}`; rows subscribe with a boolean selector") and `use-place-hover.ts`. Extend the `map-helpers.ts` line with `pinPopups`. Update `real-map-canvas-*`: hover tooltip alongside the active card; no local hover state. `map-pin.tsx`: `highlight` prop; `lib/map-pin.ts`: `pinZIndex(active, highlight)`.
- [ ] `REQUIREMENTS.md` §10: add one bullet: "Hovering or keyboard-focusing an itinerary row lifts its pin; hovering a pin highlights its row and shows a name tooltip without closing the open pin card."
- [ ] Commit `docs: map hover sync [TP-0096]`

---

## Notes and dependencies

- **Shared marker z-scale** (owned by `lib/map-pin.ts`, every marker explicit): ghost 1, route label 5, pin 10, cluster 15, hover-highlight 50, active 100, preview 1000. This plan only adds the 50 step (`pinZIndex(active, highlight)`).
- **Day-bar plan (merged "1 · 4" pins, lands after this one):** a coincident group is one marker. When it rebases, the group's pointer handlers call `onPinHover(groupHoverId(g, activeId))` (its existing pure helper), and the group gets `highlight` / `pinZIndex(…, true)` when `hover?.placeId` is any of `g.pins[*].id`. A list hover on row 4 then lifts the shared "1 · 4" marker, and hovering that marker highlights the row it reports.
- **MapPin plan (MAP-02):** lands first (see Depends on). This plan adds `highlight` to `MapPin` and extends `pinZIndex`; it does not restyle the pin. If the order flips, use the Task 2 fallback.
- **Camera-rules plan:** they edit the same canvas files but different regions (initial camera, `ActiveFocus` props and the overlay versus markers and popups). Either order works.
- **Not done:** pin keyboard focus → row highlight. Google Advanced Markers with `onClick` are focusable, but vis.gl 1.8 exposes no focus or blur props on `AdvancedMarker`. Wiring it needs the raw `gmp-click` element listeners, and the gain is small. A10 (pin accessible names) is the better home for marker keyboard work.
