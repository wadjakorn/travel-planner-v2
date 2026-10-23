# Google Maps links as place input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste a Google Maps link (or Google's share text) into any place search. Let an agent send `googleMapsUrl` to the v1 API and to import. In both cases the server turns the link into a name, coordinates and a Google id, without any Google Maps Platform API. If an agent sends no coordinates but does send a link or an `address`, the server geocodes the place on a best-effort basis.

**Architecture:**
- One server module, `lib/places/gmaps-link.ts`. It parses Google Maps URLs and expands `maps.app.goo.gl` short links by following redirects only. It never reads Google HTML.
- **UI:** the existing autocomplete route checks whether the query holds a link. If it does, the route returns suggestions built from the link, so all five pickers that use it get link support without a new component.
- **Agent API:** the server resolves `googleMapsUrl`, and geocodes a place that still has no coordinates but has a link or an `address`. This happens before the existing service call. The response carries `warnings[]` so the agent can fix pins itself.
- **Docs:** API.md, SKILL.md and the MCP plan teach agents what to send.

**Tech Stack:** Next.js 16.2.4 App Router, TypeScript, vitest 3, the existing Geoapify/Photon search (`lib/places/search.ts`), and the existing rate limiter (`consumeRateLimitKey`).

**Spec:** [docs/research/2026-10-20-google-places-into-app.md](../../research/2026-10-20-google-places-into-app.md) — §3 A (paste link), §3.10 (agent API), §3.11 (MCP / Skill).
**Review:** [2026-10-20-google-maps-links.scrutiny.md](2026-10-20-google-maps-links.scrutiny.md) records each finding and whether it was Applied or Kept.

## Global Constraints

- **Must work in `MAPS_PROVIDER=open`; in google mode a `ChIJ` id from a link may go through `getPlaceDetail`; no scraping. Execute after stage A.** A bare `ChIJ` id from a link has no session, so `basic` returns `name:''` and the link's own name must be kept, while `full` would bill per request at Enterprise. The server may only follow the HTTP redirects of a short link. It must never fetch or parse HTML from `google.com/maps/*` (robots.txt + ToS; the user rejected scraping in round 2).
- **Outbound fetch rules.**
  - Fetch only allowlisted hosts on `https:` with the default port.
  - Use `redirect: 'manual'`, at most 3 hops, a 4 s timeout per hop, and discard the response body.
- **No DB migration.**
  - The Google id goes in the existing `place_id_external`, as either `gcid:<decimal CID>` (a new prefix) or a bare `ChIJ…` (the existing legacy-Google form).
  - The id comes **only** from the link or from the agent. A geocode result never supplies it, so a geocoded pin stays editable.
- **Never fail a request because of a link.** `name` stays required in the API. A malformed field (a `googleMapsUrl` that is not a string, or is longer than 2048 chars) is a 400. A well-formed link that is unusable only adds a warning.
- **Coordinate precedence:** exact pin from the link (`!3d/!4d`, `?q=lat,lng`, `/search/lat,lng`) > agent `lat/lng` > link viewport `@lat,lng` > geocode of `link.query ?? link.name ?? "name, address"`.
- **When a geocode may run:** the place still has no coordinates, **and** a link was sent or `address` is non-null, **and** `kind !== 'transit'`.
  - A place with only a name keeps today's behaviour: no pin, no warning, no network call.
  - This changes research §3.10 in two ways: agent coordinates now beat a geocode, and an address alone, with no URL, is enough to geocode. (Review R2-M3.)
- **`coords_mismatch` threshold:** 2000 m (haversine).
- **Cost caps.**
  - Per API request: **50** lookups (one short-link expansion or one geocode each) and a **20 s** deadline. Both sit well under `CLAIM_TTL_MS = 60_000` (`lib/api/idempotency.ts:27`).
  - Per user: **300 geocodes per 24 h window, starting at the user's first geocode** (a fixed window, from `consumeRateLimitKey`) in bucket `geocode:<userId>` via `consumeRateLimitKey`. The prune cron deletes windows older than 1 day, so the window must stay at 1 day or less. If the limiter itself fails, allow the geocode (fails open), the same way `allowPlacesRequest` does.
  - Identical geocode queries inside one request run once. The cache holds the **promise**, so concurrent places share one call.
- **A deadline or abort is never a miss.** When `budget.signal.aborted` is set, an empty or `null` result is reported as `lookup_skipped` and is not cached. Both resolvers swallow errors, so the code must check the signal instead of waiting for an exception. (Review R2-M2.)
- **Out of scope** (a separate later plan): clipboard chip, PWA share target, bookmarklet, Google embed preview (H), and links on the **API's** hotel fields. In the UI, links work in every picker, hotels included.
- **Spec option B is in scope as a single link.** Under the search box, a `Find on Google Maps ↗` link opens `https://www.google.com/maps/search/?api=1&query=<q>` in a new tab. It is shown in `place-search-picker` and `hotel-search-picker`. (Review R3-n2.)

## Review Focus

1. **Google share text, not a bare URL.** For example `"Jay Fai\n327 Maha Chai Rd…\nhttps://maps.app.goo.gl/AbC?g_st=ic"`. The URL inside must be found and used. → Task 1 (`extractGmapsUrl`), Task 3 route test.
2. **EU consent interstitial.** The redirect goes to `consent.google.com/?continue=<url>`. Use the `continue` URL and never fetch the consent host. → Task 2.
3. **Dropped pin.** It expands to `/maps/search/39.920439,+116.331538?entry=tts…` (a `,+` separator, checked live). This must parse as `exact` and must not be geocoded as text. A `@lat,lng` with no `!3d/!4d` is `viewport`, never `exact`. → Task 1.
4. **Lookalike and internal hosts.** `maps.app.goo.gl.evil.io`, `google.com.evil.io`, `:8443` ports, `http:`, `169.254.169.254`, and an off-allowlist `Location` must all cause no fetch, or stop the redirect chain. → Tasks 1 and 2.
5. **A large import, or a slow or exhausted provider, still creates the trip.** Places past the budget, the deadline or the daily geocode cap get `lookup_skipped`. → Task 5.

