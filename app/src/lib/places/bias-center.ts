import type { LatLng } from './bias';

export type BiasPoint = { id?: string; lat?: number | null; lng?: number | null; synthetic?: boolean };
type BiasDay = { id: string; places: BiasPoint[] };

const pointOf = (point: BiasPoint | undefined): LatLng | null =>
  point && Number.isFinite(point.lat) && Number.isFinite(point.lng) ? { lat: point.lat!, lng: point.lng! } : null;

export function centroidOf(points: BiasPoint[]): LatLng | null {
  const valid = points.map(pointOf).filter((point): point is LatLng => point !== null);
  if (!valid.length) return null;
  return { lat: valid.reduce((sum, point) => sum + point.lat, 0) / valid.length, lng: valid.reduce((sum, point) => sum + point.lng, 0) / valid.length };
}

export function dayCenter(places: BiasPoint[]): LatLng | null {
  const real = [...places].reverse().find((place) => !place.synthetic && pointOf(place));
  return pointOf(real)
    ?? pointOf(places.find((place) => place.synthetic && place.id?.endsWith('-end')))
    ?? pointOf(places.find((place) => place.synthetic && place.id?.endsWith('-begin')));
}

export function tripBiasCenter(days: { places: BiasPoint[] }[], hotels: BiasPoint[] = []): LatLng | null {
  return centroidOf(hotels) ?? centroidOf(days.flatMap((day) => day.places));
}

export function dayBiasCenter(days: BiasDay[], dayId: string): LatLng | null {
  const index = days.findIndex((day) => day.id === dayId);
  if (index < 0) return tripBiasCenter(days);
  const current = dayCenter(days[index].places);
  if (current) return current;
  for (let i = index - 1; i >= 0; i--) {
    const previous = dayCenter(days[i].places);
    if (previous) return previous;
  }
  return tripBiasCenter(days);
}
