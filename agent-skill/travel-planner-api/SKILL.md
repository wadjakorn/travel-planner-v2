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

Ask the user for their host and token if not already known, then export them:

```bash
export TP_HOST="https://travel-planner-v2-eight.vercel.app"   # or their host
export TP_TOKEN="tp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"   # from Settings → API access
```

The token is minted in the app: **Account → Settings → API access → Create
token**. It is shown once (`tp_…`), stored only as a hash, and can be revoked
any time. A missing/invalid/revoked token returns `401`.

> Tokens are **read-write** by default. If you mint a **read-only** token, write
> calls (`POST`/`PATCH`/`DELETE`) return `403 forbidden` — mint a read-write
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
- **Send `Idempotency-Key` on every POST** (see §4). Retrying without one
  double-creates.
- **Dates are `YYYY-MM-DD` strings.** Timestamps (`at`) are ISO
  `2026-09-01T08:30:00Z`.
- **`*` fields are required.** Omitting one → `400 bad_request`.
- **Parse the JSON, branch on `error`.** Every failure is
  `{ "error": <code>, "message": <text> }`.

## 2. Core workflow — build a plan

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

## 3. Endpoint map

| Method & path | Body | Result |
|---------------|------|--------|
| `GET /me` | — | `{ user }` — whoami / token check |
| `GET /trips` | — | `{ trips }` — your trips + day/place counts |
| `POST /trips` | `{ title*, subtitle?, startDate?, endDate?, cover? }` | `201 { trip }` — dated trips seed a day per date |
| `GET /trips/:tripId` | — | `{ trip }` with `days[] → places[] / segments[]` |
| `PATCH /trips/:tripId` | any of `title, subtitle, startDate, endDate, cover` | `{ trip }` — only sent fields change |
| `DELETE /trips/:tripId` | — | `{ ok }` — soft delete (owner only) |
| `POST /trips/:tripId/days` | — | `201 { day }` — appended |
| `DELETE /days/:dayId` | — | `{ ok, tripId }` — cascades places+segments, re-indexes |
| `POST /days/:dayId/places` | place fields (§6) | `201 { place }` — appended |
| `PATCH /places/:placeId` | full place fields | `{ place }` — **replaces all fields** (`name` required) |
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

## 4. Idempotency (send it on every POST)

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

## 5. Errors

| Status | `error` | Meaning / what to do |
|--------|---------|----------------------|
| 400 | `bad_request` | bad/missing JSON, bad field, empty required value — fix the body |
| 401 | `unauthorized` | missing/invalid/revoked token — ask user for a new one |
| 403 | `forbidden` | trip exists but this token can't touch it — wrong account |
| 404 | `not_found` | no such trip/day/place — re-read to get valid ids |
| 409 | `conflict` | idempotency-key reuse with a different/in-flight request |
| 500 | `internal` | server error — retry once, then report to the user |

## 6. Place fields

```jsonc
{
  "kind": "hotel | food | sight | transit",  // required
  "name": "string",                          // required
  "category": "string?",
  "rating": 4.5, "reviews": 1200,
  "time": "8:30 AM?", "duration": "1h?", "price": "¥1200?",
  "address": "string?", "phone": "string?", "website": "string?", "hours": "string?",
  "tags": ["dinner"],
  "thumb": "url?", "note": "string?",
  "lat": 35.0, "lng": 135.7,
  "placeIdExternal": "google-place-id?"
}
```

`PATCH /places/:placeId` **replaces every field** — send the full object you
want, not just the delta (`name` is required). Everything else patches only the
fields you send.

## 7. Not available via API

- Invites / memberships (UI only).
- `GET /trips` is owner-scoped — trips shared with you are reachable by id but
  not listed.
- Place/day reordering and segment travel-modes are not exposed.
- Checklist-item reorder + toggle-by-flip are web-only; via API set `done`
  explicitly on `PATCH /items/:itemId`.

## 8. Etiquette

- Confirm destructive actions (`DELETE`, or a `PATCH /places` that drops fields)
  with the user before sending.
- After a batch of writes, `GET /trips/:tripId` once and show the user the
  resulting plan rather than narrating each call.