---

## File map

| File | Change |
|---|---|
| `app/src/lib/places/gmaps-link.ts` (+test) | **Create.** `parseGmapsUrl`, `isGmapsUrl`, `extractGmapsUrl`, `expandShortLink`, `readGmapsLink` |
| `app/src/lib/places/place-id.ts` (+test) | `'gcid'` provider, `cidOf` |
| `app/src/lib/gmaps.ts`, `gmaps.test.ts` (exists) | `gcid:` → `https://maps.google.com/?cid=` in `gmapsSearchUrl` |
| `app/src/lib/places/search.ts` (+test) | `signal` in `Deps`; `suggestFromLink` |
| `app/src/lib/places/geoapify.ts`, `photon.ts` (+tests) | Accept and forward `signal` |
| `app/src/app/api/places/autocomplete/route.ts` (+ new `route.test.ts`) | Link branch, `linkError` |
| `app/src/lib/places/client.ts`, `client.test.ts` | `fetchSuggestions` also returns `linkError` |
| `app/src/components/use-place-search.ts` | Expose `linkError` |
| Picker consumers of `usePlaceSearch`: `place-search-picker.tsx`, `hotel-search-picker.tsx`, `hotel-place-picker.tsx`, `transport-place-picker.tsx`, `place-autocomplete.tsx` | Placeholder copy; `linkError` hint (place + hotel search pickers) |
| `app/src/components/sortable-place-item.tsx:185` | Show Edit unless the id is `geoapify:` or `osm:` |
| `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx:43-60` | Pass `lat`, `lng` and `placeIdExternal` into `initial` so saving keeps them |
| `app/src/components/place-preview-modal.tsx:74` | Pass `placeIdExternal: prediction.id` |
| `app/src/lib/api/place-link.ts` (+test) | **Create.** `applyPlaceLink`, `resolvePlanLinks`, `LinkBudget`, warnings |
| `app/src/lib/api/place-input.ts` (+test) | `readPlaceLink(body)` |
| `app/src/lib/api/import-input.ts` (+test) | `readImportPlaceLinks(body)`; `ParsedImportPlan` **unchanged** |
| `app/src/app/api/v1/days/[dayId]/places/route.ts`, `app/src/app/api/v1/places/[placeId]/route.ts` | Resolve, return `warnings` |
| `app/src/lib/api/import-orchestrator.ts`, `import-orchestrator.integration.test.ts` | `resolveLinks` dep (and in the test's `deps()` factory); warnings in body and marker |
| Vercel project settings | Confirm Fluid Compute (see Task 5, step 5) |
| `API.md`, `agent-skill/travel-planner-api/SKILL.md`, `docs/superpowers/plans/2026-09-17-mcp-server-byo-agent.md`, `AGENTS-INDEX.md`, research doc §7 | Docs |

---

### Task 1: Parse Google Maps URLs and the `gcid` id

**Files:**
- Create: `app/src/lib/places/gmaps-link.ts`, `gmaps-link.test.ts`
- Modify: `app/src/lib/places/place-id.ts`, `place-id.test.ts`, `app/src/lib/gmaps.ts`, `app/src/lib/gmaps.test.ts`, `app/src/components/place-preview-modal.tsx:74`

**Interfaces:**
- Produces:
  ```ts
  export type GmapsLink = {
    name: string | null;          // from /place/<name>/
    query: string | null;         // q / query / /search/<text>, when not coordinates
    lat: number | null;
    lng: number | null;
    precision: 'exact' | 'viewport' | null;
    cid: string | null;           // decimal string
    googlePlaceId: string | null; // ChIJ… from query_place_id
  };
  export function isGmapsUrl(raw: string): boolean;              // maps URL or short link
  export function isShortLink(u: URL): boolean;
  export function extractGmapsUrl(text: string): string | null;  // first whitespace-separated https:// token passing isGmapsUrl
  export function parseGmapsUrl(raw: string): GmapsLink | null;  // null = not a Google Maps URL
  // place-id.ts
  export type PlaceProvider = 'google' | 'geoapify' | 'osm' | 'gcid';
  export function cidOf(id: string | null | undefined): string | null;
  ```

**Host rules.**
- Maps host: `/^(www\.|maps\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/`.
- Short link: `maps.app.goo.gl`, or `goo.gl` with a path starting `/maps`.
- Require `https:` and an empty `port`.
- `/maps/dir/…` and `/maps/embed…` are maps URLs, but parse to an all-null `GmapsLink`.

**Extraction order** (first match wins for the coordinates):
1. `!3d<lat>!4d<lng>` in `data=` → `exact`.
2. `q`, `query` or `ll` that is a coordinate pair, or `/maps/search/<pair>` → `exact`. A pair means `/^(-?\d+(\.\d+)?),[\s+]*(-?\d+(\.\d+)?)$/`, checked after URL decoding.
3. `/@<lat>,<lng>,` → `viewport`.

**Other fields.**
- CID: take the second hex number from `!1s0x…:0x…`, or from `ftid=0x…:0x…`, and convert it with `BigInt`. Otherwise take the `cid` param as is.
- `googlePlaceId` comes from `query_place_id`.
- Name: decode with `decodeURIComponent(seg.replace(/\+/g, ' '))` inside a try/catch. If decoding fails, the name is `null`.
- Coordinates outside lat ±90 / lng ±180 become `null`.

- [ ] **Step 1: Write the failing tests.** Fixtures: `PLACE` below is synthetic. `LIVE_PLACE` and `LIVE_PIN` are the two real `Location` values the scrutiny captured. Take the full values, `?entry=tts&g_ep=…` tails included, from the Task 2 step 5 live run (`curl -sI https://maps.app.goo.gl/mBtbC6qXLK2baGTV9` for the place; the pin needs a dropped-pin short link). The tails do not affect parsing; they are there to prove that the extra query parameters are ignored. Put them in `app/src/lib/places/__fixtures__/gmaps-links.ts`:

```ts
const PLACE = 'https://www.google.com/maps/place/Jay+Fai/@13.7522,100.5042,17z/data=!3m1!4b1!4m6!3m5!1s0x30e2993d6a1e2a8d:0x6f3c1b2a4d5e6f70!8m2!3d13.75249!4d100.50449!16s%2Fg%2F11b6';

it('reads the exact pin, name and CID from a place URL', () => {
  expect(parseGmapsUrl(PLACE)).toEqual({ name: 'Jay Fai', query: null, lat: 13.75249, lng: 100.50449,
    precision: 'exact', cid: '8015311305313251184', googlePlaceId: null });
});
it('parses the live place fixture', () => {
  expect(parseGmapsUrl(LIVE_PLACE)).toMatchObject({ name: 'Steak no Don', lat: 34.5945482, lng: 133.7583428, precision: 'exact' });
});
it('parses a dropped pin with a ",+" separator as exact', () => {
  expect(parseGmapsUrl(LIVE_PIN)).toMatchObject({ lat: 39.920439, lng: 116.331538, precision: 'exact', query: null });
});
it('treats @lat,lng without !3d/!4d as viewport', () => {
  expect(parseGmapsUrl('https://www.google.com/maps/place/Jay+Fai/@13.7522,100.5042,17z'))
    .toMatchObject({ lat: 13.7522, precision: 'viewport', cid: null });
});
it('reads ftid as CID', () => {
  expect(parseGmapsUrl('https://maps.google.com/maps?q=Jay+Fai,+Bangkok&ftid=0x30e2993d6a1e2a8d:0x6f3c1b2a4d5e6f70'))
    .toMatchObject({ query: 'Jay Fai, Bangkok', cid: '8015311305313251184', lat: null });
});
it('decodes Thai and %2B names, survives malformed %', () => {
  expect(parseGmapsUrl('https://www.google.com/maps/place/%E0%B9%80%E0%B8%88%E0%B9%8A%E0%B9%84%E0%B8%9D/@1,2,3z')!.name).toBe('เจ๊ไฝ');
  expect(parseGmapsUrl('https://www.google.com/maps/place/A%2BB+Cafe/@1,2,3z')!.name).toBe('A+B Cafe');
  expect(parseGmapsUrl('https://www.google.com/maps/place/%E0%B9/@1,2,3z')!.name).toBeNull();
});
it('reads api=1 search URLs and cid', () => {
  expect(parseGmapsUrl('https://www.google.com/maps/search/?api=1&query=Jay%20Fai%2C%20Bangkok&query_place_id=ChIJabc'))
    .toMatchObject({ query: 'Jay Fai, Bangkok', lat: null, googlePlaceId: 'ChIJabc' });
  expect(parseGmapsUrl('https://maps.google.com/?cid=8015311305313251184')).toMatchObject({ cid: '8015311305313251184' });
});
it('rejects non-Google, lookalike, http, ported and out-of-range input', () => {
  for (const u of ['https://google.com.evil.io/maps/place/X', 'https://maps.app.goo.gl.evil.io/abc',
                   'http://www.google.com/maps/place/X/@1,2,3z', 'https://www.google.com:8443/maps/place/X',
                   'http://169.254.169.254/', 'Jay Fai'])
    expect(parseGmapsUrl(u)).toBeNull();
  expect(isGmapsUrl('https://maps.app.goo.gl/AbC123')).toBe(true);
  expect(isGmapsUrl('https://goo.gl/photos/x')).toBe(false);
  expect(parseGmapsUrl('https://maps.google.com/?q=95,100')!.lat).toBeNull();
});
it('extracts the link from Google share text', () => {
  expect(extractGmapsUrl('Jay Fai\n327 Maha Chai Rd, Bangkok\nhttps://maps.app.goo.gl/AbC?g_st=ic')).toBe('https://maps.app.goo.gl/AbC?g_st=ic');
  expect(extractGmapsUrl('see https://evil.io/x and nothing else')).toBeNull();
});
```

Also add these tests:
- `place-id.test.ts`:
  - `placeProvider('gcid:123')` returns `'gcid'`.
  - `cidOf('gcid:123')` returns `'123'`.
  - `cidOf('ChIJx')` returns `null`.
- `gmaps.test.ts`:
  - `gmapsSearchUrl({ name: 'Jay Fai', lat: 1, lng: 2, placeIdExternal: 'gcid:123' })` returns `'https://maps.google.com/?cid=123'`.
  - With `'geoapify:x'`, the result is unchanged (`query=1%2C2`).

- [ ] **Step 2: Run the tests and confirm they fail.** `cd app && pnpm vitest run src/lib/places/gmaps-link.test.ts src/lib/places/place-id.test.ts src/lib/gmaps.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - Write the parser.
  - Add `gcid` and `cidOf`.
  - Make `gmapsSearchUrl` return `https://maps.google.com/?cid=<cid>` when `cidOf(p.placeIdExternal)` is set. `gmapsDirectionsUrl` already uses `lat,lng` for non-Google ids.
  - In `place-preview-modal.tsx:74`, add `placeIdExternal: prediction.id`.
- [ ] **Step 4: Run the tests again and confirm they pass.** Then run `pnpm typecheck` and check that `tail -3` is clean.
- [ ] **Step 5: Commit.** `feat(places): parse Google Maps URLs into name/coords/CID [TP-0046]`

---

### Task 2: Expand short links safely

**Files:** Modify `app/src/lib/places/gmaps-link.ts` and `gmaps-link.test.ts`.

**Interfaces:**
- Consumes: `parseGmapsUrl` and `isShortLink` (Task 1).
- Produces:
  ```ts
  export type LinkDeps = { fetchImpl?: typeof fetch; signal?: AbortSignal };
  export async function expandShortLink(raw: string, deps?: LinkDeps): Promise<string | null>;
  export async function readGmapsLink(raw: string, deps?: LinkDeps): Promise<GmapsLink | null>;
  // short link → expand then parse; maps URL → parse, NO fetch; anything else → null
  ```

**`expandShortLink` algorithm:**
1. Loop at most 3 times.
2. Each pass calls `fetchImpl(url, { redirect: 'manual', signal })`. The signal combines `deps.signal` (when it is defined) with `AbortSignal.timeout(4000)`; build that list with a type guard rather than `filter(Boolean)`. Then call `res.body?.cancel()`.
3. If the response is not a 3xx, return `null`.
4. Resolve `Location` against the current URL.
5. If the host is `consent.google.com`, take its `continue` param instead and do not fetch the consent page.
6. Then:
   - a maps URL → return it;
   - a short link → loop again;
   - anything else → return `null`.
7. Any exception → return `null`.

- [ ] **Step 1: Write the failing tests.**

```ts
const redirect = (loc: string) => new Response(null, { status: 302, headers: { location: loc } });

it('follows one 302 to the place URL', async () => {
  const f = vi.fn().mockResolvedValue(redirect(LIVE_PLACE));
  expect(await readGmapsLink('https://maps.app.goo.gl/mBtbC6qXLK2baGTV9', { fetchImpl: f })).toMatchObject({ precision: 'exact' });
  expect(f).toHaveBeenCalledTimes(1);
});
it('unwraps consent.google.com?continue= without fetching it', async () => {
  const f = vi.fn().mockResolvedValue(redirect(`https://consent.google.com/ml?continue=${encodeURIComponent(PLACE)}`));
  expect((await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: f }))!.cid).toBe('8015311305313251184');
  expect(f).toHaveBeenCalledTimes(1);
});
it('stops at an off-allowlist Location', async () => {
  const f = vi.fn().mockResolvedValueOnce(redirect('http://169.254.169.254/latest'));
  expect(await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: f })).toBeNull();
  expect(f).toHaveBeenCalledTimes(1);
});
it('gives up after 3 hops', async () => {
  const f = vi.fn().mockResolvedValue(redirect('https://maps.app.goo.gl/again'));
  expect(await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: f })).toBeNull();
  expect(f).toHaveBeenCalledTimes(3);
});
it('does not fetch full maps URLs', async () => {
  const f = vi.fn();
  await readGmapsLink(PLACE, { fetchImpl: f });
  expect(f).not.toHaveBeenCalled();
});
it.each([['throws', () => Promise.reject(new Error('x'))], ['200', () => Promise.resolve(new Response('ok'))],
         ['404', () => Promise.resolve(new Response(null, { status: 404 }))]])('returns null when fetch %s', async (_, impl) => {
  expect(await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: vi.fn(impl) })).toBeNull();
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again and confirm they pass.**
- [ ] **Step 5: Check against a live link, once.**
  - Run `pnpm tsx -e "import('./src/lib/places/gmaps-link').then(async m=>console.log(await m.readGmapsLink(process.argv[1])))" 'https://maps.app.goo.gl/mBtbC6qXLK2baGTV9'`.
  - It should print `precision: 'exact'`.
  - Paste the output into the PR description.
