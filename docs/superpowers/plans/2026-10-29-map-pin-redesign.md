# Map Pin Redesign Implementation Plan

> **Ticket:** TP-0084

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 28px colored circle (`map-pin-badge.tsx`) with a token-driven `MapPin` (teardrop / stay square, kind icon, active ring + name label, preview variant), used by both map renderers, with a real accessible name on every pin.

**Architecture:** Map tokens (`--map-pin-*`, `--map-route-*`, `--map-card-*`) go in `globals.css` `:root` only (pins stay light in dark mode). Pins are DOM in both renderers (Google `AdvancedMarker` content and MapLibre `Marker` children are ordinary light-DOM nodes), so `MapPin` styles with a CSS module + `var(--…)`. A TS mirror is kept only where a renderer needs raw values (route colors for Polyline / MapLibre paint, used by the route-lines plan); a vitest reads `globals.css` to keep the mirror and the contrast floor honest. Pure rules (accessible name, anchor, popup offset) live in `lib/map-pin.ts`.

**Tech Stack:** Next.js 16, React 19, CSS Modules, `@vis.gl/react-google-maps` 1.8.3 (`AdvancedMarker` `title`/`zIndex`/`anchorPoint`), `react-map-gl/maplibre` 8.1.3 (`Marker` `anchor`/`style`), vitest (node env, `*.test.ts` only — no DOM tests).

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §7.2 (handoff), §2.2 M1, §2.3 (active loses kind), §5 A1/A6/A10, §6 (map tokens, MapPin row), TL;DR #3. Ticket proposal MAP-02.

**Touches:** `app/src/app/globals.css` (new `:root` token block + remove `tp-preview-pulse` rules), `lib/map-helpers.ts` (`KIND_COLOR`, `MODE_COLOR` values), `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx`, `map-preview-marker.tsx`, `pin-card.tsx`. Deletes `map-pin-badge.tsx`.

**Landing order (scrutiny, 2026-10-29):** this plan lands **before** `map-hover-sync`, `map-day-bar-ghost-pins` and `map-trip-overview` (all three add a prop to `PinBadge`, which this plan deletes) and before `map-route-lines` (needs Task 1). See "Downstream plans" at the end for where their props go on `MapPin`.

## Decision needed

