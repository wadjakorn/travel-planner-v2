# Scrutiny: Google Maps links as place input (plan 2026-10-20)

**Reviewed:** [2026-10-20-google-maps-links.md](2026-10-20-google-maps-links.md) against the spec [2026-10-20-google-places-into-app.md](../../research/2026-10-20-google-places-into-app.md) (§3 A, §3.9, §3.10, §3.11, §7) and the code at `f093d91`.
**Reviewer stance:** outsider, cold read. Each finding has a **Status** line for the author to set to Applied or Kept.

## 1. Intent

**Goal, in one sentence:** turn a Google Maps link (pasted by a user, or sent by an agent as `googleMapsUrl`) into a name, a pin and a Google deep-link id. No Google API is called. The only network step is following the redirects of a short link.

### Simpler-alternative pass

- **UI path: the plan already picked the simpler option.** The spec (§6, §3.9) proposed a new `/api/places/from-link` route plus picker changes. The plan instead branches inside the existing autocomplete route. That gives every picker link support with no new component. Keep it.
- **Agent path: the "build a search URL" fallback adds nothing (see M1).** For an `api=1&query=` URL the server only geocodes the `query` text, which is the same as geocoding `name, address`. Without the spec's `sourceUrl` column, the constructed URL is not even kept for "open in Google Maps". A smaller and clearer rule:
  - `googleMapsUrl` is accepted only when the agent actually has one.
  - When a place has no coordinates, the server geocodes `name, address`, whether or not a URL was sent.

  This removes rule 2 from the agent copy, removes a class of malformed URLs, and gives the same behaviour to agents that send no URL.

## 2. What I traced and confirmed

These claims hold, so they are not findings:

- **CID math is correct.** `BigInt('0x6f3c1b2a4d5e6f70')` gives `8015311305313251184`, and the spec's `0x1c9bdbc5990908bf` gives `2061482896174680255`.
- **The host regex is safe.** It accepts `google.com`, `www.google.co.th`, `maps.google.com.au` and `maps.google.co.uk`. It rejects `google.com.evil.io` and `consent.google.com`. `new URL()` normalises upper case and strips userinfo (`user@maps.app.goo.gl`). A trailing-dot host fails an exact match, which fails closed.
- **The real short link still resolves in one hop (checked live today).** `curl -sI maps.app.goo.gl/mBtbC6qXLK2baGTV9` returned `302` to `/maps/place/Steak+no+Don/…!3d34.5945482!4d133.7583428…?entry=tts&g_ep=…`, both with and without a browser user agent. `maps.app.goo.gl/robots.txt` returns 400, so there is no robots file.
- **No transaction is open during network I/O.**
  - POST: the plan resolves before `withIdempotencyAtomic` (`app/src/app/api/v1/days/[dayId]/places/route.ts:16-18`).
  - Import: it resolves inside the `try`, after `claimKey` and before `importPlan` opens its transaction (`app/src/lib/api/import-orchestrator.ts:56-73`).
  - The 20 s deadline is below `CLAIM_TTL_MS = 60_000` (`app/src/lib/api/idempotency.ts:27`). Even past the TTL, the marker write rolls back a superseded import (`import-orchestrator.ts:80-87`), so there is no duplicate.
- **`googleMapsUrl` reaches the server without parser changes.** `parsePlaceFields` ignores unknown keys (`app/src/lib/api/place-input.ts:37-70`).
- **These consumers are unaffected by a `gcid:` id:**
  - `gmapsDirectionsUrl` uses `lat,lng` for non-Google ids (`app/src/lib/gmaps.ts:28-31`).
  - `resolvePlace` skips the details call for non-Geoapify ids (`app/src/lib/places/client.ts:13`).
  - `getPlaceDetail` returns null for them (`app/src/lib/places/search.ts:32`).
  - The trip OG image reads only lat/lng (`app/src/app/trip/[id]/opengraph-image.tsx:75-85`).
  - There is no export path that reads `placeIdExternal`.
- **The SSRF chain is sound.** The input must be on the allowlist before any fetch, every `Location` is checked again, `consent.google.com` is unwrapped and never fetched, and only `https:` is followed.

## 3. Findings

### Major

#### M1. The agent fallback "build a `/maps/search/?api=1&query=` URL" is redundant, and geocoding depends on a URL being present

- **Status:** Applied. A place is geocoded when it has no coordinates, with or without a URL. Agent copy rule 2 now says to send only real links.
- **Finding:** `applyPlaceLink` geocodes only when a URL is sent (step 1: `url` null means no change). Rule 2 in the agent copy then tells agents to build a search URL so that geocoding happens. The URL carries no more information than `name + address`.
- **Why it matters:**
  - Agents that skip rule 2 get no pin. Agents that follow it get a geocode of the same text.
  - Rule 2 also invites made-up `query_place_id` values, which rule 3 then has to forbid.
  - The spec's reason to keep the URL was the `sourceUrl` column (§3.10, principle 2). The plan drops that column, so the URL is thrown away after parsing.
- **Evidence:** In plan Task 4, step 5 ("None of the above"), the query for a search-only link is `link.query`, which is the agent's own `name, city` text.
- **Suggested change:**
  - Geocode when the final coordinates are null, whether or not a link was sent. Use `link.query ?? link.name ?? name, address`.
  - Cut rule 2 down to "send `googleMapsUrl` only if you found a real one".
  - Keep the `query_place_id` pass-through for real links.

#### M2. There is no cap on Geoapify credits per user, so one PAT can use up the shared free quota in about a minute

- **Status:** Applied. Added the `geocode:<userId>` bucket at 300/day (fails open) and a per-request query cache, and documented the caps in API.md.
- **Finding:** Each geocode is one Geoapify Autocomplete credit. Geoapify allows 3,000 credits per day (`AGENTS.md:42`).
  - An import may make 50 lookups.
  - The v1 limiter allows 60 requests per minute per token (`app/src/lib/api/rate-limit-policy.ts:19`).
  - 60 imports × 50 geocodes is 3,000 credits in one minute.
  - Under M1, the dominant agent path (search URLs, no coordinates) geocodes every place.
  - There is no cache by URL or query. The spec asked for one in §3.10, principle 5.
- **Why it matters:** When the quota runs out, search in the UI falls back to Photon for every user for the rest of the day (`app/src/lib/places/search.ts:18-21`). Bulk use of Photon also strains the public komoot instance.
- **Evidence:**
  - `PLACES_RATE_LIMIT` (120 per 10 min) applies only to the session routes (`app/src/lib/places/rate-limit.ts:6`).
  - The plan adds no cap on the v1 path.
- **Suggested change:**
  - Add a per-user daily geocode bucket with the existing `consumeRateLimitKey`, for example `geocode:<userId>` at 300 per day. When it is exhausted, return `lookup_skipped`.
  - Cache identical queries within one import with a `Map`.
  - Say in API.md that geocoding is best-effort and capped.

