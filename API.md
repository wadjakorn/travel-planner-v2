# Travel Planner REST API (v1)

Connect your own agent or script to build travel plans over HTTP. Everything
the web app does to trips/days/places is available here with a personal
access token — no browser needed.

Base path: `/api/v1` · Format: JSON · Auth: `Authorization: Bearer <token>`

**Connecting an AI agent?** Drop [`agent-skill/travel-planner-api/SKILL.md`](agent-skill/travel-planner-api/SKILL.md)
into your agent — it distills this contract into agent-facing setup, curl
recipes, idempotency, and error handling.

## Quickstart — connect your agent

1. **Create a token.** In the app, open **Account → Settings → API access**,
   name a token, and **Create token**. The plaintext (`tp_…`) is shown once —
   copy it now; it is stored only as a hash and cannot be retrieved again.

2. **Verify it works.**

   ```bash
   curl -H "Authorization: Bearer $TOKEN" https://<host>/api/v1/me
   # -> { "user": { "id": "...", "name": "...", "email": "..." } }
   ```

3. **Build a plan.**

   ```bash
   # create a trip
   TRIP=$(curl -s -X POST https://<host>/api/v1/trips \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"Kyoto","startDate":"2026-09-01","endDate":"2026-09-03"}' \
     | jq -r .trip.id)

   # add a day (dated trips are pre-seeded a day per date; add extras here)
   DAY=$(curl -s -X POST https://<host>/api/v1/trips/$TRIP/days \
     -H "Authorization: Bearer $TOKEN" | jq -r .day.id)

   # add a place to that day
   curl -s -X POST https://<host>/api/v1/days/$DAY/places \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"kind":"food","name":"Nishiki Market","lat":35.005,"lng":135.764}'

   # read the whole plan back
   curl -s https://<host>/api/v1/trips/$TRIP -H "Authorization: Bearer $TOKEN"
   ```

Revoke a token any time from the same settings panel; it is rejected
immediately afterward.

## Auth

Send the token as a bearer header on every request:

```
Authorization: Bearer tp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A missing, malformed, unknown, or revoked token returns `401`. A token only
grants access to trips its owner owns or is a member of; touching another
user's trip returns `403`.

### Token scopes

Each token has a scope, chosen when you mint it in Settings → API access:

- **Read & write** (default) — full access to every endpoint.
- **Read only** — `GET` requests only. Any write (`POST`/`PATCH`/`PUT`/`DELETE`)
  returns `403 { "error": "forbidden", "message": "Token lacks write scope" }`.

Scope is fixed for the life of a token. To change it, revoke the token and mint
a new one.

## Idempotency

`POST` endpoints accept an optional `Idempotency-Key` header. Retrying a
request with the same key returns the original response instead of creating a
duplicate — send a fresh UUID per logical create and reuse it on retry.

```
Idempotency-Key: 6f9d…-uuid
```

The key is bound to the request (method + path + body) and claimed atomically:
- Reusing a key with a **different** request → `409 conflict`.
- Retrying while the first request is **still in flight** → `409 conflict` (retry shortly).
- A failed (non-2xx) attempt releases the key so it can be retried cleanly.

## Rate limits

Each personal access token is rate limited independently — a default of **60
requests per minute** (per token, not global). Exceeding it returns `429` with
a `Retry-After` header (whole seconds until the window resets):

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42

{ "error": "rate_limited", "message": "Rate limit exceeded (60 requests/min). Retry after 42s." }
```

Back off for `Retry-After` seconds, then retry. Requests under the limit are
unaffected. Only bearer-token API traffic is limited; the web app is not.

Place-link lookups have their own caps: 50 lookups and a 20 s deadline per
request, and 300 geocodes per user per 24 h window (starting at the first
geocode). Past a cap the place is saved and gets a `lookup_skipped` warning.

## Errors

Every error is `{ "error": <code>, "message": <text> }` with a matching status:

