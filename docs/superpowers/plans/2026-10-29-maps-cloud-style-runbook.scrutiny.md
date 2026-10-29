# Scrutiny: maps cloud style runbook

Plan: [2026-10-29-maps-cloud-style-runbook.md](2026-10-29-maps-cloud-style-runbook.md) · Runbook: [docs/ops/google-maps-cloud-style.md](../../ops/google-maps-cloud-style.md) · Reviewed 2026-10-29 against HEAD `6f6f7a2` and Google's current docs.

## Intent

Calm the Google basemap so our pins stand out, using a cloud style on the existing Map ID. Attractions and parks stay tappable for TP-0077, and the change needs no code.

### Simpler alternatives considered

- **JSON `styles` in code.** Google ignores these when a `mapId` is set, and the app needs `mapId` for Advanced Markers. Cloud styling is the only layer that works, and it needs no deploy and can be rolled back in minutes. The plan uses the right layer.
- **`clickableIcons={false}`.** This would kill TP-0077. It is correctly rejected per §13's M11 amendment.

## Verified (no change needed)

- **Feature names.** The runbook's names match Google's current map-feature taxonomy (`developers.google.com/maps/documentation/cloud-customization/taxonomy`, fetched 2026-10-29). Each of these is listed there:
  - Entertainment: Arts, Casino, Cinema, Historic, Museum, Theme park, Tourist attraction
  - Food and drink: Bar, Cafe, Restaurant, Winery
  - Landmark; Lodging
  - Recreation: Beach … Zoo, including Sports complex, Sports field, Golf course, Boating, Fishing
  - Retail: Grocery, Shopping
  - Service: the nine entries listed
  - Transit: Airport
  - Other: Government, School, Library, Military, Cemetery, Place of worship (Buddhist, Shinto, …)
  - Infrastructure: Business corridor, Railway track (Commercial, Commuter), Road network → Road shield
  - Natural: Land, Water; and Political
  - Style elements: Pin fill, Pin glyph, Pin outline, Text fill (with opacity), Stroke (with opacity), Icon color
- **Dates** (cloud-styling release notes):
  - Legacy styles became unavailable on 2025-03-25.
  - Dark-mode styles, and associating them with a Map ID, arrived on 2025-03-31.
  - A Map ID holds one light style and one dark style; with no dark style set, Google's default dark style is used.
- **`colorScheme` is fixed at map creation** (Google `mapcolorscheme` doc). The app's code comment says vis.gl recreates the map when it changes (`real-map-canvas-google.tsx:86-88`), so check 5.9's live flip is plausible.
- **Code references:**
  - `mapId` and `colorScheme` are already passed in `real-map-canvas-google.tsx:92-93` and `pin-picker-map-google.tsx:28-29`.
  - The picker sets `clickableIcons={false}` (`:35`), and the trip map does not.
  - The cost guardrails row says 300 loads/day (`maps-cost-guardrails.md:29`).
  - The setup doc says §5 Vector (`google-maps-setup.md:89-95`).
  - "App pinned to light" is true (`app/layout.tsx:41`, `lib/user-settings-types.ts:13-17`).
- **TP-0077 keeps working** as long as tappable categories stay visible. The trip map has no `clickableIcons` prop (it defaults to true). `onClick` takes `e.detail.placeId` and calls `e.stop()` (`real-map-canvas-google.tsx:99-106`). Checks 5.2 and 5.3 cover a hidden category becoming untappable.

## Findings

### 1. Minor: the runbook says screenshots are gitignored, and they are not

- **Evidence:** `.gitignore` ignores only `docs/research/wanderlog/shots/`, and `docs/design-review/` is untracked at HEAD.
- **Why it matters:** a `git add docs/design-review` would commit the before/after PNGs.
- **Change:** the runbook now says the folder is not ignored, so don't commit the shots; attach them to the PR or ticket instead. **Applied.**

### 2. Minor: the Transit station rows used wrong names and the wrong element

- **Evidence:** the taxonomy lists "Rail station, Subway station, Bus station, Tram station, Ferry terminal, Monorail, Funicular station, Gondola station, Bicycle share". These are infrastructure icons, so the style element is "Icon color" (non-POI icons), not "Pin fill".
- **Change:** both are corrected in runbook §2.2. **Applied.**

### 3. Minor: Landmark may ignore the grey pin color

- **Evidence:** release note 2024-09-26: "Landmark POIs will now be displayed as illustrated icons rather than POI pins."
- **Why it matters:** check 5.1 could be failed falsely because a colored landmark icon remains.
- **Change:** a note in the §2.1 Landmark row says a remaining color is not a failure. **Applied.**

### 4. Minor: the dark check needed a more robust method

- **Finding:** check 5.9 used only a live `data-theme` flip and said a reload would revert it.
- **Evidence:** the root layout honors a `theme=dark` cookie (`layout.tsx:55-58`).
- **Change:** check 5.9 now leads with `document.cookie='theme=dark; path=/'` plus a reload, keeps the live flip as an alternative, says to delete the cookie afterwards, and notes that Google labels dark styles experimental. The plan's Review Focus #2 is updated to match. **Applied.**

### 5. Decision for the user: Retail → Shopping

- **Finding:** §7.1 hides `poi.business`, so the runbook sets Retail to Off. That makes shopping streets and markets that Google files as Shopping (e.g. Komachi-dori in Kamakura, on the test trip's route) untappable. This is the same trade-off as Decision A (food).
- **Change:** added as **Decision C** in the plan, with the default Hidden per §7.1, plus a note in the runbook under Decision A. **Left for the user.**

## Cross-plan

- **map-pin-redesign:** the grey POI pins (`#7b8794`, `#b8bec6`) don't collide with the new pin tokens (teal, orange-brown, navy, slate). The two plans are independent, and either can land first. The light-locked pins decision (pin plan Decision 1) pairs with this plan's dark style.
- **research-usability-telemetry:** POI-tap telemetry (`use-poi-preview`) would show whether hiding Retail costs taps. That supports revisiting Decision C later.

## Verdict

**Ship.** The small fixes are applied, and Decision C (Retail) is the only open item. The plan is correctly console-only, its feature names match Google's current taxonomy, and its verification checks cover the one real risk: a hidden POI becoming untappable.