- [ ] **Step 6: Commit.** `feat(places): expand maps.app.goo.gl links via redirects only [TP-0046]`

---

### Task 3: Paste a link into any place search (UI)

**Files:**
- Modify:
  - `app/src/lib/places/search.ts` (+test), `geoapify.ts`, `photon.ts` (+tests)
  - `app/src/app/api/places/autocomplete/route.ts`
  - `app/src/lib/places/client.ts` (+`client.test.ts`), `app/src/components/use-place-search.ts`
  - the five pickers in the file map
  - `app/src/components/sortable-place-item.tsx:185`
  - `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx:43-60`
- Create: `app/src/app/api/places/autocomplete/route.test.ts`

**Interfaces:**
- Consumes: `readGmapsLink`, `extractGmapsUrl`, `LinkDeps` (Tasks 1–2); `timeZoneAt`; `placeProvider`.
- Produces:
  ```ts
  // search.ts
  type Deps = { key?: string; fetchImpl?: typeof fetch; signal?: AbortSignal }; // signal forwarded to geoapify + photon (combine with their 4 s timeout via a type guard, as in Task 2)
  export type LinkSuggestions = { results: PlaceSuggestion[]; linkError: 'unresolved' | null };
  export async function suggestFromLink(url: string, deps?: Deps): Promise<LinkSuggestions>;
  // client.ts
  export async function fetchSuggestions(q: string, signal?: AbortSignal): Promise<LinkSuggestions>;
  // use-place-search.ts: return value gains `linkError: 'unresolved' | null`
  ```

