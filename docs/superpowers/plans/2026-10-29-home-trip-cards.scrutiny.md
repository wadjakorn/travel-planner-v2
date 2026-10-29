# Scrutiny: home trip cards

Plan: [2026-10-29-home-trip-cards.md](2026-10-29-home-trip-cards.md). Traced against HEAD `6f6f7a2`.

## Intent

Make Home cards informative and the grid ordered by what comes next: a static-map cover, delete moved into a ⋯ menu, Upcoming / No dates / Past groups, and readable avatars (spec §4.2, HOME-01).

### Simpler alternatives considered (mandatory pass)

- **Do nothing for covers / use a Places photo of the first stop.** The spec allows either. A photo costs a Place Photo SKU per card, and the app's photo path is already capped. The static map is cheaper ($0.002) and shows the route. Keep the map.
- **The proxy route vs a signed URL straight in `<img>`.** The original design had an authenticated route that fetched the PNG with the server key, held it in the Next data cache for 24 h, and re-served it with `private, max-age=86400`. Google's documented pattern for Static Maps is a signed URL loaded by the browser. The app already has a public, referrer-locked browser key (`maps/config.ts:57`, setup doc §4), and the console already rejects unsigned requests (setup doc §6/§7). Signing a browser-key URL server-side removes the route, the auth and 404 handling, the version hash, the cache headers, and the ToS problem (B1). **Applied.**

## Findings

### B1. Blocker: server-side caching and rehosting of Static Maps images is not permitted (applied)

- **Finding:** the plan cached the Google Static Maps PNG on our servers (`fetch` `revalidate: 86400`, the Next data cache) and re-served it from our origin.
- **Why it matters:** Google Maps Platform ToS §3.2.3(b) says: "*No Caching. Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms.*" §3.2.3(a)(i) says Customer will not "*pre-fetch, index, store, reshare, or rehost Google Maps Content outside the services*". I fetched the current Service Specific Terms (last modified Oct 28, 2026) and searched them. They hold no Maps Static API caching permission. The only "Static" caching carve-out is `pano_ID` for Street View Static. A ToS breach puts the whole Maps account at risk, not just this feature.
- **Evidence:** the ToS (`cloud.google.com/maps-platform/terms`, last modified Aug 26, 2026) and the Service Specific Terms (`…/maps-service-terms`) were both fetched and grepped on 2026-10-29. The plan's cost table relied on exactly this server cache ("Next data cache … any user or device … 0 calls").
- **Change:** the cover is now `buildStaticMapUrl(points, { …, key: 'browser' })`, a URL signed with the existing secret that carries the browser key, rendered as a plain `<img>`. `next/image` is explicitly forbidden, because the Vercel optimizer would store the image. There is no route and no server cache. Open mode gets the gradient (the Geoapify key is server-only). The console step to add Maps Static API to the browser key is in Task 5 and the setup doc. The cost was recomputed: the console quota (400/day → ≤ $4/month) is the hard ceiling, and the expected load is about 4.5k/month = $0. **Applied.**
- **Follow-up (not this plan):** the existing OG image (`static-map.ts:153-175`, `revalidate: 86400`, inlined as a data URI and then ISR-cached) has the same caching question. `maps-cost-guardrails.md:134` presents the revalidate as a cost choice, with no ToS analysis. Recommend a ticket to review it, for example by drawing the OG without the Google map or by using Geoapify/OSM for OG.

### M1. Major: fixed-height covers crop the Google logo (applied)

- **Finding:** the plan used `h-36`, and `h-48 sm:h-56` when featured, with `object-cover` on a 1280×512 (5:2) image.
- **Why it matters:** a featured card at 390 px is about 342×192 (ratio 1.78). `object-cover` scales the image to 192 px tall, about 480 px wide, and crops roughly 70 px from each side, cutting off the bottom-left Google logo. The plan's own Global Constraint (no overlay on the bottom 28 px) didn't cover cropping. At 1440 px a featured card (about 760×224, ratio 3.4) crops top and bottom, which can lose markers and the copyright line.
- **Change:** the cover box is `aspect-[5/2]` for every card, so the image always matches and nothing is cropped. Featured is larger only by `sm:col-span-2`. Review Focus 5 and Task 5 now check the logo on the featured card at both widths. **Applied.**

### M2. Major: "load points in the existing `Promise.all`" can't work (applied)

- **Finding:** `(home)/page.tsx:42-45` runs `Promise.all([loadTripsForUser, tServer])`. The trip ids that `loadTripCoverPoints(tripIds)` needs come from the first call.
- **Change:** call it after `loadTripsForUser` (one extra round-trip; `[]` → no query). **Applied.**

### M3. Major: the avatars polish seed-only data (left as Decision 4)

- **Finding:** the card draws `trips.collaborators` (`trip-card.tsx:76`). Only `seed.ts:37` writes it, and the importer writes `[]` (`import-orchestrator.ts:87`). Real trips never show avatars, while the trip header draws real members (`trip/[id]/layout.tsx:49-60`). The budget plan also treats `collaborators` as decorative.
- **Why it matters:** the size fix makes fake data more legible but leaves the card and the header disagreeing about who is on a trip.
- **Change:** added as Decision 4. The default keeps the cheap spec fix; switching to real members is a follow-up. **Left for the user.**

### m1. Minor: `AGENTS-INDEX.md:336` is already stale

- It describes `static-map.ts` as "Geoapify … no signing", but the file has signed Google since Stage A. Task 6 rewrites the row.

### Verified claims

- `trip-delete-button.tsx` has one importer (`trip-card.tsx:5`). ✓
- `tripStatus` (`trip-card-art.ts:47-57`) puts a trip ending today in "ongoing" and a start-only trip on its start date. The plan's grouping tests match it. ✓
- `MAX_MARKERS = 12` and `sample()` keeps the first and last (`static-map.ts:17,42-46`). ✓
- `640x256@2` = 1280×512 is within the Static Maps limit of 640×640 at scale 2 (Google Maps Static API "start" docs). ✓
- `path=` is inside the signed query, so the signature covers it (`static-map.ts:91-92`). ✓
- Static Maps costs $2.00/1k after 10k free (`research/2026-10-23-…:88`). 400/day × 30 = 12k → 2k × $0.002 = **$4**. ✓

## Cross-plan resolutions

- **a11y-batch** (`trip-delete-button.tsx:39` + `tp-hit`), **ds-hex-codemod** (`trip-delete-button.tsx:39` `text-zinc-600`), and **ds-foundations** (`trip-card.tsx:146,154` `text-[9px]`) all edit code this plan deletes or rewrites. Resolution: **home-trip-cards owns `trip-card.tsx` avatars and the delete trigger.** If home lands first, those plans drop these rows. If one of them lands first, home deletes the file anyway and carries `tp-hit` forward to the `TripCardMenu` trigger (Task 3 Step 2). Notes were appended to those three scrutiny files.
- **ds-hex-codemod baseline:** this PR removes the raw `bg-white/85 text-zinc-600`, so it should regenerate `raw-color-baseline.json` if the codemod has landed.
- **i18n-extraction P1** (home): new literals "Upcoming", "No dates", "Past", "Trip settings", "Delete trip…" and the menu aria-label.
- **Merge with bookings-layout?** No. The two plans share no file except `skeletons.tsx`, and there they touch different functions (`TripGridSkeleton` and `BookingsSkeleton`). They also share no concept or reviewer focus. Merging would only make one PR harder to review.

## Verdict

**fix-then-ship.** The architecture was replaced with the ToS-compliant signed browser-key URL, which is also smaller. The cover crop was fixed. The avatar data source is left as a product decision.