#### M3. Pasted share text that is not a bare URL falls through to normal search

- **Status:** Applied. Added `extractGmapsUrl`; the route branches on it, and the share-text test is in Task 3.
- **Finding:** The route branch is `isGmapsUrl(rawQ.trim())`, which requires the whole input to be a URL. The spec (§A, "ข้อความที่แชร์จากแอป Google Maps…", plus `extractUrl(text)` in §6) says the Google Maps apps often share "name + address + link" as several lines. A single-line `<input>` flattens that to one line.
- **Why it matters:**
  - On mobile, Share → Copy is the main entry path, and it often produces this mixed text.
  - The text then goes through the 120-character slice to Geoapify as a garbage query. The user sees wrong or no results, with no sign that the link was ignored.
  - The future share target (`/share?text=`) has the same problem.
- **Evidence:**
  - Plan Task 3, "Route change".
  - `app/src/app/api/places/autocomplete/route.ts:12` slices to 120 characters.
- **Suggested change:**
  - Add `extractGmapsUrl(text): string | null` to `gmaps-link.ts`. It finds the first `https://` token whose host is on the allowlist.
  - Branch on that in the route.
  - Add a test with `"Jay Fai\n327 Maha Chai Rd…\nhttps://maps.app.goo.gl/AbC?g_st=ic"`.

#### M4. In the UI, link-sourced places are always `sight` with no address, and they cannot be edited

- **Status:** Applied, option (b). The Edit button now shows for `gcid:` places. No reverse geocode, which saves one credit per paste.
- **Finding:** `suggestFromLink` returns `kind: 'sight'` and `address: null`, and the picker stores `placeIdExternal = gcid:…`. The day list hides the Edit button for any place with `placeIdExternal` set (`app/src/components/sortable-place-item.tsx:185`).
- **Why it matters:** Every restaurant pasted from Google is saved as a sight with no address. The user can only delete it and re-add it. The spec (§A, last row of the parse table) planned a Geoapify reverse geocode to fill address and kind.
- **Evidence:** The path is:
  1. `place-search-picker.tsx:93-97` (`pick`) calls `resolvePlace`.
  2. `client.ts:13` returns the suggestion unchanged for a `gcid` id.
  3. `submitPlace` sets `kind`, `address` and `placeIdExternal` from the suggestion (`place-search-picker.tsx:56-62`).
- **Suggested change:** Do one of these:
  - (a) Reverse geocode once per pasted link to fill `address`, and `kind` through `kindFromCategories`. This costs one credit per paste.
  - (b) Show the Edit button when `placeProvider(id) === 'gcid'`.

  Either way, write the choice down in §7.

#### M5. `hotel-place-picker` saves the label "From Google Maps link" as the hotel's address

- **Status:** Applied. `secondary: null`.
- **Finding:** The plan sets `secondary: 'From Google Maps link'` and `address: null`. `HotelPlacePicker` stores `address: s.address ?? s.secondary` (`app/src/components/hotel-place-picker.tsx:66`).
- **Why it matters:** That label is written to `hotel_booking.address` and shown on the booking card. `gmapsSearchUrl` does not use it while coordinates exist, but the user sees it.
- **Evidence:** `hotel-place-picker.tsx:66`. This picker calls the same autocomplete route through `usePlaceSearch`.
- **Suggested change:** Do one of these:
  - Put the label somewhere other than `secondary`.
  - Set `secondary: null` and show the "From Google Maps link" hint in the picker row from `placeProvider(p.id) === 'gcid'`.

  See also m1.

#### M6. A geocoded guess is stamped with a `geoapify:` id, which locks a possibly wrong pin from UI editing

- **Status:** Applied. A geocode never sets `placeIdExternal`. The Thailand bias is recorded in §7.
- **Finding:** Task 4, step 5 sets `placeIdExternal` to the first search result's id, which is `geoapify:…` or `osm:…`, when no link id exists. The same result also produces the `coords_approx` warning.
- **Why it matters:**
  - Before this change, an agent-created place with no `placeIdExternal` could be edited in the UI. After it, the place is flagged "may be wrong" and its Edit button is hidden (`sortable-place-item.tsx:185`).
  - The first-result geocode is also biased to Thailand (`app/src/lib/places/geoapify.ts:79` uses `bias: 'countrycode:th'`; `app/src/lib/places/photon.ts:41` biases toward Bangkok). Approximate pins on non-Thai trips are likely.
- **Evidence:** Plan Task 4, step 5 ("set `placeIdExternal` only if it is still empty (the result's id)").
- **Suggested change:**
  - Never take `placeIdExternal` from an approximate geocode. Ids should come only from the link (`gcid:`/`ChIJ`) or the agent.
  - Note that the spec's trip-city bias (§3.10 diagram) was dropped.

#### M7. The ParsedImportPlan type change breaks the typecheck in files that are not in the file map

- **Status:** Applied. A separate `readImportPlaceLinks(body)` is added and `ParsedImportPlan` is unchanged.
- **Finding:** Adding a required `placeLinks` to `ParsedImportPlan.days[i]` breaks `dayInputs = Array.from(…, () => ({ date: null, places: [] }))` at `app/src/lib/services/import-service.ts:56`. It also breaks the typed `days` literal at `app/src/lib/services/import-service.integration.test.ts:82`.
- **Why it matters:** Task 5, step 4 (`pnpm typecheck`) fails, and `import-service.ts` is not in the plan's file map.
- **Evidence:**
  - `let dayInputs = plan.days` takes the new element type.
  - The seeded objects lack `placeLinks`.
- **Suggested change:** Do one of these:
  - Make it `placeLinks?: (string | null)[]`.
  - Return the links outside `ParsedImportPlan`, for example `parseImportPlan(body)` → `{ plan, links }`. This keeps `importPlan` unaware of links.

  Add `import-service.ts` to the file map if it is touched.

#### M8. The dropped-pin and `ftid` formats are not covered, and one of them is the form verified live today

- **Status:** Applied. Live fixtures are used, `,[\s+]*` coordinates are accepted, and `ftid` is read.
- **Finding:** A dropped-pin short link expands to `/maps/search/39.920439,+116.331538?entry=tts…`, with a literal `+` after the comma (checked live; spec §A line 2).
  - Extraction rule 3 says `/maps/search/<lat>,<lng>`, and no test uses the `,+` form.
  - A strict `^-?\d+(\.\d+)?,-?\d+(\.\d+)?$` would miss it. The value then becomes `query = "39.920439, 116.331538"` and is geocoded as text.
  - Share links for businesses can also expand to `?q=<name, address>&ftid=0x…:0x…`. The plan reads a CID only from `!1s0x…:0x…` and `cid=`. I have not verified this live; the GeoShare fixtures cover it.
- **Why it matters:** Dropped pins are a common share. Losing their exact coordinates defeats the feature.
- **Evidence:**
  - The plan's Task 1 "Extraction order" and tests.
  - The `curl -sI` output in §2.
