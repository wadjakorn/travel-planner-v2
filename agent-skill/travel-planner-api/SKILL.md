---
name: travel-planner-api
description: Use when the user wants to build, edit, or read a travel itinerary in Travel Planner — create trips, add days/places/hotels/transport/expenses/notes over the REST API with a personal access token. No browser needed.
---

# Travel Planner REST API

Build travel plans over HTTP. Everything the web app does to
trips/days/places/hotels/transport/expenses/notes is reachable here with a
personal access token.

- Base path: `<host>/api/v1`
- Format: JSON in, JSON out
- Auth: `Authorization: Bearer <token>` on every request

## 0. Setup (once per session)

**Install the skill.** Drop this `travel-planner-api/` folder into the agent's
skills directory (`.claude/skills/` for a project, `~/.claude/skills/` for all
projects) so the agent can load it. It needs no dependencies beyond `curl`,
`jq`, and `uuidgen`.

**Store the token in a gitignored `.env` — never hardcode it.** The token is a
personal access token: treat it like a password. Put it in a `.env` file that
is listed in `.gitignore`, and load it into the environment — do **not** paste
it into source, commit it, or echo it to logs/output.

```bash
# .env  (must be gitignored — never commit this file)
TP_HOST="https://travel-planner-v2-eight.vercel.app"   # or their host
TP_TOKEN="tp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # from Settings → API access
```

```bash
set -a; . ./.env; set +a    # load TP_HOST / TP_TOKEN into the environment
```

If you ask the user for the values interactively, export them for the session
instead of writing them anywhere:

```bash
export TP_HOST="https://travel-planner-v2-eight.vercel.app"
read -rs TP_TOKEN; export TP_TOKEN    # read without echoing to the terminal
```

Never print `$TP_TOKEN` (no `echo`, no `curl -v` that dumps headers). Pass it
only via the `Authorization` header shown below.

The token is minted in the app: **Account → Settings → API access → Create
token**. It is shown once (`tp_…`), stored only as a hash, and can be revoked
any time. A missing/invalid/revoked token returns `401`.

> Tokens are **read-write** by default. If you mint a **read-only** token, write
> calls (`POST`/`PATCH`/`PUT`/`DELETE`) return `403 forbidden` — mint a read-write
> token to create or edit trips.

Verify before doing anything else:

```bash
curl -s "$TP_HOST/api/v1/me" -H "Authorization: Bearer $TP_TOKEN"
# -> { "user": { "id": "...", "name": "...", "email": "..." } }
```

If this returns `401`, stop and ask the user for a fresh token — do not guess.

## 1. Golden rules

- **Read before you write.** `GET /trips/:id` returns the whole plan
  (days → places/segments). Fetch it first so you edit real ids, not invented
  ones.
- **One token = one user's trips.** You can only touch trips the token owner
  owns or is a member of. Another user's trip → `403`. A missing trip → `404`.
- **Send `Idempotency-Key` on every POST** (see §5). Retrying without one
  double-creates.
- **Dates are `YYYY-MM-DD` strings.** Timestamps (`at`) are ISO
  `2026-09-01T08:30:00Z`.
- **`*` fields are required.** Omitting one → `400 bad_request`.
- **Parse the JSON, branch on `error`.** Every failure is
  `{ "error": <code>, "message": <text> }`.

## 2. Import a whole plan (fastest path)

If you already built the itinerary, import it in **one call** — create the trip
with all its days, places, hotels, **transport, expenses, notes and budget** at
once, then tell the user to fine-tune it in the app. Prefer this over the
step-by-step flow in §3.