**`suggestFromLink` rules:**
- **The link has coordinates.** Return one suggestion, with `linkError: null`:
  - `id`: `gcid:<cid>`, else `googlePlaceId`, else `''`. An empty id is stored as null by `trimOrNull`.
  - `name`: the link's `name`, else its `query`, else `` `${lat.toFixed(5)}, ${lng.toFixed(5)}` ``.
  - `secondary: null` and `address: null`. A null `secondary` stops `hotel-place-picker.tsx:66` from saving a label as the address.
  - `kind: 'sight'`.
  - `timeZone: timeZoneAt(lat, lng)`.
- **No coordinates, but a `query` or `name`.** Return `searchPlaces(query ?? name)` with `linkError: null`.
- **Otherwise.** Return `{ results: [], linkError: 'unresolved' }`.

**Route:**
- Run `const link = extractGmapsUrl(rawQ)` **before** the 120-char slice. `rawQ` is capped at 4096 chars.
- If `link` is set, return `suggestFromLink(link)`. Otherwise run the existing path and return `{ results, linkError: null }`.
- Every response includes `linkError`, including the early returns for rate-limited requests and for `q.length < 2` (both `null`).
- Same `allowPlacesRequest` bucket as today.

**Client:**
- `fetchSuggestions` returns `{ results: [], linkError: null }` on a non-2xx response, and reads `linkError ?? null` from the JSON.
- `usePlaceSearch` sets `linkError = null` wherever it clears `results` or starts a new query: in `onQueryChange` (including the under-`minChars` branch), in `reset`, and in `clearResults`.

