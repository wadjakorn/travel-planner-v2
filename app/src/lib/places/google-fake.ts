import 'server-only';
import autocomplete from './__fixtures__/google-autocomplete.json';
import detailsFull from './__fixtures__/google-details-full.json';
import detailsRefresh from './__fixtures__/google-details-refresh.json';
import detailsSecond from './__fixtures__/google-details-second.json';
import { GOOGLE_MASKS, GOOGLE_REFRESH_MASK } from './google';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Keyed by the live second suggestion's id, read from the fixture (never hard-coded).
const secondId = autocomplete.suggestions[1].placePrediction.placeId;
const DETAILS: Record<string, Record<string, unknown>> = {
  [secondId]: detailsSecond,
};

/** Mirrors billing: Google returns only the fields named in the mask. */
function applyMask(body: Record<string, unknown>, mask: string | null): Record<string, unknown> {
  if (mask !== GOOGLE_MASKS.basic && mask !== GOOGLE_MASKS.preview && mask !== GOOGLE_MASKS.poi) return body;
  const keep = new Set(mask.split(','));
  return Object.fromEntries(Object.entries(body).filter(([k]) => keep.has(k)));
}

/** Serves the live-captured fixtures; anything else is a 404. Unknown ids get the first place's (Raan Jay Fai) full details. */
export function fakeGoogleFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== 'https://places.googleapis.com') return json({ error: 'not found' }, 404);
    if (url.pathname === '/v1/places:autocomplete') return json(autocomplete);
    if (url.pathname.startsWith('/v1/places/')) {
      const id = decodeURIComponent(url.pathname.slice('/v1/places/'.length));
      const mask = new Headers(init?.headers).get('X-Goog-FieldMask');
      if (id.startsWith('ChIJfakeGone')) return json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
      if (id.startsWith('ChIJfakeBad')) return json({ error: { code: 400, status: 'INVALID_ARGUMENT' } }, 400);
      if (mask === GOOGLE_REFRESH_MASK) {
        const closed = id.startsWith('ChIJfakeClosed');
        return json({ ...detailsRefresh, id, ...(closed ? { businessStatus: 'CLOSED_TEMPORARILY' } : {}) });
      }
      return json(applyMask(DETAILS[id] ?? detailsFull, mask));
    }
    return json({ error: 'not found' }, 404);
  }) as typeof fetch;
}
