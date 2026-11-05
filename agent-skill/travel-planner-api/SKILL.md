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

> **Using an MCP client?** Travel Planner also runs an MCP server at `/api/mcp`, with the same PAT. Its tools wrap this API, and creating or editing a trip requires a preview first. See `docs/MCP.md`. The rest of this skill covers the REST API.

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

## 0.5 Ask before you build

Do not guess the basics. Before creating anything, ask the user (one short
message, not an interrogation) and wait for the answers:

- **Destination** and **dates** (start/end, or how many days).
- **Travellers** — how many people (this is also `budget.travelers`).
- **Budget and its currency** — amount, whether it is total / per person / per
  day, and which currency (e.g. THB or JPY).
- **Already booked?** Flights, hotels, car/rental — and if booked, the details
  (times, hotel name, dates). Anything not booked stays unbooked: do not invent it.
  A hotel the user hasn't booked is `"status": "tbd"` + `area`, never an
  invented hotel (§2).
- **Pace** — relaxed or packed.

**Recommended flow:**

1. Build the import body. For each place send real `lat`/`lng` if you know
   them; otherwise send a `query` **with `near`** (the city or the previous
   stop) and let the server resolve it (§2). Use `GET /places/search` (§6a)
   when you need to pick between several matches yourself.
2. `POST /trips/import` with `"dryRun": true`.
3. **Show the user a summary** (days, places, hotels, transport, budget, every
   warning) and **wait for an explicit "yes"**.
