# TP-0113: the OG image re-hosts Google Static Maps

## Finding

When `MAPS_PROVIDER=google` is set with a key and a signing secret, `lib/maps/config.ts` set `staticMap: 'google'`. The OG route then works like this:

1. `app/trip/[id]/opengraph-image.tsx` fetches a signed Google Static Maps PNG through `fetchStaticMapDataUri`.
2. It inlines that PNG as a data URI and composes it into our own 1200×630 PNG.
3. It serves the result from our domain to crawlers. The route uses `revalidate: 86400`, and the fetch is also cached for 24 h.

Google Maps Platform Terms §3.2.3(b) forbid pre-fetching, caching, indexing or storing Content. The only exceptions are the limited ones in the Service Specific Terms, and none of them allows re-hosting a Maps Static image inside another image. `docs/research/2026-10-15-maps-provider-alternatives.md` notes the same.

## Options

1. **Geoapify (OSM) for the OG map whenever a key is set.** This is already supported, and it is already the default in open mode.
2. **No map in the OG image.** This loses the visual.
3. **Point the OG `<img>` at Google.** Not possible: the OG image is a PNG we generate, not HTML.

**Choice:** option 1, falling back to option 2 when there is no Geoapify key. In that case `fetchStaticMapDataUri` returns null and the OG image renders its non-map layout.

## Change

- **`config.ts`, google branch:** `staticMap: fallbackStatic`, which resolves to Geoapify or null. A comment cites the terms.
- **`static-map.ts` header:** the Google builder stays and stays tested, but no config selects it.
- **Config tests:** a google config no longer yields `'google'`.

## Ops note

Production should have `GEOAPIFY_API_KEY` set. Without it, OG cards still render but have no map.