1. **Dark mode (§11 Q6):** pins, pin card and hover tooltip stay light in dark mode (Google InfoWindow and MapLibre popup are white in both themes). **Default: yes** — map tokens are defined in `:root` only, never in `[data-theme="dark"]`; popup text uses light-locked `--map-card-*`, not `--foreground`/`--muted` (which flip and would render light-on-white).
2. **Color by kind vs by day (§11 Q4):** **Default: by kind** in the day view (review's own recommendation); by-day belongs to the trip-overview mode (MAP-13).
3. **Stay pin content:** §7.2 says "rounded square, bed icon". **Default:** rounded square that still shows its **number** with the bed as the corner kind icon — the list numbers hotel stops, and §2.4 requires pin numbers to match list numbers.

## Global Constraints

- Token values exactly (§7.2): `--map-pin-sight #0f766e`, `--map-pin-food #c2410c`, `--map-pin-stay #1e3a8a`, `--map-pin-other #334155`, `--map-pin-ghost rgb(148 163 184 / 0.6)`, `--map-route-walk #15803d`, `--map-route-drive #1d4ed8`, `--map-route-transit #7c3aed`. Plus (this plan): `--map-pin-fg #ffffff`, `--map-card-bg #ffffff`, `--map-card-fg #18181b`, `--map-card-muted #6e6e77`, `--map-card-link var(--brand-700)`.
- Kind → token: `sight→--map-pin-sight`, `food→--map-pin-food`, `hotel→--map-pin-stay`, `transit→--map-pin-other`.
- White digits on every `--map-pin-{sight,food,stay,other}` ≥ 4.5:1 (computed: 5.47 / 5.18 / 10.36 / 10.35).
- Sizes (§7.2): default teardrop 36×44 in a 44×44 hit box; active teardrop 44×54 (same kind color, 3px white ring, outer ring = kind color at 30%, name label under the pin, top z-order); stay = 40×40 rounded square (radius 10px), active adds the same two rings; preview = 36×44 teardrop, dashed border, no number, `+` icon, pulse once.
- Hover: `scale(1.12)` + `var(--shadow-md)`, `120ms ease-out`, origin = the anchor point; none under `prefers-reduced-motion`.
- Type: `var(--font-sans)`, 13px / 700 for the number; name label 12px / 600, `line-height: 1.45`, max-width 160px, one line, ellipsis.
- Accessible name, both renderers, EN (i18n forced to `en`): `Stop {n}: {name}, {time}`; drop `, {time}` when no time; `Stop {n}` when no name. Preview keeps `Preview: {name}`.
- CSS reaches the pins: Google `AdvancedMarker` content is a light-DOM `div` that vis.gl assigns to `marker.content` (`@vis.gl/react-google-maps` `index.modern.mjs:1454-1455`) and portals into; MapLibre `Marker`/`Popup` and Google `InfoWindow` content are plain DOM in the map container. So CSS-module classes and `:root` custom properties both apply (verified in scrutiny; the existing `[aria-label^='Preview:'][role='img']` rule in `globals.css` already styles marker content the same way).
- No new hex outside `globals.css` and the TS token mirror in `lib/map-helpers.ts`. Ghost pin **rendering** is out of scope (MAP-09); its token is defined now.
- No new Google calls; no change to billed loads.

## Review Focus

1. **Dark theme popups:** tooltip / pin card text must stay dark on the white InfoWindow/Popup when `data-theme="dark"`. Test: Task 1 asserts `--map-card-*` exist in `:root` and appear nowhere under `[data-theme="dark"]`; manual check in Task 5.
2. **MapLibre keyboard activation:** Tab reaches each pin, Enter/Space activates it exactly once (the `<button>` click bubbles to the Marker element listener — no second handler), and the accessible name is the full `Stop n: …` string. Manual check in Task 5 (axe/accessibility snapshot).
3. **Overlapping pins** (hotel begin/end at the same coords, two stops in one building): the active pin must draw on top. Google warns that mixing explicit and unset `zIndex` is undefined, so **every** pin gets a `zIndex` (Task 4). Test `pinZIndex` in Task 2.
4. **Popup position after the anchor change:** pins move from center- to bottom-anchored (stay stays centered); the card/tooltip must sit above the pin, not over it. Test `pinPopupOffset` per kind/state in Task 2; visual check Task 5.
5. **Long Thai / Japanese names on the active label:** one line, ellipsis at 160px, Thai descenders not clipped (`line-height 1.45`). Manual check with a long name in Task 5.

---

### Task 1: Map tokens + TS mirror + drift/contrast test

**Files:**
- Modify: `app/src/app/globals.css` (new block after the `--z-*` tokens inside `:root`, ~L82)
- Modify: `app/src/lib/map-helpers.ts:22-33` (`KIND_COLOR`, `MODE_COLOR`)
- Create: `app/src/lib/map-tokens.test.ts`

**Interfaces:**
- Produces (CSS): all tokens listed in Global Constraints, in `:root` only.
- Produces (TS, `lib/map-helpers.ts`):
  - `KIND_COLOR: Record<string, string>` — values become CSS var references: `{ hotel: 'var(--map-pin-stay)', food: 'var(--map-pin-food)', sight: 'var(--map-pin-sight)', transit: 'var(--map-pin-other)' }`. Existing caller `map-stop-carousel.tsx:169` (`style={{ background: KIND_COLOR[pin.kind] ?? KIND_COLOR.sight }}`) keeps working unchanged and now matches the pin.
  - `MODE_COLOR: Record<Mode, string>` — raw hex mirror of `--map-route-*` (Google `Polyline.strokeColor` and MapLibre paint can't read CSS vars): `{ walk: '#15803d', drive: '#1d4ed8', transit: '#7c3aed' }`. Currently unused (consumer: the route-lines plan).

- [ ] **Step 1: Write the failing test** `app/src/lib/map-tokens.test.ts` — reads `src/app/globals.css` with `fs.readFileSync`, splits the `:root { … }` block from `[data-theme="dark"] { … }`, parses `--name: value;` pairs. Local helper `contrast(hexA, hexB)` (WCAG relative luminance).

```ts
it('pin colors keep white digits at >= 4.5:1', () => {
  for (const k of ['sight', 'food', 'stay', 'other']) expect(contrast(root[`--map-pin-${k}`], '#ffffff')).toBeGreaterThanOrEqual(4.5);
});
it('route mirror matches the CSS tokens', () => {
  for (const m of ['walk', 'drive', 'transit'] as const) expect(MODE_COLOR[m]).toBe(root[`--map-route-${m}`]);
});
it('KIND_COLOR points at defined pin tokens', () => {
  expect(KIND_COLOR).toEqual({ hotel: 'var(--map-pin-stay)', food: 'var(--map-pin-food)', sight: 'var(--map-pin-sight)', transit: 'var(--map-pin-other)' });
  for (const v of Object.values(KIND_COLOR)) expect(root[v.slice(4, -1)]).toBeDefined();
});
it('map tokens are light-locked (not overridden in dark)', () => {
  expect(Object.keys(dark).filter((n) => n.startsWith('--map-'))).toEqual([]);
  expect(root['--map-card-fg']).toBe('#18181b');
});
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/map-tokens.test.ts` → FAIL (tokens undefined).
- [ ] **Step 3:** Add the token block (comment: "Map overlays — light in both themes (review §11 Q6); route colors mirrored in lib/map-helpers.ts MODE_COLOR") and update `KIND_COLOR` / `MODE_COLOR`.
- [ ] **Step 4:** Re-run → PASS. `pnpm typecheck && pnpm lint && pnpm test` → clean (tail -3).
- [ ] **Step 5:** Commit `feat(map): map pin/route/card tokens + TS mirror [TP-0084]`

### Task 2: Pure pin rules — `lib/map-pin.ts`

**Files:**
- Create: `app/src/lib/map-pin.ts`
- Test: `app/src/lib/map-pin.test.ts`

**Interfaces:**
- Consumes: `Pin` from `@/lib/map-helpers`.
- Produces:
  - `pinTitle(pin: Pin): string` — the accessible name (format in Global Constraints).
  - `pinShape(kind: Pin['kind']): 'drop' | 'square'` — `hotel → 'square'`, else `'drop'`.
  - `pinAnchor(kind: Pin['kind']): 'bottom' | 'center'` — drop → `'bottom'` (tip on the coordinate), square → `'center'`.
  - `pinPopupOffset(kind: Pin['kind'], active: boolean): number` — px from the anchor to the popup's bottom edge: drop `52` / active `62`; square `24` / active `30`. (Drop: 44px × hover 1.12 ≈ 50 + gap; active: 54 + 6px outer ring + 2.)
  - `pinZIndex(active: boolean): number` — `active ? 100 : 10`. Preview stays `1000` (existing).

- [ ] **Step 1: Write failing tests**

```ts
const p = (o: Partial<Pin> = {}): Pin => ({ id: 'a', idx: 2, kind: 'food', lat: 0, lng: 0, ...o });
it('pinTitle', () => {
  expect(pinTitle(p({ name: 'Tsuta Ramen', time: '19:30' }))).toBe('Stop 2: Tsuta Ramen, 19:30');
  expect(pinTitle(p({ name: 'Tsuta Ramen', time: null }))).toBe('Stop 2: Tsuta Ramen');
  expect(pinTitle(p())).toBe('Stop 2');
});
it('stay pins are centered squares; others bottom-anchored drops', () => {
  expect([pinShape('hotel'), pinAnchor('hotel')]).toEqual(['square', 'center']);
  expect([pinShape('sight'), pinAnchor('sight')]).toEqual(['drop', 'bottom']);
});
it('pinPopupOffset', () => {
  expect(pinPopupOffset('food', false)).toBe(52);
  expect(pinPopupOffset('food', true)).toBe(62);
  expect(pinPopupOffset('hotel', false)).toBe(24);
  expect(pinPopupOffset('hotel', true)).toBe(30);
});
it('active pin draws above the rest', () => expect(pinZIndex(true)).toBeGreaterThan(pinZIndex(false)));
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/map-pin.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement the five functions.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(map): pin rules — accessible name, anchor, popup offset [TP-0084]`

### Task 3: `MapPin` + `PreviewPin` components, popup bodies on tokens

**Files:**
- Create: `app/src/components/map-pin.tsx`, `app/src/components/map-pin.module.css`
- Create: `app/src/components/pin-card.module.css`
- Modify: `app/src/components/pin-card.tsx` (inline styles → module classes; add `PinTooltip`)
- Modify: `app/src/components/map-preview-marker.tsx` (`PreviewMarker` renders `PreviewPin`; `PreviewPopupBody` wrapper font → `var(--font-sans)`)
- Modify: `app/src/app/globals.css` (delete `@keyframes tp-preview-pulse` and its `[aria-label^='Preview:'][role='img']` reduced-motion rule, ~L176-183 — moved into `map-pin.module.css`)

**Interfaces:**
- Consumes: Task 1 tokens + `KIND_COLOR`; Task 2 `pinTitle`, `pinShape`.
- Produces:
  ```ts
  // interactive=true → <button type="button" aria-label={pinTitle(pin)}> (MapLibre: focusable, named)
  // interactive=false → <div aria-hidden="true"> (Google: the AdvancedMarker `title` names it)
  export function MapPin(props: { pin: Pin; active?: boolean; interactive?: boolean }): JSX.Element
  export function PreviewPin(props: { name: string }): JSX.Element   // role="img" aria-label={`Preview: ${name}`}
  export function PinTooltip(props: { pin: Pin }): JSX.Element       // in pin-card.tsx; replaces the two inline tooltip blocks
  ```
  `PinCard`'s props are unchanged.

Decided structure / values:
- Root `.pin` box: `width:44px; height:44px` (drop) / `44×54` (drop, active) / `44×44` (square); `display:flex; align-items:flex-end; justify-content:center; position:relative; background:none; border:0; padding:0; cursor:pointer`; `--pin-color: KIND_COLOR[kind]` set inline (the only inline style). `data-shape`, `data-active` attributes drive the CSS.
- Drop shape: inline SVG `viewBox="0 0 36 44"` path `M18 43C18 43 3 27.5 3 17a15 15 0 0 1 30 0c0 10.5-15 26-15 26z`, `fill: var(--pin-color)`, `stroke: var(--map-pin-fg)`, `stroke-width: 2`; rendered at 36×44, active at 44×54 (`overflow: visible`). Active draws the path twice: underneath with `stroke: color-mix(in srgb, var(--pin-color) 30%, transparent); stroke-width: 12` (outer ring), on top with `stroke-width: 6` white (3px ring outside the fill).
- Square: 40×40 `border-radius:10px`, `background: var(--pin-color)`, `border:2px solid var(--map-pin-fg)`; active: `box-shadow: 0 0 0 3px var(--map-pin-fg), 0 0 0 9px color-mix(in srgb, var(--pin-color) 30%, transparent)`.
- Number: centered on the drop's round head (top 17px of 44) / square center; `color: var(--map-pin-fg)`; 13px/700 `var(--font-sans)`; `letter-spacing:-0.02em`.
- Kind icon (A6 non-color cue): 16px white circle at the shape's top-right (`top:-2px; right:-2px` of the shape), 10px icon stroked in `var(--pin-color)`, `aria-hidden`. `sight→Camera`, `food→Fork`, `hotel→Bed`, `transit→Train` from `@/components/icons` (note: `icons.tsx` also exports an icon named `MapPin` — don't import it into `map-pin.tsx`).
- Active name label: `position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:4px` (outside the box, so it never moves the anchor); `background: var(--map-card-bg); color: var(--map-card-fg); border-radius: var(--radius-full); padding: 2px 8px; box-shadow: var(--shadow-sm)`; text per Global Constraints; `aria-hidden`.
- Hover/focus: `.pin:hover .shape, .pin:focus-visible .shape { transform: scale(1.12); filter: drop-shadow(0 4px 12px rgb(0 0 0 / 0.18)) }` (`--shadow-md` is a box-shadow; drop-shadow follows the teardrop), `transform-origin: 50% 100%` (drop) / `50% 50%` (square), `transition: transform 120ms ease-out`; inside `@media (prefers-reduced-motion: reduce)` no transform, no transition.
- Preview: drop path with `fill: var(--map-card-bg); stroke: var(--brand-700); stroke-dasharray: 4 3; stroke-width: 2`, `Plus` icon 14px in `var(--brand-700)` centered on the head; `animation: tp-pin-pulse 1.2s ease-out 1` (`@keyframes tp-pin-pulse` = `scale(0.6)→scale(1)` with opacity `0→1`); none under reduced motion.
- `PinTooltip` / `PinCard` classes: font `var(--font-sans)`; title `color: var(--map-card-fg)`; meta/close `var(--map-card-muted)`; link `var(--map-card-link)`; sizes as today (13/600 title + 12 meta tooltip; 14/600 + 12 card; card width 240, padding 12; ✕ keeps 32px target). `line-height: 1.45` on title/meta **unconditionally** (not `:lang(th)`: `<html lang="en">` is forced at `app/layout.tsx:63` until i18n P6, so a `:lang(th)` rule would never match, and stop names are Thai/Japanese regardless of UI language).
- Hover/focus scope: `.pin:focus-visible` only fires on MapLibre (the `<button>`). On Google, keyboard focus lands on the `gmp-advanced-marker` element, not on `MapPin`; it gets the global `:focus-visible` outline (`globals.css` ~L186) and no scale. Accepted — don't add a global `gmp-advanced-marker` selector.

- [ ] **Step 1:** Implement `map-pin.tsx` + `map-pin.module.css` per the values above.
- [ ] **Step 2:** Move `PinCard` styles into `pin-card.module.css`; add `PinTooltip`.
- [ ] **Step 3:** `PreviewMarker` → `<PreviewPin name={name} />` (keep the export so canvases don't change twice); remove the old globals.css pulse rules.
- [ ] **Step 4:** `cd app && pnpm typecheck && pnpm lint` → clean (tail -3). `rg -n "#[0-9a-fA-F]{3,6}|apple-system" src/components/map-pin* src/components/pin-card* src/components/map-preview-marker.tsx` → no matches.
- [ ] **Step 5:** Commit `feat(map): MapPin component — teardrop/stay, kind icon, active ring + label [TP-0084]`

### Task 4: Wire both renderers

**Files:**
- Modify: `app/src/components/real-map-canvas-google.tsx:122-192`
- Modify: `app/src/components/real-map-canvas-maplibre.tsx:86-168`
- Delete: `app/src/components/map-pin-badge.tsx`

**Interfaces:**
- Consumes: Task 2 `pinTitle`, `pinAnchor`, `pinPopupOffset`, `pinZIndex`; Task 3 `MapPin`, `PinTooltip`.
- Produces: no new exports. `RealMapCanvasProps` unchanged.

Google (`AdvancedMarker` per pin):
- `title={pinTitle(pin)}` (A10; Google turns it into the marker's accessible name), `zIndex={pinZIndex(active)}` on **every** pin, `anchorPoint={pinAnchor(pin.kind) === 'bottom' ? AdvancedMarkerAnchorPoint.BOTTOM : AdvancedMarkerAnchorPoint.CENTER}`.
- Content: keep the mouse-only hover wrapper `div`; inside `<MapPin pin={pin} active={active} />` (non-interactive — the marker element is already the clickable/focusable button).
- Preview marker: anchor `BOTTOM` (it's a drop now); its `InfoWindow` `pixelOffset={[0, -52]}` (was −22).
- Pin `InfoWindow`: `pixelOffset={[0, -pinPopupOffset(popupPin.kind, pinCard)]}`; tooltip branch → `<PinTooltip pin={popupPin} />`.
- If the native browser title tooltip doubles up with `PinTooltip` on hover in the Task 5 check, keep `title` (A10 wins) and note it in the PR; don't drop the accessible name.

MapLibre (`Marker` per pin):
- `anchor={pinAnchor(pin.kind)}` is a construction-time option in react-map-gl 8.1.3 (its update effect syncs `offset`/`style`/`className`/…, never `anchor`), and a place's kind **is** editable (`place-form.tsx:81`, `place-manual-form.tsx:112`). So key the marker by `` `${pin.id}:${pinAnchor(pin.kind)}` `` — a sight→hotel edit remounts it with the right anchor instead of leaving the square 22px off. `style={{ zIndex: pinZIndex(active) }}`.
- Content: hover wrapper → `<MapPin pin={pin} active={active} interactive />` (a `<button>`; its click bubbles to the Marker element's click listener → existing `onClick` → `onActivate`, so keyboard Enter/Space works with no extra handler).
- Preview `Marker`: `anchor="bottom"`, `style={{ zIndex: 1000 }}`; its `Popup` `offset={52}` (was 22).
- Pin `Popup`: `offset={pinPopupOffset(popupPin.kind, pinCard)}`; tooltip branch → `<PinTooltip pin={popupPin} />`.

- [ ] **Step 1:** Apply the Google changes.
- [ ] **Step 2:** Apply the MapLibre changes; delete `map-pin-badge.tsx`.
- [ ] **Step 3:** `cd app && rg -n "PinBadge|map-pin-badge" src` → no matches. `pnpm typecheck && pnpm lint && pnpm test` → all pass (tail -3).
- [ ] **Step 4:** Commit `feat(map): both renderers use MapPin; named, focusable pins [TP-0084]`

### Task 5: Verify in the real app + docs

**Files:**
- Modify: `AGENTS-INDEX.md` (Map table: replace the `map-pin-badge.tsx` row with `map-pin.tsx` — "`MapPin` (stop: drop / stay square, kind icon, active ring + name label; `interactive` = MapLibre button) + `PreviewPin`"; `pin-card.tsx` row adds `PinTooltip`; helpers line adds `lib/map-pin.ts` (`pinTitle`, `pinShape`, `pinAnchor`, `pinPopupOffset`, `pinZIndex`); note map tokens `--map-pin-*`/`--map-route-*`/`--map-card-*` in `globals.css`, mirrored by `MODE_COLOR`)
- Modify: `REQUIREMENTS.md` §10 (one bullet: "Pins: colored by kind from map tokens (light in both themes), kind icon as a non-color cue, active keeps its color with a ring + name label; each pin's accessible name is `Stop n: name, time` on both renderers.")
- Modify: `app/src/components/ui/README.md` (Tokens: one line pointing at the map token block and the "light-locked" rule)

- [ ] **Step 1:** `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`; open `/trip/79efe162-dfb2-46c2-ad46-a34695771b8b` at 1440×900.
- [ ] **Step 2:** Screenshot day 1: teardrops with kind icons; hotel is a square; pin tips sit on the places (compare with the list addresses). Computed `fill` of a food pin path = `rgb(194, 65, 12)`.
- [ ] **Step 3:** Click a food pin: it keeps orange-brown (not teal), grows, shows rings + name label, draws above neighbours; the card sits fully above the pin. Hover another pin: scale + tooltip above it.
- [ ] **Step 4:** Accessibility snapshot: Google markers read `Stop 2: …, 19:30`.
- [ ] **Step 5:** `MAPS_PROVIDER=open`: Tab moves through pins (focus ring visible), each named `Stop n: …`; Enter activates once (card opens; Enter again closes).
- [ ] **Step 6:** Search a place → preview drop with dashed border and `+`, pulses once; "Add to Day" card fully visible above it — also for a Google POI tap (TP-0077, same `PreviewPopupBody`) at 1440×900 and in 390×844 full-map. The card now sits 30px higher than before (popup offset 22 → 52 while `PREVIEW_OFFSET_Y = 120` in `lib/map-preview.ts:12` is unchanged); if its top clips, raise `PREVIEW_OFFSET_Y` to `150` (same framing as today) and note it in the PR. Emulate `prefers-reduced-motion: reduce`: no pulse, no hover scale.
- [ ] **Step 7:** Dark theme — the Settings Appearance picker is "coming soon" and the app is pinned to light (`app/layout.tsx:41-58`, `lib/user-settings-types.ts:13-17`), so there is no UI switch. In DevTools run `document.cookie = 'theme=dark; path=/'` and reload (the root layout resolves `pref === 'dark'` → `data-theme="dark"`); afterwards delete the cookie. Check: pins identical, tooltip/card text dark on white.
- [ ] **Step 8:** 390×844 full-map: carousel index circles match pin colors; pins tappable; active label not hidden behind the carousel (camera padding from TP-0076 keeps it above).
- [ ] **Step 9:** Update the three docs; commit `docs(index): MapPin + map tokens [TP-0084]`.

---

## Self-review notes

- Spec coverage: §7.2 tokens (Task 1), states default/hover/active/preview/stay (Task 3), 44px hit area (Task 3 box), ARIA (Tasks 2/4), font 13/700 (Task 3); M1 colors (Task 1); §2.3 active keeps kind (Task 3); A1 contrast (Task 1 test); A6 icon cue (Task 3); A10 names + MapLibre focus (Tasks 2/4). Ghost state: token only (rendering = MAP-09). List-row hover → pin hover (§7.2 "แถวในลิสต์ถูก hover") = MAP-06; it can add a `hovered` prop that sets the same `data-*` hook.
- Not here: merged "1 · 4" pin for same-coords stops (§7.5) — needs a multi-id marker and changes activation; z-order handles it until then.

## Downstream plans (scrutiny resolution, 2026-10-29)

This plan lands first; the plans below were written against `PinBadge` and must target `MapPin` (`components/map-pin.tsx`) instead. Don't add these props here — each plan adds its own.

| Plan | Their `PinBadge` change | On `MapPin` |
|---|---|---|
| `map-hover-sync` | `highlight?: boolean` (scale + shadow) | `highlight?: boolean` → `data-highlight` attribute; extend the existing `.pin:hover .shape` rule to `.pin[data-highlight] .shape` (same 1.12 / drop-shadow / 120ms / reduced-motion values) |

Shared Google `zIndex` scale (agreed across the map plans' scrutiny; `lib/map-pin.ts` owns it, every marker sets one): ghost 1 (day-bar `GHOST_Z_INDEX`) · route label 5 (route-lines) · pin 10 · hover-highlight 50 (hover-sync extends `pinZIndex`) · active 100 · preview 1000.
| `map-day-bar-ghost-pins` | `idx: number` → `label: string`, pill when > 2 chars ("1·4") | `label?: string` (default `String(pin.idx)`). A label longer than 2 chars ("1·4", "10·12") does not fit the 30px drop head at 13px; that plan picks the treatment (e.g. 11px, or a widened head) and adds a `pinTitle` variant for merged stops. Skip adding `--map-pin-ghost` (defined here). Ghost markers on Google need an explicit `zIndex` (e.g. `1`) because every pin now sets one. |
| `map-trip-overview` | `color?: string`, `icon?: ReactNode` | `color?: string` only — overrides `KIND_COLOR[kind]` via `--pin-color`. No `icon` prop: the `hotel` kind already renders the stay square + bed (per that plan's scrutiny) |
| `ds-foundations` | font line in `map-pin-badge.tsx:32`, `pin-card.tsx:20`, `map-preview-marker.tsx:45`, canvases' tooltip `fontFamily` | already `var(--font-sans)` in the new CSS modules — drop those five edits from that plan. Its `--dur-fast: 120ms` can replace the literal `120ms` here if it lands first. |

