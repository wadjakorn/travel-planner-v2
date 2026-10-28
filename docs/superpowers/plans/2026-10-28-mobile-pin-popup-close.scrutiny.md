# Scrutiny — mobile pin popup close

Plan: [2026-10-28-mobile-pin-popup-close.md](2026-10-28-mobile-pin-popup-close.md)

## Intent

Let mobile users close the pin popup on the trip map.

### Simpler alternatives considered

- **Native close buttons:** MapLibre `closeButton` / Google `headerDisabled={false}`.
  Rejected. MapLibre's × is tiny, and Google's header bar eats card height. Neither
  matches the ✕ on the search-preview card. A custom ✕ that reuses `onActivate` adds no
  new state.
- **Do nothing / tap-empty-map:** the user ruled these out.
- **Fix #2 (pointer-type hover) only:** not enough. Users still have no target to tap,
  because the popup covers the pin.

## Findings

### 1. Major — closing would snap the camera to the whole day

- **Finding:** closing via ✕ refits the map instantly. The original plan said "leave it".
- **Why it matters:** once the ✕ is the main way to close, every close jumps the map
  (`duration: 0`) and the user loses their place.
- **Evidence:** ✕ → `activePlaceId=null` → `mapFocus(null, null, true)` returns `fit`
  (`lib/map-preview.ts:89-93`) → `fitBounds(..., duration: 0)`
  (`map-active-focus-maplibre.tsx:67`). The Google renderer does the same (`map-active-focus-google.tsx:79-93`).
- **Change:** return `stay` when the active pin is cleared and `pinsSig` is unchanged.
  A day switch also clears `placeId` (`persistent-map.tsx:47`), so the `pinsSig` guard
  is required. Add unit tests in `map-preview.test.ts`. **Applied to the plan (§4).**

### 2. Major — non-Google active pins would still be unclosable

- **Finding:** the ✕ in `PinCard` only appears when the pin has a `googleId`.
- **Why it matters:** custom and legacy places keep the bug.
- **Evidence:** `pinCard = !!popupPin?.googleId && ...` (`real-map-canvas-maplibre.tsx:51`,
  `real-map-canvas-google.tsx:77`), and the tooltip has no ✕.
- **Change:** don't create a new `PinTooltip`. Drop the `googleId` gate, since
  `usePinPhoto(null)` already returns `null` (`use-pin-photo.ts:21`). This is simpler
  than what the plan first proposed. **Applied (§3).**

### 3. Confirmed — the hover fix is load-bearing

- **Claim checked:** the ✕ only works if the hover fix ships with it.
- **Trace:** a touch tap fires a compat `mouseenter` → `hoveredPlaceId=id`. No
  `mouseleave` ever follows. After ✕, `popupId = hoveredPlaceId ?? null`, so the
  popup re-renders as the tooltip.
- **Result:** the `pointerType === 'mouse'` guard on `pointerenter`/`pointerleave`
  removes this. Desktop flow: click pin → hovered and active are both set → moving
  onto the card fires `pointerleave` on the pin → only the active card remains → ✕ → gone.

### 4. Minor — close latency goes through the server

- **Finding:** closing waits on a server round-trip.
- **Why it matters:** on a slow mobile connection, the ✕ may look unresponsive for a
  moment.
- **Evidence:** `activate()` does `router.push` (`persistent-map.tsx:69-73`), and
  `trip/[id]/page.tsx:80` reads `placeId` on the server, so a close needs an RSC
  round-trip. Opening a pin has the same latency today.
- **Change:** none now. Check on a real device. If it's slow, add a local
  `dismissedId` to hide the popup optimistically.

### 5. Nit — each close adds a history entry

- **Finding:** each close pushes a history entry, so Back reopens the popup.
- **Why it matters:** low impact. The existing toggle and the list row
  (`sortable-place-list.tsx:93`) already behave this way.
- **Change:** keep it consistent and don't change it here.

## What I traced

- Popup selection in both renderers.
- `onActivate` → `persistent-map.activate` → URL → `activePlaceId` validation.
- `ActiveFocus` and `ActiveFocusGoogle` → `mapFocus` branches.
- `usePinPhoto` handling of null.
- `RealMapCanvas` has a single caller (`persistent-map.tsx:106`), so `onActivate` is
  always provided.
- Tests are node-only (`vitest.config.ts:15-16`), so the UI checks are manual
  Playwright runs. Only `mapFocus` gets unit tests.

## Verdict

**Fix-then-ship.** Findings 1 and 2 are already folded into the plan. The biggest
reason: without the camera `stay` branch, the new ✕ would make the map jump on every close.