4. Only then send the real `POST /trips/import` (reuse the preview's coords, §2).

> **Never commit without the user's confirmation.** `dryRun` is not approval.
> If you told the user you would show them the plan first, do exactly that. If
> they ask for changes, edit the body and `dryRun` again.

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
- **Clock times are `HH:mm`, 24-hour, always** (`"08:30"`, `"14:05"`) — place
  `time`, transport `fromTime`/`toTime`, hotel `checkInTime`/`checkOutTime`.
  Never `"8:30 AM"`. (The API stores the string as sent and does not reject
  other formats, but a consistent 24-hour value keeps the day sorted and
  rendered correctly.)
- **Never invent data.** No placeholder names, no random picks the user did not
  agree to — ask, or leave the field out (see §2 hotels / transit).
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
                    "status": "confirmed", "sourceUrl": "https://example.com/nishiki" },
                  { "kind": "sight", "name": "Fushimi Inari", "lat": 34.967, "lng": 135.773,
                    "arrive": { "mode": "transit", "durationMin": 25, "note": "JR Nara line" } } ] },
    { "date": "2026-11-02",
      "places": [ { "kind": "sight", "name": "Kiyomizu-dera", "lat": 34.9949, "lng": 135.785,
                    "placeIdExternal": "ChIJ…", "time": "09:00", "status": "tbd",
                    "note": "From Kyoto Sta: bus 206, ~20 min" } ] }
  ],
  "hotels": [ { "name": "Hotel Granvia", "checkInDate": "2026-11-01", "checkOutDate": "2026-11-02",
                "placeIdExternal": "ChIJ…", "costAmount": 50000, "costCurrency": "JPY" },
              { "status": "tbd", "area": "Dogo Onsen, Matsuyama",
                "checkInDate": "2026-11-02", "checkOutDate": "2026-11-03" } ],
  "transport": [ { "type": "flight", "title": "NRT → KIX", "fromCode": "NRT", "toCode": "KIX",
                   "dayIdx": 0, "fromDate": "2026-11-01", "fromTime": "08:30",
                   "toDate": "2026-11-01", "toTime": "10:00" } ],
  "expenses":  [ { "category": "food", "amount": 3000, "currency": "JPY", "label": "Dinner" } ],
  "notes":     [ { "kind": "checklist", "title": "Packing" } ],
  "budget":    { "amount": 120000, "basis": "total", "currency": "JPY" }
}' | jq '.trip | {id, days:(.days|length), hotels:(.hotels|length)}'
```

Input dates are **ISO `YYYY-MM-DD`** (`trip.startDate/endDate`, each `day.date`).
In the response each day carries both a display `date` (e.g. `"Saturday, November 1"`, or
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
  free-text **`query`**, ideally with **`near`** (a `{lat,lng}` object or a
  `"lat,lng"` string, e.g. the city or the previous stop). The server runs the
  same Google place search as `GET /places/search` (§6a), with `near` as a
  location bias. A hit fills exact `lat`/`lng`, `address` and
  `placeIdExternal`, with no warning. Each lookup counts against the same daily
  place-search limit as §6a (200/day per user). If Google is unavailable or that
  limit is spent, the server falls back to an approximate geocoder (still biased
  by `near`) and adds `coords_approx`. If nothing matches, the place is kept
  without a pin and you get `place_unresolved`. Per request: at most 50 lookups
  within about 20 s; beyond that you get `lookup_skipped`. Short landmark names
  resolve much better with `near`, so always send it.
- **Travel between stops.** Put the travel *into* a stop on that stop's
  **`arrive`** (`{ mode: drive|walk|transit, durationMin?, note? }`, §7) — e.g.
  the train from A to B goes on B's `arrive`. **Never** add a `kind:"transit"`
  place without a location to stand in for a leg (you get `transit_as_place`).
  Every day with N places gets N−1 legs (default `drive`, no note), so each leg
  has a mode picker in the app; the first stop's `arrive` is the leg from the
  morning hotel and is shown only when a hotel covers the night before (else
  `arrive_without_origin`).
- **Planning status + origin link per place.** `status` is `"confirmed"`
  (default) or `"tbd"`; `sourceUrl` is an http(s) link the place came from
  (other schemes → `400`). The trip itself takes `trip.sourceUrl` too.
- **One call, all sections.** Besides `days`/`hotels` the body accepts
  `transport[]`, `expenses[]`, `notes[]` (same fields as the §4 endpoints; a
  checklist note may also carry `items: [{ text, done? }]`, ≤ 200, created in the
  same call — no follow-up `POST /notes/:id/items`) and a
  `budget` object (`{ amount, basis, caps?, travelers?, currency? }`; `basis` ∈
  `total`/`per_person`/`per_day`; `caps` keys are expense categories;
  `travelers` is a whole number 1–99, the per-person divisor). These are
  part of the **same atomic write** — all-or-nothing with the rest.
- **Transport shows on a day via `dayIdx`.** Each `transport[]` item takes
  `dayIdx` (0-based index into `days[]`, an integer in `0..days-1`; out of range
  → `400`), `fromDate`/`toDate` (`YYYY-MM-DD`) and `fromTime`/`toTime`
  (`HH:mm`), plus `fromCode`/`fromName`/`toCode`/`toName`. A ride appears on a
  day when its `dayIdx` matches that day; with no `dayIdx` it falls back to the
  day whose date equals `fromDate`. With neither it does **not** show in any
  day's itinerary. Set `dayIdx` (and `fromDate`/`fromTime`)
  on every flight/train/ferry/car. The ride is labelled with its `fromTime`.
- **Ride ends have coordinates.** Give a ride `from`/`to` objects:
  `{ name?, lat, lng, placeId? }`, `{ googleMapsUrl }` or `{ query, near? }`.
  `name` alone is only a label and looks nothing up; a `googleMapsUrl` that
  can't be read never falls back to a name search; a `query` is searched. Send
  coordinates for airports/stations when you know them (they cost no lookup).
  Example: `"from": { "name": "BKK", "lat": 13.69, "lng": 100.75 },
  "to": { "query": "Kansai International Airport" }`. Transport ends resolve
  after hotels and places on the same lookup budget (`lookup_skipped`, path
  `/transport/<i>/from|to`). Warnings: `transport_without_day` (no `dayIdx`, or
  no matching `fromDate`, so the ride shows on no day) and `iata_code_invalid`
  (flight `fromCode`/`toCode` not 3 uppercase letters; stored as sent).
- **Do not model travel as a `transit` place without coordinates.** A
  `kind:"transit"` place is never geocoded, so it gets no pin (and without a
  `time` it raises `flight_without_time`). Use a transport
  booking with `dayIdx` for real flights/trains/ferries/cars, and put
  getting-there info for ordinary legs (e.g. "bus 206, ~20 min from Kyoto
  Sta") in the **`note`** of the *next* place. A real station or airport with
  real coordinates is fine as a normal place.
- **Hotel not chosen yet.** Never pick a hotel at random and never use a
  placeholder name like "Hotel (to be decided)". Ask the user which hotel they
  have (§0.5); if none is booked, send **`"status": "tbd"`** plus the real
  **`area`** it will be in (e.g. `"area": "Shinjuku, Tokyo"`); `name` may be
  omitted and then defaults to the area. The server geocodes the area to an
  **approximate** pin (`coordsApprox: true`, shown as an area in the app) and the
  hotel shows as not booked. Keep the check-in/out dates so nights are covered.
- **Hotel location.** A hotel resolves like a place: `googleMapsUrl` →
  `lat`/`lng` → `query` (+`near`) → `area` → `name, address`. Hotels are
  resolved **before** places on the same per-request lookup budget, so if the
  budget runs out it is places that get `lookup_skipped`. Hotel warnings carry
  `path: "/hotels/<i>"` (0-based). When you copy a dryRun hotel's `lat`/`lng`
  into the commit, also copy its `coordsApprox` so an area pin stays
  approximate.
- **Currency and `over_budget`.** Hotel `costAmount`/`costCurrency`, transport
  `costAmount`/`costCurrency` and expense `currency` should all be in the
  **budget's currency**. `over_budget` counts only cost rows in that currency;
  rows in any other currency are excluded from the total and produce a
  `budget_currency_mismatch` warning. There is **no FX conversion**, so a THB
  budget with JPY costs will under-count and never convert. Put every cost in the
  budget currency (convert it yourself and say so in `label`/`note`). *(This
  describes behaviour after TP-0139; until that ships, `over_budget` simply sums
  amounts regardless of currency, which is why all costs must share one currency.)*
- **Booking costs already count toward the budget.** Hotel/transport costs
  entered on bookings are included in the total. Do not also log them as
  expenses — that counts the same money twice.
- `days`/`hotels`/`transport`/`expenses`/`notes`/`budget` all optional. A date
  range with no `days` seeds the day skeleton.
- **Atomic:** any bad field anywhere → `400` and nothing is created.
- **Caps:** ≤ 60 days, ≤ 100 places/day, ≤ 50 hotels, ≤ 100 transport, ≤ 500
  expenses, ≤ 100 notes.
- The `201` response is `{ trip, warnings, summary }`: `trip` is the full created plan
  (nested `days → places / segments`, plus `hotels`), so you get every generated
  id back. Each day has `start` and each place its `arrive`.
  In `GET /trips/:tripId` and the import/dryRun `trip`, each non-null `arrive` also carries read-only **`estDistanceKm`** / **`estDurationMin`**: a straight-line (haversine) estimate × a detour factor (drive ×1.3 at 45 km/h, walk ×1.2 at 4.5 km/h, transit ×1.3 with no time estimate). They are `null` when either end has no coordinates; place 0 is measured from the day's begin hotel. No Google call is made. They are a hint, not a route, and are ignored if you send them back. Single place POST/PATCH responses don't include them.
  See §7 for the warning shape and codes.

### Preview first with `dryRun`

Send **`"dryRun": true`** (a real boolean in the body — a string `"true"` is a
`400`) to validate the whole plan, resolve links/queries, and get back a
**preview** of the trip it *would* create plus `warnings[]` — **writing
nothing** and **consuming no idempotency key**. The `200` response is
`{ trip, warnings, summary }`: the `trip` is shaped like a real import (ids are `null`
since nothing was saved) — including each day's `segments` (the N−1 legs it
would write), `start`, and every place's `arrive` — and also echoes the
`sections` you sent. Use it to show
the user the plan and surface warnings before the real `POST`.

```bash
curl -s -X POST "$H/trips/import" "${A[@]}" "${J[@]}" \
  -d '{ "dryRun": true, "trip": { "title": "Kyoto Autumn", "startDate": "2026-11-01", "endDate": "2026-11-02" }, "days": [ … ] }' \
  | jq '{summary, warnings, days: (.trip.days | length)}'