```bash
H="$TP_HOST/api/v1"; A=(-H "Authorization: Bearer $TP_TOKEN"); J=(-H 'Content-Type: application/json')

curl -s -X POST "$H/trips/import" "${A[@]}" "${J[@]}" -H "Idempotency-Key: $(uuidgen)" -d '{
  "trip": { "title": "Kyoto Autumn", "startDate": "2026-11-01", "endDate": "2026-11-02",
            "sourceUrl": "https://example.com/my-plan" },
  "days": [
    { "date": "2026-11-01",
      "places": [ { "kind": "food", "name": "Nishiki Market", "lat": 35.005, "lng": 135.764,
                    "googleMapsUrl": "https://maps.app.goo.gl/…", "time": "10:00",
                    "status": "confirmed", "sourceUrl": "https://example.com/nishiki" } ] },
    { "date": "2026-11-02",
      "places": [ { "kind": "sight", "name": "Kiyomizu-dera", "query": "Kiyomizu-dera temple",
                    "near": { "lat": 34.99, "lng": 135.78 }, "status": "tbd" } ] }
  ],
  "hotels": [ { "name": "Hotel Granvia", "checkInDate": "2026-11-01", "checkOutDate": "2026-11-02",
                "placeIdExternal": "ChIJ…", "costAmount": 50000, "costCurrency": "JPY" } ],
  "transport": [ { "type": "flight", "title": "NRT → KIX", "fromCode": "NRT", "toCode": "KIX" } ],
  "expenses":  [ { "category": "food", "amount": 3000, "currency": "JPY", "label": "Dinner" } ],
  "notes":     [ { "kind": "checklist", "title": "Packing" } ],
  "budget":    { "amount": 120000, "basis": "total", "currency": "JPY" }
}' | jq '.trip | {id, days:(.days|length), hotels:(.hotels|length)}'
```

Input dates are **ISO `YYYY-MM-DD`** (`trip.startDate/endDate`, each `day.date`).
In the response each day carries both a display `date` (e.g. `"Sat, Nov 1"`, or
`"Day 1"` when the trip has no start date) **and** a machine `dateIso`
(`"2026-11-01"`, or `null` when unknown). Edit against `dateIso`, show `date`.

> **Place location.**
> 1. Always send `name`, plus `address` (or at least the city). If you send no coordinates but do send an `address`, the server tries to geocode `name, address`. This is best-effort and capped, and never applies to `transit`. A place with only a name gets no pin.
> 2. If you found a real Google Maps link (`maps.app.goo.gl/…` or `google.com/maps/place/…`), send it as `googleMapsUrl`. It gives an exact pin. Do not build one yourself.
> 3. Never invent `query_place_id`, a CID, `placeIdExternal` or coordinates.
> 4. Check `warnings[]` in the response. `coords_approx`, `coords_mismatch` and `url_unresolved` mean the pin may be wrong. To move a pin, `PATCH` the place with `lat`/`lng` and **without** `googleMapsUrl`.

Rules:
- **Always creates a new trip.** Send `Idempotency-Key` so a retry returns the
  same trip instead of duplicating.
- Each place/hotel needs a **`name`** (§7 place fields); include **`lat`/`lng`**
  to render on the map. Put a place id in **`placeIdExternal`** — it is
  stored as a reference; the API does **not** call any provider. Ids are
  provider-prefixed: `geoapify:<id>`, `osm:<N|W|R><id>`, `gcid:<decimal CID>`
  (set from a `googleMapsUrl`; do not send it yourself), or a bare id (legacy
  Google Place ID). Not validated.
- **Resolve coords server-side.** Instead of `lat`/`lng` a place may send a
  free-text **`query`** (optionally biased by **`near`**: a `{lat,lng}` object
  or a `"lat,lng"` string); the server searches and fills in coordinates. If the
  query finds nothing the place is kept without a pin and you get a
  `place_unresolved` warning.
- **Planning status + origin link per place.** `status` is `"confirmed"`
  (default) or `"tbd"`; `sourceUrl` is an http(s) link the place came from
  (other schemes → `400`). The trip itself takes `trip.sourceUrl` too.
- **One call, all sections.** Besides `days`/`hotels` the body accepts
  `transport[]`, `expenses[]`, `notes[]` (same fields as the §4 endpoints) and a
  `budget` object (`{ amount, basis, caps?, currency? }`; `basis` ∈
  `total`/`per_person`/`per_day`; `caps` keys are expense categories). These are
  part of the **same atomic write** — all-or-nothing with the rest.
- `days`/`hotels`/`transport`/`expenses`/`notes`/`budget` all optional. A date
  range with no `days` seeds the day skeleton.
- **Atomic:** any bad field anywhere → `400` and nothing is created.
- **Caps:** ≤ 60 days, ≤ 100 places/day, ≤ 50 hotels, ≤ 100 transport, ≤ 500
  expenses, ≤ 100 notes.