- **Suggested change:**
  - Use the two real `Location` values, including their `?entry=tts&g_ep=…` tails, as fixtures.
  - Allow `,\s*` and `,+` between the coordinates.
  - Read the CID from `ftid` too.
  - Take the CID-format fixtures from GeoShare (§A, library table).

### Minor

#### m1. Link support reaches five pickers, not two, so "links on hotels out of scope" is false

- **Status:** Applied. All five pickers are in the file map; API hotel links are the only thing out of scope.
- **Finding:** These components all call the autocomplete route: `place-search-picker`, `hotel-search-picker`, `hotel-place-picker`, `transport-place-picker` and `place-autocomplete` (all through `usePlaceSearch`/`fetchSuggestions`). After Task 3, hotels and transport legs accept links and store `gcid:` ids.
- **Why it matters:**
  - The plan's out-of-scope line and the Task 6 advice ("keep `ChIJ` on hotels") contradict what ships.
  - M5 is one consequence that nobody planned for.
- **Evidence:** `grep -rln usePlaceSearch app/src/components`.
- **Suggested change:**
  - List all five consumers in the file map.
  - Treat hotels and transport as in scope for the UI, and check M5 on each.
  - Keep only *API* hotel links out of scope.

#### m2. When a link cannot be resolved in the UI, the user sees an empty list with no message

- **Status:** Applied. `linkError: 'unresolved'` plus a hint next to Manual Add.
- **Finding:** `suggestFromLink` returns `[]` in these cases: a `?cid=`-only link, a failed expansion, a consent wall with no `continue`, a timeout, or a Google format change. The spec (§A, legal paragraph) asked for a fallback: "open the manual form with whatever coordinates were found".
- **Why it matters:** This is the main way the feature fails, and it fails silently.
- **Evidence:** Plan Task 3, rules ("Otherwise return `[]`").
- **Suggested change:** Have the route return `{ results: [], linkError: 'unresolved' }`. The picker then shows "Couldn't read this link — add it manually" next to the existing Manual Add button.

#### m3. On POST, replays and conflicting retries repeat the network lookups

- **Status:** Kept. The extra cost is bounded by the 50-lookup budget, the 20 s deadline and the daily bucket, and avoids adding a hook to `withIdempotencyAtomic`. Recorded in Task 4.
- **Finding:** Resolution runs before `claimKey`. A retry with the same `Idempotency-Key` waits up to 20 s and spends credits, then gets back the stored body (`app/src/lib/api/idempotency-atomic.ts:44-48`).
- **Why it matters:** Retries are exactly what agents send after a timeout, so the wait lands where it hurts most. It also adds to M2.
- **Evidence:** Plan Task 4, "Route wiring".
- **Suggested change:** Either:
  - Add an optional `prepare()` hook to `withIdempotencyAtomic`. It runs after the `owned` claim and outside the transaction. This is safe because the 20 s deadline is below the 60 s TTL.
  - Or accept the cost and say so in the plan.

#### m4. Tests do not cover the wiring, and two tests are ambiguous

- **Status:** Applied. `resolveLinks` is added to `ImportDeps` with an integration case; the budget test uses short links; the deadline test asserts `lookup_skipped` only; the autocomplete route test is added.
- **Finding:**
  - (a) Nothing tests that the routes return `{ place, warnings }`, that the resolve runs before the claim, or that the orchestrator 201 includes `warnings`. `ImportDeps` (`app/src/lib/api/import-orchestrator.ts:40-44`) has no way to inject the resolver, so the orchestrator cannot be tested with stubs.
  - (b) The 60-place budget test must use **short** links. Full URLs never call `take()`, so all 60 would resolve and the test would fail for the wrong reason.
  - (c) The deadline test accepts `lookup_skipped` *or* `url_unresolved`, so it cannot tell a timeout from a resolver bug.
  - (d) The Task 3 route branch has no test.
- **Why it matters:** The unit tests pass on `applyPlaceLink` alone, while the parts that change behaviour (route order and response shape) go unchecked.
- **Evidence:** Plan Tasks 4 and 5, step 1.
- **Suggested change:**
  - Add `resolveLinks` to `ImportDeps`, and assert `warnings` in one orchestrator integration case.
  - Say "short links" in the budget test.
  - Assert exactly `lookup_skipped` in the deadline test.
  - Add one route test for the autocomplete branch.

#### m5. The deadline can fire while lookups keep running

- **Status:** Applied. `signal` is forwarded to Geoapify and Photon.
- **Finding:** `searchPlaces` takes no signal (`app/src/lib/places/search.ts:9`; Geoapify and Photon each set their own 4 s timeout). Task 5 "races" calls against `budget.signal`. The underlying fetches keep running and still cost credits after the place is marked `lookup_skipped`. In the Task 4 POST path, search is not raced at all.
- **Why it matters:** Credits and sockets are spent after the result has already been dropped.
- **Evidence:** `app/src/lib/places/geoapify.ts:68`, `app/src/lib/places/photon.ts:43`.
- **Suggested change:** Add `signal?: AbortSignal` to `Deps`. Pass `AbortSignal.any([signal, AbortSignal.timeout(4000)])` into both providers instead of racing.

#### m6. Import replays lose `warnings`, and the reason given is weak

- **Status:** Applied. `warnings` are stored in the marker.
- **Finding:** The marker is plain JSON (`import-orchestrator.ts:27-30`). Storing `{ __idem, tripId, warnings }` costs nothing and makes replays consistent. As planned, a replay returns `warnings` only if the best-effort upgrade to the full body happened to succeed.
- **Why it matters:** An agent that retries after a timeout, the case idempotency exists for, gets no warnings, so it cannot correct the pins.
- **Evidence:** Plan Task 5, "Orchestrator", last bullet.
- **Suggested change:** Put `warnings` in the marker and return them on replay. Drop the API.md caveat.

#### m7. The function duration limit is not checked

- **Status:** Applied. `maxDuration = 60` on the import route.
- **Finding:** Neither the import route nor the place routes set `maxDuration`, and `vercel.json` has none. A 20 s resolve phase plus the import is fine on Fluid Compute (300 s default). On a legacy configuration (10 s Hobby, 15 s Pro) it would be killed. That would leave a pending claim until the TTL expires and return a 504.
- **Why it matters:** The plan's "large import still creates the trip" guarantee (Review Focus 5) depends on this.
- **Evidence:** `vercel.json` has no `functions` block, and `grep maxDuration app/src` finds nothing.
- **Suggested change:** Check that the project runs on Fluid Compute, or add `export const maxDuration = 60` to `app/src/app/api/v1/trips/import/route.ts`.

#### m8. Some steps are underspecified

