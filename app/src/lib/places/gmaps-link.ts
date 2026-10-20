export type GmapsLink = {
  name: string | null;
  query: string | null;
  lat: number | null;
  lng: number | null;
  precision: 'exact' | 'viewport' | null;
  cid: string | null;
  googlePlaceId: string | null;
};

const MAPS_HOST = /^(www\.|maps\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;
const PAIR = /^(-?\d+(\.\d+)?),[\s+]*(-?\d+(\.\d+)?)$/;
const NUM = '(-?\\d+(?:\\.\\d+)?)';

export function isShortLink(u: URL): boolean {
  return u.hostname === 'maps.app.goo.gl' || (u.hostname === 'goo.gl' && /^\/maps(\/|$)/.test(u.pathname));
}

function parseHttps(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  return u.protocol === 'https:' && u.port === '' ? u : null;
}

function allowedUrl(raw: string): URL | null {
  const u = parseHttps(raw);
  if (!u) return null;
  if (isShortLink(u)) return u;
  if (!MAPS_HOST.test(u.hostname)) return null;
  // Only the maps.* subdomain serves maps at arbitrary paths; elsewhere /url and /search are open redirects.
  return u.hostname.startsWith('maps.') || /^\/maps(\/|$)/.test(u.pathname) ? u : null;
}

export function isGmapsUrl(raw: string): boolean {
  return allowedUrl(raw) !== null;
}

export function extractGmapsUrl(text: string): string | null {
  const tokens = text.split(/\s+/).map((t) => t.replace(/[).,;!?]+$/, ''));
  return tokens.find((t) => t.startsWith('https://') && isGmapsUrl(t)) ?? null;
}

function decode(s: string): string | null {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

function inRange(lat: number, lng: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function pairOf(s: string | null): { lat: number; lng: number } | null {
  const m = s ? PAIR.exec(s) : null;
  return m ? { lat: Number(m[1]), lng: Number(m[3]) } : null;
}

function hexToDecimal(hex: string): string {
  return BigInt(`0x${hex}`).toString();
}

export function parseGmapsUrl(raw: string): GmapsLink | null {
  const u = allowedUrl(raw);
  if (!u) return null;
  const out: GmapsLink = {
    name: null,
    query: null,
    lat: null,
    lng: null,
    precision: null,
    cid: null,
    googlePlaceId: null,
  };
  if (/^\/maps\/(dir|embed)/.test(u.pathname)) return out;

  const segs = u.pathname.split('/');
  const after = (word: string) => {
    const i = segs.indexOf(word);
    return i === -1 ? undefined : segs[i + 1];
  };
  const placeSeg = after('place');
  if (placeSeg) out.name = decode(placeSeg);
  const searchSeg = after('search');
  const searchText = searchSeg ? decode(searchSeg) : null;

  const p = u.searchParams;
  let coords: { lat: number; lng: number } | null = null;
  let precision: GmapsLink['precision'] = null;

  const bang = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(`${u.pathname}${u.search}`);
  if (bang) {
    coords = { lat: Number(bang[1]), lng: Number(bang[2]) };
    precision = 'exact';
  }
  if (!coords) {
    coords = pairOf(p.get('q')) ?? pairOf(p.get('query')) ?? pairOf(p.get('ll')) ?? pairOf(searchText);
    if (coords) precision = 'exact';
  }
  if (!coords) {
    const at = new RegExp(`/@${NUM},${NUM},`).exec(u.pathname);
    if (at) {
      coords = { lat: Number(at[1]), lng: Number(at[2]) };
      precision = 'viewport';
    }
  }
  if (coords && inRange(coords.lat, coords.lng)) {
    out.lat = coords.lat;
    out.lng = coords.lng;
    out.precision = precision;
  }

  const text = [p.get('q'), p.get('query'), searchText].find((s) => s && !pairOf(s));
  out.query = text ?? null;

  const hexCid =
    /!1s0x[0-9a-f]+:0x([0-9a-f]+)/i.exec(u.pathname)?.[1] ??
    /^0x[0-9a-f]+:0x([0-9a-f]+)$/i.exec(p.get('ftid') ?? '')?.[1];
  out.cid = hexCid ? hexToDecimal(hexCid) : (/^\d{1,25}$/.test(p.get('cid') ?? '') ? p.get('cid') : null);
  out.googlePlaceId = p.get('query_place_id') || null;
  return out;
}
