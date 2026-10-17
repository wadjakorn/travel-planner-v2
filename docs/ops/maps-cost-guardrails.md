# Maps and place search — quota and cost guardrails

The app no longer uses Google Maps Platform. There is no billable cloud console
to cap; the only metered service is Geoapify's free plan.

## Services

| Service | Used for | Key | Limit |
|---|---|---|---|
| Geoapify | Place autocomplete, place details (`/api/places/*`), OG static map (`lib/static-map.ts`) | `GEOAPIFY_API_KEY` (server-only) | Free plan: **3,000 credits/day**, no card |
| Photon (komoot) | Fallback search when Geoapify is missing, errors, or returns 429 | none | Fair use, no SLA |
| OpenFreeMap | Basemap tiles/style for every MapLibre map | none | **No SLA** |

## Credit cost

Roughly **1 credit per Geoapify request** (autocomplete, place details and
static map each count as a request). Confirm the current per-endpoint rate on
the Geoapify pricing page before changing limits. One search session is
therefore several credits (one per debounced autocomplete call plus one details
call on pick), which is why caching and debouncing matter.

## Guardrails in code

- Geoapify and Photon responses use the Next data cache for **30 days**
  (`revalidate`), so repeat queries cost no credits.
- Autocomplete is debounced client-side and stale responses are discarded
  (`components/use-place-search.ts`).
- `/api/places/*` requires a session (401 otherwise), so an anonymous
  scraper cannot drain the daily credits. There is no per-user rate limit yet.
- On **HTTP 429** from Geoapify the server falls back to Photon automatically;
  users keep getting results, with less detail.
- The OG image is cached per trip (`revalidate = 86400`), so volume follows the
  number of public trips shared, not page views.

## Watching usage

Check the dashboard at **myprojects.geoapify.com** (per-day credit usage).
If daily use regularly nears 3,000, raise the cache TTL first, then consider a
paid plan. Keep the key server-only; never prefix it `NEXT_PUBLIC_`.

## OpenFreeMap outage

OpenFreeMap has no SLA. If tiles stop loading, change the style URL in
`app/src/lib/map-style.ts` to another OpenMapTiles-compatible style (or a
self-hosted one). No other code change is needed.

## Behaviour changes versus Google

- Hotel pickers **rank lodging first** instead of filtering to lodging only,
  because Geoapify autocomplete cannot filter by category.
- Newly added places have **no rating or review count**.
- `placeIdExternal` is provider-prefixed: a bare id is a legacy Google id,
  otherwise `geoapify:<id>` or `osm:<N|W|R><id>`. "Open in Google Maps" for
  legacy rows still uses `query_place_id`.
- The trip map frames each day with `fitBounds`.