- The `201` response is `{ trip, warnings }`: `trip` is the full created plan
  (nested `days → places`, plus `hotels`), so you get every generated id back.
  See §7 for the warning shape and codes.

### Preview first with `dryRun`

Send **`"dryRun": true`** (a real boolean in the body — a string `"true"` is a
`400`) to validate the whole plan, resolve links/queries, and get back a
**preview** of the trip it *would* create plus `warnings[]` — **writing
nothing** and **consuming no idempotency key**. The `200` response is
`{ trip, warnings }`: the `trip` is shaped like a real import (ids are `null`
since nothing was saved) and also echoes the `sections` you sent. Use it to show
the user the plan and surface warnings before the real `POST`.

```bash
curl -s -X POST "$H/trips/import" "${A[@]}" "${J[@]}" \
  -d '{ "dryRun": true, "trip": { "title": "Kyoto Autumn", "startDate": "2026-11-01", "endDate": "2026-11-02" }, "days": [ … ] }' \
  | jq '{warnings, days: (.trip.days | length)}'
```

## 3. Core workflow — build a plan

```bash
H="$TP_HOST/api/v1"; A=(-H "Authorization: Bearer $TP_TOKEN"); J=(-H 'Content-Type: application/json')

# create a trip (dated trips auto-seed one day per date)
TRIP=$(curl -s -X POST "$H/trips" "${A[@]}" "${J[@]}" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"title":"Kyoto","startDate":"2026-09-01","endDate":"2026-09-03"}' | jq -r .trip.id)

# read it back to get the seeded day ids
curl -s "$H/trips/$TRIP" "${A[@]}" | jq '.trip.days[] | {id, date}'
DAY=$(curl -s "$H/trips/$TRIP" "${A[@]}" | jq -r '.trip.days[0].id')

# add a place to that day
curl -s -X POST "$H/days/$DAY/places" "${A[@]}" "${J[@]}" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"kind":"food","name":"Nishiki Market","lat":35.005,"lng":135.764}'

# add a hotel + a flight (trip-scoped)
curl -s -X POST "$H/trips/$TRIP/hotels" "${A[@]}" "${J[@]}" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"Kyoto Granbell","checkInDate":"2026-09-01","checkOutDate":"2026-09-03","nights":2}'
curl -s -X POST "$H/trips/$TRIP/transport" "${A[@]}" "${J[@]}" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"type":"flight","title":"NRT → KIX","fromCode":"NRT","toCode":"KIX"}'
```

To add an extra day beyond the seeded ones: `POST /trips/:tripId/days` (no
body) → `201 { day }`, appended at the end.

## 4. Endpoint map

