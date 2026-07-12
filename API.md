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
                      "placeIdExternal": "ChIJ…", "time": "10:00" } ] },
      { "date": "2026-11-02",
        "places": [ { "kind": "sight", "name": "Kiyomizu-dera" } ] }
    ],
    "hotels": [ { "name": "Hotel Granvia", "checkInDate": "2026-11-01", "checkOutDate": "2026-11-02",
                  "placeIdExternal": "ChIJ…", "costAmount": 50000, "costCurrency": "JPY" } ]
  }'
# -> 201 { "trip": { …, "days": [...], "hotels": [...] } }
```

Rules:
- **Always creates a new trip** (owned by the token's user). Idempotent via
  `Idempotency-Key`.
- Each place/hotel needs a **`name`**; include **`lat`/`lng`** so it renders on
  the map. A Google Place ID goes in **`placeIdExternal`** (stored as a
  reference — the API does **not** call Google).
- `days` and `hotels` are optional. If you pass a date range but no `days`, the
  day skeleton is created for you.
- **Atomic:** any validation error returns `400` and creates nothing.
- **Caps:** ≤ 60 days, ≤ 100 places/day, ≤ 50 hotels (else `400`).
- Transport, expenses, and notes are not importable yet — add those in the app.

The `201` response is the full created plan (same nested shape as
`GET /trips/:tripId`), so you get every generated id back.

## Endpoints

| Method & path | Body | Result |
|---------------|------|--------|
| `POST /trips/import` | `{ trip{title*,…}, days[{date?, places[]}], hotels[] }` | `201 { trip }` — new trip with days+places+hotels, created atomically. Idempotent. See above. |
| `GET /trips` | — | `{ trips: [...] }` — your trips with day/place counts |
| `POST /trips` | `{ title*, subtitle?, startDate?, endDate?, cover? }` | `201 { trip }`. Dated trips seed one day per date. Idempotent. |
| `GET /trips/:tripId` | — | `{ trip }` with nested `days[] → places[] / segments[]` **and `hotels[]`** |
| `PATCH /trips/:tripId` | any of `title, subtitle, startDate, endDate, cover` | `{ trip }` — only provided fields change |
| `DELETE /trips/:tripId` | — | `{ ok: true }` — soft delete (owner only) |
| `POST /trips/:tripId/days` | — | `201 { day }` — appended at the end. Idempotent. |
| `DELETE /days/:dayId` | — | `{ ok, tripId }` — cascades places+segments, re-indexes survivors |
| `POST /days/:dayId/places` | place fields (below) | `201 { place }` — appended at end of the day. Idempotent. |
| `PATCH /places/:placeId` | full place fields | `{ place }` — **replaces all fields** (`name` required) |
| `DELETE /places/:placeId` | — | `{ ok, tripId }` — re-indexes survivors + realigns segments |

`*` = required. Dates are ISO `YYYY-MM-DD` strings.

### Hotels & transport (trip-scoped, soft-deleted)

| Method & path | Body | Result |
|---------------|------|--------|
| `GET  /trips/:tripId/hotels` | — | `{ hotels: [...] }` |
| `POST /trips/:tripId/hotels` | `{ name*, checkInDate?, checkOutDate?, nights?, room?, guests?, ref?, costAmount?, costCurrency?, address?, lat?, lng?, … }` | `201 { hotel }`. Idempotent. |
| `PATCH /hotels/:hotelId` | any hotel field | `{ hotel }` |
| `DELETE /hotels/:hotelId` | — | `{ ok, tripId }` |
| `GET  /trips/:tripId/transport` | — | `{ transport: [...] }` |
| `POST /trips/:tripId/transport` | `{ type*, title*, provider?, fromCode?, toCode?, fromTime?, toTime?, costAmount?, … }` | `201 { transport }`. Idempotent. `type` ∈ flight/train/car/ferry. |
| `PATCH /transport/:transportId` | any transport field | `{ transport }` |
| `DELETE /transport/:transportId` | — | `{ ok, tripId }` |

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
  "placeIdExternal": "google-place-id?"
}
```

## Not in v1

Invites/memberships are not writable via the API (UI only). Trip listing is
owner-scoped — trips shared with you via membership are reachable by id but not
yet in `GET /trips`. Segment travel-modes and place/day reordering are not yet
exposed. `POST /trips/import` always creates a **new** trip (no import into an
existing one) and does not accept transport/expenses/notes — add those in the
app.