| Status | `error`        | When |
|--------|----------------|------|
| 400    | `bad_request`  | invalid/missing JSON, bad field, empty required value |
| 401    | `unauthorized` | missing / invalid / revoked token |
| 403    | `forbidden`    | trip exists but you lack access |
| 404    | `not_found`    | no such trip / day / place |
| 409    | `conflict`     | idempotency-key reuse with a different/in-flight request |
| 429    | `rate_limited` | too many requests for this token — back off for `Retry-After` seconds |
| 500    | `internal`     | unexpected server error |

## Import a whole plan (agents start here)

If your agent already built the itinerary, import it in **one call** instead of
creating each day/place/hotel separately. `POST /trips/import` creates a new
trip with all its days, places, and hotels atomically — then the user fine-tunes
it in the app.

```bash
curl -s -X POST https://<host>/api/v1/trips/import \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "trip": { "title": "Kyoto Autumn", "startDate": "2026-11-01", "endDate": "2026-11-02" },
    "days": [
      { "date": "2026-11-01",
        "places": [ { "kind": "food", "name": "Nishiki Market", "lat": 35.005, "lng": 135.764,
                      "googleMapsUrl": "https://maps.app.goo.gl/…", "time": "10:00" },
                    { "kind": "sight", "name": "Fushimi Inari", "lat": 34.967, "lng": 135.773,
                      "arrive": { "mode": "transit", "durationMin": 25, "note": "JR Nara line" } } ] },
      { "date": "2026-11-02",
        "places": [ { "kind": "sight", "name": "Kiyomizu-dera", "address": "Kyoto" } ] }
    ],
    "hotels": [ { "name": "Hotel Granvia", "checkInDate": "2026-11-01", "checkOutDate": "2026-11-02",
                  "placeIdExternal": "ChIJ…", "costAmount": 50000, "costCurrency": "JPY" } ]
  }'
# -> 201 { "trip": { …, "days": [...], "hotels": [...] }, "warnings": [...], "summary": {…} }
```

> **Place location.**
> 1. Always send `name`, plus `address` (or at least the city). If you send no coordinates but do send an `address`, the server tries to geocode `name, address`. This is best-effort and capped, and never applies to `transit`. A place with only a name gets no pin.
> 2. If you found a real Google Maps link (`maps.app.goo.gl/…` or `google.com/maps/place/…`), send it as `googleMapsUrl`. It gives an exact pin. Do not build one yourself.
> 3. Never invent `query_place_id`, a CID, `placeIdExternal` or coordinates.
> 4. Check `warnings[]` in the response. `coords_approx`, `coords_mismatch` and `url_unresolved` mean the pin may be wrong. To move a pin, `PATCH` the place with `lat`/`lng` and **without** `googleMapsUrl`.

