// Pure FormData → hotel fields reader for the hotel server actions. Lives
// outside the 'use server' actions file (which may only export async
// functions) so it can be unit-tested.
//
// status / area / coordsApprox are read only when the form carries the key:
// an absent key leaves the stored value untouched on update (partial patch)
// and falls back to the DB defaults ('confirmed' / null / false) on create, so
// a form without those inputs can never reset a tbd hotel or wipe its
// approximate-pin flag.

import { trimOrNull, parseNumber, parseInt32 } from '@/lib/form-parsers';
import type { HotelServerFields } from '@/lib/services/booking-service';

export function readHotelFormFields(formData: FormData): {
  fields: Record<string, unknown>;
  server: HotelServerFields;
} {
  const fields: Record<string, unknown> = {
    dayIdx: parseInt32(formData.get('dayIdx')),
    name: trimOrNull(formData.get('name')) ?? '',
    address: trimOrNull(formData.get('address')),
    lat: parseNumber(formData.get('lat')),
    lng: parseNumber(formData.get('lng')),
    placeIdExternal: trimOrNull(formData.get('placeIdExternal')),
    checkInDate: trimOrNull(formData.get('checkInDate')),
    checkInTime: trimOrNull(formData.get('checkInTime')),
    checkOutDate: trimOrNull(formData.get('checkOutDate')),
    checkOutTime: trimOrNull(formData.get('checkOutTime')),
    nights: parseInt32(formData.get('nights')),
    room: trimOrNull(formData.get('room')),
    guests: parseInt32(formData.get('guests')),
    ref: trimOrNull(formData.get('ref')),
    costAmount: parseNumber(formData.get('costAmount')),
    costCurrency: trimOrNull(formData.get('costCurrency')),
    cancellation: trimOrNull(formData.get('cancellation')),
    contact: trimOrNull(formData.get('contact')),
    notes: trimOrNull(formData.get('notes')),
    attachmentName: trimOrNull(formData.get('attachmentName')),
    attachmentSize: trimOrNull(formData.get('attachmentSize')),
    thumb: trimOrNull(formData.get('thumb')),
  };
  if (formData.has('status')) {
    fields.status = formData.get('status') === 'tbd' ? 'tbd' : 'confirmed';
  }
  if (formData.has('area')) fields.area = trimOrNull(formData.get('area'));
  const server: HotelServerFields = {};
  if (formData.has('coordsApprox')) server.coordsApprox = formData.get('coordsApprox') === 'true';
  return { fields, server };
}
