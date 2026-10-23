import 'server-only';
import autocomplete from './__fixtures__/google-autocomplete.json';
import detailsFull from './__fixtures__/google-details-full.json';
import detailsThipsamai from './__fixtures__/google-details-thipsamai.json';
import { GOOGLE_MASKS } from './google';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const DETAILS: Record<string, Record<string, unknown>> = {
  ChIJfakeThipsamai0002: detailsThipsamai,
};

/** Mirrors billing: Google returns only the fields named in the mask. */
function applyMask(body: Record<string, unknown>, mask: string | null): Record<string, unknown> {
  if (mask !== GOOGLE_MASKS.basic) return body;
  const keep = new Set(mask.split(','));
  return Object.fromEntries(Object.entries(body).filter(([k]) => keep.has(k)));
}

/** Serves the hand-written fixtures; anything else is a 404. Unknown ids get the Jay Fai details. */
export function fakeGoogleFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== 'https://places.googleapis.com') return json({ error: 'not found' }, 404);
    if (url.pathname === '/v1/places:autocomplete') return json(autocomplete);
    if (url.pathname.startsWith('/v1/places/')) {
      const id = decodeURIComponent(url.pathname.slice('/v1/places/'.length));
      const mask = new Headers(init?.headers).get('X-Goog-FieldMask');
      return json(applyMask(DETAILS[id] ?? detailsFull, mask));
    }
    return json({ error: 'not found' }, 404);
  }) as typeof fetch;
}