- **Status:** Applied. (a) `lookup_skipped`; (b) `resolve_place({name,address?,googleMapsUrl?})`; (c) rule 4: PATCH without `googleMapsUrl`.
- **Finding:**
  - (a) Task 4, step 5 does not say what happens when the geocode's `take()` fails. Presumably the place gets `lookup_skipped`.
  - (b) The MCP `resolve_place({ googleMapsUrl?, name, near? })` "wraps `applyPlaceLink`", but `applyPlaceLink` needs full `PlaceFields`, and `near` has nothing to plug into (`searchPlaces` has no bias parameter).
  - (c) With an exact link, link coordinates always win, so an agent following rule 4 ("send a corrected PATCH") cannot override the pin while it resends the same URL.
- **Why it matters:** Each gap forces the implementer to decide something the plan should decide.
- **Evidence:** Plan Task 4, step 5; Task 6, step 3; the agent copy, rule 4.
- **Suggested change:**
  - Define the exhausted-geocode outcome.
  - Give `resolve_place` a signature that builds minimal fields.
  - Rule 4: "to move a pin, PATCH `lat`/`lng` without `googleMapsUrl`".

### Nits

#### n1. Small accuracy and robustness fixes

- **Status:** Applied. All six items.
- **Finding:**
  - `app/src/lib/gmaps.test.ts` already exists, so "create if absent" is wrong.
  - `decodeURIComponent` throws on a malformed `%E0%B9`. Wrap it, because `parseGmapsUrl` is called on user input in the route.
  - `AbortSignal.any([deps.signal, …].filter(Boolean))` does not narrow the type in TypeScript, so use a type guard.
  - Reject a non-empty `u.port`.
  - The preview modals call `gmapsSearchUrl` without `placeIdExternal` (`place-preview-modal.tsx:74`). Pass `prediction.id` so the preview also opens the `?cid=` listing.
  - The commit messages use `[TP-XXXX]`; create the `pm` ticket first.
- **Why it matters:** Each one is small, but together they cause avoidable friction or wrong behaviour.
- **Evidence:** As cited.
- **Suggested change:** As stated.

## 4. Proportionality

The plan is about the right size. The interfaces, precedence order and tests are pinned down, and the merge code is left to the implementer, which is correct. The fixed agent copy in Task 6 is a good idea.

Two places need more precision, not more code:

- the budget and abort semantics (m5, m8a);
- the import type change (M7).

## Verdict

**Fix-then-ship.** The approach is sound and safe on SSRF and robots. Before implementation, fix the following:

- the redundant search-URL fallback and the unbounded Geoapify spend it drives (M1, M2);
- paste handling for share text (M3);
- the link-sourced data that is wrong and locked from editing (M4, M5, M6);
- the import type break (M7);
- the dropped-pin parse gap (M8).

---

# Round 2

**Reviewed:** the revised plan against the same code (`f093d91`). Each finding has a **Status** line for the author to set to Applied or Kept.

## Round-1 fixes verified

- **M1: Applied correctly, but it changes behaviour for existing clients.** Places with no pin are now geocoded whether or not a link was sent. See R2-M3.
- **M2: Applied, and it fits the real limiter.** `consumeRateLimitKey(key, max, windowSeconds, database?)` (`app/src/lib/api/rate-limit.ts:73-78`) matches `consume?: typeof consumeRateLimitKey`, and the fail-open wrapper mirrors `allowPlacesRequest` (`app/src/lib/places/rate-limit.ts:11-21`).
  - The window is fixed and starts at the user's first geocode. It is not a calendar day.
  - The prune cron deletes rows whose `windowStart` is more than 1 day old (`app/src/app/api/internal/prune-rate-limit/route.ts`). That matches a 86 400 s window exactly, so it is fine.
  - The cache has a race; see R2-m3.
- **M3: Applied.** `extractGmapsUrl` runs before the 120-character slice.
- **M4: Incomplete.** The Edit button now shows for `gcid` places, but saving the edit form wipes the pin and the id (R2-M1). Hotels added from a link are still locked (R2-m4).
- **M5: Applied.** With `secondary: null`, `address: s.address ?? s.secondary` (`app/src/components/hotel-place-picker.tsx:66`) stores null.
- **M6: Applied.** A geocode never sets `placeIdExternal`.
- **M7: Applied.** `ParsedImportPlan` and `import-service.ts:56` are untouched.
- **M8: Applied.**
- **m1: Applied.**
- **m2: Applied, but underspecified.** See R2-m2.
- **m4: (a), (b) and (d) applied. (c) has regressed in a new form.** The deadline test passes only because its stub throws. The real resolver never throws. See R2-M2.
- **m5: Applied.** The snippet's literal code has a type problem; see R2-n1.
- **m6: Applied.** The marker stays backward compatible: `isImportMarker` checks only `__idem` and `tripId` (`app/src/lib/api/import-orchestrator.ts:31-38`), and `marker.warnings ?? []` covers old rows. Old full-body rows `{ trip }` replay without `warnings`, which is harmless.
- **m7: Questionable.** See R2-m5.
- **m8: Applied.** The `resolve_place` signature works. `PlaceFields` accepts null for every optional field, including `tags: string[] | null` (`app/src/lib/services/place-service.ts`). `applyPlaceLink` then geocodes `name, address`.
- **n1: Applied.**

## Judgement on the Kept item (m3)

**The reasoning holds.** On a replay of a POST, the cost is one short-link expansion (no credit) plus at most one geocode. That is bounded by the daily bucket and by the v1 limit of 60 requests per minute. The latency is at most about 8 s (see R2-M3), not 20 s.

## Simpler-alternative pass (revised plan)

- **Link resolution: keep as is.** It is small, costs no credits, and is safe against SSRF.
- **Server-side auto-geocoding is now the expensive part.** It is the reason for `takeGeocode`, the daily bucket, the query cache, concurrency 5 and most of the warning taxonomy. It is also the part that changes existing behaviour (R2-M3). There are two smaller options:
  - **(a) Narrowest change.** Geocode only when a link was sent, or when `address` is non-null. Agent copy rule 1 already asks agents for an address. Name-only places then keep today's behaviour, which is no pin.
  - **(b) Move the choice to the agent.** Expose the existing `searchPlaces` as `GET /api/v1/places/search?q=` (and as an MCP tool). The agent knows the trip city and can pick the right result. The server then keeps only link expansion, and the daily geocode bucket guards one endpoint instead of three write paths.

  **I recommend (a) for this plan.** Option (b) suits the MCP plan.

## Findings

### Major

#### R2-M1. The edit page drops `lat`, `lng` and `placeIdExternal`, so saving the newly shown Edit form wipes the pin and the Google id

- **Status:** Applied. The edit page now passes `lat`, `lng` and `placeIdExternal` into `initial`; the file map and a manual check step are added.
- **Finding:** `EditPlacePage` builds `initial` without `lat`, `lng` or `placeIdExternal`. `PlaceAutocomplete` therefore starts with empty hidden fields. On save, `readPlaceFields` sends nulls for all three, and `updatePlace` writes every field.
- **Why it matters:** The round-1 M4 fix exists so that users can correct link-sourced places, for example changing `sight` to `food`. As planned, the first such save does three things:
  - it drops the place from the map;
  - it removes the `gcid:` id, so "Open in Google Maps" falls back to a name search;
  - it hides nothing that warns the user.

  The same thing already happens today to manual places that have a pin. The plan now also creates many agent-geocoded places with no id, and those have the Edit button too.
