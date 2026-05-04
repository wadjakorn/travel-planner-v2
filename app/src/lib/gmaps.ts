// Google Maps URL helpers.

type Place = {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
};

/**
 * Builds a Google Maps Directions URL for a sequence of places.
 * First place = origin, last = destination, middle = waypoints.
 * Manual places (no placeIdExternal) send "lat,lng" so Google geocodes
 * to coordinates instead of fuzzy name search.
 */
export function gmapsDirectionsUrl(
  places: Place[],
  travelmode: 'driving' | 'walking' | 'transit' | 'bicycling' = 'driving',
): string {
  if (!places || places.length === 0) return '#';
  const enc = (p: Place) => {
    if (!p.placeIdExternal && p.lat != null && p.lng != null) {
      return encodeURIComponent(`${p.lat},${p.lng}`);
    }
    return encodeURIComponent(`${p.name}${p.address ? ', ' + p.address : ''}`);
  };
  const placeIdOf = (p: Place) =>
    p.placeIdExternal ? encodeURIComponent(p.placeIdExternal) : null;
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
 * Builds a Google Maps Search URL for a single place.
 */
export function gmapsSearchUrl(p: Place): string {
  const q = encodeURIComponent(`${p.name}, ${p.address ?? ''}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
