// Location resolution for the PATCH /places/:id merge-patch (TP-0145).
//
// Absent fields keep their stored value, so the pin only moves on new location
// input: a googleMapsUrl, or an `address` that actually changed while
// `lat`/`lng` were not sent. A re-resolve that finds nothing keeps the stored
// pin (and placeIdExternal) and returns the warning, like hotel PATCH.

import 'server-only';
import type { PlaceFields } from '@/lib/services/place-service';
import { applyPlaceLink, type LinkBudget, type PlaceLinkDeps, type PlaceLinkWarning } from '@/lib/api/place-link';

export async function resolvePlacePatch(
  existing: PlaceFields,
  patch: Partial<PlaceFields>,
  link: string | null,
  budget: LinkBudget,
  deps: PlaceLinkDeps = {},
): Promise<{ patch: Partial<PlaceFields>; merged: PlaceFields; warnings: PlaceLinkWarning[] }> {
  const coordsSent = 'lat' in patch;
  const addressChanged = 'address' in patch && patch.address !== existing.address;
  const out: Partial<PlaceFields> = { ...patch };
  let warnings: PlaceLinkWarning[] = [];

  if (link !== null || (addressChanged && !coordsSent)) {
    const input: PlaceFields = {
      ...existing,
      ...patch,
      lat: coordsSent ? (patch.lat ?? null) : null,
      lng: coordsSent ? (patch.lng ?? null) : null,
      // The stored id belongs to the old location.
      placeIdExternal: 'placeIdExternal' in patch ? (patch.placeIdExternal ?? null) : null,
    };
    const r = await applyPlaceLink(input, link, budget, deps);
    warnings = r.warnings;
    if (r.fields.lat !== null && r.fields.lng !== null) {
      out.lat = r.fields.lat;
      out.lng = r.fields.lng;
      out.placeIdExternal = r.fields.placeIdExternal;
      if (input.address === null && r.fields.address !== null) out.address = r.fields.address;
    }
  }
  return { patch: out, merged: { ...existing, ...out }, warnings };
}