- **Evidence:**
  - `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx:43-60`: `initial` has no `lat`, `lng` or `placeIdExternal`.
  - `app/src/components/place-form.tsx:114-120` passes `v.lat`, `v.lng` and `v.placeIdExternal`, so all three are undefined here.
  - `app/src/components/place-autocomplete.tsx:55-58` and `:155-157`: the hidden inputs start empty.
  - `app/src/app/actions/places.ts:62-64` reads `lat`, `lng` and `placeIdExternal`, which are null.
  - `app/src/lib/services/place-service.ts:105-108`: `.set({ ...fields })`.
- **Suggested change:**
  - Add `lat`, `lng` and `placeIdExternal` from `r.place` to `initial` in the edit page.
  - Add the edit page to the Task 3 file map.
  - Add a manual-check step: "Edit a link-added place, change Kind, save → pin and *Open in Google Maps* unchanged."

#### R2-M2. A deadline or abort is never reported as `lookup_skipped`, because both resolvers swallow errors

- **Status:** Applied. An empty or `null` result after `budget.signal.aborted` → `lookup_skipped`, not cached. The deadline test stub resolves `null`/`[]` instead of rejecting, and a no-link place is covered.
- **Finding:** Step 4 says "an abort or exception adds `lookup_skipped`", but neither real dependency ever throws:
  - `searchPlaces` wraps both providers in `.catch(() => [])`, so an aborted search returns `[]`, which counts as a **miss**.
  - `expandShortLink` returns `null` on any exception, which counts as **`url_unresolved`**.

  So when the 20 s deadline fires:
  - a place with a link gets `url_unresolved`, which wrongly says the link is bad, then `lookup_skipped` from the failed `takeGeocode`;
  - a place without a link gets **no warning at all**;
  - the `null` is cached in `geocodeCache`.

  The Task 5 deadline test expects exactly `[lookup_skipped]`. It passes only because its stub *rejects* on abort, which the real `readGmapsLink` never does.
- **Why it matters:**
  - Agents are told to act on `url_unresolved`. A slow provider makes them drop good links.
  - Places that were skipped look the same as places that were not found.
  - The test proves nothing about the real path; this is round-1 m4(c) again.
- **Evidence:**
  - `app/src/lib/places/search.ts:19-22` (both `.catch(() => [])`).
  - Plan Task 2, `expandShortLink` step 7 ("Any exception → return null").
  - Plan Task 4, step 1 ("A `null` result gives `url_unresolved`").
  - Plan Task 5, the deadline test.
- **Suggested change:**
  - In `applyPlaceLink`, when `readLink` returns `null` or `search` returns `[]`, check `budget.signal.aborted` first. If it is set, add `lookup_skipped`, skip `url_unresolved`, and do not cache the result.
  - Change the deadline-test stub to *resolve `null`* (or `[]`) on abort, as the real code does.
  - Also assert that a place with no link and no coordinates gets `[lookup_skipped]` after the deadline.

#### R2-M3. Geocoding every place without a pin silently changes behaviour for existing API clients

- **Status:** Applied, option (a). Geocode only when there is a link or an `address`, never for `transit`. Name-only places keep today's behaviour. The PATCH rule and the address in the examples are documented.
- **Finding:** Today, a POST, PATCH or import with no `lat`/`lng` stores a place with no pin. After Task 4/5, the same request gets the first Geoapify or Photon result for `name[, address]`, biased toward Thailand. Clients that ignore the new `warnings` cannot tell. Specific effects:
  - **Placeholder rows get random pins.** Agents create rows such as `transit` "Shinkansen to Osaka", "Free afternoon" or "Check-out". These now receive a POI pin, which can be in Bangkok.
  - **The published SKILL example triggers it.** The example place `{ "kind": "sight", "name": "Kiyomizu-dera" }` (`agent-skill/travel-planner-api/SKILL.md:72`) has no address and is now geocoded.
  - **PATCH can no longer clear a pin.** PATCH is a full replace (`app/src/app/api/v1/places/[placeId]/route.ts:15-20`). Omitting `lat`/`lng` used to clear the pin; now it re-geocodes.
  - **POST/PATCH latency rises.** `searchPlaces` tries Geoapify (4 s timeout) and then Photon (4 s) one after the other. That adds up to about 8 s to calls that used to be fast.
- **Why it matters:** One wrong pin on a Kyoto trip pulls the day map's bounds to Bangkok, because every place with coordinates is plotted (`app/src/lib/day-augment.ts:162`). This is a contract change made without a flag.
- **Evidence:**
  - Plan Global Constraints ("a place is geocoded even when no URL was sent").
  - Plan Task 4, step 4 ("**with or without a link**").
  - `app/src/lib/places/geoapify.ts:79` (`countrycode:th` bias).
- **Suggested change:** Apply simpler alternative (a).
  - Geocode only when a link was sent or `address` is non-null. Never geocode `kind: 'transit'`.
  - Update the SKILL/API examples to include `address` or the city.
  - Record the PATCH semantics in API.md: omitting `lat`/`lng` with an address re-geocodes.
  - Change the test `no link, no coords → geocodes "Jay Fai, Bangkok"`, and add `name only → no search call`.

### Minor

#### R2-m1. Making `resolveLinks` required in `ImportDeps` breaks the typecheck of the existing orchestrator integration test

- **Status:** Applied. The `deps()` factory gets `resolveLinks`.
- **Finding:** The test's `deps()` factory builds `{ loadApiTrip, idemDb, txDb }`, and one case spreads it with `{ ...deps(), txDb: takeoverTx }`. `tsc --noEmit` includes test files. The plan says only "a new case injects `resolveLinks`".
- **Why it matters:** Task 5, step 4 (`pnpm typecheck`) fails.
- **Evidence:** `app/src/lib/api/import-orchestrator.integration.test.ts:68` and `:146`; `app/tsconfig.json` (`include`); `package.json` (`"typecheck": "tsc --noEmit"`).
- **Suggested change:** Say so explicitly: add `resolveLinks: async (_u, plan) => ({ plan, warnings: [] })` to the `deps()` factory. This also keeps the existing cases off the network and the limiter.

#### R2-m2. The `fetchSuggestions` return-type change breaks `client.test.ts`, and the `linkError` lifecycle is unspecified

- **Status:** Applied. `client.test.ts` is in the file map. Every route response includes `linkError`. The hook resets `linkError` at every point where it clears results.
- **Finding:**
  - `client.test.ts` asserts `toEqual([])` on a non-2xx response. The new type is `{ results, linkError }`, and the test file is not in the file map.
  - The plan does not say when `usePlaceSearch` clears `linkError`. If it is not reset in `onQueryChange` (including the under-`minChars` branch), `reset` and `clearResults`, the hint stays up after the user starts typing a normal search.
  - Two early returns in the route have no `linkError`: the rate-limited one and the `q.length < 2` one.