```

**Reuse the preview's coords on commit.** The dry run and the real `POST` are
separate requests, so every `query` / address / link resolved in the preview is
looked up **again** on commit — counting twice against the daily place-search /
geocode limits,
and near that limit the commit can come back `lookup_skipped` for places the
preview did resolve. To avoid both, copy each resolved place's `lat`, `lng`
(and `address` / `placeIdExternal` — the preview now usually sets it) from `.trip.days[].places[]` of the
preview into the commit body. Places that already carry coords are never
geocoded again.

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
  -d '{"type":"flight","title":"BKK → KIX","fromCode":"BKK","toCode":"KIX","dayIdx":0,
       "from":{"name":"BKK","lat":13.69,"lng":100.75},
       "to":{"query":"Kansai International Airport"}}'
# -> 201 { "transport": {…, "fromLat": 13.69, …}, "warnings": [] }
```
On `PATCH /transport/:id`, only the end you send (`from`/`to`) is re-resolved; changing
`fromCode`/`fromName` alone keeps the old pin, so send a new `from` too.

To add an extra day beyond the seeded ones: `POST /trips/:tripId/days` (no
body) → `201 { day }`, appended at the end.

## 3a. Edit an existing trip (`PUT /trips/:tripId/plan`)

Use this to rearrange a trip that already exists. It does **not** create a new trip (that is `import`). One atomic call can:
- reorder places within a day;
- move places between days;
- edit and create places;
- set legs (`arrive`);
- with `prune`, delete the places you left out.