| Method & path | Body | Result |
|---------------|------|--------|
| `GET /me` | — | `{ user }` — whoami / token check |
| `GET /places/search` | `?q=<text>*&near=<lat,lng>&radius=<m>` (query string) | `200 [{ placeId, name, lat, lng, address, types? }]` — Google place search by name (§6a) |
| `POST /trips/import` | `{ trip{title*,sourceUrl?,…}, days[{date?, places[]}], hotels[], transport[], expenses[], notes[], budget, dryRun? }` | `201 { trip, warnings }` — whole plan in one atomic call; `dryRun:true` → `200` preview, no write (§2) |
| `GET /trips` | — | `{ trips }` — owned + shared trips, day/place counts, your `role` |
| `POST /trips` | `{ title*, subtitle?, startDate?, endDate?, cover? }` | `201 { trip }` — dated trips seed a day per date |
| `GET /trips/:tripId` | `?status=confirmed\|tbd` (optional) | `{ trip }` with `days[] → places[] / segments[]` **and `hotels[]`**; each day has `date`+`dateIso`; trip has `url`, `budget`, `currency`, `sourceUrl`, `tbdCount` (§7). `?status=` filters places; `tbdCount` is always the whole-trip total |
| `PATCH /trips/:tripId` | any of `title, subtitle, startDate, endDate, cover, budget, currency, sourceUrl` | `{ trip }` — only sent fields change; `sourceUrl` must be http/https |
| `DELETE /trips/:tripId` | — | `{ ok }` — soft delete (owner only) |
| `POST /trips/:tripId/days` | — | `201 { day }` — appended |
| `DELETE /days/:dayId` | — | `{ ok, tripId }` — cascades places+segments, re-indexes |
| `POST /days/:dayId/places` | place fields (§7) | `201 { place, warnings }` — appended |
| `PATCH /places/:placeId` | full place fields | `{ place, warnings }` — **replaces all fields** (`name` required) |
| `DELETE /places/:placeId` | — | `{ ok, tripId }` |
| `GET/POST /trips/:tripId/hotels` | `{ name*, checkInDate?, checkOutDate?, nights?, room?, guests?, ref?, costAmount?, costCurrency?, address?, lat?, lng?, attachmentName?, attachmentSize?, … }` | list / `201 { hotel }` |
| `PATCH/DELETE /hotels/:hotelId` | any hotel field | `{ hotel }` / `{ ok, tripId }` |
| `GET/POST /trips/:tripId/transport` | `{ type*, title*, provider?, fromCode?, toCode?, fromTime?, toTime?, costAmount?, … }` | list / `201 { transport }`. `type` ∈ flight/train/car/ferry |
| `PATCH/DELETE /transport/:transportId` | any transport field | `{ transport }` / `{ ok, tripId }` |
| `GET/POST /trips/:tripId/expenses` | `{ category*, amount*, currency?, label?, dayIdx?, paidBy?, note?, at?, splits? }` | list (with splits) / `201 { expense }`. `at` = ISO datetime, defaults now |
| `PATCH/DELETE /expenses/:expenseId` | any expense field + optional `splits` | `{ expense }` (splits replace all) / `{ ok, tripId }` |
| `GET/POST /trips/:tripId/notes` | `{ kind*, title*, body? }` | list (with items) / `201 { note }`. `kind` ∈ checklist/doc |
| `PATCH/DELETE /notes/:noteId` | `{ title?, body? }` | `{ note }` / `{ ok, tripId }` |
| `POST /notes/:noteId/items` | `{ text*, done? }` | `201 { item }` |
| `PATCH/DELETE /items/:itemId` | `{ text?, done? }` | `{ item }` / `{ ok, tripId }` |

`category` ∈ transport/hotels/food/activities/shopping/other. Each split is
`{ accountId*, shareAmount?, sharePct? }`.

## 5. Idempotency (send it on every POST)

`POST` accepts an optional `Idempotency-Key` header. Reuse the same key on a
retry to get the original response instead of a duplicate. Use a fresh UUID per
logical create.

```
Idempotency-Key: <uuid>
```

- Same key + **same** request → returns the first response (safe retry).
- Same key + **different** body/path → `409 conflict`.
- First request still in flight → `409 conflict` (retry shortly).
- A failed (non-2xx) attempt releases the key so it can be retried cleanly.

## 6. Errors

| Status | `error` | Meaning / what to do |
|--------|---------|----------------------|
| 400 | `bad_request` | bad/missing JSON, bad field, empty required value — fix the body |
| 401 | `unauthorized` | missing/invalid/revoked token — ask user for a new one |
| 403 | `forbidden` | trip exists but this token can't touch it — wrong account |
| 404 | `not_found` | no such trip/day/place — re-read to get valid ids |
| 409 | `conflict` | idempotency-key reuse with a different/in-flight request |
| 429 | `rate_limited` | too many requests for this token — sleep `Retry-After` seconds (header), then retry |
| 500 | `internal` | server error — retry once, then report to the user |

Rate limit: ~60 requests/min **per token**. On `429`, honor the `Retry-After`
header (whole seconds) before retrying — don't hammer.

Place-link lookups have separate caps: 50 lookups and a 20 s deadline per
request, 300 geocodes per user per 24 h window (from the first geocode). Past a
cap the place is saved with a `lookup_skipped` warning.

## 6a. Search places by name

`GET /api/v1/places/search` resolves a free-text place name to real
coordinates server-side (Google Places), so you don't have to invent `lat`/`lng`
or a `placeIdExternal`. Use it to find a place, then feed the returned
`placeId`/coords into `POST /days/:dayId/places` or `POST /trips/import`.

