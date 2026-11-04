// Pure helpers for the transport place picker's stored (edit-mode) end.

import type { PlaceSelection } from '@/lib/places/pick';
import { deriveCode } from '@/lib/transport-compute';

export type EndInitial = {
  name?: string | null;
  code?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
};

function hasCoords(i: EndInitial): boolean {
  return Number.isFinite(i.lat) && Number.isFinite(i.lng);
}

/** "13.690, 100.750" — label of last resort for a coords-only end. */
export function shortCoords(lat: number, lng: number): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

/**
 * Initial picker selection for a stored end. Built when the end has a name OR
 * coordinates, and carries the stored coordinates, so editing only the code
 * chip (or nothing) never drops them. A coords-only end (stored by an agent)
 * is labelled by its code, else its short coordinates.
 */
export function initialSelection(initial: EndInitial | null | undefined): PlaceSelection | null {
  if (!initial) return null;
  const located = hasCoords(initial);
  const name = initial.name?.trim() || null;
  if (!name && !located) return null;
  const code = initial.code?.trim() || null;
  const label =
    name ?? code ?? shortCoords(initial.lat as number, initial.lng as number);
  return {
    name: label,
    code: name ? (code ?? deriveCode(name)) : code,
    secondary: null,
    lat: located ? (initial.lat as number) : null,
    lng: located ? (initial.lng as number) : null,
    placeId: located ? (initial.placeId ?? null) : null,
    utcOffsetMinutes: null,
  };
}

export type EffectiveEnd = {
  name: string | null;
  code: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

/**
 * What the form submits for one end. `reported` is the picker's last report:
 * undefined = it never reported (untouched → the stored values pass through
 * verbatim, no label synthesis), null = the user cleared the end (label, code
 * and coordinates all blank together), else the picked/edited selection.
 */
export function effectiveEnd(reported: PlaceSelection | null | undefined, stored: EndInitial): EffectiveEnd {
  if (reported === undefined) {
    return {
      name: stored.name ?? null,
      code: stored.code ?? null,
      lat: stored.lat ?? null,
      lng: stored.lng ?? null,
      placeId: stored.placeId ?? null,
    };
  }
  if (reported === null) return { name: null, code: null, lat: null, lng: null, placeId: null };
  return {
    name: reported.name,
    code: reported.code,
    lat: reported.lat,
    lng: reported.lng,
    placeId: reported.placeId,
  };
}