**UI:**
- **Placeholder** in all five pickers: `Search places or paste a Google Maps link…`. If a picker's placeholder is a short name field, such as the transport airport picker, leave it as it is and record that in the PR.
- **Error hint** in `place-search-picker` and `hotel-search-picker`. When `linkError` is set, show `Couldn't read this Google Maps link — try searching the name, or add it manually.` above the existing Manual Add button.
- **Edit button** in `sortable-place-item.tsx:185`. Show it unless `placeProvider(place.placeIdExternal)` is `'geoapify'` or `'osm'`. That covers `gcid:`, bare `ChIJ` (whose pin may be an approximate geocode) and manual places. Places added from a link are saved as `sight` with no address, so the user must be able to fix them.
- **Hotels: no change.** The editor users actually see, `HotelFormClient` in bookings, already allows "Enter manually instead" for every hotel and keeps `placeIdExternal`, `lat` and `lng`. `hotel-edit-modal.tsx` is dead code; do not touch it. (Review R3-m1.)
- **Option B link:** see Global Constraints. Show it when the query has 2 or more characters and is not a link. It is a plain `<a target="_blank" rel="noreferrer noopener">`.
- **Edit page.** Add `lat`, `lng` and `placeIdExternal` from `r.place` to `initial` (`edit/page.tsx:43-60`). Today saving the form writes nulls for all three, because `place-autocomplete` starts its hidden inputs empty and `updatePlace` replaces every field (Review R2-M1). This bug also affects manual places with a pin that exist today.

- [ ] **Step 1: Write the failing tests.**
  - `search.test.ts` (injected `fetchImpl`, `key: ''`):
    - `suggestFromLink(PLACE)` gives `{ results: [{ id: 'gcid:8015311305313251184', name: 'Jay Fai', secondary: null, kind: 'sight' }], linkError: null }`, and `fetchImpl` is not called.
    - A `search/?api=1&query=Jay%20Fai` link gives the Photon fixture results, with one `fetchImpl` call whose URL contains `q=Jay+Fai`.
    - `'https://maps.google.com/?cid=1'` gives `{ results: [], linkError: 'unresolved' }`.
  - `geoapify.test.ts` / `photon.test.ts`: an aborted `signal` rejects without the fetch resolving.
  - `client.test.ts`: change the non-2xx case to expect `{ results: [], linkError: null }`.
  - `route.test.ts`:
    - `vi.mock('@/lib/auth')` returns a session.
    - `vi.mock('@/lib/places/rate-limit')` allows.
    - `vi.mock('@/lib/places/search')` spies.
    - `GET ?q=` set to the share text (Review Focus 1), in both its `\n` form and its space-joined form (what a single-line input actually sends), calls `suggestFromLink` with `'https://maps.app.goo.gl/AbC?g_st=ic'` and never calls `searchPlaces`.
    - `?q=Jay Fai` calls `searchPlaces` and returns `linkError: null`.
- [ ] **Step 2: Run the tests and confirm they fail.** `pnpm vitest run src/lib/places src/app/api/places`
- [ ] **Step 3: Implement.**
  - `signal` plumbing in both providers. Combine the optional `signal` with `AbortSignal.timeout(4000)`, using a type guard as in Task 2.
  - `suggestFromLink`.
  - The route change.
  - `client.ts` / `usePlaceSearch` gain `linkError`.
  - Picker copy and the error hint.
  - The Edit-button condition and the option B link.
  - The edit page's `initial`.
- [ ] **Step 4: Run the tests again and confirm they pass.** Then run `pnpm typecheck && pnpm lint` and check that `tail -3` is clean.
- [ ] **Step 5: Check by hand.** Run `pnpm dev` and go to Add place.
  1. Paste a real short link. You should get one result, the pin should land in the right spot, Edit should be visible, and "Open in Google Maps" should open the same listing.
  2. Paste Google's multi-line share text. The input joins the lines with spaces; you should get the same result as step 1.
  3. Paste `https://maps.google.com/?cid=1`. The hint should appear.
  4. In the hotel booking form, paste a link. The address should stay empty, not show a label. Then edit that hotel in Bookings → "Enter manually instead", and save. The `gcid:` id and the pin should survive.
  7. Type "Jay Fai". The `Find on Google Maps ↗` link should open a Google search for it.
  5. Edit the place from step 1, change Kind to food, and save. The pin and the `?cid=` "Open in Google Maps" link should be unchanged.
  6. Type a normal name after step 3. The hint should disappear.
- [ ] **Step 6: Commit.** `feat(places): accept pasted Google Maps links in place search [TP-0046]`

---

### Task 4: `googleMapsUrl` and best-effort geocoding on v1 place endpoints

**Files:**
- Create: `app/src/lib/api/place-link.ts` and `place-link.test.ts`.
- Modify:
  - `app/src/lib/api/place-input.ts` and `place-input.test.ts` (create the test if absent)
  - `app/src/app/api/v1/days/[dayId]/places/route.ts`
  - `app/src/app/api/v1/places/[placeId]/route.ts`

