// Leg (place-to-place travel) warnings, TP-0141. Same `{ code, path, message }`
// shape as the import/place-link taxonomy, plus an optional place `name`.
// A warning never rejects a request.

import type { PlaceFields } from '@/lib/services/place-service';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { HotelBooking } from '@/db/schema';
import { splitHotelsForDay } from '@/lib/day-augment';
import { addDaysIso } from '@/lib/calendar-queries';

export type LegWarningCode = 'transit_as_place' | 'arrive_without_origin';
export type LegWarning = { code: LegWarningCode; path?: string; message: string; name?: string };

const ARRIVE_WITHOUT_ORIGIN =
  `This day has no hotel to leave from; the first stop's "arrive" is stored but not shown.`;

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

/**
 * Leg warnings for an import plan (after link resolution). `links` is the
 * parallel [day][place] googleMapsUrl matrix from readImportPlaceLinks.
 * - `arrive_without_origin`: the first stop has `arrive` but the day (explicit
 *   date, else startDate + i) has no begin hotel, so the start leg is stored
 *   but never drawn. At most one per day.
 * - `transit_as_place`: one per coordless, address-less, link-less transit stop.
 */
export function collectLegWarnings(
  plan: ParsedImportPlan,
  links: (string | null)[][],
): LegWarning[] {
  const out: LegWarning[] = [];
  const startDate = plan?.trip?.startDate ?? null;
  // splitHotelsForDay reads only checkInDate/checkOutDate.
  const hotels = (plan?.hotels ?? []) as unknown as HotelBooking[];
  (plan?.days ?? []).forEach((d, i) => {
    const places = d?.places ?? [];
    if (d?.arrives?.[0] && places.length > 0) {
      const iso = d.date ?? (startDate ? addDaysIso(startDate, i) : null);
      if (splitHotelsForDay(hotels, iso).beginHotels.length === 0) {
        out.push({
          code: 'arrive_without_origin',
          path: `/days/${i}/places/0/arrive`,
          message: ARRIVE_WITHOUT_ORIGIN,
          name: places[0].name,
        });
      }
    }
    places.forEach((p, j) => {
      const w = transitAsPlaceWarning(p, links[i]?.[j] ?? null, `/days/${i}/places/${j}`);
      if (w) out.push(w);
    });
  });
  return out;
}
