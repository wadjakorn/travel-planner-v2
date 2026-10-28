# Mobile: close the pin popup on the trip map

**Status:** revised after /scrutinize — see [scrutiny](2026-10-28-mobile-pin-popup-close.scrutiny.md)
**Date:** 2026-10-28

## Problem

On mobile, once a map pin's popup is open there's no way to close it.

Root cause (both renderers: `real-map-canvas-maplibre.tsx`, `real-map-canvas-google.tsx`):

1. The popup shows `hoveredPlaceId ?? activePlaceId`. It has no close button
   (`closeButton={false}` / `headerDisabled`).
2. The only way to close it is to tap the same pin again. `activate()` in
   `persistent-map.tsx:69` toggles `?placeId=`, but the popup usually covers the pin.
3. **Sticky hover on touch:** tapping a pin fires an emulated `mouseenter` but never a
   `mouseleave`. So `hoveredPlaceId` stays set, and even after `activePlaceId` clears
   the popup stays visible as a tooltip.

## Decisions (from user)

- **No** tap-empty-map-to-close.
- **Yes:** add a small ✕ to `PinCard`.

## Scope

```mermaid
flowchart LR
  T[tap ✕ in popup] --> C[onClose = onActivate(pin.id)]
  C --> P[persistent-map activate → toggles ?placeId= off]
  P --> A[activePlaceId = null]
  A --> X{hoveredPlaceId?}
  X -- "touch: never set (fix 2)" --> Gone[popup gone]
  X -- "mouse: pointer still over popup, not pin" --> Gone
```

### 1. ✕ button in `PinCard`

- `PinCard` gets a new prop, `onClose: () => void`.
- Put the name row in a flex row with a ✕ button, reusing the `Close` icon and the
  style of the compact preview card (`place-preview-card.tsx:57-65`). Use the
  `aria-label` "Close".
- Mobile tap target: keep the 16px icon but give the button a 32×32 hit area (negative
  margin so the layout doesn't shift).
- Both renderers pass `onClose={() => onActivate?.(popupPin.id)}`. This reuses the
  existing toggle, with no new state or URL logic.

### 2. Hover only for real mice (required for #1 to work)

Without this fix, the ✕ clears `activePlaceId`, but on touch devices the sticky
`hoveredPlaceId` brings the popup straight back as a tooltip.

- In both renderers, swap the pin wrapper's `onMouseEnter`/`onMouseLeave` for
  `onPointerEnter`/`onPointerLeave`, guarded with `e.pointerType === 'mouse'`.
- Desktop hover tooltip keeps working as before.

### 3. Every active pin gets the card (simplified after scrutiny)

The card only shows when `pinCard = !!popupPin?.googleId && popupPin.id === activePlaceId`.
An **active** pin without a `googleId` (custom or legacy place) gets the light tooltip
instead, with no ✕, so the bug would remain for those pins.

- **Fix:** drop the `googleId` condition, so `pinCard = popupPin?.id === activePlaceId`.
  `usePinPhoto(null)` already returns `null` (`use-pin-photo.ts:21`), so a non-Google
  place gets the card with no photo: name, meta, ✕, and a Maps link from lat/lng.
- There's no new `PinTooltip` component. The hover tooltip stays inline and stays
  without a ✕, since it's hover-only and desktop-only after #2.

### 4. Keep the camera when the popup closes (now in scope)

Trace: ✕ → `activePlaceId=null` → `ActiveFocus` effect → `mapFocus(null, null, activeChanged=true)`
→ `{kind:'fit'}` → `map.fitBounds(..., duration: 0)` (`map-active-focus-maplibre.tsx:67`).
The map **snaps instantly to the whole day**. Today almost nobody hits this, because the
toggle pin is under the popup. The ✕ makes closing the main action, so this snap would
happen every time.

- `mapFocus` gets a `pinsChanged` arg:
  `if (activeChanged && !activePin && !preview && !pinsChanged) return { kind: 'stay' }`.
- `pinsChanged` matters because a day switch also clears `activePlaceId`
  (`persistent-map.tsx:47` checks `placeId` against the day's pins). That case must
  still refit.
- Both `ActiveFocus` (MapLibre) and `ActiveFocusGoogle` track `prevPinsSig` the same
  way they already track `prevActiveId`, and pass it in.
- Add node unit tests in `lib/map-preview.test.ts` for:
  - close on same day → `stay`
  - day switch → `fit`
  - pin A → pin B → `active`
  - preview active → `preview`

## Verification

There are no component tests (vitest is `node`-only, `*.test.ts`), so this is
verified manually with Playwright at a 390×844 touch viewport (`hasTouch`) plus desktop.
Check it on both renderers.

- [ ] Mobile: tap a pin → card opens → tap ✕ → popup gone and stays gone; `?placeId=` removed.
- [ ] Mobile: tap the same pin again → it reopens.
- [ ] Mobile: tap pin A, then pin B → card switches; ✕ closes B.
- [ ] Desktop: hover tooltip still appears and disappears; click → card; ✕ closes it.
- [ ] Closing with ✕ keeps the camera where it is (no snap). Switching day still refits.
- [ ] A non-Google pin (custom place) also gets the card with a ✕.
- [ ] Search preview popup is unaffected.
- [ ] `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` all pass.

## Process

`pm` ticket first → worktree from fresh `origin/main` → implement → PR.