**Interfaces:**
- Consumes: `readGmapsLink`, `isGmapsUrl` (Tasks 1–2); `searchPlaces` with `signal` (Task 3); `consumeRateLimitKey` (`lib/api/rate-limit`); `PlaceFields`.
- Produces:
  ```ts
  // place-input.ts
  export function readPlaceLink(body: Record<string, unknown>): string | null; // trims; non-string or > 2048 chars → ServiceError('bad_request')
  // place-link.ts
  export type PlaceLinkWarningCode = 'url_unsupported' | 'url_unresolved' | 'coords_approx' | 'coords_mismatch' | 'lookup_skipped';
  export type PlaceLinkWarning = { code: PlaceLinkWarningCode; message: string };
  export const API_LINK_LOOKUPS = 50;
  export const API_LINK_DEADLINE_MS = 20_000;
  export const GEOCODE_DAILY = 300;
  export class LinkBudget {
    constructor(userId: string, lookups?: number, deadlineMs?: number, consume?: typeof consumeRateLimitKey);
    take(): boolean;                 // per-request lookup count + deadline not passed
    takeGeocode(): Promise<boolean>; // take() AND geocode:<userId> bucket (GEOCODE_DAILY / 86400 s); limiter error → true
    readonly signal: AbortSignal;    // AbortSignal.timeout(deadlineMs), created in constructor
    readonly geocodeCache: Map<string, Promise<PlaceSuggestion | null | 'skipped'>>;
  }
  export type PlaceLinkDeps = { readLink?: typeof readGmapsLink; search?: typeof searchPlaces };
  export async function applyPlaceLink(
    fields: PlaceFields, url: string | null, budget: LinkBudget, deps?: PlaceLinkDeps,
  ): Promise<{ fields: PlaceFields; warnings: PlaceLinkWarning[] }>;
  ```

**`applyPlaceLink` steps.** These define the order; the merge code is the implementer's.

1. **Read the link.**
   - If `url` is not `isGmapsUrl`, add the warning `url_unsupported` and treat it as if no link was sent.
   - If `url` is a short link, it needs `budget.take()` first. If that fails, add `lookup_skipped` and continue as if no link was sent. Otherwise call `readLink(url, { signal: budget.signal })`.
   - A `null` result gives `lookup_skipped` if `budget.signal.aborted` is set, and `url_unresolved` otherwise. Processing continues either way.
2. **Set `placeIdExternal`.** Keep `fields.placeIdExternal` if the agent sent one. Otherwise use `gcid:<cid>`, otherwise the link's `googlePlaceId`.
3. **Set the coordinates.**
   - **Link is `exact`.** Use the link's coordinates. If the agent also sent coordinates more than 2000 m away, add `coords_mismatch`.
   - **Agent sent coordinates.** Keep them.
   - **Link is `viewport`.** Use the link's coordinates and add `coords_approx`.
4. **Geocode if there are still no coordinates**, but only when a link was sent or `address` is non-null, **and** `kind !== 'transit'`. Otherwise stop.
   - The query is `link?.query ?? link?.name ?? [name, address].filter(Boolean).join(', ')`.
   - If `budget.geocodeCache` holds a promise for that query, await it. Otherwise, **synchronously, before any `await`**, store `(async () => (await budget.takeGeocode()) ? (await search(q, { signal: budget.signal }))[0] ?? null : 'skipped')()` and await that. Storing it first is what stops concurrent duplicates (Review R3-m2).
   - **`'skipped'`:** add `lookup_skipped` and stop.
   - **Hit:** set `lat` and `lng`. Set `address` only if it is still null. Add `coords_approx`. **Never set `placeIdExternal` from a geocode.**
   - **`null` while `budget.signal.aborted` is set:** add `lookup_skipped` and delete the cache entry.
   - **`null` otherwise (a real miss):** add `url_unresolved` if a link was sent. Otherwise add no warning; the place simply has no pin.
5. **Never touch the other fields.** `name`, `kind` and every other field are left unchanged.
6. **Each warning code appears at most once per place.** For example, a short link that times out followed by a skipped geocode gives one `lookup_skipped`, not two. (Review R3-m3.)

**Route wiring.**
- **POST.** After `parsePlaceFields`, run `applyPlaceLink(parsed, readPlaceLink(body), new LinkBudget(userId))`. Do this **before** `withIdempotencyAtomic`, so no transaction is open during network I/O. The response is `{ place, warnings }`, stored with the idempotency record.
- **PATCH.** Same wiring, same response shape.
- To move a pin, an agent sends a PATCH with `lat`/`lng` and **without** `googleMapsUrl` (see the Task 6 copy).
- PATCH is a full replace. A PATCH with no `lat`/`lng` but with an `address` re-geocodes. A PATCH with neither clears the pin, as it does today. API.md must say this.

**Known cost, kept on purpose.**
- Lookups run before the access check, so a wrong `dayId`/`placeId` can wait up to 20 s and use one of the caller's own geocodes before it gets a 404. (Review R3-n3.)
- A replay of the same idempotency key runs the lookups again before the stored body comes back. The 50-lookup budget, the 20 s deadline and the daily bucket bound this cost. Moving resolution after the claim would mean a new hook in `withIdempotencyAtomic`, so it was not worth it.

- [ ] **Step 1: Write the failing tests.** `place-link.test.ts` uses stub `readLink`/`search` and a `consume` stub that returns `{ ok: true }`. The base fields are `{ kind: 'food', name: 'Jay Fai', address: null, lat: null, lng: null, placeIdExternal: null, … }`.

