// Pure FormData → transport fields reader for the transport server actions.
// Lives outside the 'use server' actions file (which may only export async
// functions) so it can be unit-tested.
//
// The form always emits all three coordinate keys per end ('' when the end has
// none), so the service's pair rule (lat+lng together, null pair clears all
// three) is always satisfied: '' → null, otherwise Number (non-finite → null).

import { trimOrNull, parseNumber } from '@/lib/form-parsers';

export const TRANSPORT_TYPES = ['flight', 'train', 'car', 'ferry'] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

function parseTransportType(v: FormDataEntryValue | null): TransportType {
  if (typeof v !== 'string' || !TRANSPORT_TYPES.includes(v as TransportType)) {
    throw new Error('Invalid transport type');
  }
  return v as TransportType;
}

export function readTransportFields(formData: FormData) {
  return {
    type: parseTransportType(formData.get('type')),
    title: trimOrNull(formData.get('title')) ?? '',
    provider: trimOrNull(formData.get('provider')),
    ref: trimOrNull(formData.get('ref')),
    fromCode: trimOrNull(formData.get('fromCode')),
    fromName: trimOrNull(formData.get('fromName')),
    fromLat: parseNumber(formData.get('fromLat')),
    fromLng: parseNumber(formData.get('fromLng')),
    fromPlaceId: trimOrNull(formData.get('fromPlaceId')),
    fromTime: trimOrNull(formData.get('fromTime')),
    fromDate: trimOrNull(formData.get('fromDate')),
    fromTerminal: trimOrNull(formData.get('fromTerminal')),
    toCode: trimOrNull(formData.get('toCode')),
    toName: trimOrNull(formData.get('toName')),
    toLat: parseNumber(formData.get('toLat')),
    toLng: parseNumber(formData.get('toLng')),
    toPlaceId: trimOrNull(formData.get('toPlaceId')),
    toTime: trimOrNull(formData.get('toTime')),
    toDate: trimOrNull(formData.get('toDate')),
    toTerminal: trimOrNull(formData.get('toTerminal')),
    duration: trimOrNull(formData.get('duration')),
    seats: trimOrNull(formData.get('seats')),
    bag: trimOrNull(formData.get('bag')),
    costAmount: parseNumber(formData.get('costAmount')),
    costCurrency: trimOrNull(formData.get('costCurrency')),
  };
}
