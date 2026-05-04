// Google Maps URL helpers.

type Place = { name: string; address?: string | null };

/**
 * Builds a Google Maps Directions URL for a sequence of places.
 * First place = origin, last = destination, middle = waypoints.
 */
export function gmapsDirectionsUrl(
  places: Place[],
  travelmode: 'driving' | 'walking' | 'transit' | 'bicycling' = 'driving',
): string {
  if (!places || places.length === 0) return '#';
  const enc = (p: Place) =>
    encodeURIComponent(`${p.name}${p.address ? ', ' + p.address : ''}`);
  const origin = enc(places[0]);
  const destination = enc(places[places.length - 1]);
  const waypoints = places.slice(1, -1).map(enc).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${travelmode}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}

/**
 * Builds a Google Maps Search URL for a single place.
 */
export function gmapsSearchUrl(p: Place): string {
  const q = encodeURIComponent(`${p.name}, ${p.address ?? ''}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