Query params:

| Param | Required | Meaning |
|-------|----------|---------|
| `q` | **yes** | the search text (e.g. `Wat Arun`). Empty/missing → `400 bad_request` |
| `near` | no | bias point `"lat,lng"` (e.g. `13.75,100.5`) |
| `radius` | no | bias radius in metres (used with `near`; clamped to 50 km) |

```bash
curl -s -G "$H/places/search" "${A[@]}" \
  --data-urlencode "q=Wat Arun" \
  --data-urlencode "near=13.75,100.5" \
  --data-urlencode "radius=5000" | jq .
```

Response `200` is a JSON **array** (up to 10), each:

```jsonc
{
  "placeId": "ChIJ…",              // Google place id → send as placeIdExternal
  "name": "Wat Arun Ratchawararam",
  "lat": 13.7437,
  "lng": 100.4888,
  "address": "158 Thanon Wang Doem, Bangkok",  // or null
  "types": ["tourist_attraction", "place_of_worship"]  // omitted if none
}
```

No match → `[]`. Then add the pick:

```bash
curl -s -X POST "$H/days/$DAY/places" "${A[@]}" "${J[@]}" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"kind":"sight","name":"Wat Arun Ratchawararam","lat":13.7437,"lng":100.4888,"placeIdExternal":"ChIJ…"}'
```

Limits & errors:
- **200 searches per user per day.** Over the cap → `429 rate_limited` with a
  `Retry-After` header (seconds) — wait, then retry. This is a **separate**
  bucket from the ~60/min per-token limit and the import geocode cap.
- Search is **not configured** on this server → `503` (`error:"unavailable"`);
  a transient Google outage → `502` (`error:"bad_gateway"`). Both are clean
  JSON, not a crash.