**Flow:**
1. `GET /trips/:tripId`. Note `updatedAt` and every day/place `id`.
2. Build the body:
   - `days` = **every existing day id, in its current order**. Each day may carry `title`, `defaultMode` and `places`.
   - In `places`:
     - `{ "id": … }` keeps a place at that position.
     - Adding fields edits it as a merge-patch: absent = unchanged, `null` = clear.
     - An item without `id` creates a place, with the same fields as import (`query`/`near` allowed).
     - A known id listed under another day moves it there.
3. `PUT` with `"dryRun": true`. Show the user `diff` (created / updated / moved / deleted places, day fields, legs) and `warnings`. **Wait for a yes.**
4. `PUT` the same body without `dryRun`, with `"ifUpdatedAt": "<updatedAt from step 1>"` and an `Idempotency-Key`.

```bash
curl -s -X PUT "$H/trips/$TRIP/plan" "${A[@]}" "${J[@]}" -H "Idempotency-Key: $(uuidgen)" -d '{
  "ifUpdatedAt": "2026-11-06T03:12:45.120Z",
  "dryRun": true,
  "days": [
    { "id": "D1", "places": [ { "id": "P3" }, { "id": "P1", "time": "10:00" } ] },
    { "id": "D2", "title": "Kyoto", "places": [
        { "id": "P7" },
        { "kind": "food", "name": "Nishiki Market", "query": "Nishiki Market Kyoto",
          "arrive": { "mode": "walk", "durationMin": 10 } } ] }
  ] }' | jq '{diff, summary}'
```

**Rules:**
- **A place you leave out:**
  - Without `prune`, it stays and is appended at the end of its day.
  - With `"prune": true`, it is **deleted**. `prune` requires `ifUpdatedAt`.
  - A day with no `places` key is untouched, except for places moved out of it.
- **`arrive`** is the leg *into* that place at its new position. Leg notes follow their place pair when places move.
- **Pins:**
  - An edited place keeps its pin unless you send `lat`/`lng`, a `googleMapsUrl`, or a changed `address` (same as `PATCH /places`).
  - `query`/`near` only work on new places.
- **Response:** `200 { trip, diff, warnings, summary }`. A dryRun returns `trip: null`.
- **`409 conflict`** means the trip changed since your GET (`reason: version_mismatch`, with `details.updatedAt`), or while the call ran (`reason: plan_changed`). GET again, rebuild the body, and retry.
- **Not here yet.** These return `400` with a `reason` that names what to use instead:

| What | `reason` | Use instead |
|---|---|---|
| Add a day | `day_order_unsupported` | `POST /trips/:tripId/days`, then PUT |
| Reorder or remove days | `day_order_unsupported` | (not available) |
| Day `date` | `unsupported_field` | — |
| `trip`/`budget` | `unsupported_section` | `PATCH /trips/:tripId` |
| `hotels`/`transport`/`expenses`/`notes` | `unsupported_section` | their own endpoints |

Other `reason`s: `unknown_id`, `duplicate_id`, `version_required`, `bad_field`.

## 4. Endpoint map

