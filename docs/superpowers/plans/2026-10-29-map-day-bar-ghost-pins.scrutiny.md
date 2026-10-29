# Scrutiny: map day bar + ghost pins

Plan: [2026-10-29-map-day-bar-ghost-pins.md](2026-10-29-map-day-bar-ghost-pins.md)

## Intent

On md+, let the user switch days from the map itself. Other days' stops show as faint dots that can be clicked, and stops at the same coordinates (a hotel's begin/end on a middle night) merge into one `1 · 4` pin.

### Simpler alternatives considered

- **Make the existing chip a `<select>` or a ‹ › stepper only.** That is smaller, but spec §3.1 asks for a chip row (‹ D1 D2 … ›). The stepper already exists on mobile (TP-0076). The chip row is about 1 component plus 2 pure helpers, so it is not over-built.
- **Clear the preview in a `day.id`-change effect instead of in every `onClick`.** This would catch every entry point (Back, list day chips). Rejected after tracing: `ActiveFocus*`'s passive effect runs before the parent's in the same commit. It sees the preview still set (`mapFocus` → `preview`), and on the next render `previewExited` → `stay` (`lib/map-preview.ts:86-98`). The new day would never be framed. Clearing *before* navigation, as the plan does and as `activate()` already does (`persistent-map.tsx:89`), is correct. The rationale is now written into the plan so nobody "simplifies" it later.
- **Drop the `1 · 4` merge and rely on z-order** (pin-redesign's stance). That would leave the begin and end copies of a hotel stacked: one pin, two numbers, and a click that only ever opens the top one. The merge is about 30 lines of pure code plus a render change. Keep it.

## Trace highlights (claims verified at HEAD `6f6f7a2`)

- The line refs are correct: the chip is at `real-map-canvas-google.tsx:195-198` and `real-map-canvas-maplibre.tsx:171-174`, `dayLabel` at `map-renderer-props.ts:11` and `persistent-map.tsx:137`, the marker loops at `:122-139` and `:86-109`, `.dayPill` at `map-canvas.module.css:82`, and the full-map rule at `globals.css:293-297`.
- "The stay pin already shows every night" holds: `splitHotelsForDay` (`lib/day-augment.ts:41-61`) and `displayPlacesForDay` (`:91-101`). Begin and end ids are distinct (`hotel-${id}-begin|end`, `:75`), so `groupClickTarget` can tell them apart.
- **`1 · 4` click cycle vs the `activate` toggle holds.** `activate(id)` does `next = shownPlaceId === id ? null : id` (`persistent-map.tsx:87-94`). The renderer receives `activePlaceId={shownPlaceId}` (`:141`), so `groupClickTarget` reads the same optimistic value. The sequence is: inactive → first; first → next (≠ shown, so set); last → itself (= shown, so toggled off). `PinCard`'s ✕ calls `onActivate(popupPin.id)` and toggles off as before. `ActiveFocus` gets the raw pin, so moving 1 → N pans to identical coords (a no-op).
- **Day-bar `push` vs TP-0076 `replace`: no conflict.** The carousel switcher renders only when `fullMap` (`map-stop-carousel.tsx:104`) and is `md:hidden` (`:115`). The bar is `hidden md:flex`, so they are never on screen together. Desktop already pushes on day change (`day-header.tsx:57` `<Link>`) and on pin click (`persistent-map.tsx:92`), so push is the consistent choice.
- The ghost-exclusion and tie-break tests produce the asserted output (traced by hand).

## Findings

### 1. Blocker: the plan edits `PinBadge`, which pin-redesign deletes, and re-adds pin-redesign's token
- **Finding:** Task 3 changed `map-pin-badge.tsx` (`idx` → `label`) and added `--map-pin-ghost` to `globals.css`. Pin-redesign (MAP-02, Phase 1, ordered first per `_plan-notes.md`) deletes `map-pin-badge.tsx`, introduces `MapPin` / `pinTitle` / `pinZIndex`, and already adds `--map-pin-ghost`.
- **Why it matters:** the second PR either fails to rebase, or lands a duplicate token and a resurrected badge.
- **Change:** depend on pin-redesign. Add `label?: string` to `MapPin`, use `pinZIndex` / `pinTitle`, and drop the token step. **Applied** (header "Depends on", Global Constraints, Task 3).

### 2. Major: the merged pin shows the wrong popup on the second click (desktop)
- **Finding:** hover was set to `g.pins[0].id`. After click 2 (active = N), the mouse is still on the group, so `popupId = hoveredPlaceId ?? activePlaceId` = stop 1 (`real-map-canvas-google.tsx:78`, `real-map-canvas-maplibre.tsx:50`). `pinCard` is false, so the user sees stop 1's tooltip and not stop N's card. The "1 → N → closed" check in Task 4 would fail on desktop.
- **Change:** keep the hovered *group key* in state and derive the id at render time with a new pure `groupHoverId(g, activeId)`, tested. **Applied** (Task 1 interfaces and tests, Task 3, Review Focus 2, Task 4 check).

### 3. Major (resolved on the other side): deleting `dayLabel` and the `data-map-day` overlay broke two plans
- **Finding:** in the original drafts, a11y-batch's `mapSummary(dayLabel, pins)` ran inside both renderers, and camera-rules put its empty-day note inside the `data-map-day` overlay that this plan deletes.
- **Resolution:** both sibling scrutinies have fixed it on their side. a11y-batch builds `summary` in `PersistentMap`, and camera-rules moved the note to the bottom-left `data-map-dist` slot (see their scrutiny files). I first patched this plan to keep the prop and overlay, then **reverted that** to the original, simpler deletion so the three plans agree. This plan now removes `dayLabel`, the overlay, `.overlayTl`, `.dayPill` and the dead `globals.css` selector. The "Depends on" line records why that is safe. **Applied.**

### 4. Major: z-index scales disagree across four map plans
- **Finding:** this plan used ghosts 1 / pins 10 / active 20. Pin-redesign uses `pinZIndex` 10 / 100. Hover-sync uses active 900, highlight 800, default **unset**. Route-lines uses labels 5 and pins ≥10. Hover-sync's "unset" default would put ghosts (1) *above* normal pins on Google, which pin-redesign itself warns is undefined.
- **Change:** one scale, owned by `lib/map-pin.ts`: ghost 1 (`GHOST_Z_INDEX`, new), route label 5, pin 10, hover-highlight 50, active 100, preview 1000, always explicit. **Applied here.** **Cross-plan:** hover-sync must switch 900/800/unset to `pinZIndex(true)` / 50 / `pinZIndex(false)` (listed in the final report; no hover-sync scrutiny file existed at the time of writing).

### 5. Major: ghost dot a11y used `div role="button"`
- **Finding:** on MapLibre a `div role="button"` without `tabIndex` can't be reached by keyboard. On Google it nests a "button" inside the already-clickable `AdvancedMarker`. Spec §7.2 requires the `Day {d}: {name}` name, and pin-redesign solved the same problem with `title` on Google and a real `<button>` on MapLibre.
- **Change:** use the same split (`GhostDot interactive`). **Applied** (Task 3).

### 6. Minor: the top-left bar and search-distance's top-right button
- **Finding:** search-distance's Task 4 placed its button `absolute right-4 top-4` and patched this bar's `max-w` to `calc(100%-13rem)`. Degraded-notice also puts a chip top-right.
- **Change:** `PersistentMap` renders one flex top row (bar left, search button right), so neither plan needs width math. **Applied here and in search-distance.** **Cross-plan:** degraded-notice's top-right chip (`.overlayTr`) must start at `top: 68px` on md+, below the row. Its MapLibre insertion point ("after the top-left overlay, `:171-174`") also disappears, so it should insert before the zoom overlay instead. No degraded-notice scrutiny file existed at the time of writing, so this is listed in the final report.

### 7. Nit: spec §7.4 breakpoint table says the day bar is ≥1024 only
- The table lists "768–1023: as before", but §3.1 doesn't restrict it. The plan uses md (768) and checks 768-wide scrolling in Task 4. At `md:w-[400px]` aside (`trip-aside-class.ts`) the map is about 368px wide, and the bar scrolls inside it. Fine as is. **Left** (product call if the user wants lg+).

### 8. Nit: pre-existing preview leak on Back and on list day chips
- Both change the day without `clearPreview()`, so the camera stays on the preview and a POI preview's "Add to Day N" goes stale. Fixing it needs `ActiveFocus` to remember `pinsChanged` until it is consumed, which is out of scope. **Left**, as a follow-up ticket suggestion.

## Cross-plan resolutions
- **Order:** pin-redesign → (camera-rules, hover-sync, route-lines, a11y-batch) → **day-bar** → search-distance Task 4 → trip-overview.
- **Owned here:** `dayTitle` / `dayChip`, `GHOST_Z_INDEX`, and the PersistentMap md+ top row (search-distance adds its right-hand child). The 68px md+ offset for canvas top overlays belongs to degraded-notice.
- **hover-sync:** adopt the shared z-scale; report the group-derived hover id (`groupHoverId`) from grouped markers.

**Verdict: fix-then-ship.** Every blocker and major has been applied to the plan. The biggest issue was building on a component that pin-redesign deletes.

## Cross-plan (from the map-pin-redesign / route-lines scrutiny, 2026-10-29)
- Pin-redesign agrees: it lands first. Its "Downstream plans" table now says `label?: string` goes on `MapPin`, `--map-pin-ghost` is not re-added, and ghosts use the shared zIndex scale (ghost 1, route label 5, pin 10, highlight 50, active 100, preview 1000).
- On the drop shape, a `label` longer than 2 chars ("1·4", "10·12") does not fit the 30px head at 13px. This plan picks the treatment (e.g. 11px or a widened head) and the `pinTitle` wording for merged stops.
- Route-lines changes `Pin.idx` to the display position, so numbers can have gaps (1, 3) where a stop has no coordinates. Merged labels should join the real `idx` values.

## Cross-plan (appended by the nav-labels scrutiny, 2026-10-29)
- nav-labels widens the md+ rail from 56 to 72 px. At 768 px the map is then 296 px wide (was 312): 768 − 72 rail − 400 aside. This plan's md+ day bar and its overlays must fit that width. Check at 768×1024 in the browser task.

## Cross-plan (appended by the camera-rules / hover-sync / degraded-notice scrutiny)
- **degraded-notice** adopted md+ `.overlayTr { top: 68px }` and inserts the chip after `</Map>`, not after the deleted top-left overlay. **Applied** in that plan.
- **hover-sync** uses the shared scale: `pinZIndex(active, highlight)` 100 / 50 / 10, always explicit. **Applied** in that plan.
- **camera-rules:** the empty-day note lives in the bottom-left `data-map-dist` slot, and this plan's deletions are safe. Confirmed.
