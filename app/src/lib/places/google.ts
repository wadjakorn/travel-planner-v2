import type { GoogleStatus } from './google-sync';
import { toGoogleBias, type Bias } from './bias';
import { kindFromGoogleTypes } from './kind';
import type { Fields, PlaceDetail, PlacePhoto, PlaceSuggestion } from './types';

const BASE = 'https://places.googleapis.com/v1';

export const GOOGLE_MASKS: Record<Fields, string> = {
  basic: 'id,formattedAddress,location,types',
  full: 'id,displayName,formattedAddress,location,types,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount',
  // `photos` is an Essentials (IDs Only) field, so this stays on the Essentials SKU.
  preview: 'id,formattedAddress,location,types,photos',
};

/** Place Details Enterprise: GOOGLE_MASKS.full minus `types` plus `businessStatus`. No Atmosphere fields. */
export const GOOGLE_REFRESH_MASK =
  'id,displayName,formattedAddress,location,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount';

export const GOOGLE_BIAS = { lat: 13.75, lng: 100.5, radius: 50000 };

export class GoogleHttpError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `Google Places HTTP ${status}`);
    this.name = 'GoogleHttpError';
  }
}

export function isValidGoogleId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,256}$/.test(id);
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new GoogleHttpError(0, e instanceof Error ? e.message : 'network error');
  }
  if (!res.ok) throw new GoogleHttpError(res.status);
  try {
    return await res.json();
  } catch (e) {
    throw new GoogleHttpError(0, e instanceof Error ? e.message : 'bad json');
  }
}

