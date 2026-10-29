# Scrutiny: map pin redesign

Plan: [2026-10-29-map-pin-redesign.md](2026-10-29-map-pin-redesign.md) · Reviewed against HEAD `6f6f7a2` (main).

## Intent

Replace the 28px colored circle with a token-driven `MapPin` component. Pins keep their kind color when active, carry a kind icon and an accessible name, and both renderers use the same component.

### Simpler alternatives considered

- **Recolor the existing circle.** Swap `KIND_COLOR` to the §7.2 tokens, keep the kind color when active, and add `title`/`aria-label`. That fixes M1, A1, A10 and §2.3 with no anchor or popup-offset changes. §7.2 explicitly asks for the teardrop, stay square and active label, though, so the full plan is justified. The cost is concentrated in the anchor change: popup offsets, the preview card position and the MapLibre construction-time anchor. The findings below cover those.
- **vis.gl `<Pin>` (PinElement).** It only works on Google, and MapLibre needs DOM markers anyway. One shared DOM component is the right call.

## Verified (no change needed)

- **CSS variables and CSS-module classes resolve in pin and popup DOM.** vis.gl creates a plain `div`, sets it as `marker.content`, and portals children into it (`@vis.gl/react-google-maps` `dist/index.modern.mjs:1454-1455`, `:1417`). That is light DOM inside the document, so page stylesheets apply. Google's own custom-HTML marker examples style content with page classes. Custom properties inherit across shadow boundaries in any case. The existing rule `globals.css` `[aria-label^='Preview:'][role='img']` already styles marker content this way. `InfoWindow` content is another vis.gl-created `div` (`:1801`). MapLibre `Marker` and `Popup` elements live in the map container (`.tp-preview-popup .maplibregl-popup-content` already targets them).
- **`--font-sans` is emitted at runtime**, even though it is declared in `@theme inline` (`globals.css:161`). `body` references it, and the built CSS contains `--font-sans:var(--font-geist-sans)…` (`.next/static/chunks/*.css`).
- **`--map-card-link: var(--brand-700)` stays light-locked.** `--brand-700` is not overridden in `[data-theme="dark"]` (`globals.css:85-118`).
- **Contrast claims hold** (computed): white on `#0f766e` 5.47, `#c2410c` 5.18, `#1e3a8a` 10.36, `#334155` 10.35. `--map-card-muted #6e6e77` on white is 5.05.
- **MapLibre focus.** A custom marker element gets no `tabindex` or `role` from maplibre-gl 6.14: `_updateTabIndex` and `_updateAccessibilityRole` act only on default markers or markers with a popup (`maplibre-gl/src/ui/marker.ts:965-1001`). The inner `<button>` is therefore the only tab stop. Its click bubbles to the `getElement().addEventListener('click')` listener that react-map-gl registers, so Enter and Space activate exactly once.
- **Google props exist in 1.8.3:** `title` and `zIndex` are bound via `usePropBinding` (`:1477-1478`), and `anchorPoint` (`AdvancedMarkerAnchorPoint.BOTTOM`) is reactive (`useAdvancedMarkerAnchoring`, `:1521-1573`).
- **`KIND_COLOR` as `var()` strings is safe.** The only non-badge consumer is `map-stop-carousel.tsx:169`, a DOM `style.background`. `MODE_COLOR` is unused at HEAD (grep), so changing its values breaks nothing.
- **Icons** `Camera`, `Fork`, `Bed`, `Train` and `Plus` exist in `components/icons.tsx`.
- **TP-0077 POI tap is unaffected.** `Map onClick` → `e.detail.placeId` → `e.stop()` (`real-map-canvas-google.tsx:99-106`) is independent of the markers. Only the preview pin's look and anchor change; see finding 4.

## Findings

### 1. Major: the dark-mode check cannot be run as written (Task 5 Step 7)

