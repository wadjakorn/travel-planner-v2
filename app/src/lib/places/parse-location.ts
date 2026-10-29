import type { MessageKey } from '@/lib/i18n-client';
import { extractGmapsUrl, isShortLink, parseGmapsUrl } from './gmaps-link';

export type LocationParseError = 'empty' | 'out_of_range' | 'short_link' | 'no_coords' | 'unrecognized';
export type LocationParse =
  | { ok: true; lat: number; lng: number; source: 'coords' | 'link' }
  | { ok: false; reason: LocationParseError };

/** Message key per parse error (copy in messages/*.json). */
export const LOCATION_ERROR_KEY = {
  out_of_range: 'place_location_err_out_of_range',
  short_link: 'place_location_err_short_link',
  no_coords: 'place_location_err_no_coords',
  unrecognized: 'place_location_err_unrecognized',
} as const satisfies Record<Exclude<LocationParseError, 'empty'>, MessageKey>;

const NUM = '(-?\\d+(?:\\.\\d+)?)';
// "35.6812, 139.7671" · "35.6812 139.7671" · "(35.6812,139.7671)" · "35.6812° N, 139.7671° E"
const COORDS = new RegExp(
  `^\\(?\\s*${NUM}\\s*°?\\s*([NS])?\\s*(?:,\\s*|\\s+)${NUM}\\s*°?\\s*([EW])?\\s*\\)?$`,
  'i',
);

function signed(n: number, hemi: string | undefined, neg: 'S' | 'W'): number {
  return hemi?.toUpperCase() === neg ? -Math.abs(n) : n;
}

export function parseLocationInput(raw: string): LocationParse {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };

  const m = COORDS.exec(text);
  if (m) {
    const lat = signed(Number(m[1]), m[2], 'S');
    const lng = signed(Number(m[3]), m[4], 'W');
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, reason: 'out_of_range' };
    return { ok: true, lat, lng, source: 'coords' };
  }

  const url = extractGmapsUrl(text);
  if (url) {
    if (isShortLink(new URL(url))) return { ok: false, reason: 'short_link' };
    const link = parseGmapsUrl(url);
    if (link?.lat != null && link.lng != null) return { ok: true, lat: link.lat, lng: link.lng, source: 'link' };
    return { ok: false, reason: 'no_coords' };
  }

  return { ok: false, reason: 'unrecognized' };
}

export function formatLatLng(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}
