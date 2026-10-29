# Scrutiny: calendar trip-range view

Plan: [2026-10-29-calendar-trip-range.md](2026-10-29-calendar-trip-range.md). Traced against HEAD `6f6f7a2`.

## Intent

Open the Calendar on the trip's own days (one column per day) instead of a mostly empty month grid. Keep the month grid one tap away, and drop the amber trip-day tint that collides with note and warning yellow (spec §4.5, CAL-01).

### Simpler alternatives considered (mandatory pass)

- **Only re-tint and keep month as the default.** That fixes bullet 2 but not bullet 1, which is the main ask. Rejected.
- **Columns without stops**, i.e. bookings + day title + the `placeCount` that `loadItineraryDays` already returns. This saves `loadItineraryStops`. It is viable, but a column reading "5 places" is much less useful than the names, and the query is a single indexed join. Keep the plan, but load stops only in trip view (applied, below).
- **Hourly axis (the spec's "แกนเวลา").** Correctly deferred: stop `time` is free text (`schema.ts:218`) and empty in the seed, so most items would land in an "unscheduled" bin.

## Findings

### M1. Major: the default-view rule excluded start-only trips that have days (applied)

- **Finding:** "trip view iff start **and end** and ≤ 31 days".
- **Why it matters:** a trip can have `startDate` and no `endDate` (`tripStatus` handles it at `trip-card-art.ts:53`, and so does the home plan's grouping). Such a trip has no seeded days (`expectedDayCount` returns 0 without an end, `seed-days.ts:89`), but days added by the user still resolve to real dates via `startDate + idx` (`calendar-queries.ts:163-164`). Those trips would open on a month grid even though the trip view could show them exactly.
- **Change:** a new pure `tripRangeEnd(tripEnd, itinerary)`, which is `endDate`, or else the last itinerary day's date. It feeds both `resolveCalendarView` and `buildTripRange`. Tests were added, and invalid `end < start` now falls back to month. **Applied.**

### m1. Minor: month view would pay for the stops query

- The plan added `loadItineraryStops` to the page's `Promise.all` unconditionally. **Applied:** load it only after the view resolves to `'trip'`.

### m2. Minor: REQUIREMENTS has a second calendar-default row

- `REQUIREMENTS.md:326` ("Calendar default view (month / agenda) … fixed responsive presentation") would contradict the new §8 text. **Applied:** Task 5 now updates it.

### m3. Minor: raw-color ratchet

- `calendar-view.tsx` holds 16 named-hue classes that ds-hex-codemod's baseline counts (codemod scrutiny, line 18), and this plan removes the 4 amber ones. If the codemod lands first, regenerate `raw-color-baseline.json` here. **Applied** to the Touches line.

### On the default-view rule (requested focus)

Precedence is: explicit `view` → `ym` means month → default. That keeps every existing `?ym=` link working, including the ‹ › month arrows (`calendar-view.tsx:122-136`, which emit `?ym=` only), and lets "Month" deep-link with `view=month&ym=`. The 31-day cap is a judgment call rather than a correctness issue: the strip scrolls horizontally, so a longer trip still works. It is a reasonable point where the month grid becomes the denser view. The no-cap alternative is listed in Decision 2. Ongoing trips: the view doesn't auto-scroll to today's column. That is a nice-to-have, not needed for correctness.

### Verified claims

- `parseLooseTime` lives in `lib/ics.ts:98` and that file has no imports, so `calendar-trip-range.ts` stays DB-free. ✓
- The event ids are `${bookingId}:${date}` (`calendar-queries.ts:104,122`), so "distinct bookings by id prefix" works for `outside.count`. ✓
- `hotelLastNight` excludes the checkout date (`calendar-queries.ts:62-73`), so the check-in time goes on the first night only, as specified. ✓
- Demo: JL5 `fromDate 2026-04-11` falls one day before the 04-12 start, so it lands in a "Before trip" edge column (`seed-trip.ts` transport). ✓
- Four amber sites at `calendar-view.tsx:210, 248, 335, 380`. ✓
- `--color-brand` is in `@theme` (`globals.css:131`), so `bg-brand/5` / `border-brand/40` work in Tailwind v4. ✓
- The trip map is hidden on sub-pages (`persistent-map.tsx:39,132`), so at 1440 the calendar has the full 1200 px `--page-max` and six columns of 11rem fit. ✓

## Cross-plan

- **i18n-extraction P4** (`calendar-view.tsx` 19 literals): the new strings "Trip", "Month", "Before trip", "After trip", "Nothing planned", "+{n} more" and "{n} booking(s) outside these dates" join P4's list.
- **ds-foundations** keeps ownership of the month grid's `text-[10px]` sites (`:159,253,353,420`). This plan doesn't touch them, and its new view is ≥ 12 px.

## Verdict

**fix-then-ship.** The fixes are applied. The design is sound and well tested. The one real gap was the default-view rule missing start-only trips.