```ts
it('exact link sets coords + gcid, no warnings')
it('exact link > 2 km from agent coords → link coords, [coords_mismatch]')
it('agent coords beat a viewport link, no warnings')
it('viewport link without agent coords → [coords_approx]')
it('search-only link geocodes link.query; placeIdExternal = link ChIJ, never the geocode id; [coords_approx]')
it('no link, no coords, address "Bangkok" → geocodes "Jay Fai, Bangkok"; placeIdExternal stays null')
it('name only (no link, no address) → no search call, no warnings')
it('kind transit with address → no search call')
it('readLink resolves null after the deadline aborts → [lookup_skipped], not url_unresolved')
it('search resolves [] after abort → [lookup_skipped], nothing cached')
it('two concurrent identical queries on one budget → search called once')
it('short link times out, then geocode skipped → warnings exactly [lookup_skipped]')
it('no link, agent coords → no search call')
it('agent placeIdExternal is never overwritten')
it('unresolvable short link with no geocode hit → [url_unresolved]')
it('non-Google URL with address → [url_unsupported, coords_approx]')
it('LinkBudget(userId, 0) → short link [lookup_skipped], readLink not called')
it('daily geocode bucket exhausted (consume → ok:false) → [lookup_skipped], search not called')
it('limiter throws → geocode still runs (fails open)')
it('same query twice on one budget → search called once')
```

`place-input.test.ts`:
- `readPlaceLink({})` returns `null`.
- `' https://x '` returns `'https://x'`.
- `5` throws `bad_request`.
- A string of 2049 characters throws.

- [ ] **Step 2: Run the tests and confirm they fail.** `pnpm vitest run src/lib/api/place-link.test.ts src/lib/api/place-input.test.ts`
- [ ] **Step 3: Implement.** Write `readPlaceLink`, `LinkBudget` and `applyPlaceLink`, then make the two route edits.
- [ ] **Step 4: Run the tests again and confirm they pass.** Run `pnpm vitest run src/lib/api src/app/api/v1`. Integration suites skip when `TEST_DATABASE_URL` is unset.
- [ ] **Step 5: Check with curl.** Against `pnpm dev` with a PAT, POST `{"kind":"food","name":"Steak no Don","googleMapsUrl":"https://maps.app.goo.gl/mBtbC6qXLK2baGTV9"}`. Expect a 201 where `place.lat` ≈ 34.5945, `placeIdExternal` starts with `gcid:`, and `warnings` is `[]`.
- [ ] **Step 6: Commit.** `feat(api): accept googleMapsUrl and geocode linked/addressed places on v1 [TP-0046]`

---

### Task 5: `googleMapsUrl` in `POST /trips/import`

**Files:**
- Modify:
  - `app/src/lib/api/import-input.ts` and `import-input.test.ts`
  - `app/src/lib/api/place-link.ts` and `place-link.test.ts`
  - `app/src/lib/api/import-orchestrator.ts` and `import-orchestrator.integration.test.ts`
  - `app/src/app/api/v1/trips/import/route.ts`

**Interfaces:**
- Consumes: `readPlaceLink`, `applyPlaceLink`, `LinkBudget`, `PlaceLinkDeps` (Task 4).
- Produces:
  ```ts
  // import-input.ts — ParsedImportPlan is NOT changed (import-service.ts:56 stays untouched)
  export function readImportPlaceLinks(body: Record<string, unknown>): (string | null)[][]; // [day][place]; call only after parseImportPlan succeeded
  // place-link.ts
  export type PlanLinkWarning = PlaceLinkWarning & { day: number; place: number }; // 1-based
  export async function resolvePlanLinks(
    userId: string, plan: ParsedImportPlan, links: (string | null)[][],
    deps?: PlaceLinkDeps & { budget?: LinkBudget },
  ): Promise<{ plan: ParsedImportPlan; warnings: PlanLinkWarning[] }>;
  // import-orchestrator.ts
  export type ImportDeps = { …existing; resolveLinks: typeof resolvePlanLinks };
  ```

**`resolvePlanLinks`:**
- Use one budget (`deps.budget ?? new LinkBudget(userId)`).
- Run `applyPlaceLink` for every place that has a link, or that has no coordinates but has an `address` and is not `transit`. Run at most 5 at a time.
- Places beyond the budget or the deadline get `lookup_skipped` (via `applyPlaceLink`).
- Return a new plan. Never mutate the input.

**Orchestrator:**
- Inside the existing `try`, do the following in order:
  1. `const parsed = parseImportPlan(body)`
  2. `const { plan, warnings } = await deps.resolveLinks(userId, parsed, readImportPlaceLinks(body))`
  3. `importPlan(…plan…)`
- The marker becomes `{ __idem: true, tripId, warnings }`, and `isImportMarker` still accepts the old shape.
- A replay from a marker returns `{ trip, warnings: marker.warnings ?? [] }`.
- The fresh 201 body and the persisted `full` are both `{ trip, warnings }`.
- `maxDuration` is decided in step 5. Do not set it by default: Fluid Compute already gives 300 s, and 60 would lower it (Review R2-m5).

- [ ] **Step 1: Write the failing tests.**
  - `import-input.test.ts`: two places where only the second has `googleMapsUrl`. `readImportPlaceLinks` returns `[[null, '<url>']]`. A non-string URL throws `day 1 place 2: …`.
  - `place-link.test.ts`, budget case:
    - 60 places, each with a **short** link and no coordinates.
    - The `readLink` stub resolves `exact`, and the default budget applies.
    - Expect 50 resolved and 10 places with exactly `[lookup_skipped]`, the first being `{ day: 1, place: 51 }`.
    - The input is deep-equal to a `structuredClone` taken before the call.
  - `place-link.test.ts`, deadline case:
    - `readLink` waits for its signal to abort and then **resolves `null`**, the way the real code behaves. It must not reject.
    - The plan includes one place with no link, an address and no coordinates; its `search` stub resolves `[]` on abort.
    - `budget: new LinkBudget('u', 50, 50)`.
    - The call returns within 1 s, and every place has exactly `[lookup_skipped]`.
  - `import-orchestrator.integration.test.ts`, gated as the suite already is:
    - Annotate the existing `deps()` factory (`:68`) as `(): ImportDeps`, and add `resolveLinks: async (_u, plan) => ({ plan, warnings: [] })` to it. Without the annotation, strict mode makes both parameters implicit `any` (Review R3-m4). The spread at `:146` then still typechecks, and the existing cases stay off the network.
    - A new case injects `resolveLinks` that returns one warning.
    - Assert that the 201 body has `warnings`, and that a replay with the same key also returns it.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `pnpm vitest run src/lib/api` and `pnpm typecheck`; both should pass.** If you have `TEST_DATABASE_URL` set, also run the orchestrator integration suite.