- **Why it matters:** A red test, and a stale error hint in the UI.
- **Evidence:**
  - `app/src/lib/places/client.test.ts:30-35`.
  - `app/src/components/use-place-search.ts:20-52`.
  - `app/src/app/api/places/autocomplete/route.ts:11-13`.
- **Suggested change:**
  - Add `client.test.ts` to the file map; non-2xx returns `{ results: [], linkError: null }`.
  - The client reads `linkError ?? null`.
  - The hook sets `linkError = null` wherever it sets `results` to `[]` or starts a new query.

#### R2-m3. With 5 places at a time, `geocodeCache` does not stop duplicate geocodes

- **Status:** Applied. The cache now holds the promise, and a concurrent test is added.
- **Finding:** The cache is checked before an `await`, and the result is stored after it. Two in-flight places with the same query both miss, so both consume the bucket and a credit.
- **Why it matters:** The Global Constraint "identical geocode queries inside one request run once" does not hold. Imports often repeat a query, such as the same name and city.
- **Evidence:** Plan Task 4, step 4 (check, then `await takeGeocode`, then `search`, then cache), and the `resolvePlanLinks` concurrency of 5.
- **Suggested change:**
  - Cache the promise: `Map<string, Promise<PlaceSuggestion | null>>`.
  - Add a test: two identical queries in one concurrent batch → `search` is called once.

#### R2-m4. Hotels added from a link stay locked to dates-only editing

- **Status:** Applied. `hotel-edit-modal.tsx:37` uses the `gcid` rule.
- **Finding:** The round-1 M4 rule was applied only to day places. A hotel picked from a link gets `placeIdExternal = gcid:…` and `address: null`. A dropped-pin link also gives it a name like `"39.92044, 116.33154"`. `HotelEditModal` treats any row with `placeIdExternal` as search-sourced and allows editing dates only.
- **Why it matters:** The plan made hotels in scope for links in the UI (m1), so this is the same lock-out that M4 fixed for places.
- **Evidence:** `app/src/components/hotel-edit-modal.tsx:37` (`isManual = !initial.placeIdExternal`) and `:151`.
- **Suggested change:**
  - Use `isManual = !id || placeProvider(id) === 'gcid'` there.
  - Add the file to the Task 3 file map.

#### R2-m5. `maxDuration = 60` may lower the limit, and the place routes have none

- **Status:** Applied. A step was added: check Fluid Compute first; if it is off, set `maxDuration` on all 3 routes.
- **Finding:** On Fluid Compute, the default limit is 300 s, so `maxDuration = 60` *shortens* it for the import route. That route runs up to 20 s of lookups, then a transaction over as many as 6,000 places, then `loadApiTrip`. Meanwhile POST and PATCH can now spend up to the same 20 s deadline with no setting at all, which matters on a legacy 10 s Hobby limit.
- **Why it matters:** One of two things happens:
  - on Fluid, the change adds a new way for large imports to time out;
  - on legacy, it protects only one of the three routes.
- **Evidence:** `app/vercel.json` (no `functions` block); `grep maxDuration app/src` finds nothing; plan Task 5 ("In the route, add `export const maxDuration = 60`").
- **Suggested change:** Make the step: "Check Fluid Compute in the Vercel project settings. If it is on, add nothing. If it is off, set `maxDuration` on all three routes."

### Nits

#### R2-n1. Small accuracy fixes

- **Status:** Applied: the AbortSignal type guard, the `search_nearby` wording, and the rolling 24 h window. Kept: a single summary warning instead of per-place `lookup_skipped`. With option (a) only places that have an address get geocoded, so long lists are unlikely, and per-place warnings tell the agent exactly which places to fix.
- **Finding:**
  - Task 3, step 3 writes `AbortSignal.any([signal, AbortSignal.timeout(4000)])` with a `signal` that may be undefined. That is a TypeScript error, and it throws at runtime. Reuse the type-guard wording from Task 2.
  - The MCP revision note says `search_nearby` "must move to `lib/places/search.ts`". `searchPlaces` is text autocomplete and takes no location or category, so nothing there can stand in for a nearby search. Say instead: "needs a redesign (e.g. Geoapify Places API categories + circle); out of scope".
  - API.md should describe the cap as "300 geocodes per rolling 24 h window", not "per day". Add a comment on `GEOCODE_DAILY` saying the prune cron assumes windows of 1 day or less.
  - A 6,000-place import with no pins returns about 5,950 `lookup_skipped` warnings. Consider one summary warning once the budget is spent. This is optional.
- **Why it matters:** Each one causes avoidable implementer friction or misleads agents.
- **Evidence:** As cited above; `app/src/app/api/internal/prune-rate-limit/route.ts`.
- **Suggested change:** As stated.

## Proportionality and clarity

- **Proportionate if R2-M3 option (a) is taken.** The geocode machinery then serves a narrower, opt-in path.
- **Steps are clear, with three exceptions:**
  - the aborted-versus-miss rule (R2-M2);
  - the `linkError` reset points (R2-m2);
  - the `deps()` factory update (R2-m1).

## Verdict

**Fix-then-ship.** The link-parsing and SSRF core is sound. Before implementation, fix the following:

- the Edit form wipes pins and ids on save (R2-M1);
- the deadline is reported as a bad link or not at all (R2-M2);
- unconditional geocoding silently changes existing API behaviour (R2-M3).

---

# Round 3

**Reviewed:** the plan as revised after round 2, against the same code (`f093d91`). This is the final round. Each finding has a **Status** line for the author to set to Applied or Kept.

## Round-2 fixes verified

- **R2-M1 (edit page `initial`): Applied, and it works.**
  - Path: `edit/page.tsx:44-60` → `PlaceForm` passes `defaultLat`, `defaultLng` and `defaultPlaceIdExternal` (`place-form.tsx:117-119`, already wired) → `PlaceAutocomplete` seeds its hidden-input state from them (`place-autocomplete.tsx:55-57`) → `readPlaceFields` reads them back (`actions/places.ts:62-64`).
  - A save with no other change therefore keeps the pin and the `gcid:` id.
  - **Typing a new name.** `onChange` (`place-autocomplete.tsx:130-137`) only changes `inputVal` and starts a search. The hidden `lat`, `lng` and `placeIdExternal` stay as they are until the user picks a suggestion (`pickPrediction`, `:88-92`). So renaming "39.92044, 116.33154" to "Hotel Beijing" keeps the pin, which is what we want. If the user types a *different* place and does not pick it, the old pin and id stay too. The add flow already behaves this way after a pick, so I would not change it. Clearing the hidden fields on every keystroke would bring back the R2-M1 bug on every rename.
  - Pasting a link into the edit form's name field and picking the result replaces all four hidden fields. That is correct.
