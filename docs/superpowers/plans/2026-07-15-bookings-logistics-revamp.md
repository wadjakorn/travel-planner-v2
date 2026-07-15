# Bookings & Logistics Revamp — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-15-bookings-logistics-revamp-design.md`
**PM tickets:** `OX0Bm-Pxnjmm` (Bookings page), `oC31FrNn-WZi` (transport → itinerary)

**Goal:** Consolidate Hotels + Transport into one mobile-first **Bookings**
(travel-wallet) page, and surface transport bookings on the itinerary list via
the existing `dayIdx`, matching the hotel synthetic-stop pattern. No schema or
server-action changes.

**Architecture:** Pure merge/sort/gap logic (`bookings-merge.ts`) and the
transport augmentation in `day-augment.ts` are unit-tested first (TDD). UI is
composed from existing loaders + server actions and verified visually. Old
`/hotels` and `/transport` routes redirect to `/trip/[id]/bookings`.

**Tech stack:** Next.js 15 App Router (RSC + client components), React 19,
TypeScript, Drizzle/Postgres (read-only here), CSS Modules, vitest.

## Global constraints

- No DB migration; no change to server-action signatures.
- Do not change the web-facing shape of `loadTrip`/`loadHotelsForTrip`/
  `loadTransportForTrip` — add new functions, compose existing ones.
