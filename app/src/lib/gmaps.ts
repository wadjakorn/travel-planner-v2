// Google Maps URL helpers.

import { cidOf, isGooglePlaceId } from './places/place-id';

type Place = {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
};

type TravelMode = 'driving' | 'walking' | 'transit' | 'bicycling';

const googleId = (p: Place) => (isGooglePlaceId(p.placeIdExternal) ? p.placeIdExternal! : null);

const enc = (p: Place) => {
  if (!googleId(p) && p.lat != null && p.lng != null) {
    return encodeURIComponent(`${p.lat},${p.lng}`);
  }
  return encodeURIComponent(`${p.name}${p.address ? ', ' + p.address : ''}`);
};

const placeIdOf = (p: Place) => {
  const id = googleId(p);
  return id ? encodeURIComponent(id) : null;
};

/**
 * Builds a Google Maps Directions URL for a sequence of places.
 * First place = origin, last = destination, middle = waypoints.
 * Only Google place_ids are sent as place ids; other places (manual or from
 * another provider) send "lat,lng" so Google geocodes
 * to coordinates instead of fuzzy name search.
 */
export function gmapsDirectionsUrl(
  places: Place[],
  travelmode: TravelMode = 'driving',
): string {
  if (!places || places.length === 0) return '#';
  const origin = enc(places[0]);
  const destination = enc(places[places.length - 1]);
  const waypoints = places.slice(1, -1).map(enc).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${travelmode}`;
  const oid = placeIdOf(places[0]);
  const did = placeIdOf(places[places.length - 1]);
  if (oid) url += `&origin_place_id=${oid}`;
  if (did) url += `&destination_place_id=${did}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  const wpIds = places.slice(1, -1).map(placeIdOf);
  if (wpIds.length > 0 && wpIds.every((id) => id != null)) {
    url += `&waypoint_place_ids=${wpIds.join('|')}`;
  }
  return url;
}

/**
 * Directions to one place from wherever the user is: no `origin`, so Google
 * uses the device location. (`gmapsDirectionsUrl([p])` would route p -> p.)
 */
export function gmapsNavigateUrl(p: Place, travelmode: TravelMode = 'driving'): string {
  let url = `https://www.google.com/maps/dir/?api=1&destination=${enc(p)}&travelmode=${travelmode}`;
  const did = placeIdOf(p);
  if (did) url += `&destination_place_id=${did}`;
  return url;
}

/**
 * Builds a Google Maps Search URL for a single place.
 * Prefers the exact Google place_id (`query_place_id`, Google ids only) so Maps opens the pinned
 * place instead of fuzzy-matching the name. When there's no place_id but we have
 * coordinates, the query itself is "lat,lng" so Maps drops a pin at the exact
 * point rather than autocompleting the name to a wrong result. Name + address is
 * the last-resort fallback (unverified/manual places).
 */
export function gmapsSearchUrl(p: Place): string {
  const cid = cidOf(p.placeIdExternal);
  if (cid) return `https://maps.google.com/?cid=${encodeURIComponent(cid)}`;
  const hasCoords = p.lat != null && p.lng != null;
  const gid = googleId(p);
  const query =
    !gid && hasCoords
      ? `${p.lat},${p.lng}`
      : `${p.name}${p.address ? ', ' + p.address : ''}`;
  let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  if (gid) {
    url += `&query_place_id=${encodeURIComponent(gid)}`;
  }
  return url;
}