type Text = { text?: string };
type Prediction = {
  placeId?: string;
  text?: Text;
  structuredFormat?: { mainText?: Text; secondaryText?: Text };
  types?: string[];
};
type RawDetails = {
  id?: string;
  displayName?: Text;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  photos?: { name?: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
};

export async function googleAutocomplete(
  q: string,
  o: { key: string; lang: 'th' | 'en'; session: string | null; fetchImpl: typeof fetch; timeoutMs?: number; bias?: Bias | null },
): Promise<PlaceSuggestion[]> {
  const body = {
    input: q,
    languageCode: o.lang,
    ...(o.session ? { sessionToken: o.session } : {}),
    locationBias: o.bias
      ? toGoogleBias(o.bias)
      : { circle: { center: { latitude: GOOGLE_BIAS.lat, longitude: GOOGLE_BIAS.lng }, radius: GOOGLE_BIAS.radius } },
  };
  const json = (await call(
    o.fetchImpl,
    `${BASE}/places:autocomplete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': o.key },
      body: JSON.stringify(body),
    },
    o.timeoutMs ?? 1500,
  )) as { suggestions?: { placePrediction?: Prediction }[] };
  const out: PlaceSuggestion[] = [];
  for (const s of json?.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p?.placeId) continue;
    out.push({
      id: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? null,
      address: null,
      lat: null,
      lng: null,
      kind: kindFromGoogleTypes(p.types),
      timeZone: null,
    });
  }
  return out;
}

export async function googleDetails(
  id: string,
  o: { key: string; lang: 'th' | 'en'; session: string | null; fields: Fields; fetchImpl: typeof fetch; timeoutMs?: number },
): Promise<PlaceDetail | null> {
  if (!isValidGoogleId(id)) return null;
  const qs = new URLSearchParams({ languageCode: o.lang });
  if (o.session) qs.set('sessionToken', o.session);
  const d = (await call(
    o.fetchImpl,
    `${BASE}/places/${id}?${qs}`,
    { method: 'GET', headers: { 'X-Goog-Api-Key': o.key, 'X-Goog-FieldMask': GOOGLE_MASKS[o.fields] } },
    o.timeoutMs ?? 3000,
  )) as RawDetails;
  const lat = d?.location?.latitude;
  const lng = d?.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const full = o.fields === 'full';
  const hours = full ? d.regularOpeningHours?.weekdayDescriptions : undefined;
  return {
    id,
    name: d.displayName?.text ?? '',
    secondary: null,
    address: d.formattedAddress ?? null,
    lat,
    lng,
    kind: kindFromGoogleTypes(d.types),
    timeZone: null,
    phone: full ? d.nationalPhoneNumber ?? null : null,
    website: full ? d.websiteUri ?? null : null,
    hours: hours?.length ? hours.join('; ') : null,
    rating: full ? d.rating ?? null : null,
    reviews: full ? d.userRatingCount ?? null : null,
    ...(o.fields === 'preview' ? { photo: firstPhoto(d.photos) } : {}),
  };
}

function firstPhoto(photos: RawDetails['photos']): PlacePhoto | null {
  const p = photos?.find((x) => x.name);
  if (!p?.name) return null;
  return {
    name: p.name,
    attributions: (p.authorAttributions ?? [])
      .filter((a) => a.displayName)
      .map((a) => ({ name: a.displayName!, uri: a.uri ?? null })),
  };
}

// A Place Photo resource name, e.g. places/ChIJ…/photos/AbC… (from a details `photos` ref).
export function isValidPhotoName(name: string): boolean {
  return /^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]{1,2048}$/.test(name);
}

/** Details mask for a fresh photo ref only: Essentials (IDs Only), an unbilled SKU. */
export const GOOGLE_PHOTO_REF_MASK = 'id,photos';

// Photo names must not be cached or stored (Google ToS) and they expire, so
// the pin card asks for a fresh one; this call carries no session token.
export async function googlePlacePhoto(
  id: string,
  o: { key: string; fetchImpl: typeof fetch; timeoutMs?: number },
): Promise<PlacePhoto | null> {
  if (!isValidGoogleId(id)) return null;
  const d = (await call(
    o.fetchImpl,
    `${BASE}/places/${id}`,
    { method: 'GET', headers: { 'X-Goog-Api-Key': o.key, 'X-Goog-FieldMask': GOOGLE_PHOTO_REF_MASK } },
    o.timeoutMs ?? 3000,
  )) as RawDetails | null;
  return firstPhoto(d?.photos);
}

/** Place Photo (New): one billed media request; returns the short-lived https photoUri. */
export async function googlePhotoUri(
  name: string,
  o: { key: string; maxWidthPx: number; fetchImpl: typeof fetch; timeoutMs?: number },
): Promise<string | null> {
  if (!isValidPhotoName(name)) return null;
  const qs = new URLSearchParams({ maxWidthPx: String(o.maxWidthPx), skipHttpRedirect: 'true' });
  const d = (await call(
    o.fetchImpl,
    `${BASE}/${name}/media?${qs}`,
    { method: 'GET', headers: { 'X-Goog-Api-Key': o.key } },
    o.timeoutMs ?? 3000,
  )) as { photoUri?: string } | null;
  const uri = d?.photoUri;
  return typeof uri === 'string' && uri.startsWith('https://') ? uri : null;
}

export type GoogleRefresh = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  hours: string | null;
  rating: number | null;
  reviews: number | null;
  /** Only Google's own values; NOT_FOUND / INVALID are ours. */
  businessStatus: Exclude<GoogleStatus, 'NOT_FOUND' | 'INVALID'> | null;
};

const GOOGLE_BUSINESS_STATUS = new Set(['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY']);

/** Re-fetches a place's volatile details (Enterprise tier, no session). Null when the response has no location. */
export async function googleRefreshDetails(
  id: string,
  o: { key: string; lang: 'th' | 'en'; fetchImpl: typeof fetch; timeoutMs?: number },
): Promise<GoogleRefresh | null> {
  const d = (await call(
    o.fetchImpl,
    `${BASE}/places/${id}?${new URLSearchParams({ languageCode: o.lang })}`,
    { method: 'GET', headers: { 'X-Goog-Api-Key': o.key, 'X-Goog-FieldMask': GOOGLE_REFRESH_MASK } },
    o.timeoutMs ?? 3000,
  )) as RawDetails;
  const lat = d?.location?.latitude;
  const lng = d?.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const hours = d.regularOpeningHours?.weekdayDescriptions;
  return {
    id: d.id || id,
    name: d.displayName?.text ?? '',
    address: d.formattedAddress ?? null,
    lat,
    lng,
    phone: d.nationalPhoneNumber ?? null,
    website: d.websiteUri ?? null,
    hours: hours?.length ? hours.join('; ') : null,
    rating: d.rating ?? null,
    reviews: d.userRatingCount ?? null,
    businessStatus:
      d.businessStatus && GOOGLE_BUSINESS_STATUS.has(d.businessStatus)
        ? (d.businessStatus as GoogleRefresh['businessStatus'])
        : null,
  };
}
