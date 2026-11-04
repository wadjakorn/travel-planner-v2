// Leg (place-to-place travel) warnings, TP-0141. Same `{ code, path, message }`
// shape as the import/place-link taxonomy, plus an optional place `name`.
// A warning never rejects a request.

import type { PlaceFields } from '@/lib/services/place-service';

export type LegWarningCode = 'transit_as_place' | 'arrive_without_origin';
export type LegWarning = { code: LegWarningCode; path?: string; message: string; name?: string };

const TRANSIT_AS_PLACE =
  `This transit stop has no location; put the travel on the next stop's "arrive" instead.`;

/**
 * A `transit` place with no coordinates, no address and no link is a leg
 * disguised as a stop. Evaluate after link resolution (`fields` may have
 * gained coordinates from the link).
 */
export function transitAsPlaceWarning(
  fields: PlaceFields,
  link: string | null,
  path?: string,
): LegWarning | null {
  if (fields.kind !== 'transit') return null;
  if (fields.lat != null || fields.lng != null) return null;
  if (fields.address || link != null) return null;
  return {
    code: 'transit_as_place',
    ...(path !== undefined ? { path } : {}),
    message: TRANSIT_AS_PLACE,
    name: fields.name,
  };
}