- **Finding:** the step says "Settings → dark theme", but there is no such control.
- **Why it matters:** the plan's top decision (light-locked pins and popups) would go unverified, or the executor would stall.
- **Evidence:** the Appearance picker is "coming soon" and the app is pinned to light (`app/layout.tsx:41-58`, `theme-watcher.tsx:6-8`, `lib/user-settings-types.ts:13-17`, where the default is `'light'`). The layout does honor a `theme=dark` cookie (`pref === 'dark' ? 'dark' : 'light'`, `layout.tsx:55-58`).
- **Change:** set `document.cookie = 'theme=dark; path=/'`, reload, check, then delete the cookie. **Applied.**

### 2. Major: the MapLibre anchor goes stale when a place's kind changes

- **Finding:** `Marker anchor={pinAnchor(pin.kind)}` is construction-time only, and the plan assumes a kind never changes under the same id.
- **Why it matters:** if an editor switches a place to Hotel (or back), its pin draws 22px off its coordinate until a remount.
- **Evidence:** react-map-gl 8.1.3's marker update effect syncs `offset`, `style`, `className`, `draggable`, `rotation` and the alignments, but never `anchor` (`dist/maplibre.cjs` ~L990-1030). Kind is editable in `place-form.tsx:81` and `place-manual-form.tsx:112`.
- **Change:** key the marker as `` `${pin.id}:${pinAnchor(pin.kind)}` ``. **Applied** (Task 4, MapLibre).

### 3. Major: cross-plan ordering against the plans that extend `PinBadge`

- **Finding:** this plan deletes `map-pin-badge.tsx`, while `map-hover-sync` (`highlight`), `map-day-bar-ghost-pins` (`idx` → `label` pill, `--map-pin-ghost`) and `map-trip-overview` (`color`, `icon`) each add props to `PinBadge`. `ds-foundations` also edits its font line.
- **Why it matters:** the order decides whether three plans rebase onto a deleted file, or this plan has to port three prop semantics, including day-bar's "1·4" pill, onto a teardrop.
- **Resolution:** **pin-redesign lands first.** Then route-lines (which needs Task 1), hover-sync, day-bar, and overview (which needs day-bar). The other plans each add one prop to `MapPin`. Hover-sync's `highlight` reuses the hover CSS rule this plan already defines. **Applied:** a "Landing order" line under Touches and a "Downstream plans" table at the end of the plan.

### 4. Minor: the preview card moves 30px higher

- **Finding:** the preview popup offset goes from 22 to 52 (bottom-anchored drop), but `PREVIEW_OFFSET_Y = 120` (`lib/map-preview.ts:12`) still places the coordinate by the old geometry.
- **Why it matters:** on short maps (tablet, or mobile full-map), the top of the search/POI preview card (TP-0062/TP-0077) can clip.
- **Change:** Task 5 Step 6 now checks the POI-tap preview at both sizes. If the card clips, raise `PREVIEW_OFFSET_Y` to 150, which keeps today's framing. **Applied.**

### 5. Minor: `:lang(th)` never matches

- **Finding:** popup title and meta get `line-height 1.45` only under `:lang(th)`.
- **Evidence:** `<html lang="en">` is hard-coded (`app/layout.tsx:63`) until i18n P6. Stop names are Thai or Japanese whatever the UI language.
- **Change:** make it unconditional. **Applied.**

### 6. Nit: `.pin:focus-visible` is MapLibre-only

On Google, focus lands on the `gmp-advanced-marker` element, which is outside `MapPin`, so keyboard users get the global outline but no scale. **Applied:** the plan now documents this; no global selector added.

### 7. Nit: equal `zIndex` on every non-active pin

The plan's "mixing explicit and unset zIndex is undefined" is paraphrased, not cited. Giving all inactive pins `10` may replace Google's default stacking (lower on screen = in front) with DOM order. This is low impact. The Task 5 overlap check will show it. **Left as is.**

### 8. Nit: `rg` working directory

Task 4 Step 3 ran `rg … app/src` and then `cd app`. **Applied:** it now does `cd app && rg … src`.

## Cross-plan (recorded here and in the plan)