- Needs any valid token (read-only is fine; it's a `GET`).

## 7. Place fields

```jsonc
{
  "kind": "hotel | food | sight | transit",  // required
  "name": "string",                          // required
  "status": "confirmed | tbd?",              // default "confirmed"
  "sourceUrl": "https://…?",                 // origin link; http/https only
  "category": "string?",
  "rating": 4.5, "reviews": 1200,
  "time": "8:30 AM?", "duration": "1h?", "price": "¥1200?",
  "address": "string?", "phone": "string?", "website": "string?", "hours": "string?",
  "tags": ["dinner"],
  "thumb": "url?", "note": "string?",
  "lat": 35.0, "lng": 135.7,
  "query": "free-text search?",              // import only: resolve coords server-side
  "near": { "lat": 35.0, "lng": 135.7 },     // import only: bias point for `query` ({lat,lng} or "lat,lng")
  "placeIdExternal": "id?",
  "googleMapsUrl": "https://maps.app.goo.gl/…?"   // max 2048 chars; places only, not hotels
}
```

`status` (`confirmed`/`tbd`) and `sourceUrl` (http/https, else `400`) are
accepted on place create, place `PATCH`, and each place in import. `query`/`near`
are import-only resolve-time inputs (see §2); `near` is a `{lat,lng}` object or a
`"lat,lng"` string.

> **Place location.**
> 1. Always send `name`, plus `address` (or at least the city). If you send no coordinates but do send an `address`, the server tries to geocode `name, address`. This is best-effort and capped, and never applies to `transit`. A place with only a name gets no pin.
> 2. If you found a real Google Maps link (`maps.app.goo.gl/…` or `google.com/maps/place/…`), send it as `googleMapsUrl`. It gives an exact pin. Do not build one yourself.
> 3. Never invent `query_place_id`, a CID, `placeIdExternal` or coordinates.
> 4. Check `warnings[]` in the response. `coords_approx`, `coords_mismatch` and `url_unresolved` mean the pin may be wrong. To move a pin, `PATCH` the place with `lat`/`lng` and **without** `googleMapsUrl`.

**Warnings.** `POST /days/:dayId/places` and `PATCH /places/:placeId` return
`{ place, warnings }`; `POST /trips/import` returns `{ trip, warnings }` (201,
on an idempotent replay, and as the `200` `dryRun` preview). A warning never
fails the request — it flags something worth checking.

Base shape is **`{ code, message }`**. On `import`/`dryRun`, per-place
link/resolution warnings additionally carry 1-based **`day`** and **`place`**,
while trip-level semantic warnings carry an optional **`path`** (a
JSON-pointer-ish location like `/days/0/places/1` or `/budget`), i.e.
**`{ code, path?, message }`**.

Codes:

| Code | Meaning |
|------|---------|
| `url_unsupported` | `googleMapsUrl` is not a supported Google Maps link; it was ignored |
| `url_unresolved` | the Google Maps link could not be resolved to a location |
| `place_unresolved` | the `query` search found no match; place kept without coords |
| `coords_approx` | coords are approximate (viewport/address lookup); send `lat`/`lng` to pin exactly |
| `coords_mismatch` | `lat`/`lng` differ from the link by > 2000 m; the link location was used |
| `lookup_skipped` | a lookup was skipped (request budget, deadline, or daily cap); send `lat`/`lng` or retry |
| `night_without_hotel` | a day before the last has no hotel booking covering that night (import/dryRun) |
| `place_without_coords` | a non-transit place has no coordinates; it won't appear on the map (import/dryRun) |
| `flight_without_time` | a `transit` place/leg has no `time`; it can't be ordered in the day (import/dryRun) |
| `over_budget` | estimated spend (hotels + expenses) exceeds the trip `budget` (import/dryRun) |

**Pin precedence:** exact pin from the link, then your `lat`/`lng`, then the
link's viewport, then a geocode. A geocode runs only when the place still has no
coordinates, it has a link or an `address`, and `kind` is not `transit`. A
geocode never sets `placeIdExternal`.

**Caps:** 50 lookups and a 20 s deadline per request; 300 geocodes per user per
24 h window, starting at the first geocode. Past a cap the place is still
saved and gets `lookup_skipped`.

`googleMapsUrl` is an optional string, at most 2048 chars (else `400
bad_request`). It is accepted on place create, place `PATCH` and each place in
import, not on hotels. PATCH replaces every field. A PATCH with no `lat`/`lng`
but with an `address` re-geocodes (an exact pin becomes approximate); a PATCH
with neither clears the pin. To move a pin, PATCH `lat`/`lng` without
`googleMapsUrl`.

`PATCH /places/:placeId` **replaces every field** — send the full object you
want, not just the delta (`name` is required). Omitting `placeIdExternal`
clears it. Everything else patches only the fields you send.

Place responses include read-only **`googleStatus`** (`OPERATIONAL`,
`CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`, `NOT_FOUND`, `INVALID` or `null`;
set from Google and refreshed periodically in Google mode (each place at most every ~25 days, within a daily budget), ignored on write). Google-sourced `rating`, `reviews` and
`hours` read as `null` after 30 days; values you set yourself never expire.

**Trip-level fields (`GET /trips/:tripId`).** Alongside `days[]`/`hotels[]`, the
trip object carries:
- `url` — canonical public link to the trip (read-only, derived).
- `budget` — the stored budget config `{ amount, basis, caps }` or `null`
  (`basis` ∈ `total`/`per_person`/`per_day`; `caps` is `{<category>: number}`).
- `currency` — the 3-letter comparison currency, or `null`.
- `sourceUrl` — the trip's origin link, or `null`.
- `tbdCount` — count of `status:"tbd"` places across the whole trip (independent
  of any `?status=` filter).

Set `budget` / `currency` / `sourceUrl` via `PATCH /trips/:tripId` (§4);
`sourceUrl` must be http/https (else `400`), and a `null`/`""` clears a field.

## 8. Not available via API

- Invites / memberships (UI only).
- Place/day reordering and segment travel-modes are not exposed.
- Checklist-item reorder + toggle-by-flip are web-only; via API set `done`
  explicitly on `PATCH /items/:itemId`.
- `POST /trips/import` only creates a **new** trip (no import into an existing
  one); it now accepts transport/expenses/notes/budget (§2).

## 9. Etiquette

- Confirm destructive actions (`DELETE`, or a `PATCH /places` that drops fields)
  with the user before sending.
- After a batch of writes, `GET /trips/:tripId` once and show the user the
  resulting plan rather than narrating each call.
