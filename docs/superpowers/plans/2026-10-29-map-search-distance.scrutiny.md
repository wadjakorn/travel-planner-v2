# Scrutiny: search-result distance + map search shortcut

Plan: [2026-10-29-map-search-distance.md](2026-10-29-map-search-distance.md)

## Intent

Under each add-place search result, show how far it is from the day being planned, with no new billed lookups. On desktop, give the map a one-key way (`/` or a button) to reach the active day's search box.

### Simpler alternatives considered

- **Client-only haversine (spec M5 as written).** In prod (`google` mode) this works on almost no rows, because Google suggestions carry `lat/lng: null` (`lib/places/google.ts:96-104`, verified). Getting coords per row means a Details call per row, which isn't acceptable. So `origin` → `distanceMeters` is the only zero-cost route for Google rows. The plan is right.
- **Reuse `PlaceBiasProvider` instead of a new `DayStopsProvider`.** The layout already wraps `{children}` in a per-day context (`components/place-bias-context.tsx`, `app/trip/[id]/layout.tsx:84`). Adding `stopsByDay` + `units` to that provider saves one component and one wrap. It's an elegance point, not a defect. **Left** to the implementer.
- **A floating search input on the map.** The plan rejects it with sound reasons: a second session token, owner and busy state, and the list is always visible on md+. I agree.

## Verification of the key claim: `origin` → `distanceMeters`, no SKU change

- **Docs (fetched 2026-10-29):** [Place Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete). `origin` is "the origin point from which to calculate straight-line distance to the destination… If this value is omitted, straight-line distance will not be returned." `distanceMeters` sits on `placePrediction`. It is **omitted** for `route` predictions and when the value is `0` (< 1 m), and the docs say "don't display a zero distance to users". **Claim holds.**
- **Billing:** [Usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing). Autocomplete (New) is billed per request (Autocomplete Requests) or free inside a session that ends in Details (Autocomplete Session Usage). Field-mask tiering is documented only for Details / Nearby / Text Search. Neither `origin` nor `distanceMeters` is named as a billing input. **No SKU change, as far as the docs show** (that rests on the docs not mentioning it; Google publishes no explicit "origin is free" statement).
- **Code:** `googleAutocomplete` sends **no** `X-Goog-FieldMask` (`lib/places/google.ts:84-89`), so `distanceMeters` will come back unmasked. Nothing else in the path filters it. The in-app cap `gplaces:autocomplete` (`search.ts:81`) is unchanged.
- The verification and the field-mask caveat are now in Decision 1. **Applied.**

## Trace highlights
- Provider order and coord availability are correct: `searchPlaces` `search.ts:101-112`, Geoapify `geoapify.ts:28-38`, Photon `photon.ts:20-29`.
- `fetchSuggestions` (`lib/places/client.ts:6-18`) and `usePlaceSearch`'s `nearRef` pattern (`use-place-search.ts:20,38,57`) support adding `origin` the way the plan says.
- The test numbers check out: (35.6584, 139.7018) is about 48 m from the hotel, giving "≈ 50 m", and 3.9 km from the tower. 1234 m gives "1.2 km". `toFixed(3)` + `encodeURIComponent` gives `35.658%2C139.702`. The test pattern `google.test.ts:65` exists.
- The inline picker is editor-only and per open day (`days-accordion.tsx:312-323`), which matches the `/` shortcut's canEdit gate and the pending-focus handoff design.

## Findings

### 1. Major: the map button collides with the day bar and the degraded chip
- **Finding:** `absolute right-4 top-4` plus a `max-w-[calc(100%-13rem)]` patch to the day bar is magic-number coupling. Degraded-notice also puts a chip at top-right (`.overlayTr`, top 16px).
- **Change:** the button is the right-hand child of the day-bar plan's single md+ top row in `PersistentMap` (flex, `justify-between`). There is no width math, and canvas top overlays (degraded chip) start at 68px on md+, which degraded-notice owns. **Applied** (Task 4; the `map-day-bar.tsx` edit is removed; Touches / Depends on updated). **Cross-plan:** degraded-notice joins the md+ `top: 68px` rule.

### 2. Major: the `/` handler would fire below md
- **Finding:** the button is `hidden md:inline-flex` but stays mounted, so its window `keydown` listener runs on mobile too. That breaks the plan's own Global Constraint ("on md+").
- **Change:** the handler checks `useIsWide()`. **Applied.**

### 3. Minor: route `deps` shape
- **Finding:** `route.ts:17` builds `deps` as a union literal, so "`deps.origin = …`" doesn't type-check as written.
- **Change:** spell out the rebuilt object. **Applied.**

### 4. Minor: the cost doc target doesn't exist as described
- **Finding:** there is no "Autocomplete bullet" in `docs/ops/maps-cost-guardrails.md`. Google Places is a table row (`:26`).
- **Change:** point Step 5 at that row. **Applied.**

### 5. Decision for the user: origin precision
- 3 decimals shifts the origin by up to about 55 m, which is visible on short walks ("≈ 50 m" vs "≈ 100 m"). 4 decimals (≈ 11 m) costs almost nothing in privacy, since Google already receives the query, a 2-decimal `near`, and often the stop's own place id from an earlier add. **Recommend 4 decimals. Left** for the user (noted in Decision 1).

### 6. Nit: "≈ 0 m from Tokyo Tower"
- The coords path can print a zero distance (the plan's own test asserts it), while Google omits zero and asks apps not to show it. Consider returning `null` (or copy like "Already on this day") when the rounded distance is 0. **Left** (copy decision).

### 7. Nit: imperial ≥ 100 km
- The whole-km rule is applied before `formatDistance`, which converts "812 km" to "504.6 mi" with one decimal. That's harmless. **Left.**

### 8. Nit: split
- Tasks 1–3 (distance) don't depend on the day bar. Task 4 does. Shipping them as two PRs lets the distance ship in Phase 2 regardless of day-bar timing. **Noted in "Depends on"**, and the split is optional.

## Cross-plan resolutions
- Top row ownership: the day-bar plan owns the `PersistentMap` md+ top row, and this plan adds the right-hand child. Recorded in the day-bar scrutiny too.
- `formatNear` change (whole km ≥ 100 km) is shared with the map preview popup; camera-rules also edits `lib/map-preview.ts` (different functions), so expect a trivial rebase.

**Verdict: fix-then-ship.** The core claim (`origin` → `distanceMeters`, same SKU) checks out against the docs. The fixes were all layout and gating.

## Cross-plan (appended by the degraded-notice scrutiny)
- degraded-notice's `.overlayTr` uses md+ `top: 68px` (below the top row) and keeps 16px + safe-area on mobile, where the search button is hidden. **Applied** in that plan.

## Cross-plan (appended by the ds-hex-codemod scrutiny, 2026-10-29)
- hex-codemod Task 4 deletes every `[data-theme='dark']` rule in `place-search-picker.module.css` and adds the file to its zero-raw-color `STRICT` list. `.itemNear` uses `var(--muted)`, which already swaps per theme, so **don't add the dark override "next to `:304`"**. If this plan lands first, its dark rule gets deleted by the codemod anyway.
- The new text is 12px (meets the ds-foundations 12px floor).