- **map-hover-sync:** put `highlight` on `MapPin` (`data-highlight`, same rule as `.pin:hover`).
- **map-day-bar-ghost-pins:** `label` goes on `MapPin`, and a long label needs its own treatment on the drop head. Skip `--map-pin-ghost` (this plan defines it). Give ghost `AdvancedMarker`s an explicit `zIndex`, because every pin now sets one.
- **map-trip-overview:** only `color` goes on `MapPin`. Its scrutiny dropped `icon`, because the hotel kind already draws square + bed, and the plan's Downstream table now matches.
- **Shared Google zIndex scale** (owned by `lib/map-pin.ts`; every marker sets one): ghost 1, route label 5, pin 10, hover-highlight 50, active 100, preview 1000. This matches the day-bar and hover-sync scrutiny files and is added to the plan's Downstream section.
- **ds-foundations:** drop its font-family edits to `map-pin-badge.tsx`, `pin-card.tsx`, `map-preview-marker.tsx` and the two canvas tooltips, which this plan replaces with modules on `var(--font-sans)`. If it lands first, use `--dur-fast` for the 120ms.
- **ds-hex-codemod:** already adds `--map-route-*` "only if absent". No change.
- **a11y-batch:** edits `pin-card.tsx` (role="group", Esc) and `map-preview-marker.tsx`. Only textual overlap (inline styles → module); either order works.
- **map-camera-rules:** bottom-anchored drops extend 44–60px above their coordinate. A top fit padding of 48 can crop an active pin at the top edge, so consider ≥ 64.

## Verdict

**Fix-then-ship.** All fixes are applied. The design is sound and CSS reaches every pin and popup surface. The real risks were a dark-mode check that couldn't run and a stale MapLibre anchor; both are now fixed in the plan.

## Cross-plan (appended by the day-bar / overview / search-distance scrutiny)
- **Shared z-scale lives in `lib/map-pin.ts`:** ghost `GHOST_Z_INDEX = 1` (added by day-bar), route label 5, pin `pinZIndex(false) = 10`, cluster `CLUSTER_Z_INDEX = 15` (added by trip-overview), hover-highlight 50 (hover-sync should use this instead of 800 / unset), active `pinZIndex(true) = 100`, preview 1000. Every marker is explicit.
- **`MapPin` gains two optional props later:** `label?: string` from day-bar (merged `1 · 4`; a label longer than 2 chars widens the head into a pill), and `color?: string` from trip-overview (per-day color via `--pin-color`). Neither changes this plan; keep the head width CSS-driven so it can grow.

## Cross-plan (appended by the camera-rules / hover-sync / degraded-notice scrutiny)
- **map-hover-sync** now depends on this plan landing first. It adds `MapPin` `highlight` → `data-highlight`, which joins the `.pin:hover .shape` selector (so reduced motion follows this plan's no-transform rule), and it extends `pinZIndex(active, highlight = false)` → 100 / 50 / 10, matching the shared z-scale above. It also adds one `pinZIndex` test.
- **map-camera-rules:** whichever plan lands second raises `ACTIVE_CARD_CLEARANCE.top` 280 → 330 and `PREVIEW_CARD_CLEARANCE.top` 340 → 370, following this plan's `pinPopupOffset`, and raises `fitPadding(false).top` 48 → 64 (your note). `PREVIEW_OFFSET_Y` survives for far previews, so your fallback to 150 still applies.

## Cross-plan (appended by the ds-foundations / ds-hex-codemod scrutinies, 2026-10-29)
- Shared test helpers: `map-tokens.test.ts` imports `rootTokens`/`contrast` from `app/test/css-tokens.ts` (created by ds-foundations Task 1, or by whichever plan lands first) instead of a local copy.
- The hex-codemod raw-color ratchet is now **exact** (fails on increase *and* decrease). Mirror lines in `lib/map-helpers.ts` (`KIND_COLOR`, `MODE_COLOR`) carry `// hex-ok: mirrors --map-… (parity-tested)`, so value changes don't touch the baseline. Removing hex from `pin-card.tsx`/`map-preview-marker.tsx`, or deleting `map-pin-badge.tsx`, requires `UPDATE_RAW_COLOR_BASELINE=1` in the same PR if the codemod landed first.
- `--map-route-{walk,drive,transit}`: whichever plan lands first defines them in the map token block; the other skips (no duplicate declarations).
- If ds-foundations lands first, new module text must be ≥ 12px and transitions must use `--dur-*` (its guards). The 120ms is `var(--dur-fast)`.
