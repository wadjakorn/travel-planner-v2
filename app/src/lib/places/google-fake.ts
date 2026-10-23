import 'server-only';
import autocomplete from './__fixtures__/google-autocomplete.json';
import detailsFull from './__fixtures__/google-details-full.json';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Serves the hand-written fixtures; anything else is a 404. */
export function fakeGoogleFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== 'https://places.googleapis.com') return json({ error: 'not found' }, 404);
    if (url.pathname === '/v1/places:autocomplete') return json(autocomplete);
    if (url.pathname.startsWith('/v1/places/')) return json(detailsFull);
    return json({ error: 'not found' }, 404);
  }) as typeof fetch;
}