- **R2-m4 (`hotel-edit-modal`): Applied, but it targets dead code.** See R3-m1.
- **R2-M2 (abort is not a miss): Applied, and the rule is right.** It checks `budget.signal.aborted`, not an exception, which matches the real resolvers: `search.ts:19,22` uses `.catch(() => [])`, and Task 2 step 7 returns `null`. The deadline-test stub now resolves rather than rejects. One gap remains: the same code can be added twice; see R3-m3.
- **R2-m3 (promise cache): Applied in the type, but the step order brings the race back.** See R3-m2.
- **R2-M3 (narrower geocode condition): Applied, and the plan is consistent about it.** The same rule ("link, or non-null `address`, and not `transit`") appears in the Goal, the Architecture, the Global Constraints, Task 4 step 4, the `resolvePlanLinks` filter, agent copy rule 1, "Done when" and the §7 note. No text still says "geocode all pinless places", apart from one commit message (R3-n2).
- **R2-m2 (`linkError` lifecycle): Applied, and it fits the real hook.**
  - `use-place-search.ts` clears results in four places: the under-`minChars` branch at `:25`, the `catch` at `:35`, `reset` at `:45` and `clearResults` at `:50`. The plan's wording ("wherever it clears `results` or starts a new query") covers all four, and the success path at `:33` sets `linkError` from the response.
  - Every consumer goes through `fetchSuggestions` → `usePlaceSearch`: the five pickers and `client.test.ts`. No other caller exists (`grep -rln "usePlaceSearch\|fetchSuggestions"`).
  - Only the two search pickers render the hint, and the other three ignore `linkError` safely.
  - `r.slice` at `:33` becomes `r.results.slice`, which the type change forces.
- **R2-m1 (`deps()` factory): Applied, but the snippet as written fails `tsc`.** See R3-m4.
- **R2-m5 (Fluid Compute step): Applied, and it is sound.**
  - `app/vercel.json` has only `crons`, and `vercel project inspect` exists in the installed CLI (54.21.1).
  - The import route resolves links *after* `claimKey` (inside the `try`, `import-orchestrator.ts:70-72`). So the 20 s deadline plus the transaction fits under both the 60 s claim TTL and any `maxDuration` of 60.
  - Optional: `"fluid": true` in `vercel.json` would put the setting in code review instead of the dashboard.

## Judgement on the Kept items

- **m3 (replays repeat lookups on POST/PATCH): the reasoning holds.** It applies only to the v1 place routes. On import, resolution runs after the claim, so a replay returns at `import-orchestrator.ts:61-66` without any lookup. On POST and PATCH, the cost of a replay is one geocode, charged to the user's own daily bucket, plus at most one short-link expansion, which costs no credit.
- **R2-n1, last point (no summary warning): the reasoning holds.** Option (a) limits geocodes to places with a link or an address. The 60-place budget test now expects 10 per-place warnings, which is a reasonable size.

## Coherence pass

I read the plan top to bottom. Global Constraints, Interfaces, step text, tests, agent copy and "Done when" agree on:

- the coordinate precedence;
- the geocode condition;
- the warning codes;
- the caps (50 / 20 s / 300);
- PATCH semantics;
- the `maxDuration` decision, which appears only in Task 5 and is conditional.

There is no leftover "geocode all pinless places" rule and no unconditional `maxDuration = 60`. The remaining disagreements are small:

- Task 4's own steps contradict two of its tests (R3-m3).
- A few stale or inaccurate wordings remain (R3-n2).
- The hotel parts of Task 3, step 5 (manual check 4) and of "Done when" point at a component users never see (R3-m1).

## Simpler-alternative pass

- **Link parsing and expansion: keep.** It is small, costs no credits, and the SSRF rules are tight.
- **Autocomplete-route link branch: keep.** One route change gives link support to all five pickers.
- **Server-side geocoding:** now opt-in (a link or an address), so it is proportionate. Option (b) from round 2, exposing `searchPlaces` to agents, stays the better long-term shape for MCP, and the Task 6 revision note already points there.
- **One new simplification:** drop the `hotel-edit-modal` change (R3-m1). The live hotel editor already handles this case.

## Findings

### Major

None.

### Minor

#### R3-m1. `hotel-edit-modal.tsx` is dead code; the live hotel editor already allows full edits and keeps the id

- **Status:** Applied. The `hotel-edit-modal` change is dropped (dead code). Manual check 4 now uses Bookings → "Enter manually instead"..
- **Finding:**
  - `HotelEditModal` is used only by `HotelEditLauncher`, which is used only by `HotelsView` (`components/hotels-view.tsx:312`). Nothing imports `HotelsView`, and `/trip/[id]/hotels` now just redirects to `/bookings` (`app/trip/[id]/hotels/page.tsx`).
  - The real editor is `HotelFormClient` in the bookings overlay (`bookings-view.tsx:484-488` → `updateHotelInlineAction`). It already offers "Enter manually instead" for **every** hotel, and it carries `v.placeIdExternal`, `v.lat` and `v.lng` through manual mode (`hotel-form-client.tsx:194-198, 223-227`).
  - So R2-m4's premise, that hotels added from a link are locked, does not hold for the UI users see.
  - Had the modal been live, the planned change would have done harm. Its manual branch never sends `placeIdExternal` (`hotel-edit-modal.tsx:85-91`). `readHotelFields` turns the missing field into `null` (`actions/bookings.ts:37`), and `updateHotel` writes it (`booking-service.ts:83-96`). Saving would therefore wipe the `gcid:` id, which is the R2-M1 bug again.
- **Why it matters:**
  - The change is wasted work.
  - Manual check 4 ("open the hotel's edit modal; every field should be editable") cannot be performed as written.
  - "Done when" claims an outcome for the hotel case that is already true without this change.
- **Evidence:** `grep -rn "HotelsView\|hotel-edit-launcher" app/src` finds only the two files themselves.
- **Suggested change:**
  - Drop the `hotel-edit-modal.tsx` line from the file map and from Task 3 (UI → Hotels).
  - Rewrite manual check 4 as: "In Bookings, edit the link-added hotel → *Enter manually instead* → change the address → save; the `?cid=` Map link is unchanged."
  - Optional, as separate cleanup: delete `hotels-view.tsx`, `hotel-edit-launcher.tsx` and `hotel-edit-modal.tsx`.

#### R3-m2. Awaiting `takeGeocode()` before storing the promise reopens the duplicate-geocode race

- **Status:** Applied. The promise is stored in the cache synchronously before any await, and covers `takeGeocode` + `search`. A `'skipped'` sentinel is used..
- **Finding:** Task 4 step 4 says: "check the cache → otherwise `await budget.takeGeocode()` → store the promise → await". `takeGeocode` makes a database round trip (`consumeRateLimitKey`, `lib/api/rate-limit.ts:73-99`). Two places that run at the same time with the same query both miss the cache, both wait on the limiter, and then both store and search. That is R2-m3 again, now with the promise type in place.
- **Why it matters:**
  - The planned test, "two concurrent identical queries → search called once", fails whenever the `consume` stub is async, which it is.
  - If the implementer "fixes" the test instead, imports spend two bucket units and two credits for each duplicate.