| Method & path | Body | Result |
|---------------|------|--------|
| `GET /me` | — | `{ user }` — whoami / token check |
| `GET /places/search` | `?q=<text>*&near=<lat,lng>&radius=<m>` (query string) | `200 [{ placeId, name, lat, lng, address, types? }]` — Google place search by name (§6a) |
| `POST /trips/import` | `{ trip{title*,sourceUrl?,…}, days[{date?, places[{…, arrive?}]}], hotels[], transport[], expenses[], notes[], budget, dryRun? }` | `201 { trip, warnings, summary }` — whole plan in one atomic call; `dryRun:true` → `200` preview, no write (§2) |
| `PUT /trips/:tripId/plan` | `{ ifUpdatedAt?, prune?, dryRun?, days[{id*, title?, defaultMode?, places?[{id?, …place fields, arrive?}]}] }` | `200 { trip, diff, warnings, summary }`: reorder, move across days, edit, create and (with `prune`) delete places in one atomic call (§3a) |
| `GET /trips` | — | `{ trips }` — owned + shared trips, day/place counts, your `role` |
| `POST /trips` | `{ title*, subtitle?, startDate?, endDate?, cover? }` | `201 { trip }` — dated trips seed a day per date |
| `GET /trips/:tripId` | `?status=confirmed\|tbd` (optional) | `{ trip }` with `days[] → places[] / segments[]` **and `hotels[]`**; each day has `date`+`dateIso`; trip has `url`, `budget`, `currency`, `sourceUrl`, `tbdCount` (§7). `?status=` filters places; `tbdCount` is always the whole-trip total |
| `PATCH /trips/:tripId` | any of `title, subtitle, startDate, endDate, cover, budget, currency, sourceUrl` | `{ trip }` — only sent fields change; `sourceUrl` must be http/https |
| `DELETE /trips/:tripId` | — | `{ ok }` — soft delete (owner only) |
| `POST /trips/:tripId/days` | — | `201 { day }` — appended |
| `DELETE /days/:dayId` | — | `{ ok, tripId }` — cascades places+segments, re-indexes |
| `POST /days/:dayId/places` | place fields (§7) | `201 { place, warnings }` — appended |
| `PATCH /places/:placeId` | any place field, `googleMapsUrl?`, `arrive?` | `{ place, warnings }` — **merge-patch**: absent = unchanged, `null` = clear (`name`/`kind` can't be cleared). See §7 pin rules |
| `DELETE /places/:placeId` | — | `{ ok, tripId }` |
| `PUT /places/:placeId/arrive` | `{ mode*, durationMin?, note? }` (the arrive object itself) | `{ arrive, tripId }` — sets the leg into this place (first place: the day's start leg) |
| `DELETE /places/:placeId/arrive` | — | `{ arrive: null, tripId }` — clears the leg's note/duration (mode kept); on the first place clears the start leg |
| `GET/POST /trips/:tripId/hotels` | `{ name* (optional when tbd + area), status? (confirmed\|tbd), area?, checkInDate?, checkOutDate?, nights?, room?, guests?, ref?, costAmount?, costCurrency?, address?, lat?, lng?, googleMapsUrl?, query?, near?, attachmentName?, attachmentSize?, … }` — `googleMapsUrl`/`query`/`near` resolve the pin and are not stored; response has read-only `coordsApprox` | list / `201 { hotel, warnings }` |
| `PATCH/DELETE /hotels/:hotelId` | any hotel field, incl. `status`, `area`, `googleMapsUrl`, `query`, `near` (only new location input re-resolves; a failed re-resolve keeps the pin). `arrivalMode` = travel mode of the last leg of the day arriving at this hotel; `departureMode` = leg leaving the hotel (applies to every night of the stay, except that a first-stop `arrive` (`PUT /places/:firstPlaceId/arrive`) overrides `departureMode` for that day). Values `drive|walk|transit|null`; `null` = use the day's `defaultMode`; anything else is `400`. | `{ hotel, warnings }` / `{ ok, tripId }` |
| `GET/POST /trips/:tripId/transport` | `{ type*, title*, provider?, fromCode?, toCode?, fromTime?, toTime?, costAmount?, from?, to?, … }` | list / `201 { transport, warnings }`. `type` ∈ flight/train/car/ferry |
| `PATCH/DELETE /transport/:transportId` | any transport field, incl. `from`/`to` (only the end sent re-resolves; a failed lookup keeps the pin) | `{ transport, warnings }` / `{ ok, tripId }` |
| `GET/POST /trips/:tripId/expenses` | `{ category*, amount*, currency?, label?, dayIdx?, paidBy?, note?, at?, splits? }` | list (with splits) / `201 { expense }`. `at` = ISO datetime, defaults now |
| `PATCH/DELETE /expenses/:expenseId` | any expense field + optional `splits` | `{ expense }` (splits replace all) / `{ ok, tripId }` |
| `GET/POST /trips/:tripId/notes` | `{ kind*, title*, body? }` | `GET` → `{ notes: [ { id, tripId, idx, kind, title, body, createdAt, updatedAt, deletedAt, items: [ { id, noteId, idx, text, done, updatedAt } ] } ] }` (ordered by `idx`; `items` is `[]` for a doc) / `POST` → `201 { note }`. `kind` ∈ checklist/doc |
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
| `near` | no | bias point: `"lat,lng"` (e.g. `13.75,100.5`), JSON `{"lat":..,"lng":..}`, or `near[lat]=..&near[lng]=..` |
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

### Many names at once: `POST /places/search/batch`

```bash
curl -s -X POST "$H/places/search/batch" "${A[@]}" "${J[@]}" -d '{
  "queries": [
    { "key": "kiyomizu", "q": "Kiyomizu-dera" },
    { "key": "nishiki",  "q": "Nishiki Market", "near": { "lat": 35.005, "lng": 135.765 }, "radius": 3000 }
  ] }' | jq '.results[] | {key, top: (.results[0].name // .error)}'
```

- **Limits:**
  - Up to **25** queries per request. The batch counts as **one** request against the per-token limit, so you don't need `sleep`.
  - Each query still uses **one** unit of the daily place-search quota.
  - Needs a **read-write** token, because it is a POST. A read token can only use the GET search.
- **Response:** `200 { results: [...] }` in the same order as your queries.
  - Each entry is `{ key, results }` on success, or `{ key, error: { status, message } }` when that query failed. A `429` here means the daily quota ran out partway through the batch.
  - One failed query never fails the others.
- **Request errors:** a malformed body (empty, over 25 queries, a missing `q`, or a bad `near`/`radius`) returns `400` for the whole request.

## 7. Place fields

```jsonc
{
  "kind": "hotel | food | sight | transit",  // required
  "name": "string",                          // required
  "status": "confirmed | tbd?",              // default "confirmed"
  "sourceUrl": "https://…?",                 // origin link; http/https only
  "category": "string?",
  "rating": 4.5, "reviews": 1200,
  "time": "08:30?",                          // HH:mm 24h only
  "duration": "1h?", "price": "¥1200?",
  "address": "string?", "phone": "string?", "website": "string?", "hours": "string?",
  "tags": ["dinner"],
  "thumb": "url?", "note": "string?",                          // free text; e.g. how to get here from the previous stop
  "lat": 35.0, "lng": 135.7,
  "query": "free-text search?",              // import only: resolve coords server-side
  "near": { "lat": 35.0, "lng": 135.7 },     // import only: bias point for `query` ({lat,lng} or "lat,lng")
  "placeIdExternal": "id?",
  "googleMapsUrl": "https://maps.app.goo.gl/…?",  // max 2048 chars
  "arrive": { "mode": "drive | walk | transit", "durationMin": 25, "note": "JR line?" }  // travel INTO this place
}
```

`status` (`confirmed`/`tbd`) and `sourceUrl` (http/https, else `400`) are
accepted on place create, place `PATCH`, and each place in import. `query`/`near`
are import-only resolve-time inputs (see §2); `near` is a `{lat,lng}` object or a
`"lat,lng"` string.

`arrive` is the travel **into** this place: `mode` is required; `durationMin` is
an integer 0–2880; `note` is at most 500 chars (blank → `null`). Anything else →
`400`. On the first place of a day it is the start leg from the morning hotel.
Accepted on place create, place `PATCH`, and each place in import. `null`
clears it only on place `PATCH` (or use `PUT`/`DELETE /places/:placeId/arrive`);
on create `arrive: null` is ignored, and in import it means no leg detail.
`GET /trips/:tripId` returns `arrive` on every place and `start` on
every day.
Hotel legs use `PATCH /hotels/:id` (`arrivalMode`/`departureMode`), not `arrive` — EXCEPT the morning hotel → first stop leg, which is that first place's `arrive` (`PUT /places/:firstPlaceId/arrive`); once set, it overrides `departureMode` for that day.

> **Place location.**
> 1. Always send `name`, plus `address` (or at least the city). If you send no coordinates but do send an `address`, the server tries to geocode `name, address`. This is best-effort and capped, and never applies to `transit`. A place with only a name gets no pin.
> 2. If you found a real Google Maps link (`maps.app.goo.gl/…` or `google.com/maps/place/…`), send it as `googleMapsUrl`. It gives an exact pin. Do not build one yourself.
> 3. Never invent `query_place_id`, a CID, `placeIdExternal` or coordinates.
> 4. Check `warnings[]` in the response. `coords_approx`, `coords_mismatch` and `url_unresolved` mean the pin may be wrong. To move a pin, `PATCH` the place with `lat`/`lng` and **without** `googleMapsUrl`.

**Warnings.** `POST /days/:dayId/places` and `PATCH /places/:placeId` return
`{ place, warnings }`; `POST /trips/import` returns `{ trip, warnings, summary }` (201,
on an idempotent replay, and as the `200` `dryRun` preview). A warning never
fails the request — it flags something worth checking.

Base shape is **`{ code, message }`** (place/hotel/transport endpoints).

On `import`/`dryRun` the response is **`{ trip, warnings, summary }`**, with
**one entry per place, hotel, ride, day or budget**:

```json
{ "code": "place_unresolved",
  "codes": ["place_unresolved", "place_without_coords"],
  "path": "/days/0/places/3", "name": "Awaji Akashi Kaikyo Park",
  "message": "The \"query\" search returned no match; …",
  "details": [{ "code": "place_unresolved", "path": "/days/0/places/3", "message": "…" },
              { "code": "place_without_coords", "path": "/days/0/places/3", "message": "…" }] }
```

- **`path`** — 0-based JSON pointer to the entity: `/days/<i>/places/<j>`,
  `/hotels/<i>`, `/transport/<i>`, `/days/<i>` or `/budget`. Index your request
  body with it directly.
- **`name`** — the place / hotel (or its `area`) / ride `title`, when known.
- **`codes`** — every code for that entity; `code` is the first (the root cause,
  e.g. `place_unresolved` before the `place_without_coords` it implies). Filter
  on `codes`, not `code`.
- **`details`** — only when more than one warning merged: each original warning
  with its exact sub-path (e.g. `/transport/0/from` vs `/to`,
  `/days/0/places/0/arrive`).
- **`summary`** — `{ [code]: count }` over all `codes`, e.g.
  `{"place_unresolved":26,"place_without_coords":33}`: read it first.
- `day` / `place` (1-based) still appear on place-link entries but are
  **deprecated** — use `path`.

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
| `transit_as_place` | a `transit` place has no coords, address or link — it is a leg, not a stop; put the travel on the next stop's `arrive` instead |
| `arrive_without_origin` | a day's first stop has `arrive` but no hotel covers the night before; it is stored but not shown (import/dryRun) |
| `long_drive_day` | the day has more than 4 h of `drive` legs, counting the start leg, every stop-to-stop leg and the leg to the night's hotel. Each leg uses its `durationMin`, else `estDurationMin`, and legs with neither are skipped. On `/days/<i>`, import/dryRun only |
| `hotel_without_location` | a hotel has no `lat`/`lng` (nothing resolved); it won't appear on the map — send `area`, `query`, `googleMapsUrl` or `lat`/`lng` |
| `hotel_without_dates` | a `tbd` hotel has no `checkInDate`/`checkOutDate`; it won't appear on any itinerary day |
| `over_budget` | estimated spend (hotels + expenses) exceeds the trip `budget` (import/dryRun); a `per_person` budget is checked only when `budget.travelers` is set. Only cost rows in the budget's currency count |
| `budget_currency_mismatch` | a hotel/transport/expense cost is in a currency other than the budget's; it was excluded from the `over_budget` total (no FX conversion). Put costs in the budget currency (import/dryRun) |

**Pin precedence:** exact pin from the link, then your `lat`/`lng`, then the
link's viewport, then a geocode. A geocode runs only when the place still has no
coordinates, it has a link or an `address`, and `kind` is not `transit`. A
geocode never sets `placeIdExternal`.

**Caps:** 50 lookups and a 20 s deadline per request; 300 geocodes per user per
24 h window, starting at the first geocode. Past a cap the place is still
saved and gets `lookup_skipped`.

`googleMapsUrl` is an optional string, at most 2048 chars (else `400
bad_request`). It is accepted on place create, place `PATCH` and each place in
import, and on hotels (create, PATCH, import).

**Place PATCH pin rules (merge-patch, since 2026-11):**
- No location input (no `googleMapsUrl`, no changed `address`, no `lat`/`lng`) → the pin and `placeIdExternal` stay.
- `lat`/`lng` sent → written as sent (both together; `null`/`null` clears the pin). No lookup.
- `googleMapsUrl` sent → re-pins from the link.
- `address` **changed** and `lat`/`lng` not sent → re-geocodes (pin becomes approximate, `placeIdExternal` is dropped).
- A re-resolve that finds nothing **keeps the stored pin** and returns the warning (`place_unresolved` / `url_unresolved` / `lookup_skipped`).

To move a place pin exactly, PATCH `lat`/`lng` without `googleMapsUrl`. Hotel PATCH follows the same idea: only new location input re-resolves, and a failed re-resolve keeps the pin.

`PATCH /places/:placeId` is a **merge-patch** (changed 2026-11; it used to
replace every field): send only what changes. Absent = unchanged, `null` =
clear (`status: null` → `confirmed`, `tags: null` → `[]`). `name` and `kind`
cannot be cleared (`400`); `lat` and `lng` must be sent together (`400`).

Place responses include read-only **`googleStatus`** (`OPERATIONAL`,
`CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`, `NOT_FOUND`, `INVALID` or `null`;
set from Google and refreshed periodically in Google mode (each place at most every ~25 days, within a daily budget), ignored on write). Google-sourced `rating`, `reviews` and
`hours` read as `null` after 30 days; values you set yourself never expire.

**Trip-level fields (`GET /trips/:tripId`).** Alongside `days[]`/`hotels[]`, the
trip object carries:
- `url` — canonical public link to the trip (read-only, derived).
- `budget` — the stored budget config `{ amount, basis, caps, travelers }` or
  `null` (`basis` ∈ `total`/`per_person`/`per_day`; `caps` is
  `{<category>: number}`; `travelers` is the per-person divisor, 1–99 — absent
  means owner + editors). A config may carry only `travelers`
  (`{ amount: null, basis: "total", travelers: 4 }`).
- `currency` — the 3-letter comparison currency, or `null`.
- `sourceUrl` — the trip's origin link, or `null`.
- `tbdCount` — count of `status:"tbd"` places across the whole trip (independent
  of any `?status=` filter).
- `tbdHotelCount` — count of `status:"tbd"` (not yet booked) hotels on the trip.

Set `budget` / `currency` / `sourceUrl` via `PATCH /trips/:tripId` (§4);
`sourceUrl` must be http/https (else `400`), and a `null`/`""` clears a field.
**`budget` is replaced as a whole on PATCH, except `travelers`:** send every
`amount`/`basis`/`caps` key you want to keep — a PATCH without `caps` clears
them. `travelers` (the trip's headcount) changes only when you name it:
omitting it, or sending `budget: null`, keeps the stored count;
`"travelers": null` clears it (back to owner + editors). `travelers` outside
1–99 or not a whole number → `400`.

## 8. Not available via API

- Invites / memberships (UI only).
- **Day** reordering or removal through the plan call is not exposed. Places can be reordered and moved between days with `PUT /trips/:tripId/plan` (§3a). Leg travel modes are writable through
  each place's `arrive` (create/`PATCH`/import/plan) or `PUT /places/:placeId/arrive`.
- Checklist-item reorder + toggle-by-flip are web-only; via API set `done`
  explicitly on `PATCH /items/:itemId`.
- `POST /trips/import` only creates a **new** trip. To change an existing one,
  use `PUT /trips/:tripId/plan` (§3a).

## 9. Etiquette

- Confirm destructive actions (`DELETE`, or a `PATCH /places` that drops fields)
  with the user before sending.
- After a batch of writes, `GET /trips/:tripId` once and show the user the
  resulting plan rather than narrating each call.
