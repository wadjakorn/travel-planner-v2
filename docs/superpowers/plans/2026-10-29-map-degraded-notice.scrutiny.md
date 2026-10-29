# Scrutiny: map degraded notice

Plan: [2026-10-29-map-degraded-notice.md](2026-10-29-map-degraded-notice.md). Traced against `main` @ `6f6f7a2`.

## Intent

When Google Maps fails and the session falls back to MapLibre, tell the user with a small dismissible chip and log the cause once. The plan also adds clearer copy for the map's no-places placeholder.

### Simpler alternatives considered

- **Do nothing.** M13 is a 🟢 item, but the fallback changes the map's look with no explanation, and the review captured that confusion on screen (ภาพ 02). It is small and worth doing.
- **Inline the chip with no new lib file.** A pure `degradeOnce` is the only way to unit-test once-only logging and the open-mode no-op without a DOM test environment (vitest here is node, `*.test.ts`). It also gives telemetry its hook. **Kept.**
- **Show the chip from `PersistentMap` instead of inside the MapLibre canvas.** This would also cover the empty-day placeholder, but it would need its own position logic outside `.mapWrap`. After the camera-rules plan, the placeholder only shows for trips with no located place at all, where there is no map to explain. **Kept the plan.**

## Findings

### 1. Major: in open mode a MapLibre render error would show "Google unavailable". **Applied.**

- **Finding:** the plan claims "`degraded` can only become true from the Google loader, auth hook or boundaries" and concludes that the chip never shows in open mode. One of those boundaries is renderer-agnostic.
- **Why it matters:** an open-mode user whose MapLibre canvas throws once would see a chip blaming Google, a service they never used, plus a "Google Maps unavailable" warning in the console. That breaks Review Focus 5.
- **Evidence:** `MapRendererBoundary` wraps both renderers (`real-map-canvas.tsx`). Its `componentDidCatch` always calls `onError` = `markDegraded` (`google-map-error-boundary.tsx:54-55,76`). With `renderer === 'maplibre'`, `rendererBoundaryView` renders the children again on the first batch (`lib/maps/renderer-boundary.ts:21`), so the MapLibre canvas, and with it the chip, stays on screen with `degraded === true`. This misleading log already happens today.
- **Change (applied):** `degradeOnce(..., { enabled: value.renderer === 'google' })` makes `markDegraded` a no-op in open mode. The rest of the boundary's behaviour is unchanged: `degraded` has no effect in open mode, because `effectiveRenderer` already returns MapLibre (`lib/maps/client-config.ts:10-11`). A unit test was added.

### 2. Major: conflicts with the telemetry plan over `markDegraded`'s signature. **Applied (this side).**

- **Finding:** `2026-10-29-research-usability-telemetry.md:138` also rewrites `markDegraded`. It uses an optional `reason: 'auth' | 'load_error' | 'render_error' = 'load_error'`, and edits the same three call sites. This plan used `'auth-failure' | 'load-error' | 'render-error'`, required.
- **Why it matters:** the two PRs would conflict on every call site and end up with two reason vocabularies, one for the log and one for the event.
- **Change (applied):** this plan adopts the telemetry values (`auth`, `load_error`, `render_error`) and lands first. `onDegrade(reason)` is the single hook. The telemetry plan then only adds `track('map_degraded', { reason })` there and imports `DegradeReason`. The required (not defaulted) `reason` stays, because it is what makes `typecheck` catch a raw error object being passed as the reason (Review Focus 2). The "Not done: telemetry" note now points at the telemetry plan instead of claiming that no pipeline exists.

### 3. Major: the chip collides with the planned desktop "Search places" button. **Applied.**

- **Finding:** the chip sits at top-right, 16/16. `2026-10-29-map-search-distance.md` Task 4 puts `MapSearchButton` at the top right on md+. After the day-bar and search-distance scrutinies, that button is the right child of one md+ top row in `PersistentMap`, and canvas top overlays start at 68px.
- **Change (applied):** from `md` up, `.overlayTr` uses `top: 68px`, the value the day-bar and search-distance scrutiny files fixed. Mobile keeps 16 px plus the safe area, because the button and the day bar are hidden there. A desktop check was added to Task 3.

### 4. Nit: docs drift. **Applied.**

- `docs/ops/maps-cost-guardrails.md:153-157` quotes the old log line and `markDegraded()`. Task 3 now updates it.
- The chip's insertion point no longer anchors on the top-left day chip, which the day-bar plan deletes.

### 5. Nit: `role="status"` mounted together with its text may not be announced. Left as is.

- The live region and its content mount in the same commit, because the canvas itself mounts on degrade, and some screen readers skip that. This is a minor issue for a 🟢 item, and the visible chip is the primary signal. If the a11y pass wants it announced, mount an empty `role="status"` in the canvas and fill it later.

## Verified as claimed

- **Call sites.** `google-maps-api.tsx:15`, `google-map-error-boundary.tsx:29` and `:76`, and the auth hook at `maps-config-provider.tsx:29` are the only `markDegraded` callers (`grep`). Requiring `reason` makes `typecheck` flag any call site that is missed.
- **Once-only logging.** `gm_authFailure`, then the boundary catching the AdvancedMarker throw on the dead map, gives two calls. `degradeOnce` logs and flips state once, which matches today's `warned` ref (`maps-config-provider.tsx:17-24`).
- **Dismiss scope.** A module-level `dismissedThisPage` survives a canvas unmount and remount (day switch, sub-page) and resets on reload. That matches `degraded`, which is React state in the provider and also lasts one page load.
- **Cost.** No Google calls are added.

## Left for the user

- Nothing. The plan had no decisions, and the fixes above are mechanical.

## Cross-plan

- **`research-usability-telemetry`:** resolved by finding 2. This plan goes first, and telemetry rebases onto `onDegrade(reason)` and `DegradeReason` (`auth` | `load_error` | `render_error`). The telemetry plan's Task 4 edits to `maps-config-provider.tsx`, `google-maps-api.tsx:15` and `google-map-error-boundary.tsx:29,76` shrink to one `track()` line.
- **`map-search-distance`:** resolved by finding 3 (the chip sits at md+ `top: 68px`, agreed with the day-bar scrutiny).
- **`map-camera-rules`:** the placeholder copy here and the empty-day note there read correctly in either order. The two plans touch different CSS rules.

**Verdict: fix-then-ship (fixes applied).** The biggest issue was that the chip could have blamed Google in open mode.

## Coordinator cross-plan items (folded in)
- **Desktop top row (day bar left + search button right):** the chip starts at md+ `top: 68px`, below that row. Mobile keeps `16px + safe-area`. Applied in Global Constraints and Task 2.
- **Insertion point:** the chip renders as a sibling right after `</Map>` in `real-map-canvas-maplibre.tsx` (`:169`, before the corner overlays), not after the top-left `overlayTl` day chip that the day-bar plan deletes. Applied in Task 2.
- **Landing order:** degraded-notice does not depend on the map ordering, and it lands before research-usability-telemetry (finding 2).
