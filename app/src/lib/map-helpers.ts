export type Mode = 'drive' | 'walk' | 'transit';

export type Pin = {
  id: string;
  idx: number;
  kind: 'hotel' | 'food' | 'sight' | 'transit';
  lat: number;
  lng: number;
  name?: string;
  category?: string | null;
  time?: string | null;
};

export const KIND_COLOR: Record<string, string> = {
  hotel: '#5b3fd9',
  food: '#ff8a3d',
  sight: '#0071e3',
  transit: '#1d1d1f',
};

export const MODE_COLOR: Record<Mode, string> = {
  drive: '#0071e3',
  walk: '#22a06b',
  transit: '#ff8a3d',
};

export function toGoogleMode(m: Mode): google.maps.TravelMode {
  if (m === 'walk') return google.maps.TravelMode.WALKING;
  if (m === 'transit') return google.maps.TravelMode.TRANSIT;
  return google.maps.TravelMode.DRIVING;
}

export function centroid(pins: Pin[]): { lat: number; lng: number } {
  if (pins.length === 0) return { lat: 35.65, lng: 139.74 };
  const lat = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
  const lng = pins.reduce((s, p) => s + p.lng, 0) / pins.length;
  return { lat, lng };
}

export function deriveZoom(pins: Pin[]): number {
  if (pins.length < 2) return 14;
  const latSpread =
    Math.max(...pins.map((p) => p.lat)) - Math.min(...pins.map((p) => p.lat));
  if (latSpread > 1) return 8;
  if (latSpread > 0.1) return 11;
  return 14;
}
