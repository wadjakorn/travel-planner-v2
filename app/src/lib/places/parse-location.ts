import { extractGmapsUrl, isShortLink, parseGmapsUrl } from './gmaps-link';

export type LocationParseError = 'empty' | 'out_of_range' | 'short_link' | 'no_coords' | 'unrecognized';
export type LocationParse =
  | { ok: true; lat: number; lng: number; source: 'coords' | 'link' }
  | { ok: false; reason: LocationParseError };

export const LOCATION_ERROR_COPY: Record<Exclude<LocationParseError, 'empty'>, string> = {
  out_of_range: 'Latitude must be between -90 and 90, longitude between -180 and 180.',
  short_link: "Short links can't be read here. Paste it in the place search instead, or paste the coordinates.",
  no_coords: 'That link has no coordinates. Use a link to a place or dropped pin, or paste the coordinates.',
  unrecognized: 'Enter coordinates like 35.6812, 139.7671 or paste a Google Maps link.',
};

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
