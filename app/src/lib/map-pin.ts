import type { Pin } from './map-helpers';

// Pure rules for the trip-map pin (components/map-pin.tsx), shared by the
// Google and MapLibre renderers.

type Kind = Pin['kind'];

/** Accessible name: `Stop n: name, time` (time and name optional). */
export function pinTitle(pin: Pin): string {
  if (!pin.name) return `Stop ${pin.idx}`;
  return `Stop ${pin.idx}: ${pin.name}${pin.time ? `, ${pin.time}` : ''}`;
}

/** Stays draw as a rounded square; every other kind is a teardrop. */
export function pinShape(kind: Kind): 'drop' | 'square' {
  return kind === 'hotel' ? 'square' : 'drop';
}

/** Teardrop tip sits on the coordinate; the stay square is centered on it. */
export function pinAnchor(kind: Kind): 'bottom' | 'center' {
  return pinShape(kind) === 'drop' ? 'bottom' : 'center';
}

/**
 * px from the anchor to the popup's bottom edge, so tooltip/card sit above the
 * pin. Drop: 44px × hover 1.12 ≈ 50 + gap; active: 54 + 6px outer ring + 2.
 * Square: half of 40 + gap; active adds the rings.
 */
export function pinPopupOffset(kind: Kind, active: boolean): number {
  if (pinShape(kind) === 'square') return active ? 30 : 24;
  return active ? 62 : 52;
}

// Shared marker z-scale (design roadmap; every marker sets one, since Google
// leaves mixed explicit/unset zIndex ordering undefined): ghost 1 · route
// label 5 · pin 10 · cluster 15 · hover-highlight 50 · active 100 · preview 1000.
export const PREVIEW_Z_INDEX = 1000;

// MapLibre popups (tooltip, pin card, preview card) share the canvas container
// with the markers and have no z-index of their own, so without this every
// pin (10+) would paint over them. Google's InfoWindow pane already sits above
// all markers.
export const POPUP_Z_INDEX = 1100;

/** Active 100 · list/pin-hover highlight 50 · default 10. */
export function pinZIndex(active: boolean, highlight = false): number {
  if (active) return 100;
  return highlight ? 50 : 10;
}
