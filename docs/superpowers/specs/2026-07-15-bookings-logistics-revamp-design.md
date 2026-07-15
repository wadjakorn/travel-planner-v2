# Bookings & Logistics Revamp — Design

**Date:** 2026-07-15
**PM tickets:** `OX0Bm-Pxnjmm` (Bookings page), `oC31FrNn-WZi` (transport → itinerary/map)
**Prototype:** `docs/superpowers/specs/2026-07-15-bookings-prototype.html` (travel-wallet mockup — source of truth for card markup/styles)

## 1. Purpose

The Hotels and Transport views are two separate list pages that are hard to
understand, hard to use, and not mobile friendly. They also sit awkwardly beside
the itinerary+map, which **already** integrates hotels as synthetic "wake/sleep"
stops. This revamp reorganizes the app around two clear layers and fixes both the
redundancy and the mobile experience.

## 2. The two-layer model

| Layer | Answers | Owns | Today |
|---|---|---|---|
| **Plan** — itinerary + map | "What will I do, where, how do I move between spots" | Geography, per-day flow | Strong. Hotels linked via `day-augment.ts`. **Transport bookings absent.** |
| **Bookings** — reservations/documents | "My confirmations, seats, costs, PDFs, check-in times" | Paperwork | Two separate list pages, redundant + not mobile-friendly |

These layers **cross-link**, they do not compete. The Bookings page is a travel
wallet, not a second timeline of the trip.

### Key codebase facts (verified)

- `day-augment.ts` renders each hotel as synthetic `begin`/`end` `DisplayPlace`
  stops per day (`splitHotelsForDay`, `hotelToSyntheticPlace`,
  `displayPlacesForDay`, `buildMapDays`). This is the extension seam.
- `TransportBooking` is referenced **only** in `transport-view.tsx` — never on
  the map or itinerary. The itinerary's `segment.tsx` drive/walk/transit rows are
  place-to-place *modes*, a different concept from a booked flight.
- `transportBookings.dayIdx` **already exists and is populated** (see
  `seed-trip.ts`). So a booked ride already knows its day — itinerary-list
  integration is a rendering job, not date-math.
- `transportBookings` has **no lat/lng** for endpoints (only `fromName`,
  `fromCode`, `toName`, `toCode`). Hotels *do* have `lat`/`lng`. → Map **pins**
  for rides are blocked without geocoding or new columns; the itinerary **list**
  integration is unblocked.
- Nav (`trip-rail.tsx`) has live `hotels` + `transport` items; consolidation
  replaces them with one `bookings` item.
- Existing server actions stay unchanged: `addHotelInlineAction`,
  `updateHotelInlineAction`, `removeHotelAction`, `addTransport`/`updateTransport`
  /`removeTransportAction`.
- Commands: `pnpm dev` (localhost:3210), `pnpm test` (vitest), `pnpm typecheck`,
  `pnpm lint`.

## 3. Goals / non-goals

**Goals**
- One consolidated, mobile-first **Bookings** page (stays + rides) with a
  documents identity and cross-links to the plan.
- Transport bookings appear on the **itinerary list** by `dayIdx`, matching the
  hotel synthetic-stop pattern, each linking back to its booking.
- Consistent single add flow (stay-or-transport chooser) replacing today's split.
- No schema changes, no server-action changes.

**Non-goals**
- On-map **pins/polylines** for transport (needs coordinates we don't store —
  deferred; see §7).
- Drag-to-reorder bookings; desktop multi-column redesign beyond responsive
  centering; the `calendar`/`budget`/`notes` disabled tabs.

## 4. Bookings page (ticket `OX0Bm-Pxnjmm`)

### 4.1 Layout & components

Route: **`/trip/[id]/bookings`**. `/hotels` and `/transport` redirect to it
(preserves existing links + `trip-rail` badges collapse into one).

- **Header:** eyebrow "Reservations · <trip>", title "Bookings", total cost,
  sub-line "N stays · M rides · <date range> · See on itinerary →".
- **Segmented filter:** All / Stays / Transport (reproduces the two old views).
- **Date-grouped list**, sorted ascending by the booking's primary date
  (hotel `checkInDate`; transport `fromDate`). Two card kinds:
  - **Transport = boarding-pass card:** `fromCode → toCode`, carrier · flight no.,
    departure date/time; perforated stub with **seat · booking ref · fare**.
  - **Stay = key-card:** name, nights badge, area/room; perforated stub with
    **check-in · confirmation · total**.