- Preserve the single persistent-map Dynamic Maps load (Maps #3b).
- Keep `pnpm typecheck` + `pnpm lint` + `pnpm test` green after every task.
- Import the maps key only via `@/lib/maps-config` (not touched here, but noted).
- Amber `#C2591B` = stays, teal `#1B6E8C` = transport (wayfinding code).

## File structure

```
app/src/
  app/trip/[id]/bookings/page.tsx        (new route)
  app/trip/[id]/hotels/page.tsx          (→ redirect)
  app/trip/[id]/transport/page.tsx       (→ redirect)
  components/bookings-view.tsx           (new orchestrator, client)
  components/booking-card-stay.tsx       (new)
  components/booking-card-ride.tsx       (new)
  components/bookings-view.module.css    (new)
  components/trip-rail.tsx               (edit: one Bookings item)
  components/days-accordion.tsx          (edit: render ride rows)
  lib/bookings-merge.ts                  (new, pure)
  lib/bookings-merge.test.ts             (new)
  lib/day-augment.ts                     (edit: transport augmentation)
  lib/day-augment.test.ts                (new or extend)
  lib/trip-queries.ts                    (edit: loadBookingsForTrip)
  app/trip/[id]/layout.tsx | page.tsx    (edit: load transport)
AGENTS-INDEX.md                          (edit: file map)
```

---

## Phase A — Bookings page (ticket `OX0Bm-Pxnjmm`)

### Task 1: Pure merge/sort/gap helpers

**Files:** `app/src/lib/bookings-merge.ts`, `app/src/lib/bookings-merge.test.ts`

**Interfaces:**
```ts
export type BookingItem =
  | { kind: 'stay'; date: string | null; hotel: HotelBooking }
  | { kind: 'ride'; date: string | null; transport: TransportBooking };
export function mergeBookings(hotels: HotelBooking[], transport: TransportBooking[]): BookingItem[];
export function gapNights(hotels: HotelBooking[]): string[]; // ISO dates with no stay between first check-in and last check-out
```

- [ ] **Step 1: Write failing tests** — mixed stay/ride ordering by date
  (`checkInDate` / `fromDate`); items with null dates sort last, stable;
  `gapNights` returns the uncovered night(s) between consecutive stays; empty
  inputs → `[]`. Reuse the half-open `[checkIn, checkOut)` convention already in
  `hotels-view.tsx`.
- [ ] **Step 2: Run tests, verify they fail** — `pnpm test bookings-merge`
- [ ] **Step 3: Implement `bookings-merge.ts`** (pure, no server-only imports)
- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: `pnpm typecheck`**
- [ ] **Step 6: Commit** — `feat(bookings): pure merge/sort/gap helpers [BOOK]`

### Task 2: `loadBookingsForTrip` query

**Files:** `app/src/lib/trip-queries.ts`

- [ ] **Step 1: Add `loadBookingsForTrip(tripId)`** composing existing
  `loadHotelsForTrip` + `loadTransportForTrip`, returning `mergeBookings(...)`.
  Do not alter the existing loaders.
- [ ] **Step 2: `pnpm typecheck`**
- [ ] **Step 3: Commit** — `feat(bookings): loadBookingsForTrip composer [BOOK]`

### Task 3: Card components

**Files:** `booking-card-stay.tsx`, `booking-card-ride.tsx`,
`bookings-view.module.css`

- [ ] **Step 1: Build `booking-card-ride.tsx`** — boarding-pass: `fromCode →
  toCode`, carrier·flight, departure date/time; perforated stub seat·ref·fare;
  expandable detail with cross-link chips + Ticket PDF/Edit. Port markup/styles
  from the prototype (`docs/superpowers/specs/2026-07-15-bookings-prototype.html`).
- [ ] **Step 2: Build `booking-card-stay.tsx`** — key-card: name, nights badge,
  area/room; stub check-in·conf·total; expand → chips + Voucher/Map/Edit. Reuse
  `computeNights`, `formatCost`, `pastelFromName` from `hotels-view.tsx` (extract
  to a shared util if cleaner).
- [ ] **Step 3: Wire delete/edit** to existing actions (`removeHotelAction`,
  `removeTransportAction`, hotel edit launcher / transport edit href).
- [ ] **Step 4: `pnpm lint` + `pnpm typecheck`**
- [ ] **Step 5: Commit** — `feat(bookings): stay + ride document cards [BOOK]`

### Task 4: `bookings-view.tsx` orchestrator + route

**Files:** `bookings-view.tsx`, `app/trip/[id]/bookings/page.tsx`

- [ ] **Step 1: Build `bookings-view.tsx`** (client) — header, segmented filter
  (All/Stays/Transport), date-grouped list, gap markers from `gapNights`, sticky
  "Add booking" chooser. Busy/overlay + toast patterns from `hotels-view.tsx`.
- [ ] **Step 2: Build `page.tsx`** — RSC mirroring `hotels/page.tsx` auth +
  `getTripRole`/`canWrite`; load via `loadBookingsForTrip` + `loadBookingCounts`;
  render `TripRail active="bookings"`.
- [ ] **Step 3: Manual verify** — `pnpm dev`, open `/trip/<id>/bookings` at
  390px: filter, expand, add/edit/delete both kinds, gap note shows.
- [ ] **Step 4: Commit** — `feat(bookings): consolidated Bookings page [BOOK]`

### Task 5: Redirects + nav consolidation

**Files:** `hotels/page.tsx`, `transport/page.tsx`, `trip-rail.tsx`

- [ ] **Step 1: Replace** hotels + transport `trip-rail` items with one
  `bookings` item (`Bed`/`Plane`→ pick one icon; badge = hotels+transport count).
  Add `'bookings'` to `TripRailKey`.
- [ ] **Step 2: Convert** `hotels/page.tsx` and `transport/page.tsx` to
  `redirect('/trip/<id>/bookings')`.
- [ ] **Step 3: Manual verify** — old links land on Bookings; badge correct.
- [ ] **Step 4: Commit** — `feat(bookings): redirect legacy routes + nav [BOOK]`

---

## Phase B — Transport on the itinerary (ticket `oC31FrNn-WZi`)

### Task 6: Augment days with transport rides (pure)

**Files:** `app/src/lib/day-augment.ts`, `app/src/lib/day-augment.test.ts`

**Interfaces:**
```ts
export type DisplayRide = { id: string; transportId: string; type: TransportBooking['type'];
  label: string; time: string | null; fromDate: string; toDate: string | null };
export function ridesForDay(transport: TransportBooking[], dayIdx: number, dayIso: string | null): DisplayRide[];
```

- [ ] **Step 1: Write failing tests** — ride assigned by `dayIdx`; overnight ride
  (`fromDate !== toDate`) renders on the departure day only, labelled with both
  dates; null `dayIdx` falls back to matching `fromDate` against the day's ISO;
  unresolved rides excluded (surfaced elsewhere).
- [ ] **Step 2: Run tests, verify fail**
- [ ] **Step 3: Implement `ridesForDay`** + integrate into the day-augment output
  (a parallel `rides` list on the augmented day — do NOT overload the hotel
  `begin/end` place list).
- [ ] **Step 4: Run tests, verify pass; `pnpm typecheck`**
- [ ] **Step 5: Commit** — `feat(itinerary): augment days with transport rides [LOGI]`

### Task 7: Load transport into the trip data build + render rows

**Files:** `app/trip/[id]/layout.tsx` and/or `page.tsx`, `days-accordion.tsx`

- [ ] **Step 1: Load `loadTransportForTrip`** in the trip data build alongside
  `loadHotelsForTrip`; pass rides through `ridesForDay` per day.
- [ ] **Step 2: Render ride rows** in `days-accordion.tsx` (top of each day, a
  distinct teal ride row) linking to `/trip/<id>/bookings#<transportId>`.
- [ ] **Step 3: Manual verify** — seeded flights/train/car appear on correct
  days; overnight ride correct; no hotel-stop or map regression; single Maps load.
- [ ] **Step 4: Commit** — `feat(itinerary): render transport ride rows [LOGI]`

---

## Phase C — Wrap-up

### Task 8: Docs + final verification

- [ ] **Step 1: Update `AGENTS-INDEX.md`** — new Bookings files, redirect notes,
  transport-on-itinerary note, mark map-pins-for-rides as future.
- [ ] **Step 2: Full sweep** — `pnpm test`, `pnpm typecheck`, `pnpm lint` all green.
- [ ] **Step 3: Manual regression** — itinerary+map, Bookings, budget, redirects.
- [ ] **Step 4: Commit** — `docs(arch): bookings/logistics revamp file map [BOOK][LOGI]`

## Sequencing notes

- Phase A and Phase B are independent (different tickets) and can be built in
  parallel; Task 7 only needs Task 4's route to exist for its deep-link target
  (link can be added before the anchor exists).
- Deferred: map pins for rides (needs coordinates — see spec §7), a separate
  future ticket.