- [ ] **Step 5: Check the function duration.**
  - Run `vercel project inspect` or check the dashboard to see whether Fluid Compute is enabled.
  - **If it is on:** add nothing, and note "Fluid, 300 s" in the PR.
  - **If it is off:** add `export const maxDuration = 60` to the import route and to both v1 place routes.
- [ ] **Step 6: Commit.** `feat(api): resolve googleMapsUrl and geocode addressed places during import [TP-0046]`

---

### Task 6: Teach agents (API.md, SKILL.md, MCP plan, index)

**Files:**
- Modify `API.md`: §Import rules, §Place fields, §Rate limits.
- Modify `agent-skill/travel-planner-api/SKILL.md`: import rules around L80–86, examples at L70–75, field list around L190–197.
- Modify `docs/superpowers/plans/2026-09-17-mcp-server-byo-agent.md`: `placeShape` around L672, and `search_nearby` plus E10/E11.
- Modify `AGENTS-INDEX.md`.
- Modify the research doc, §7.

Use this exact copy everywhere:

> **Place location.**
> 1. Always send `name`, plus `address` (or at least the city). If you send no coordinates but do send an `address`, the server tries to geocode `name, address`. This is best-effort and capped, and never applies to `transit`. A place with only a name gets no pin.
> 2. If you found a real Google Maps link (`maps.app.goo.gl/…` or `google.com/maps/place/…`), send it as `googleMapsUrl`. It gives an exact pin. Do not build one yourself.
> 3. Never invent `query_place_id`, a CID, `placeIdExternal` or coordinates.
> 4. Check `warnings[]` in the response. `coords_approx`, `coords_mismatch` and `url_unresolved` mean the pin may be wrong. To move a pin, `PATCH` the place with `lat`/`lng` and **without** `googleMapsUrl`.

- [ ] **Step 1: Update API.md.**
  - Add `googleMapsUrl` to the place fields and add the copy above.
  - Document `warnings` on POST, PATCH and import.
  - Document the caps: 50 lookups and 20 s per request, and 300 geocodes per user per 24 h window, starting at the first geocode.
  - Document the PATCH rule from Task 4.
  - Add an `address` (or city) to the examples' places, for example `"Kiyomizu-dera"` with `"address": "Kyoto"`.
  - Replace `"placeIdExternal": "ChIJ…"` on the place examples with `googleMapsUrl`. Leave the hotel examples alone, because API hotel links are out of scope.
  - Add `gcid:<cid>` to the id prefixes.
- [ ] **Step 2: Update SKILL.md** with the same edits. Put the copy at the top of the import section.
- [ ] **Step 3: Update the MCP plan.**
  - Add `googleMapsUrl: z.string().optional().describe('A real Google Maps link you found (maps.app.goo.gl or /maps/place/). Never build or invent one.')` to `placeShape`.
  - Put the copy in the server `instructions`.
  - Add a "Revision 2026-10-20" note at the top, covering two points:
    - `search_nearby` cannot run as written, because TP-0045 removed Google Places, and `lib/places/search.ts` is text autocomplete with no location or category input. It needs a redesign, for example Geoapify Places API categories with a circle. That is out of scope here. A text-search tool over `searchPlaces` (`GET /api/v1/places/search?q=`) is a cheap first step.
    - A new tool, `resolve_place({ name: string, address?: string, googleMapsUrl?: string })`, builds `{ kind: 'sight', name, address, … all other fields null }`, then calls `applyPlaceLink` with a fresh `LinkBudget(userId)`, then returns `{ lat, lng, placeIdExternal, address, warnings }`. It writes nothing.
  - Do **not** implement MCP here.
- [ ] **Step 4: Update AGENTS-INDEX.md.**
  - Add rows for `places/gmaps-link.ts` and `api/place-link.ts`.
  - Add "link → suggestions" to the autocomplete route row.
- [ ] **Step 5: Update research doc §7.** Record these decisions:
  - **Coordinate precedence changed:** agent coordinates beat a geocode. A place is geocoded only when it has a link or an address, and never when it is `transit`.
  - **No `sourceUrl` column.**
  - **No trip-city bias:** the existing Thailand bias stays, and the fallback is `coords_approx` so the agent can fix it.
  - **Places are editable unless the pin came from Geoapify/OSM:** link-added (`gcid`), `ChIJ` and manual places all show Edit. Hotels need no change.
  - **Phase 2 is a separate plan:** clipboard, share target and bookmarklet.
- [ ] **Step 6: Check.** Run `grep -n '"placeIdExternal": "ChIJ' API.md agent-skill/travel-planner-api/SKILL.md`. It should match only the hotel examples.
- [ ] **Step 7: Commit.** `docs(api): teach agents to send googleMapsUrl [TP-0046]`

---

## Done when

- `pnpm test`, `pnpm typecheck` and `pnpm lint` all pass.
- Pasting a real short link adds a correctly pinned place that can be edited. "Open in Google Maps" opens the same listing.
- Pasting Google's share text works the same as pasting the bare link.
- A v1 POST and an import, each with `googleMapsUrl` or with an `address` and no coordinates, return coordinates and `warnings`. A name-only place behaves exactly as it does today.
- Editing a link-added place, or a hotel in Bookings, keeps its pin and `gcid:` id.
- An import replay returns the same `warnings`.
- `gmaps-link.ts` has exactly one `fetch` call site, in `expandShortLink`, and no code fetches `google.com/maps`.
- Ticket: TP-0046.