- **Expand (tap):** cross-link chips ("✓ On itinerary · Day N", "Show on map"),
  secondary detail rows, and document actions (**Ticket PDF / Voucher**, Map, Edit).
- **Gap marker:** a night with no accommodation shows a warning row (reuse
  `overlappingHotelIds` logic + a new `gapNights` helper).
- **Sticky "Add booking"** → chooser (Stay / Transport) routing into the existing
  add flows.

### 4.2 Data

New server-safe helper `loadBookingsForTrip(tripId)` (or compose in the page)
returning a merged, date-sorted list of a discriminated union:

```ts
type BookingItem =
  | { kind: 'stay'; date: string | null; hotel: HotelBooking }
  | { kind: 'ride'; date: string | null; transport: TransportBooking };
```

Built from existing `loadHotelsForTrip` + `loadTransportForTrip`. Sorting and
gap detection are **pure functions** → unit-tested.

### 4.3 Design language

- **Color = wayfinding code:** amber `#C2591B` = stays, teal `#1B6E8C` = transport.
- **Type:** Fraunces (display, restrained) + Inter (UI) + Space Mono (data:
  times, airport codes, refs — the "departure board").
- Warm paper background; perforated ticket edge as the signature device.
- Quality floor: single-column ≤430px, ≥44px targets, keyboard-focusable cards
  with visible focus, `prefers-reduced-motion` respected.

## 5. Transport → itinerary integration (ticket `oC31FrNn-WZi`)

Extend `day-augment.ts` so transport bookings surface on the itinerary list the
way hotels do, keyed by the existing `dayIdx`.

- Add a `ride` variant to `DisplayPlace` (or a sibling `DisplayRide` list on the
  augmented day) so `DaysAccordion` can render a "Fly BKK → CNX · 08:30" row.
- The row deep-links to the ride's booking on the Bookings page.
- `loadTransportForTrip` is loaded in the trip layout/page data build alongside
  hotels; both feed the augmentor.
- Overnight/multi-day rides (`fromDate !== toDate`) render on the **departure**
  day (`dayIdx`), labelled with both dates. Rides with a null `dayIdx` fall back
  to date-matching against `trip.startDate`; if still unresolved, they appear
  under an "Unscheduled" group on the Bookings page only (never crash the day map).

## 6. New / changed files

| File | Change |
|---|---|
| `app/src/app/trip/[id]/bookings/page.tsx` | **new** — consolidated Bookings route |
| `app/src/app/trip/[id]/hotels/page.tsx` | redirect → `/bookings` |
| `app/src/app/trip/[id]/transport/page.tsx` | redirect → `/bookings` |
| `app/src/components/bookings-view.tsx` | **new** — orchestrator (filter, list, add) |
| `app/src/components/booking-card-stay.tsx` | **new** — key-card |
| `app/src/components/booking-card-ride.tsx` | **new** — boarding-pass card |
| `app/src/components/bookings-view.module.css` | **new** — styles |
| `app/src/lib/bookings-merge.ts` | **new** — merge/sort + gap helpers (pure, tested) |
| `app/src/lib/trip-queries.ts` | add `loadBookingsForTrip` (or reuse existing loaders) |
| `app/src/lib/day-augment.ts` | add transport-ride augmentation |
| `app/src/components/days-accordion.tsx` | render ride rows |
| `app/src/app/trip/[id]/layout.tsx` / `page.tsx` | load transport into data build |
| `app/src/components/trip-rail.tsx` | replace hotels+transport items with `bookings` |
| `AGENTS-INDEX.md` | update file map + entity notes |

## 7. Out of scope / future

- **Map pins for rides.** Requires endpoint coordinates. Two paths for a later
  ticket: (a) add `fromLat/fromLng/toLat/toLng` columns + capture them in the
  transport form via Places, or (b) geocode `fromName`/`toName` on read. Until
  then, rides are itinerary-list-only.
- Calendar/budget/notes tabs (still disabled).
- Reordering, multi-column desktop layout.

## 8. Testing

- **Unit (vitest):** `bookings-merge.ts` (sort order, mixed stay/ride, null
  dates, gap-night detection); transport augmentation in `day-augment.ts`
  (dayIdx grouping, overnight rule, null-dayIdx fallback).
- **Visual/manual:** `pnpm dev`, drive the Bookings page at 390px — filter,
  expand, add/edit/delete both kinds, redirects from old routes, ride rows on the
  itinerary, no map regression.
- `pnpm typecheck` + `pnpm lint` clean.