- **Evidence:** The step order in Task 4 step 4. The Interfaces block types `takeGeocode` as `Promise<boolean>`.
- **Suggested change:** Store the promise **synchronously, before any await**. For example: `cache.set(q, (async () => (await budget.takeGeocode()) ? (await search(q, { signal })).at(0) ?? null : SKIPPED)())`. Use a sentinel for "skipped" (not cached, or deleted afterwards), so a later place can still try once the bucket allows it.

#### R3-m3. `applyPlaceLink` can add the same warning twice, which contradicts its own tests

- **Status:** Applied. Each warning code appears at most once per place, and there is a test for it..
- **Finding:** Step 1 says "processing continues either way" after a `null` link read, and step 4 then geocodes because "a link was sent". Two cases go wrong:
  - **Deadline.** Step 1 adds `lookup_skipped`. Step 4's `takeGeocode()` → `take()` fails because the deadline has passed, so it adds `lookup_skipped` again. The Task 5 deadline test expects **exactly** `[lookup_skipped]`.
  - **Real miss.** Step 1 adds `url_unresolved`. Step 4 geocodes `name` and misses, so it adds `url_unresolved` again ("add `url_unresolved` if a link was sent"). The test "unresolvable short link with no geocode hit → [url_unresolved]" expects one.
- **Why it matters:** Either the tests fail, or the implementer has to make a rule the plan should have made. Agents also see confusing duplicate warnings.
- **Evidence:** Task 4 steps 1 and 4; the tests in Task 4 and Task 5.
- **Suggested change:** Add one line to step 5: "`warnings` holds each code at most once (de-duplicate by `code`)." It is simple, and it fixes both cases without changing the flow.

#### R3-m4. The planned `resolveLinks` line in `deps()` fails strict `tsc` (implicit `any`)

- **Status:** Applied. `deps(): ImportDeps` is annotated..
- **Finding:** The factory is `const deps = (load = testLoad) => ({ … })` with no return-type annotation (`import-orchestrator.integration.test.ts:68`). That leaves the object literal without a contextual type, so in `resolveLinks: async (_u, plan) => …` both parameters are implicitly `any`. The project sets `"strict": true`, and `tsc --noEmit` includes test files.
- **Why it matters:** Task 5 step 4 (`pnpm typecheck`) goes red on the plan's literal text.
- **Evidence:** Reproduced with the repo's `tsc` on a minimal copy of the factory shape: `error TS7006: Parameter '_u' implicitly has an 'any' type` (and the same for `plan`).
- **Suggested change:** Annotate the factory as `const deps = (load = testLoad): ImportDeps => ({ … })`. That also checks the existing three fields. Alternatively, type the parameters: `(_u: string, plan: ParsedImportPlan)`.

### Nits

#### R3-n1. The Edit-button rule still locks link-sourced `ChIJ` places with an approximate geocoded pin

- **Status:** Applied. Edit is shown unless the provider is `geoapify`/`osm`..
- **Finding:** On the API path, a search-only link with `query_place_id` stores a bare `ChIJ…` id and a geocoded `coords_approx` pin. `placeProvider` returns `'google'` for it (`place-id.ts:8`). The Task 3 rule (`!id || provider === 'gcid'`) hides Edit, so a user cannot fix a pin that may well be wrong.
- **Why it matters:** Since TP-0045, nothing refreshes Google rows, so locking them protects nothing. Only `geoapify`/`osm` rows have provider-sourced details.
- **Suggested change:** Show Edit when `placeProvider(id) !== 'geoapify' && placeProvider(id) !== 'osm'`. This covers manual, `gcid` and legacy `ChIJ` rows.

#### R3-n2. Stale or inaccurate wording

- **Status:** Applied. All items, including option B as a single `Find on Google Maps ↗` link and the space-joined share-text test..
- **Finding:**
  - The Task 4 commit message still says "geocode **pinless** places". Use "geocode linked/addressed places".
  - The Task 3 **Files** list omits `edit/page.tsx`, which is in the file map and in the UI rules. It also omits `hotel-edit-modal.tsx`, which R3-m1 drops anyway.
  - "Rolling 24 h window" (Global Constraints and Task 6 step 1) is inaccurate. `consumeRateLimitKey` uses a fixed window that starts at the first geocode (round 2, M2 note). Write "a 24 h window that starts at the user's first geocode".
  - Global Constraints say a bad link "never turns a valid request into a 4xx", but `readPlaceLink` returns 400 for a non-string value or one longer than 2,048 characters. Reword to: "a malformed field is a 400; a well-formed but unusable link only adds a warning".
  - Task 1 says to copy `LIVE_PLACE`/`LIVE_PIN` "with their `?entry=tts&g_ep=…` tails", but neither the scrutiny file nor the spec recorded the full tails (both show `…`/`?...`). Either take the tails from Task 2 step 5's live run, or say that the tails do not matter for parsing.
  - Spec option B ("Find in Google Maps ↗" row, §6) is neither built nor listed as out of scope. Add it to the out-of-scope line, or add it, since it is a one-line `gmapsSearchUrl(query)` link.
  - The Task 3 route test uses `\n` in the share text. Browsers turn line breaks into spaces when text is pasted into a single-line `<input>`, so also cover the space-joined form, which is what the route will actually receive. The whitespace-token extractor handles both.

#### R3-n3. v1 POST and PATCH spend lookups before checking authorization

- **Status:** Kept. Recorded under Known cost in Task 4: the caller only uses up their own quota, and the cost is bounded by the deadline..
- **Finding:** `applyPlaceLink` runs before `addPlace` or `updatePlace`, which is where `requireTripAccess` runs. A typo in `dayId` or `placeId`, or a foreign id, can therefore wait up to 20 s and use a geocode from the caller's own bucket before the request returns 404.
- **Why it matters:** The cost is small, because it is the caller's own bucket and the v1 rate limit applies. Still, a client mistake now becomes a slow 404 instead of an instant one.
- **Suggested change:** Accept the cost and note it under "Known cost". Do not add a separate access check.

## Proportionality

The plan is proportionate at about 570 lines. It is not a code transcript:

- The tests are mostly named cases.
- The literal test bodies appear only where exact fixtures matter (Tasks 1 and 2).
- Task 4 gives the merge as ordered rules, not code.

The Task 3 manual checks and "Done when" overlap a little, which is harmless. Do not add more. The four minor findings above each need a sentence, not a code block.

## Verdict

**Ship, with the four minor fixes folded in (R3-m1 to R3-m4); there are no blockers.** The main reason: the round-2 fixes are correct against the real code, and what remains is a dead-code target, one ordering detail, one de-duplication rule and one type annotation.