Rules:
- **Always creates a new trip** (owned by the token's user). Idempotent via
  `Idempotency-Key`.
- Each place/hotel needs a **`name`**; include **`lat`/`lng`** so it renders on
  the map. A place id goes in **`placeIdExternal`** (stored as a
  reference — the API does **not** call any provider). Ids are
  provider-prefixed: `geoapify:<id>`, `osm:<N|W|R><id>`, `gcid:<decimal CID>`
  (set from a `googleMapsUrl`; do not send it yourself), or a bare id (legacy
  Google Place ID). Not validated.
- **Legs:** each place may carry `arrive` (`{ mode: drive|walk|transit,
  durationMin?: 0–2880, note?: ≤ 500 chars }`) — the travel *into* that place;
  on place 0 it is the day's start leg (`day.start`). Every day with N places
  gets N−1 segment rows (default `drive`, null note, or the next place's
  `arrive`; `arrive: null` in import just means no leg detail). Don't model
  travel as a coordless `transit` place (`transit_as_place` warning); a
  first-stop `arrive` on a day with no hotel the night before warns
  `arrive_without_origin`. A day with more than 4 h of `drive` legs warns
  `long_drive_day` (path `/days/<i>`). Each leg uses its `durationMin`, else the estimate.
- In `GET /trips/:tripId` and the import/dryRun `trip`, each non-null `arrive` also carries read-only **`estDistanceKm`** / **`estDurationMin`**: a straight-line (haversine) estimate × a detour factor (drive ×1.3 at 45 km/h, walk ×1.2 at 4.5 km/h, transit ×1.3 with no time estimate). They are `null` when either end has no coordinates; place 0 is measured from the day's begin hotel. No Google call is made. They are a hint, not a route, and are ignored if you send them back. Single place POST/PATCH responses don't include them.
- `days` and `hotels` are optional. If you pass a date range but no `days`, the
  day skeleton is created for you.
- **Atomic:** any validation error returns `400` and creates nothing.
- **Caps:** ≤ 60 days, ≤ 100 places/day, ≤ 50 hotels (else `400`).
- **Cross-references:** every `dayIdx` (hotels / transport / expenses) must be
  `0 … dayCount-1` of the days the import creates, and expense `paidBy` /
  `splits[].accountId` must be your own account id (you are the only member of
  a new trip) — else `400`.
- **Dry run:** `"dryRun": true` validates + resolves and returns `200 { trip,
  warnings, summary }` as a preview, writing nothing. The preview's days include the
  `segments` (N−1 legs), `start`, and each place's `arrive` it would write. Commit is a separate request that
  resolves again; copy resolved `lat`/`lng` from the preview's places into the
  commit body so they aren't geocoded (and counted against the daily limit)
  twice.
- Optional top-level `transport[]`, `expenses[]`, `notes[]` and `budget` import in
  the same atomic call; each item takes the same fields as its single-create
  endpoint below. A checklist note may also carry `items: [{ text, done? }]`
  (≤ 200 per note; `400` on a `doc` note), created in the same transaction.

The `201` response is `{ trip, warnings, summary }`; `trip` is the full created plan (same nested shape as
`GET /trips/:tripId`), so you get every generated id back.

## Endpoints

| Method & path | Body | Result |
|---------------|------|--------|
| `POST /trips/import` | `{ trip{title*,…}, days[{date?, places[]}], hotels[] }` | `201 { trip, warnings }` — new trip with days+places+hotels, created atomically. Idempotent. See above. |
| `PUT /trips/:tripId/plan` | `{ ifUpdatedAt?, prune?, dryRun?, days[{id*, title?, defaultMode?, places?}] }` | `200 { trip, diff, warnings, summary }`: rearrange an existing trip's places in one atomic call. `days` must list every existing day id in its current order. A place `{id}` keeps or moves that place. A place with `id` plus fields is a merge-patch edit. A place without `id` is created. A place left out is kept and appended, or deleted when `prune: true`, which requires `ifUpdatedAt`. `dryRun` returns the diff only. Returns `409` with `reason: version_mismatch \| plan_changed`. Sending `trip`, `budget`, `hotels`, `transport`, `expenses`, `notes`, a new day, or a day `date` returns `400`, and the `reason` names the endpoint to use instead. Idempotent. |
| `GET /trips` | — | `{ trips: [...] }` — trips you own **or** are a member of, with day/place counts and your `role` (`owner`/`editor`/`viewer`) |
| `POST /trips` | `{ title*, subtitle?, startDate?, endDate?, cover? }` | `201 { trip }`. Dated trips seed one day per date. Idempotent. |
| `GET /trips/:tripId` | — | `{ trip }` with nested `days[] → places[] / segments[]` **and `hotels[]`**. `days[]` carry `start` (hotel → first stop leg or null) and `segments[]` with `note`/`durationMin`; each place carries derived `arrive` (null when no leg data). |
| `PATCH /trips/:tripId` | any of `title, subtitle, startDate, endDate, cover, budget` | `{ trip }` — only provided fields change. `budget` = `{ amount, basis, caps?, travelers? }` (`basis` ∈ `total`/`per_person`/`per_day`; `travelers` 1–99 = per-person divisor, absent → owner + editors); `amount`/`basis`/`caps` are replaced whole; `travelers` changes only when named (`travelers: null` clears it; omitting it, or `budget: null`, keeps the stored count). Booking costs already count toward the budget — don't also log them as expenses. |
| `DELETE /trips/:tripId` | — | `{ ok: true }` — soft delete (owner only) |
| `POST /trips/:tripId/days` | — | `201 { day }` — appended at the end. Idempotent. |
| `DELETE /days/:dayId` | — | `{ ok, tripId }` — cascades places+segments, re-indexes survivors |
| `POST /days/:dayId/places` | place fields (below), `arrive?` | `201 { place, warnings }` — appended at end of the day. `arrive` (an `ArriveInput`) writes the leg into the new place in the same transaction; `place.arrive` echoes it. `arrive: null` is ignored on create (nothing to clear). Idempotent. |
| `PATCH /places/:placeId` | any place field, `googleMapsUrl?`, `arrive?` | `{ place, warnings }` — **merge-patch** (since 2026-11): absent = unchanged, `null` = clear; `name`/`kind` cannot be cleared, `lat`/`lng` go together. `arrive` is tri-state: absent = leg untouched, `null` = clear it, object = set it. |
| `PUT /places/:placeId/arrive` | `ArriveInput` (the body itself) | `{ arrive, tripId }` — sets the leg into this place (into the first place = the day's start leg) |
| `DELETE /places/:placeId/arrive` | — | `{ arrive: null, tripId }` — clears the leg's note/duration (keeps its mode); on the first place clears the whole start leg |
| `DELETE /places/:placeId` | — | `{ ok, tripId }` — re-indexes survivors + realigns segments |
| `GET /places/search` | `?q=<text>*&near=<lat,lng>&radius=<m>` | `200 [{ placeId, name, lat, lng, address, types? }]` — Google place search by name (≤10). Per-user cap 200/day → `429`; unconfigured → `503`. |

`*` = required. Dates are ISO `YYYY-MM-DD` strings.

`ArriveInput` = `{ mode*, durationMin?, note? }` — the travel *into* a place from the previous
stop (or, for a day's first place, from the start). `mode` ∈ `drive`/`walk`/`transit`;
`durationMin` integer 0–2880; `note` ≤ 500 chars (blank → null). Any other value → `400 bad_request`.

### Hotels & transport (trip-scoped, soft-deleted)

| Method & path | Body | Result |
|---------------|------|--------|
| `GET  /trips/:tripId/hotels` | — | `{ hotels: [...] }` |
| `POST /trips/:tripId/hotels` | `{ name* (or area when status:"tbd"), status?, area?, googleMapsUrl?, query?, near?, checkInDate?, checkOutDate?, nights?, room?, guests?, ref?, costAmount?, costCurrency?, address?, lat?, lng?, … }` | `201 { hotel, warnings }`. Idempotent. See **Hotel location** below. |
| `PATCH /hotels/:hotelId` | any hotel field, plus `googleMapsUrl?`, `query?`, `near?` (partial patch) | `{ hotel, warnings }` |
| `DELETE /hotels/:hotelId` | — | `{ ok, tripId }` |
| `GET  /trips/:tripId/transport` | — | `{ transport: [...] }` |
| `POST /trips/:tripId/transport` | `{ type*, title*, provider?, fromCode?, toCode?, fromTime?, toTime?, costAmount?, from?, to?, … }` | `201 { transport, warnings }`. Idempotent. `type` ∈ flight/train/car/ferry. See **Transport from/to** below. |
| `PATCH /transport/:transportId` | any transport field, plus `from?`, `to?` (partial patch) | `{ transport, warnings }` |
| `DELETE /transport/:transportId` | — | `{ ok, tripId }` |

> **Transport from/to.** A ride can carry coordinates for each end. `GET`
> returns them as flat fields `fromLat`, `fromLng`, `fromPlaceId`, `toLat`,
> `toLng`, `toPlaceId` (all nullable); the flat fields are also writable.
> `fromCode`/`fromName`/`toCode`/`toName` stay labels and never move a pin.
> 1. **`from` / `to` objects** (POST, PATCH, and each `transport[]` item in
>    import) take one of `{ name?, lat, lng, placeId? }`, `{ googleMapsUrl }`
>    or `{ query, near? }`. `googleMapsUrl`, `query` and `near` are used to
>    resolve and are never stored. `name` alone does **no lookup**: it is only
>    a label, copied to `fromName`/`toName` when the body has no
>    `fromName`/`toName`. A `googleMapsUrl` that can't be read never falls
>    back to a name search (send a `query` too if you want one); a `query` is
>    searched (1 lookup, `near` biases it, no automatic trip bias).
>    `from: null` / `to: null` clears that end's `Lat`/`Lng`/`PlaceId`
>    (labels untouched).
> 2. **Object wins:** when `from` (or `to`) is sent, including `null`, the flat
>    `fromLat`/`fromLng`/`fromPlaceId` keys in the same body are dropped
>    silently. So a `GET` row plus a new `from` round-trips.
> 3. **Flat pair rule:** `fromLat` and `fromLng` go together (both present or
>    neither, else `400`). A pair of `null`s clears all three, including
>    `fromPlaceId`. A new pair without `fromPlaceId` stores `fromPlaceId: null`,
>    never a stale id. Same for `to*`.
> 4. **PATCH re-resolves only the end you send.** `{ seats }` makes no lookup
>    and keeps the stored pins; `{ to: {…} }` re-resolves `to` only. If the
>    lookup is skipped or finds nothing, the stored pin is kept and you get
>    the warning. An end `name` still updates `fromName`/`toName` when the
>    body has no `fromName`/`toName`, so the label can then differ from the
>    kept pin.
> 5. **Changing the label does not move the pin.** `PATCH { fromCode: "HND" }`
>    or `{ fromName }` without a new `from` keeps the old coordinates; send a
>    new `from` when you change the place.
> 6. **Response and warnings.** POST and PATCH return `{ transport, warnings }`
>    (`[]` when none). Everything is validated, and trip write access checked,
>    before any lookup, so a `400`/`403` spends nothing. Warning paths on POST:
>    `/from`, `/to` (lookup codes such as `url_unresolved`, `place_unresolved`,
>    `lookup_skipped`), `/fromCode`, `/toCode`; PATCH lookup warnings use
>    `/from`, `/to`. In `POST /trips/import` the paths are `/transport/<i>`,
>    `/transport/<i>/from`, `/transport/<i>/to`, `/transport/<i>/fromCode`,
>    `/transport/<i>/toCode` (0-based).
> 7. **New codes.** `transport_without_day`: no `dayIdx` and no `fromDate`
>    (on import also a `fromDate` that matches none of the trip's days), so the
>    ride shows on no itinerary day; POST carries no `path`; PATCH never emits
>    it. `iata_code_invalid` (flights only): a non-empty, trimmed `fromCode` /
>    `toCode` is not 3 uppercase letters; the code is stored as sent.
> 8. **Budget and order.** In import, transport ends resolve **after hotels and
>    places** on the same per-import lookup budget (a skipped end gets
>    `lookup_skipped` with path `/transport/<i>/from|to`; the import still
>    succeeds). `dryRun` and commit each resolve, and an idempotent POST replay
>    re-resolves, so copy resolved `lat`/`lng` into the commit. For rides send them
>    as `from: { name, lat, lng }` (or flat `fromLat`/`fromLng` without a `from`
>    object); keeping `from: { query }` re-runs the lookup on commit.

### Expenses (trip-scoped, soft-deleted, with splits)

| Method & path | Body | Result |
|---------------|------|--------|
| `GET  /trips/:tripId/expenses` | — | `{ expenses: [{ …, splits: [...] }] }` |
| `POST /trips/:tripId/expenses` | `{ category*, amount*, currency?, label?, dayIdx?, paidBy?, note?, at?, splits? }` | `201 { expense }`. Idempotent. `at` is an ISO datetime (defaults to now). |
| `PATCH /expenses/:expenseId` | any expense field + optional `splits` | `{ expense }` — `splits`, if present, replace all |
| `DELETE /expenses/:expenseId` | — | `{ ok, tripId }` |

`category` ∈ transport/hotels/food/activities/shopping/other. Each split is
`{ accountId*, shareAmount?, sharePct? }`.

### Notes & checklist items

| Method & path | Body | Result |
|---------------|------|--------|
| `GET  /trips/:tripId/notes` | — | `{ notes: [{ …, items: [...] }] }` |
| `POST /trips/:tripId/notes` | `{ kind*, title*, body? }` | `201 { note }`. Idempotent. `kind` ∈ checklist/doc. |
| `PATCH /notes/:noteId` | `{ title?, body? }` | `{ note }` |
| `DELETE /notes/:noteId` | — | `{ ok, tripId }` |
| `POST /notes/:noteId/items` | `{ text*, done? }` | `201 { item }`. Idempotent. |
| `PATCH /items/:itemId` | `{ text?, done? }` | `{ item }` |
| `DELETE /items/:itemId` | — | `{ ok, tripId }` — re-indexes survivors |

### Place fields

```jsonc
{
  "kind": "hotel | food | sight | transit",  // required
  "name": "string",                          // required
  "category": "string?",
  "rating": 4.5,            "reviews": 1200,
  "time": "8:30 AM?",       "duration": "1h?",   "price": "¥1200?",
  "address": "string?",     "phone": "string?",  "website": "string?",
  "hours": "string?",
  "tags": ["dinner"],
  "thumb": "url?",          "note": "string?",
  "lat": 35.0,              "lng": 135.7,
  "placeIdExternal": "id?",
  "googleMapsUrl": "https://maps.app.goo.gl/…?"   // max 2048 chars; places and hotels
}
```

Place responses also carry **`googleStatus`**: `OPERATIONAL`,
`CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`, `NOT_FOUND`, `INVALID` or `null`.
It is read-only and set from Google (refreshed periodically in Google mode: each place at most every ~25 days, within a daily budget); sending it has no effect.
`rating`, `reviews` and `hours` that came from Google read as `null` once they
are older than 30 days (values you set yourself never expire).
`PATCH /places/:placeId` is a merge-patch: omitting `placeIdExternal` (or any field) keeps it.

> **Place location.**
> 1. Always send `name`, plus `address` (or at least the city). If you send no coordinates but do send an `address`, the server tries to geocode `name, address`. This is best-effort and capped, and never applies to `transit`. A place with only a name gets no pin.
> 2. If you found a real Google Maps link (`maps.app.goo.gl/…` or `google.com/maps/place/…`), send it as `googleMapsUrl`. It gives an exact pin. Do not build one yourself.
> 3. Never invent `query_place_id`, a CID, `placeIdExternal` or coordinates.
> 4. Check `warnings[]` in the response. `coords_approx`, `coords_mismatch` and `url_unresolved` mean the pin may be wrong. To move a pin, `PATCH` the place with `lat`/`lng` and **without** `googleMapsUrl`.

**Warnings.** `POST /days/:dayId/places` and `PATCH /places/:placeId` return
`{ place, warnings }`; `POST /trips/import` returns `{ trip, warnings, summary }`
(201, the `dryRun` 200, and on an idempotent replay) with **one warning per place,
hotel, ride, day or budget**: `path` is the 0-based JSON pointer to it
(`/days/0/places/3`, `/hotels/1`, `/transport/2`, `/days/0`, `/budget`), `name`
is its name, `codes` lists every code for it (`code` = the first, the root
cause), `details` (only when several merged) keeps each original warning with
its exact sub-path, and `summary` is `{ [code]: count }` over all `codes`.
Place-link entries still carry 1-based `day`/`place` (deprecated — use
`path`). A warning never fails the request. Codes: `url_unsupported`,
`url_unresolved`, `place_unresolved` (a `query`/`area`/`address` lookup found
nothing), `coords_approx`, `coords_mismatch` (link pin more than 2000 m
from your `lat`/`lng`), `lookup_skipped`, `transit_as_place` (a `transit` place
with no coordinates, address or link — put the travel on the next stop's
`arrive` instead), `hotel_without_location` (hotel has no pin) and
`hotel_without_dates` (a `tbd` hotel without `checkInDate`/`checkOutDate`),
`transport_without_day` and `iata_code_invalid` (see **Transport from/to**). Leg
warnings also carry `name` (the place name). On `POST /trips/:tripId/hotels` and
`PATCH /hotels/:hotelId` hotel warnings carry no `path`.

**Pin precedence:** exact pin from the link, then your `lat`/`lng`, then the
link's viewport, then a geocode. A geocode runs only when the place still has no
coordinates, it has a link or an `address`, and `kind` is not `transit`. A
geocode never sets `placeIdExternal`.

**Caps:** 50 lookups and a 20 s deadline per request; 300 geocodes per user per
24 h window, starting at the first geocode. Past a cap the place is still
saved and gets `lookup_skipped`.

`googleMapsUrl` is an optional string, at most 2048 chars (else `400
bad_request`). It is accepted on place create, place `PATCH` and each place in
import, and on hotel create/`PATCH` (see **Hotel location**). Place PATCH is a
merge-patch, so the pin moves only on new location input: `lat`/`lng` (written
as sent, `null`/`null` clears), a `googleMapsUrl` (re-pins from the link), or a
**changed** `address` without `lat`/`lng` (re-geocodes; the pin becomes
approximate and `placeIdExternal` is dropped). With none of these the pin stays.
A re-resolve that finds nothing keeps the stored pin and returns the warning.
To move a pin exactly, PATCH `lat`/`lng` without `googleMapsUrl`.

> **Hotel leg modes.** `arrivalMode` = travel mode of the last leg of the day arriving at this hotel; `departureMode` = leg leaving the hotel (applies to every night of the stay, except that the first stop's `arrive` (`PUT /places/:firstPlaceId/arrive`) overrides `departureMode` for that day). Values `drive|walk|transit|null`; `null` = use the day's `defaultMode`; anything else is `400`.

> **Hotel location.** A hotel is `status: "confirmed"` (default, booked) or
> `"tbd"` (not booked yet). A `tbd` hotel may omit `name` and send only `area`
> (e.g. `"Dogo Onsen"`); its `name` is then the area, and follows a later
> `area` PATCH while the two are equal.
> 1. **Resolve order:** `googleMapsUrl` → `lat`/`lng` → `query` (+`near`) →
>    `area` → `name, address`. `googleMapsUrl`, `query` and `near` are used to
>    resolve and are never stored. Lookups share the caps above.
> 2. **Address-only geocodes:** a POST or PATCH with only an `address` (no
>    coordinates, link, query or area) now geocodes `name, address` (1 lookup).
>    This is an intended change; before, hotel addresses were never geocoded.
> 3. **PATCH re-resolves only on new location input:** a `googleMapsUrl`, a
>    `query`, or an `area`/`address` that differs from the stored one (and no
>    `lat`/`lng`). A PATCH like `{ notes }` makes no lookup. If the lookup is
>    skipped or finds nothing, the stored pin is kept and you get the warning.
>    A new `address` is looked up as `name, address`; the stored `area` is used
>    only when you send `area`. A `googleMapsUrl` that can't be read keeps the
>    stored pin too (no name/address fallback on PATCH).
> 4. **`coordsApprox`** is read-only: `true` when the pin came from a geocode
>    (`area`/`address`/`query`) or a viewport link, `false` for an exact link or
>    your own `lat`/`lng`. When you copy `lat`/`lng` from an approximate result
>    (e.g. a dryRun preview), also send `coordsApprox: true` to keep it
>    approximate. `coordsApprox: false`, or `coordsApprox` without `lat`/`lng`,
>    has no effect; a non-boolean `coordsApprox` is a `400 bad_request`.
> 5. **Confirm a booking:** `PATCH /hotels/:hotelId { "status": "confirmed",
>    "name": "Dogo Grand Hotel", "googleMapsUrl": "https://maps.app.goo.gl/…" }`
>    gives the hotel its exact pin and `coordsApprox: false`.


## Not in v1

Invites/memberships are not writable via the API (UI only). Leg
mode/duration/note are written via `arrive`; place/day reordering is not
exposed. `POST /trips/import` always creates a **new** trip (no import into an
existing one) and does not accept transport/expenses/notes — add those in the
app.
