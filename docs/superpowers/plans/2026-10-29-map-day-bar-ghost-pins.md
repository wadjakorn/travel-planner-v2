# Map Day Bar + Ghost Pins Implementation Plan

> **Ticket:** TP-0099

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D5 — day bar from 768px (md) up** (default kept).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On desktop/tablet (md+), replace the static "Day N · …" map chip with a clickable day bar (‹ D1 D2 … ›), draw other days' stops as small ghost dots that switch to their day when clicked, and merge stops at identical coordinates into one "1 · 4" pin.

**Architecture:** A new `MapDayBar` is rendered by `PersistentMap` as an overlay sibling of the canvas, so it also shows on empty days (today the chip lives inside the canvas, which isn't mounted for a day with no pins). It navigates with `<Link>`s built by `stopActivateHref` (TP-0076). Ghosts and coincident-pin groups are pure functions over the existing `MapDay[]` (no `MapDay` shape change, no new server data). Both renderers draw groups instead of raw pins and draw ghosts under them. Mobile full-map keeps the carousel's own switcher (TP-0076). It shares the helpers and label function, not the component.

**Tech Stack:** Next.js 16 App Router (`next/link`), React 19, Tailwind v4, `@vis.gl/react-google-maps` 1.8.3 (`AdvancedMarker`), `react-map-gl/maplibre` (`Marker`), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §3.1 (bullets "วันอื่นเป็นเงาจางๆ", "หัวแผนที่เป็นแถบวัน", "หมุดที่พัก… แสดงทุกวันที่พักอยู่"), §2.2 M7 (desktop half; the mobile half shipped in TP-0076), §7.2 (ghost row: 10px dot, click → switch day; ARIA `Day {d}: {name}`; `--map-pin-ghost` `#94a3b8` 60%), §7.5 ("จุดซ้อนพิกัดเดียวกัน… รวมเป็นหมุดเดียว '1 · 4'"), roadmap ticket MAP-09.

**Touches:** `persistent-map.tsx`, `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx`, `map-renderer-props.ts` (drops `dayLabel`; adds `ghosts` / `onGhostClick`), `map-pin.tsx` + `lib/map-pin.ts` (from the pin-redesign plan: `label` override, `GHOST_Z_INDEX`), `map-stop-carousel.tsx` (label only), `globals.css` (drop one dead selector), `map-canvas.module.css` (delete `.overlayTl` / `.dayPill`).

**Depends on:** `2026-10-29-map-pin-redesign.md` merged first. It deletes `map-pin-badge.tsx`, adds `MapPin`, `pinTitle`, `pinZIndex` (`lib/map-pin.ts`) and the `--map-pin-ghost` token, so this plan builds on those instead of editing `PinBadge`. Compatible in either order with `map-camera-rules` (its scrutiny moved the empty-day note to the bottom-left `data-map-dist` slot) and `a11y-batch` (its scrutiny moved `mapSummary` to `PersistentMap`, passed as `summary`, so the renderers no longer need `dayLabel`). Scrutiny: `2026-10-29-map-day-bar-ghost-pins.scrutiny.md`.

## Decision needed

1. **Day bar history: push or replace?** Default: **push**, via `<Link>`. The itinerary's own day headers (`day-header.tsx:57`) are push `<Link>`s, so Back steps through days on desktop like it does today. The mobile carousel stays on `replace` because swipes fire often there.
2. **Ghost click target.** Default: **switch to that day and frame it, with no stop selected**. This follows spec §7.2 ("คลิก → สลับวัน"). Selecting the stop as well would only `panTo` it (`mapFocus` → `active`) at the old zoom, and the rest of that day would sit off-screen.
3. **Ghosts on mobile full-map.** Default: **off**. Only `useIsWide()` (md+) gets ghosts. On mobile, the carousel already switches days, and 10px dots fall far below the 44px touch rule TP-0076 set.

## Already true (no work)

- **The stay pin already shows on every night it covers.** `displayPlacesForDay` (`lib/day-augment.ts:91-101`) adds a synthetic hotel stop with `begin` when `checkIn < day ≤ checkOut` and with `end` when `checkIn ≤ day < checkOut` (`splitHotelsForDay`, `:41-61`). `buildMapDays` (`:160-189`) turns every located one into a numbered pin. The gaps are hotels with no dates or no coords, and trips with no `startDate` (`dayIso` null → no hotel stops). Those are data gaps, not map work. The stay *visual* (bed icon, 40×40 rounded square, §7.2 "stay" row) belongs to MAP-02 (MapPin component), not to this plan.
- What *is* broken is that on a middle night the `begin` and `end` hotel pins sit at identical coordinates, so one hides the other. Task 1 and Task 3 fix this with grouping.

## Global Constraints

- md+ only (`WIDE_QUERY = '(min-width: 768px)'`, `use-trip-map-visible.ts:10`). Below md the day bar is `hidden` and there are no ghosts. Mobile full-map behavior stays unchanged.
- No new API calls, no new billed map loads, no `MapDay` / `Pin` shape change. Ghosts and groups are derived client-side from `mapDays`, which are already in the layout payload.
- Copy (EN, i18n is forced to `en`): chip `D{n}`, active chip `D{n} · {label} {num}`. Each chip's `aria-label` is the full `Day {n} · {label} {num}`. Arrows are `Previous day` / `Next day`, the nav is `aria-label="Trip days"`, the ghost title/aria is `Day {d}: {name}`, and the group pin label joins indexes with `' · '` (`1 · 4`).
- Colors: tokens only. `--map-pin-ghost: rgb(148 163 184 / 0.6)` (= `#94a3b8` at 60%, spec §7.2) already comes from the pin-redesign plan; don't add it again. The bar uses `bg-surface`, `border-border`, `text-foreground`, `text-muted`, and `bg-brand text-brand-foreground` for the active chip.
- Ghost hit area 24×24 CSS px (WCAG 2.5.8 minimum) around a 10px dot. Day-bar controls are at least 32px tall (pointer devices; tablets get 36px via `md:h-9`).
- Marker z-order uses the shared scale in `lib/map-pin.ts` (pin-redesign owns it): ghosts `GHOST_Z_INDEX = 1` (new constant, added there), route labels 5 (route-lines plan), groups `pinZIndex(false)` = 10, hover-highlighted 50 (hover-sync plan), active group `pinZIndex(true)` = 100, and the search preview 1000 (unchanged). Every marker gets an explicit `zIndex`, because Google leaves the order of mixed set and unset values undefined.

## Review Focus

1. **Empty day (no located stops):** today the map shows "Add a spot to see it on the map." with no chip at all. The bar must still render there so the user can leave the day. The bar is a sibling of the canvas in `PersistentMap`, rendered whenever `everOpened && day` (Task 2). Manual check in Task 4.
2. **Hotel middle night:** the `begin` (idx 1) and `end` (idx N) pins share coords. They must show as one pin labelled `1 · N`, and clicking it cycles 1 → N → closed. Test `groupPins` + `groupClickTarget` (Task 1). On desktop the mouse is still over the group while it cycles. The hover must follow the group's active pin, or the second click would show stop 1's tooltip instead of stop N's card (`popupId = hoveredPlaceId ?? activePlaceId`, `real-map-canvas-google.tsx:78`). Test `groupHoverId` (Task 1). Manual check in Task 4.
3. **Ghost under a current-day pin:** the same hotel on the adjacent day, or a place revisited, must not draw a ghost dot beneath today's real pin. Test `ghostPins` exclusion (Task 1).
4. **Search preview open, then the day changes from the bar or a ghost:** the preview's "Add to Day N" would point at the old day while `previewNear` measures against the new day's pins. Every bar and ghost navigation calls `clearPreview()` first (Task 2/3). Manual check in Task 4. It has to happen *before* the navigation. A "clear when `day.id` changes" effect in `PersistentMap` looks simpler, but it runs after `ActiveFocus*`'s own effect in the same commit. That effect would then see the preview still set (→ `preview`, no day fit), and on the next render `previewExited` → `stay`, so the new day would never be framed (`lib/map-preview.ts:86-98`). Browser Back and the list's day chips (`day-header.tsx:57`) also change the day without clearing. That is pre-existing behavior and out of scope; it is noted in the scrutiny file.
5. **Long trips (14+ days):** the chip row must scroll horizontally inside the bar (not the page), and the active chip must scroll into view when the day changes. ‹ is disabled on day 1 and › on the last day (`dayNav`, already tested). Manual check in Task 4 with a narrow window (768px).

---

### Task 1: Pure helpers: day titles, ghosts, coincident-pin groups

**Files:**
- Modify: `app/src/lib/map-carousel.ts` (add `dayTitle`, `dayChip`)
- Create: `app/src/lib/map-ghosts.ts`
- Test: `app/src/lib/map-carousel.test.ts`, `app/src/lib/map-ghosts.test.ts`

**Interfaces:**
- Consumes: `MapDay` (type) from `@/lib/day-augment`; `Pin` from `@/lib/map-helpers`; `pinTitle` from `@/lib/map-pin` (pin-redesign).
- Produces:
  - `dayTitle(d: Pick<MapDay, 'idx' | 'label' | 'num'>): string` → `'Day 1 · Sat 12'`
  - `dayChip(d: Pick<MapDay, 'idx'>): string` → `'D1'`
  - `coordKey(p: { lat: number; lng: number }): string` → `` `${lat.toFixed(6)},${lng.toFixed(6)}` `` (≈0.1 m; hotel begin/end copies are bit-identical)
  - `type PinGroup = { key: string; lat: number; lng: number; pins: Pin[] }`
  - `groupPins(pins: Pin[]): PinGroup[]`: one group per `coordKey`, ordered by first occurrence, `pins` in input order
  - `groupLabel(g: PinGroup): string` → `g.pins.map((p) => p.idx).join(' · ')`
  - `groupClickTarget(g: PinGroup, activeId: string | null): string`: active not in group → first pin id. Active in group and not last → next pin id. Active is last → `activeId` (the existing `activate` toggles it off, `persistent-map.tsx:87-94`).
  - `groupHoverId(g: PinGroup, activeId: string | null): string`: the active pin's id when it is in the group, else the first pin's id. Renderers derive the hovered id from this at render time (see Task 3), so the hover follows the click cycle.
  - `groupTitle(g: PinGroup): string` → `g.pins.map(pinTitle).join('; ')` (accessible name of a merged marker, e.g. `Stop 1: Hotel Gracery; Stop 4: Hotel Gracery`)
  - In `lib/map-pin.ts`: `export const GHOST_Z_INDEX = 1;`
  - `type GhostPin = { key: string; lat: number; lng: number; dayIdx: number; name: string }`
  - `ghostPins(days: MapDay[], dayIdx: number): GhostPin[]`: pins of every other day, one per `coordKey`, skipping keys that the current day's pins occupy. When several days share a key, keep the day nearest to `dayIdx` (tie → earlier) and that day's pin name (`pin.name ?? \`Stop ${pin.idx}\``).

- [x] **Step 1: Write the failing tests**

```ts
// map-carousel.test.ts
it('dayTitle / dayChip', () => {
  expect(dayTitle({ idx: 0, label: 'Sat', num: 12 })).toBe('Day 1 · Sat 12');
  expect(dayChip({ idx: 4 })).toBe('D5');
});

// map-ghosts.test.ts
const pin = (id: string, idx: number, lat: number, lng: number, name = id): Pin =>
  ({ id, idx, kind: 'sight', lat, lng, name });
const day = (idx: number, pins: Pin[]) => ({ id: `d${idx}`, idx, label: 'Mon', num: idx + 1, summaryDistance: null, summaryTime: null, pins });

describe('groupPins', () => {
  it('merges identical coords, keeps order', () => {
    const g = groupPins([pin('h-b', 1, 35.1, 139.1), pin('a', 2, 35.2, 139.2), pin('h-e', 3, 35.1, 139.1)]);
    expect(g.map((x) => x.pins.map((p) => p.id))).toEqual([['h-b', 'h-e'], ['a']]);
    expect(groupLabel(g[0])).toBe('1 · 3');
    expect(groupLabel(g[1])).toBe('2');
  });
  it('does not merge pins 1 m apart', () => {
    expect(groupPins([pin('a', 1, 35.1, 139.1), pin('b', 2, 35.10001, 139.1)])).toHaveLength(2);
  });
});

describe('groupClickTarget', () => {
  const g = { key: 'k', lat: 0, lng: 0, pins: [pin('x', 1, 0, 0), pin('y', 4, 0, 0)] };
  it('inactive → first', () => expect(groupClickTarget(g, null)).toBe('x'));
  it('first active → next', () => expect(groupClickTarget(g, 'x')).toBe('y'));
  it('last active → itself (toggles off)', () => expect(groupClickTarget(g, 'y')).toBe('y'));
  it('active elsewhere → first', () => expect(groupClickTarget(g, 'other')).toBe('x'));
  it('hover follows the active pin in the group', () => {
    expect(groupHoverId(g, null)).toBe('x');
    expect(groupHoverId(g, 'y')).toBe('y');
    expect(groupHoverId(g, 'other')).toBe('x');
  });
  it('groupTitle joins pin titles', () => expect(groupTitle(g)).toBe('Stop 1: x; Stop 4: y'));
});

describe('ghostPins', () => {
  const days = [
    day(0, [pin('a', 1, 35.0, 139.0, 'Senso-ji'), pin('hotel-h-end', 2, 35.5, 139.5, 'Hotel')]),
    day(1, [pin('hotel-h-begin', 1, 35.5, 139.5, 'Hotel'), pin('b', 2, 35.2, 139.2, 'Hakone')]),
    day(2, [pin('c', 1, 35.3, 139.3, 'Kamakura')]),
  ];
  it('excludes the current day and coords it occupies', () => {
    const g = ghostPins(days, 1);
    expect(g.map((x) => x.name).sort()).toEqual(['Kamakura', 'Senso-ji']);
  });
  it('labels a shared coord with the nearest day', () => {
    const g = ghostPins(days, 2).find((x) => x.name === 'Hotel')!;
    expect(g.dayIdx).toBe(1);
  });
  it('no other days → empty', () => expect(ghostPins([days[0]], 0)).toEqual([]));
});
```

- [x] **Step 2: Run to verify failure.** `cd app && pnpm vitest run src/lib/map-carousel.test.ts src/lib/map-ghosts.test.ts` → FAIL (`dayTitle` / module not found).
- [x] **Step 3: Implement** the functions above in `lib/map-carousel.ts` and the new `lib/map-ghosts.ts`, with `import type { MapDay }` so the server module stays out of the client bundle.
- [x] **Step 4: Re-run** → PASS.
- [x] **Step 5: Commit** `feat(map): day-title, ghost and coincident-pin helpers [TP-0099]`

### Task 2: `MapDayBar` replaces the in-canvas day chip

**Files:**
- Create: `app/src/components/map-day-bar.tsx`
- Modify: `app/src/components/persistent-map.tsx` (render the bar at `:128-165`; drop `dayLabel=` at `:137`. If a11y-batch has merged, its `summary=` label switches to `dayTitle(day)`, same text)
- Modify: `app/src/components/map-renderer-props.ts` (remove `dayLabel` from `RealMapCanvasProps`, `:11`)
- Modify: `app/src/components/real-map-canvas-google.tsx` (remove the `dayLabel` param and the whole `data-map-day` overlay at `:195-198`)
- Modify: `app/src/components/real-map-canvas-maplibre.tsx` (same, `:171-174`)
- Modify: `app/src/components/map-canvas.module.css` (delete the now-unused `.dayPill` (`:82`) and `.overlayTl` (its entry in the shared rule at `:31` and its own block at `:40-43`); `grep -rn "overlayTl\|dayPill" app/src` → 0 hits after)
- Modify: `app/src/components/map-stop-carousel.tsx:123-125` (label → `dayTitle(day)`)
- Modify: `app/src/app/globals.css:293-297` (drop the dead `body[data-fullmap='1'] [data-map-day]` selector, keeping `[data-map-zoom]` / `[data-map-dist]`, and update the comment above it)
- Canvas overlays on the top edge (degraded-notice's top-right chip) must start below the bar row on md+ (`top: 68px` = 16px offset + 44px row + 8px gap). The degraded-notice plan owns that rule.

**Interfaces:**
- Consumes: Task 1 `dayTitle`, `dayChip`; `dayNav`, `stopActivateHref` from `@/lib/map-carousel`; `useMapPreview().clearPreview`.
- Produces:
  ```ts
  export function MapDayBar(props: {
    tripId: string;
    days: MapDay[];
    dayIdx: number;
  }): JSX.Element | null   // null when days.length === 0
  ```

Decided behavior:
- Root: `<nav aria-label="Trip days" className="pointer-events-auto flex min-w-0 shrink items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-[var(--shadow-md)]">`. It is positioned by the `PersistentMap` top row (below), which handles `hidden md:flex` and the 16px inset.
- ‹ / › are `<Link>`s to `stopActivateHref(tripId, prev/next, null)`, with `aria-label` `Previous day` / `Next day`. When `dayNav` returns `null` they render as a `<span aria-disabled="true">` styled `text-muted opacity-40`. Size `h-8 w-8 md:h-9 md:w-9`, rounded-full.
- Chips sit in `<ul className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">`. Each chip is a `<Link href={stopActivateHref(tripId, d.idx, null)} scroll={false} prefetch={false} aria-label={dayTitle(d)} aria-current={active ? 'true' : undefined}>`, with text `dayChip(d)`, or `` `${dayChip(d)} · ${d.label} ${d.num}` `` when active. Styling is `h-8 rounded-full px-3 text-sm font-semibold whitespace-nowrap`. Active chips get `bg-brand text-brand-foreground`, others `text-foreground hover:bg-surface-2`.
- `prefetch={false}`: a 14-day trip would otherwise prefetch 14 RSC payloads of the same page.
- Every link's `onClick` calls `clearPreview()` (Review Focus 4).
- Active chip into view: `useEffect([dayIdx])` sets the `ul`'s own `scrollLeft` so the active `<li>` is fully visible. Don't use `scrollIntoView`, which also scrolls the list column / page ancestors.
- `PersistentMap`: render a top row `<div className="pointer-events-none absolute inset-x-4 top-4 z-10 hidden items-start justify-between gap-2 md:flex">` inside the `<section>`, after the canvas/empty-state branch, with `{everOpened && day ? <MapDayBar … /> : null}` as its first child. The bar root then drops its own `absolute left-4 top-4 z-10 hidden md:flex` and `max-w-[…]` and becomes `pointer-events-auto flex min-w-0 shrink`. This row covers both the canvas and the "Add a spot…" placeholder. The search-distance plan's `MapSearchButton` becomes the row's right-hand child, so neither plan needs width math.
- History: `<Link>` pushes. That matches the desktop day chips in the list (`day-header.tsx:57`) and pin clicks (`activate` → `router.push`, `persistent-map.tsx:92`). It does not conflict with TP-0076's `replace`. The carousel switcher only exists in mobile full-map (`md:hidden`, `fullMap`, `map-stop-carousel.tsx:104,115`), and the bar is `hidden md:flex`, so the two are never on screen together.
- The carousel keeps its own ‹ label › pill (touch-sized 44px, `router.replace`). Only its label text switches to `dayTitle(day)`. No shared component: the shapes differ (stepper vs chip row) and the logic they share already lives in `lib/map-carousel.ts`.

- [x] **Step 1:** Implement `map-day-bar.tsx` per the behavior above.
- [x] **Step 2:** Wire it into `persistent-map.tsx`. Remove `dayLabel` from the props type and both renderers, along with the `data-map-day` overlay, `.overlayTl`, `.dayPill` and the dead `globals.css` selector. Point the carousel label at `dayTitle`.
- [x] **Step 3:** `cd app && pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [x] **Step 4: Commit** `feat(map): clickable day bar on the desktop map [TP-0099]`

### Task 3: Ghost dots + merged coincident pins in both renderers

**Files:**
- Create: `app/src/components/map-ghost-dot.tsx`
- Modify: `app/src/components/map-pin.tsx` (pin-redesign's `MapPin`: optional `label?: string` overrides `String(pin.idx)`; a label longer than 2 chars widens the shape into a pill)
- Modify: `app/src/lib/map-pin.ts` (`GHOST_Z_INDEX`)
- Modify: `app/src/components/map-renderer-props.ts` (add `ghosts`, `onGhostClick`)
- Modify: `app/src/components/real-map-canvas-google.tsx` (markers loop; `:122-139` at HEAD, rewritten by pin-redesign Task 4)
- Modify: `app/src/components/real-map-canvas-maplibre.tsx` (markers loop; `:86-109` at HEAD, likewise)
- Modify: `app/src/components/persistent-map.tsx` (compute ghosts, handle ghost click)

**Interfaces:**
- Consumes: Task 1 `ghostPins`, `GhostPin`, `groupPins`, `groupLabel`, `groupClickTarget`, `groupHoverId`, `groupTitle`; `MapPin`, `pinZIndex`, `pinAnchor`, `GHOST_Z_INDEX` (pin-redesign + this task); `useIsWide` from `./use-trip-map-visible`; `stopActivateHref`.
- Produces:
  - `RealMapCanvasProps.ghosts?: GhostPin[]` and `RealMapCanvasProps.onGhostClick?: (dayIdx: number) => void`
  - `GhostDot({ title, interactive }: { title: string; interactive?: boolean }): JSX.Element`: a 24×24 transparent hit box (`cursor: pointer`) centring a 10px circle, `background: var(--map-pin-ghost)`, with a `1.5px solid rgb(255 255 255 / 0.9)` border. This follows `MapPin`'s a11y split. With `interactive` (MapLibre) the root is a `<button type="button" aria-label={title}>`, focusable, and its click bubbles to the `Marker` `onClick`. Without it (Google) the root is a plain `aria-hidden` div, and the accessible name goes on the `AdvancedMarker` `title`, because the marker element is already the focusable button. Never a `div role="button"` without `tabIndex`: it isn't keyboard-reachable on MapLibre, and on Google it nests inside the clickable marker.
  - `MapPin` gains `label?: string`. When the label is longer than 2 chars, the shape gets `width: auto`, `min-width` = the default size, `padding-inline: 6px`, and a stay-square / pill radius. A drop keeps its tail. Number font, rings and active label stay as in pin-redesign.

Decided behavior (both renderers):
- `const groups = useMemo(() => groupPins(pins), [pins])`. Render one marker per group at `(g.lat, g.lng)`, keyed `g.key`, using `<MapPin pin={g.pins[0]} label={groupLabel(g)} active={…} />`. Anchor and kind come from `g.pins[0]` (begin/end hotel copies share a kind). `active = g.pins.some((p) => p.id === activePlaceId)`. Google `title={groupTitle(g)}`, `zIndex={pinZIndex(active)}`. MapLibre `style={{ zIndex: pinZIndex(active) }}`. Click → `onActivate?.(groupClickTarget(g, activePlaceId ?? null))`.
- Hover: replace the `hoveredPlaceId` state with `hoveredKey: string | null` (the group key), set by the mouse-only pointer enter/leave. Derive `const hoveredGroup = groups.find((g) => g.key === hoveredKey)` and `const hoveredPlaceId = hoveredGroup ? groupHoverId(hoveredGroup, activePlaceId ?? null) : null`. The existing `popupId` / `pinCard` / `popupPin` logic then works unchanged. A fixed `g.pins[0].id` would break the cycle: after the second click the mouse is still on the group, so `popupId = hoveredPlaceId ?? activePlaceId` would show stop 1's tooltip instead of stop N's card. If hover-sync has merged, report `onPinHover?.(hoveredPlaceId)` with this derived id.
- Ghosts render **before** the pins: one marker per ghost, `title` `` `Day ${g.dayIdx + 1}: ${g.name}` ``, `zIndex={GHOST_Z_INDEX}` (Google) / `style={{ zIndex: GHOST_Z_INDEX }}` (MapLibre), click → `onGhostClick?.(g.dayIdx)`. MapLibre: in the `Marker` `onClick`, call `e.originalEvent.stopPropagation()` as the pins do. Google ghosts render only when `overlays` (`ready && !degraded`), like the pins.
- z-order: always explicit (Global Constraints). MapLibre needs it too, because marker DOM order changes when ghosts remount on a day switch.
- `ActiveFocus*` and `pinsSig` still take the raw `pins`, so the camera is unchanged and ghosts never affect the day fit.
- `PersistentMap`: `const ghosts = useMemo(() => (isWide ? ghostPins(mapDays, dayIdx) : []), [isWide, mapDays, dayIdx])`. `onGhostClick = (d) => { clearPreview(); router.push(stopActivateHref(tripId, d, null), { scroll: false }); }`. Pass both to `RealMapCanvas`.

- [x] **Step 1:** Write `GhostDot`. Add `MapPin` `label` and `GHOST_Z_INDEX`, plus a `map-pin` test: `label` `'1 · 4'` renders that text, and with no label it renders `pin.idx`.
- [x] **Step 2:** Switch both renderers to groups + ghosts per the behavior above. Add the props. Wire `PersistentMap`.
- [x] **Step 3:** `cd app && pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [x] **Step 4: Commit** `feat(map): ghost dots for other days, merged pins at identical coords [TP-0099]`

### Task 4: Verify in the real app, update docs

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, trip `79efe162-dfb2-46c2-ad46-a34695771b8b`.
- [ ] 1440×900: the bar shows `‹ D1·Sat … D2 D3 D4 D5 ›` top-left. Clicking D3 frames day 3, the list opens day 3, and browser Back returns to day 2 (push). Other days' stops show as grey dots, and their hover title reads `Day 4: …`. Clicking a dot switches to that day. Screenshot.
- [ ] A day with a hotel middle night (if the test trip has none, use any trip whose hotel spans ≥ 2 nights): one pin labelled `1 · N`. Click → card for stop 1, click → card for N (not stop 1's tooltip; keep the mouse on the pin), click → closed. Keyboard (Tab to the marker, Enter) cycles the same way.
- [ ] Empty day (add `?day=` for a day with no located stops): the bar is still there, and ‹ › works.
- [ ] Open a search preview in the list, then click a different day chip → preview gone.
- [ ] Narrow to 800px wide with a long trip, or resize: chips scroll inside the bar, the active chip stays visible, and the page doesn't scroll sideways.
- [ ] 390×844: no bar and no ghosts; the carousel switcher works as before and its label reads `Day 1 · Sat 12`.
- [ ] `MAPS_PROVIDER=open` (MapLibre): same checks at 1440.
- [x] Update `AGENTS-INDEX.md` Map section: add `map-day-bar.tsx` (md+ day bar, Links, clears preview), `map-ghost-dot.tsx`, and the `lib/map-ghosts.ts` line (`ghostPins`, `groupPins`, `groupLabel`, `groupClickTarget`, `coordKey`). Extend the `lib/map-carousel.ts` line with `dayTitle`, `dayChip`. Note that `RealMapCanvasProps` lost `dayLabel` and gained `ghosts` / `onGhostClick`, `MapPin` gained `label`, and `lib/map-pin.ts` gained `GHOST_Z_INDEX`. Add `groupHoverId` / `groupTitle` to the `lib/map-ghosts.ts` line.
- [x] Update `REQUIREMENTS.md` §10. Replace "Floating chips: day label (top)" with "Day bar (top-left, md+): ‹ D1 D2 … › switches day; mobile full-map uses the carousel's switcher." Add "Other days' stops show as small ghost dots (md+); clicking one switches to its day." and "Stops at identical coordinates (e.g. a hotel's begin/end on a middle night) merge into one pin labelled `1 · 4`; clicking cycles through them."
- [x] Commit `docs: map day bar + ghost pins [TP-0099]`
