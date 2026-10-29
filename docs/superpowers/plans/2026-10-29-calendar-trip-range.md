# Calendar Trip-Range View Implementation Plan

> **Ticket:** TP-0087

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the Calendar on the trip itself. Show one column per trip day with that day's bookings and stops, instead of a month grid that is about 80% empty. Keep the month grid one tap away. Stop the yellow trip-day highlight that collides with the note and warning yellow.

**Architecture:** A pure module `lib/calendar-trip-range.ts` decides the view (`resolveCalendarView`) and builds the columns (`buildTripRange`) from data the page already loads (`loadCalendarEvents`, `loadItineraryDays`), plus one new read (`loadItineraryStops`). Booking events gain a normalized `time` through `parseLooseTime` (already in `lib/ics.ts`). A new server component `calendar-trip-range.tsx` renders the columns: one DOM, a stacked list below `md`, and a horizontal column strip from `md` up. `CalendarView` gains a Trip | Month switcher and delegates the body. In the month grid, trip days get a brand tint and off-trip days are dimmed. No amber anywhere.

**Tech Stack:** Next.js 16 server components, Tailwind v4 tokens, vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §4.5 (Calendar), §10 CAL-01. Screenshot `docs/design-review/shots/20-calendar.png`. REQUIREMENTS §8.

**Touches:** `app/src/components/calendar-view.tsx`, `app/src/lib/calendar-queries.ts`, `app/src/app/trip/[id]/calendar/page.tsx`, `app/src/components/skeletons.tsx` (`CalendarSkeleton` only). No `globals.css`. If ds-hex-codemod has landed, this PR removes 4 amber classes from `calendar-view.tsx`, so regenerate `raw-color-baseline.json` in the same PR. (Scrutiny: [2026-10-29-calendar-trip-range.scrutiny.md](2026-10-29-calendar-trip-range.scrutiny.md).)

## Decision needed

1. **Ordered list vs time axis.** **Default:** an ordered list per day column. Bookings come first, sorted by time (untimed last). The day's stops follow in itinerary order, with their time when set. Stop `time` is free text and usually empty (the seed trip has none), so a time axis would put most stops in an "unscheduled" bin and add little. *Alternative:* an hourly axis (06:00–24:00) for timed items with an all-day row on top. Defer it until stops carry real times.
2. **When the trip view is the default.** **Default:** when the trip has a start and a resolvable end, and the span is **≤ 31 days**. The end is `endDate`, or, for a start-only trip, the date of its last itinerary day (`startDate + max(days.idx)`, which is the same arithmetic `loadItineraryDays` already uses). Start-only trips are a supported state (`tripStatus` and the home grouping handle them), and their days are real. Otherwise the month grid opens, as today. Any `?ym=` link opens the month grid, so old links keep working. *Alternative:* no cap, and trip view for any dated trip, since the strip scrolls horizontally anyway.
3. **Trip-day highlight in the month grid.** **Default:** a brand tint (`border-brand/40 bg-brand/5`) for trip days, and dimmed off-trip days (`bg-surface-2`, muted numbers). That matches REQUIREMENTS §8 "Trip days highlighted; non-trip dimmed". *Alternative:* no tint, a dim only.

## Global Constraints

