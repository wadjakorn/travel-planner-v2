import 'server-only';
import tzlookup from '@photostructure/tz-lookup';

export function timeZoneAt(lat: number, lng: number): string | null {
  try {
    return tzlookup(lat, lng);
  } catch {
    return null;
  }
}
