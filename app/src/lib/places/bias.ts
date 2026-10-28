export type LatLng = { lat: number; lng: number };
export type BBox = { south: number; west: number; north: number; east: number };

export type Bias =
  | { kind: 'point'; lat: number; lng: number; radius: number }
  | ({ kind: 'rect' } & BBox);

export const DEFAULT_BIAS_RADIUS_M = 10_000;
export const MIN_BIAS_RADIUS_M = 1_000;
export const MAX_BIAS_RADIUS_M = 50_000;
export const MAX_RECT_SPAN_DEG = 20;

function floor2(x: number) {
  return Math.floor(Number((x * 100).toFixed(6))) / 100;
}

function ceil2(x: number) {
  return Math.ceil(Number((x * 100).toFixed(6))) / 100;
}

export function normalizeBBox(b: BBox): BBox | null {
  if (
    !Number.isFinite(b.south) ||
    !Number.isFinite(b.west) ||
    !Number.isFinite(b.north) ||
    !Number.isFinite(b.east) ||
    b.south < -90 ||
    b.south > 90 ||
    b.north < -90 ||
    b.north > 90 ||
    b.west < -180 ||
    b.west > 180 ||
    b.east < -180 ||
    b.east > 180
  ) return null;

  const bbox = {
    south: Math.max(-90, floor2(b.south)),
    west: Math.max(-180, floor2(b.west)),
    north: Math.min(90, ceil2(b.north)),
    east: Math.min(180, ceil2(b.east)),
  };
  if (
    bbox.south >= bbox.north ||
    bbox.west >= bbox.east ||
    bbox.north - bbox.south > MAX_RECT_SPAN_DEG ||
    bbox.east - bbox.west > MAX_RECT_SPAN_DEG
  ) return null;
  return bbox;
}

export function parseBiasParams(sp: URLSearchParams): Bias | null {
  const bbox = sp.get('bbox');
  if (bbox) {
    const parts = bbox.split(',');
    if (parts.length === 4 && parts.every((part) => part.trim() !== '')) {
      const [south, west, north, east] = parts.map(Number);
      const normalized = normalizeBBox({ south, west, north, east });
      if (normalized) return { kind: 'rect', ...normalized };
    }
  }

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

export function biasQuery(near: LatLng | null | undefined, bbox?: BBox | null): string {
  const params = near
    ? `&near=${encodeURIComponent(`${near.lat.toFixed(2)},${near.lng.toFixed(2)}`)}`
    : '';
  const normalized = bbox ? normalizeBBox(bbox) : null;
  if (!normalized) return params;
  return `${params}&bbox=${encodeURIComponent([
    normalized.south.toFixed(2),
    normalized.west.toFixed(2),
    normalized.north.toFixed(2),
    normalized.east.toFixed(2),
  ].join(','))}`;
}

export function toGoogleBias(bias: Bias):
  | { circle: { center: { latitude: number; longitude: number }; radius: number } }
  | { rectangle: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } } } {
  if (bias.kind === 'rect') {
    return {
      rectangle: {
        low: { latitude: bias.south, longitude: bias.west },
        high: { latitude: bias.north, longitude: bias.east },
      },
    };
  }
  return { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radius } };
}

export function toGeoapifyBias(bias: Bias): string {
  if (bias.kind === 'rect') return `rect:${bias.west},${bias.south},${bias.east},${bias.north}|countrycode:none`;
  return `circle:${bias.lng},${bias.lat},${bias.radius}|countrycode:none`;
}

export function toPhotonParams(bias: Bias): { lat: string; lon: string } {
  if (bias.kind === 'rect') {
    return { lat: String((bias.south + bias.north) / 2), lon: String((bias.west + bias.east) / 2) };
  }
  return { lat: String(bias.lat), lon: String(bias.lng) };
}