- URL: `?view=trip|month`. Precedence: an explicit valid `view` wins; then a valid `ym` means month; then the default rule (Decision 2). `view=trip` on a trip with no start, no resolvable end, an end before the start, or a span > 31 days falls back to month.
- Range end: `tripRangeEnd(tripEnd, itinerary) = parseLooseDate(tripEnd) ?? itinerary.at(-1)?.date ?? null` (`itinerary` is sorted by `idx`). Both `resolveCalendarView` and `buildTripRange` receive this value, not the raw `trip.endDate`.
- Trip-range columns: every date from `tripStart` to `tripEnd` inclusive. The range extends by up to **3 days** on either side only to include booking dates there; those edge columns are labelled **"Before trip"** / **"After trip"** and dimmed. Bookings even further out are counted in a note: **"{n} booking(s) outside these dates · Month view"** (a link to the month view of the first such date).
- Column content, in order. Header: weekday + day + month (locale via `localeTag(getLang())`), then **"Day {idx+1} · {title}"** linking to `/trip/{id}?day={idx}`. Then bookings: time (if any) + label + the type color stripe, linking to `event.href`. Then stops: time (if any) + name, at most **8**, then **"+{n} more"** linking to the day. An empty trip day shows **"Nothing planned"** (muted).
- `CalendarEvent.time`: `HH:MM` from `parseLooseTime`. Hotel: `checkInTime` on the check-in date only. Transport: `fromTime` on `fromDate` only. Every other event date is `null`.
- Booking sort within a column: timed ascending, then untimed by label. Stops keep `places.idx` order (never re-sorted by time; the user's order is the plan).
- Layout: below `md`, stacked sections (full width). From `md` up: `grid-flow-col auto-cols-[minmax(11rem,1fr)] gap-2 overflow-x-auto`, with columns scroll-snapped (`snap-x snap-start`). Today's column header gets the existing brand "today" circle.
- Switcher: two links, **"Trip"** / **"Month"**, styled like the existing `navBtn`, with `aria-current="page"` on the active one. It is shown only when the trip view is available. When it is not, the old **"Trip dates"** link stays.
- No amber or yellow classes left in `calendar-view.tsx` (`grep -n amber` must be empty). Tokens only.
- Text ≥ 12 px in the new view (A7). Do not copy the 10 px classes from the month grid.

## Review Focus

1. **A booking the day before the trip.** The demo flight JL5 departs 2026-04-11 and the trip starts 04-12. It must appear in a "Before trip" column, not vanish. Test `edge column holds a booking one day before the trip` (Task 1).
2. **Old links and dateless trips.** `?ym=2026-05` → month. A trip with no start date → month with the existing "Set a trip start date…" message. `view=trip` on a 40-day trip → month. Tests in `resolveCalendarView` (Task 1).
3. **A multi-night hotel.** It shows on every night column, with the check-in time only on the first. The checkout day is not a night (keep `hotelLastNight`). Test `hotel check-in time only on the first night` (Task 1).
4. **A day with 12 stops.** It shows 8 plus "+4 more", and the column height stays bounded. Test `stops are capped at 8 with a remainder count` (Task 1).
5. **Unparseable free-text times** ("morning", "2026"). They are treated as untimed (no "NaN:NaN", no mis-sorting). Test `junk time sorts as untimed` (Task 1).

---

### Task 1: Data: event times, stops, view rule, column builder (pure + tests)

**Files:**
- Modify: `app/src/lib/calendar-queries.ts` (`CalendarEvent` + `time`; extract the loop at L96-131 into a pure `eventsFromBookings(hotels, transport, tripId)` that `loadCalendarEvents` calls; + `loadItineraryStops`)
- Create: `app/src/lib/calendar-trip-range.ts`, `app/src/lib/calendar-trip-range.test.ts`
- Modify: `app/src/lib/calendar-queries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // calendar-queries.ts
  export type CalendarEvent = { id; date; type; label; color; href; time: string | null };
  export function eventsFromBookings(hotels: Pick<HotelBooking,'id'|'name'|'checkInDate'|'checkInTime'|'checkOutDate'|'nights'>[],
    transport: Pick<TransportBooking,'id'|'type'|'title'|'fromDate'|'fromTime'|'toDate'>[], tripId: string): CalendarEvent[];
  export type ItineraryStop = { dayIdx: number; id: string; name: string; time: string | null; kind: PlaceKind };
  export async function loadItineraryStops(tripId: string): Promise<ItineraryStop[]>; // places ⋈ days, places.deletedAt IS NULL, ORDER BY days.idx, places.idx

  // calendar-trip-range.ts
  export const TRIP_RANGE_MAX_DAYS = 31;
  export const TRIP_RANGE_EDGE_DAYS = 3;
  export const TRIP_RANGE_STOP_CAP = 8;
  export function tripRangeEnd(tripEnd: string | null, itinerary: ItineraryDay[]): string | null;
  export function resolveCalendarView(p: { view?: string; ym?: string; tripStart: string | null; tripEnd: string | null }): 'trip' | 'month'; // tripEnd = tripRangeEnd(...)
  export type TripRangeColumn = {
    iso: string; edge: 'before' | 'after' | null; day: ItineraryDay | null;
    bookings: CalendarEvent[]; stops: ItineraryStop[]; moreStops: number;
  };
  export function buildTripRange(i: { tripStart: string; tripEnd: string; events: CalendarEvent[]; itinerary: ItineraryDay[]; stops: ItineraryStop[] }):
    { columns: TripRangeColumn[]; outside: { count: number; firstIso: string | null } };
  ```
  `outside.count` counts distinct bookings (the event `id` prefix before `:`) with no date inside the columns.

- [ ] **Step 1: Failing tests**
  - `calendar-queries.test.ts`: `hotel check-in time only on the first night`: a hotel 04-12→04-14 with `checkInTime '3:00 PM'` gives events on 12 and 13 only, `time` `'15:00'` then `null`. A transport with `fromTime '09:15'` on 04-14 → `time '09:15'`. `junk time sorts as untimed` part 1: `checkInTime 'morning'` → `time null`.
  - `calendar-trip-range.test.ts`, `resolveCalendarView`:
    - `{tripStart:'2026-04-12', tripEnd:'2026-04-16'}` → `'trip'`; `+ ym:'2026-05'` → `'month'`; `+ view:'trip', ym:'2026-05'` → `'trip'`;
    - `tripStart null` → `'month'`, even with `view:'trip'`; a 2026-01-01..2026-02-09 span (40 days) → `'month'`; `view:'bogus'` → falls through to the default rule; `tripEnd` before `tripStart` → `'month'`.
  - `tripRangeEnd`: `('2026-04-16', days)` → `'2026-04-16'`; `(null, [{idx:0,date:'2026-11-05'},{idx:2,date:'2026-11-07'}])` → `'2026-11-07'` (a start-only trip with days opens on trip view); `(null, [])` → `null`.
  - `buildTripRange`:
    - `edge column holds a booking one day before the trip`: a flight event on 04-11 for trip 04-12..16. Columns are `['2026-04-11', …, '2026-04-16']`, `columns[0].edge === 'before'`, and it holds the flight.
    - A booking on 04-01 (11 days out): no column is added, `outside.count === 1`, `firstIso === '2026-04-01'`.
    - Booking order: 15:00 hotel and 09:15 train on one day → train first. An untimed hotel night comes after both.
    - `junk time sorts as untimed` part 2: `time:null` events sort after timed ones, by label.
    - `stops are capped at 8 with a remainder count`: 12 stops on day 0 → `stops.length === 8`, `moreStops === 4`, in `places.idx` order.
    - Itinerary day idx 2 maps to `2026-04-14` (`day.title` is present on that column).
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/calendar-queries.test.ts src/lib/calendar-trip-range.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Import `parseLooseTime` from `@/lib/ics` (it has no `@/db` import). Use `addDaysIso`/`expandSpan` from `calendar-queries` for the date math. `calendar-trip-range.ts` imports only types from `calendar-queries`, so it stays DB-free.
- [ ] **Step 4:** Re-run. Expected: PASS, with the existing calendar and ics tests unchanged.
- [ ] **Step 5:** Commit `feat(calendar): trip-range data + view rule [TP-0087]`

### Task 2: Trip-range view + switcher

**Files:**
- Create: `app/src/components/calendar-trip-range.tsx` (server component)
- Modify: `app/src/components/calendar-view.tsx` (props `view`, `range`; the toolbar at L121-151 gets the switcher; the body branches; the month nav arrows show only in month view)
- Modify: `app/src/app/trip/[id]/calendar/page.tsx` (`searchParams` adds `view`; after the existing `Promise.all`, compute `tripRangeEnd` and call `resolveCalendarView`; only when it is `'trip'`, `await loadItineraryStops(tripId)` and call `buildTripRange`, so the month view pays no extra query)
- Modify: `app/src/components/skeletons.tsx` `CalendarSkeleton` (L230+: five column placeholders `md:grid-flow-col` in place of the 7×5 grid, stacked on mobile)

**Interfaces:**
- Consumes: Task 1 `resolveCalendarView`, `buildTripRange`, `TripRangeColumn`, `loadItineraryStops`.
- Produces:
  ```ts
  export function CalendarTripRange(p: { tripId: string; columns: TripRangeColumn[]; outside: { count: number; firstIso: string | null };
    todayIso: string; locale: string }): JSX.Element
  // CalendarView props add: view: 'trip' | 'month'; tripRangeAvailable: boolean;
  //   range: { columns: TripRangeColumn[]; outside: {...} } | null
  ```

- [ ] **Step 1:** Build `CalendarTripRange` to the Global Constraints. Columns are `<ol>` → `<li><section aria-labelledby>`. Edge columns get `bg-surface-2` and their "Before trip" / "After trip" label. Booking rows reuse the chip look of `ChipList` (`calendar-view.tsx:389-427`) at `text-xs`, with the time in `font-mono tabular-nums` before the label. The legend row (L372-383) renders under both views.
- [ ] **Step 2:** Add the switcher and page wiring. The "Month" link is `?view=month&ym={tripStart.slice(0,7)}`. The "Trip" link is `?view=trip`.
- [ ] **Step 3:** Update the skeleton.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [ ] **Step 5:** Commit `feat(calendar): open on the trip's own days, month grid one tap away [TP-0087]`

### Task 3: Month grid: no yellow

**Files:**
- Modify: `app/src/components/calendar-view.tsx` (amber classes at L210, L248, L335, L380)

- [ ] **Step 1:** Add two module constants and use them in all four places: `TRIP_DAY = 'border-brand/40 bg-brand/5'` and `OFF_TRIP = 'border-border bg-surface-2'`. The desktop cell (L333-337) is trip → `TRIP_DAY`, else `OFF_TRIP` with the day number `text-muted`. The mobile compact cell (L208-212) is trip → `TRIP_DAY`, else `border-transparent` (unchanged). The agenda (L246-250) is trip → `TRIP_DAY`, else `border-border bg-surface`. The legend swatch (L380) is `TRIP_DAY`.
- [ ] **Step 2:** `grep -n "amber" app/src/components/calendar-view.tsx` must return nothing. Then `pnpm typecheck && pnpm lint` (tail -3).
- [ ] **Step 3:** Commit `fix(calendar): trip days tinted brand, off-trip dimmed — no warning yellow [TP-0087]`

### Task 4: Verify in the real app

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, `/trip/79efe162-dfb2-46c2-ad46-a34695771b8b/calendar`.
- [ ] 1440×900: it opens on Trip view. Six columns: "Before trip" Sat 11 Apr with JL5 11:45, then Day 1–5 (Apr 12–16). Each has its title, bookings (e.g. Day 2: car rental 10:00, Hoshinoya 15:00) and stops. No horizontal scroll at 1440 for six columns (each ≥ 11rem).
- [ ] Click "Month": the April 2026 grid, trip days tinted teal, off-trip days grey, no yellow anywhere. ‹ › navigate months. `?ym=2026-05` opens May (month view). "Trip" returns.
- [ ] 390×844: stacked day sections, every label readable (≥ 12 px), and the tap targets for booking rows are ≥ 44 px tall.
- [ ] Dark mode (`data-theme="dark"`): the tint is visible and not glaring. Off-trip days remain distinguishable.
- [ ] A trip without dates (create one quickly or use a dateless trip): it opens on the month view with the "Set a trip start date…" line, and there is no switcher.
- [ ] A start-only trip with 2+ days: it opens on the trip view, with one column per itinerary day.

### Task 5: Docs

- [ ] `REQUIREMENTS.md` settings table row "Calendar default view (month / agenda)" (~L326): change it to "trip range when dated and ≤ 31 days, else month; per-visit switch, no stored setting".
- [ ] `REQUIREMENTS.md` §8: prepend "Default view: the trip's own dates, one column per day (bookings by time, then the day's stops in order), with up to 3 days either side when bookings fall there; month grid via a Trip | Month switch. Trips longer than 31 days, or with no start date (or no end date and no days), open on the month grid." Keep the existing month-grid bullets under "Month view".
- [ ] `AGENTS-INDEX.md`: L54 Calendar row adds `lib/calendar-trip-range.ts` and `calendar-trip-range`. L80 `calendar/page.tsx` becomes "Calendar: trip-range view (default) or month grid (`?view=`/`?ym=`)". L265 `calendar-view.tsx` becomes "Calendar shell: Trip | Month switch, month grid". Add `calendar-trip-range.tsx` "Trip-range columns". The `calendar-queries.ts` row adds `eventsFromBookings` and `loadItineraryStops`.
- [ ] Commit `docs: calendar trip-range view [TP-0087]`
