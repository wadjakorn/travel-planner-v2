export type LatLng = { lat: number; lng: number };

export type Bias = { kind: 'point'; lat: number; lng: number; radius: number };

export const DEFAULT_BIAS_RADIUS_M = 10_000;
export const MIN_BIAS_RADIUS_M = 1_000;
export const MAX_BIAS_RADIUS_M = 50_000;

export function parseBiasParams(sp: URLSearchParams): Bias | null {
  const near = sp.get('near');
  if (!near) return null;
  const parts = near.split(',');
  if (parts.length !== 2 || parts.some((part) => part === '')) return null;
  const [lat, lng] = parts.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const radiusParam = sp.get('radius');
  const rawRadius = radiusParam === null || radiusParam === '' ? NaN : Number(radiusParam);
  const radius = Number.isFinite(rawRadius)
    ? Math.min(MAX_BIAS_RADIUS_M, Math.max(MIN_BIAS_RADIUS_M, rawRadius))
    : DEFAULT_BIAS_RADIUS_M;
  return { kind: 'point', lat, lng, radius };
}

export function biasQuery(near: LatLng | null | undefined): string {
  if (!near) return '';
  return `&near=${encodeURIComponent(`${near.lat.toFixed(2)},${near.lng.toFixed(2)}`)}`;
}

export function toGoogleBias(bias: Bias): { circle: { center: { latitude: number; longitude: number }; radius: number } } {
  return { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radius } };
}

export function toGeoapifyBias(bias: Bias): string {
  return `circle:${bias.lng},${bias.lat},${bias.radius}|countrycode:none`;
}

export function toPhotonParams(bias: Bias): { lat: string; lon: string } {
  return { lat: String(bias.lat), lon: String(bias.lng) };
}
