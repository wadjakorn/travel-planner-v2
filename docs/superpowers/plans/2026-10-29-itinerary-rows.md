# Itinerary Row Polish Implementation Plan

> **Ticket:** TP-0093

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D2 — time format follows the UI language** (default kept): 12-hour for everyone until i18n P6.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make each itinerary row readable at a glance. The meta line drops to `★ rating · category · price` with at most one ellipsis. All times on the day use one format. The thumbnail shows the place's kind, and the real photo appears on expand. Opening hours show the trip day's weekday, with a warning when the place is closed that day. A leg with no location says which stop needs fixing and links to the fix. The travel-mode pickers become 32px icon segmented controls. The day collapse bar is labelled.

**Architecture:** Three pure helpers go in `lib/`: `formatClock` (time), `hoursForDate` (opening hours for one date) and `missingLocation` (segment fix target). They are applied at the server boundary that already shapes the rows. `trip/[id]/page.tsx` handles places and rides, and `buildMapDays` handles pins. Rows, pin cards and the stop carousel all receive display-ready strings, and no hot map file changes. The photo reuses the pin card's session cache (`usePinPhoto` + `usePhotoUri`), so a row and its pin card share one billed photo. A new `ui/segmented.tsx` primitive replaces both `<select>` mode pickers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS modules + Tailwind v4 tokens, vitest (node env, `src/**/*.test.ts`).

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §4.1 (I1–I7), §8 rows "leg ไม่มีพิกัด" and "ที่ยังไม่ยืนยัน", §13 cost table (photo SKU). I8 (floating List/Map toggle) is out of scope; see "Not done".

**Touches:** `place-row.tsx`, `itinerary-list.module.css`, `segment.tsx`, `sortable-place-item.tsx`, `segment-mode-picker.tsx`, `day-mode-picker.tsx`, `days-accordion.tsx`, `itinerary-sidebar.module.css` (`.dayHdr` only), `trip/[id]/page.tsx`, `trip/[id]/layout.tsx` (one argument), `lib/day-augment.ts` (`buildMapDays` signature), `components/ui/index.ts` + `ui/README.md`. Deletes `segment-mode-picker.module.css`. No `globals.css`, no `real-map-canvas-*`, no `persistent-map.tsx`.
Overlaps (rebase, no logic conflict): `2026-10-29-a11y-batch.md` adds `tp-hit` to `segment.tsx` links and error toasts to both mode pickers' `commit`. `2026-10-29-map-hover-sync.md` adds a `hovered` prop to `place-row.tsx:60-76`. `2026-10-29-ux-copy-glossary.md` changes two aria-labels in `sortable-place-item.tsx`.

**Cross-plan ownership (scrutiny 2026-10-29):**
- **`buildMapDays` / `page.tsx` with `2026-10-29-map-route-lines.md`.** Route-lines rewrites the `buildMapDays` body (pin `idx` = list position, `legs`) and moves leg lookup out of `page.tsx`'s `augmentDayWithHotels` into `dayLegs`, but it does **not** change the signature. This plan owns the signature change: it appends `lang: ClockLang = 'en'` as the 4th parameter and touches only the `time:` line of the pin mapping. **Order: route-lines first.** This plan then rebases. In `page.tsx` it edits only the `days` map (`places`/`rides`/`dayHours`), not the leg code. If this plan lands first, route-lines keeps the 4-arg signature and the `formatClock` call.
- **`days-accordion.tsx` / `itinerary-list.module.css` with `ds-hex-codemod`.** Agreed with that plan's scrutiny: **this plan lands first**. Task 6 here owns the collapse-bar markup (token utilities). The codemod then only removes leftover raw colours and re-applies its mapping on top of Task 3's `itinerary-list.module.css` restructure.
- **`itinerary-list.module.css` / `itinerary-sidebar.module.css`** are also edited by `ds-foundations` (font floor) and `ds-hex-codemod` (tokens). Rebase only, since the rules are different.
- **`day-mode-picker.tsx`:** `ds-modal-consolidation` replaces its `ConfirmModal` (`:75-184`). This plan touches the render `:49-73`, so the hunks are different.
- **`layout.tsx` `getLang()`:** `i18n-extraction` P0 may add the same call. Reuse its binding if it is already there.

## Decision needed

1. **Time format.** There is no time-format setting (`AppSettings` = theme/lang/units/notif/publicTrip, `lib/user-settings-types.ts:3-10`). **Default: follow the UI language.** `en` gives 12-hour (`3:00 PM`), which matches the place-form placeholder (`place-form.tsx:158`) and REQUIREMENTS §4 Place `time` example "8:30 AM". `th` gives 24-hour (`15:00`). `getLang()` is forced to `en` today (`lib/i18n.ts:17-19`), so **everyone, including users whose settings say Thai, sees 12-hour until i18n P6 un-forces it**. Hotel check-in/out times (stored `HH:mm` from `<input type="time">`, `hotel-form-client.tsx:332`) switch from `15:00` to `3:00 PM` on this PR. When P6 lands, Thai users flip to 24-hour without any change here. Alternative: always 24-hour, or add a `timeFormat` user setting (schema + settings UI, which is out of proportion here).
2. **Thumbnails (I3).** A real photo on every collapsed row costs one Place Photo per Google place per page session ($7/1k after 1,000 free/month). It also spends the shared `gplaces:photo` cap (`GOOGLE_PLACES_PHOTO_DAILY_CAP`, 100/day, `docs/ops/maps-cost-guardrails.md:74-76`). A 19-stop trip would use ~20% of a day's cap per visit. **Default:** collapsed rows show a kind-icon tile (free). The expanded row loads the photo, lazily and only for Google places, through the same cache as the pin card.

## Global Constraints

- No new Google SKU or bucket. Expanded-row photo = `/api/places/photo-ref` (Place Details Essentials IDs Only, unbilled, bucket `gplaces:details:photo`, 500/day) + `/api/places/photo` (Place Photo, $7/1k after 1k free/month, bucket `gplaces:photo`, 100/day). Both are fetched only on expand, cached for the page session in memory, and shared with the pin card. Never store photo names (Google ToS).
- Google photos always render with author attribution: reuse `PreviewPhoto` from `place-preview-card.tsx:116`.
- Colors via tokens only (`--surface-2`, `--muted`, `--stay`, `--stay-soft`, `--move`, `--move-soft`, `--brand`, `--brand-foreground`, `--border`, `--ring`, `--warning`). No new hex.
- Collapsed meta line: `★ {rating} · {category} · {price}` plus the existing TBD / Google-closure badges and the new closed-day badge. Duration and kind icon leave the meta line. At most **one** ellipsis per line (category).
- Copy (EN; i18n forced to `en`, strings stay hard-coded — the i18n extraction plan picks them up):
  - Segment: `No location for {name}` · link `Fix location`
  - Unverified row chip: `Not matched to a map place` · `Find on map`
  - Hours: expanded value `{weekday} · {hours}`, disclosure summary `All week`; collapsed badge `Closed {weekday}` (e.g. `Closed Sat`)
  - Mode buttons (aria-label + title): `Drive`, `Walk`, `Transit`; day picker adds text segment `Mixed`, titles `All Drive` / `All Walk` / `All Transit`
  - Day collapse bar: visible `Collapse Day {n}`; collapsed card keeps its title
- Segmented control: every button ≥ 32×32 CSS px, icon 16px, `aria-pressed`, keyboard focus ring `ring-2 ring-ring`. Don't add a11y-batch's `.tp-hit` to these buttons: 32 px buttons 2 px apart pass WCAG 2.2 2.5.8 (24 px), and 44 px coarse boxes would overlap their neighbours.
- Times: one formatter. `en` → `h:mm AM|PM`, `th` → `HH:mm`. Unparseable free text renders unchanged.

## Review Focus

1. **Free-text times** (`Morning`, `after lunch`, `15.30`, `25:00`) must render exactly as typed, not become `NaN` or empty. Test in Task 1.
2. **Google hours in Thai or with split ranges / "Open 24 hours"**, and narrow no-break spaces before `AM`. The weekday line must still be found and its spaces normalised. Tests in Task 2.
3. **Trip without dates** (`startDate` null): no weekday is known. The row shows the full hours list as today and no closed badge. Test `hoursForDate(…, null)` in Task 2.
4. **Missing location on the *previous* stop, or on a synthetic hotel stop:** the chip names that stop. Fix goes to the hotel booking edit route, not a 404 place edit. Viewers get no link. Tests in Task 4.
5. **Photo unavailable** (open mode, cap spent, no photo): the expanded row shows no photo and no spinner stuck forever. `useCachedValue` resolves to `null` on a 503. Checked manually in Task 7 with `MAPS_PROVIDER=open`.

---

### Task 1: One time formatter for rows, rides and pins (I2)

**Files:**
- Create: `app/src/lib/clock.ts`
- Test: `app/src/lib/clock.test.ts`
- Modify: `app/src/app/trip/[id]/page.tsx:63-131` (read `lang`, format place + ride times)
- Modify: `app/src/lib/day-augment.ts:160-178` (`buildMapDays` gains `lang`, formats `pin.time`)
- Modify: `app/src/app/trip/[id]/layout.tsx:70` (pass `lang`)
- Test: `app/src/lib/day-augment.test.ts` (one case)

**Interfaces:**
- Produces: `export type ClockLang = 'en' | 'th'` and `export function formatClock(raw: string | null | undefined, lang: ClockLang): string | null` in `lib/clock.ts`.
- Produces: `buildMapDays(trip: LoadedTrip, hotels: HotelBooking[], units: Units, lang: ClockLang = 'en'): MapDay[]`.

- [x] **Step 1: Write failing tests** (`clock.test.ts`)

```ts
describe('formatClock', () => {
  it.each([
    ['15:00', 'en', '3:00 PM'],
    ['3:00 PM', 'en', '3:00 PM'],
    ['7:30 pm', 'th', '19:30'],
    ['08:30', 'th', '08:30'],
    ['00:15', 'en', '12:15 AM'],
    ['12:00', 'en', '12:00 PM'],
    ['9am', 'en', '9:00 AM'],
    ['15:00:00', 'en', '3:00 PM'],
    ['15:00 น.', 'en', '3:00 PM'],
  ])('%s (%s) → %s', (raw, lang, out) => expect(formatClock(raw, lang as ClockLang)).toBe(out));
  it('leaves unparseable text alone', () => {
    expect(formatClock('Morning', 'en')).toBe('Morning');
    expect(formatClock('25:00', 'en')).toBe('25:00');
    expect(formatClock('15.30', 'en')).toBe('15.30');
  });
  it('empty → null', () => {
    expect(formatClock('  ', 'en')).toBeNull();
    expect(formatClock(null, 'en')).toBeNull();
  });
});
```

In `day-augment.test.ts`, add: `buildMapDays` for a day whose hotel stop has `checkInTime: '15:00'` yields a pin with `time: '3:00 PM'` (default `lang`).

- [x] **Step 2:** `cd app && pnpm vitest run src/lib/clock.test.ts src/lib/day-augment.test.ts` → FAIL (module not found / time `15:00`).
- [x] **Step 3: Implement `formatClock`.** Trim, then strip a trailing `น.`. Match 12-hour `^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])\.?\s*m?\.?$`i (h 1–12) or 24-hour `^(\d{1,2}):(\d{2})(?::\d{2})?$` (h 0–23, m 0–59). Format by hand, not with `Intl`: Node's ICU puts U+202F before AM/PM, which breaks string equality. Anything else returns the trimmed input.
- [x] **Step 4: Wire it.**
  - `page.tsx`: `const lang = await getLang()` (from `@/lib/i18n`). Hoist `const dayIso = trip.startDate ? isoForDay(trip.startDate, d.idx) : null` in the `days` map. Then `places: aug.places.map((p) => ({ ...p, time: formatClock(p.time, lang) }))` and `rides: ridesForDay(transport, d.idx, dayIso).map((r) => ({ ...r, time: formatClock(r.time, lang) }))`.
  - `buildMapDays`: `time: formatClock(p.time, lang)` at `:176` (or the equivalent line of route-lines' rewritten pin mapping; see Cross-plan).
  - `layout.tsx`: add `getLang()` to the existing `Promise.all` and pass it as the 4th argument.
  - This covers pin card, MapLibre popup and stop carousel too, because they all read `pin.time`.
- [x] **Step 5:** Re-run the tests → PASS. `pnpm typecheck && pnpm lint && pnpm test` (tail -3) → green.
- [x] **Step 6:** Commit `feat(itinerary): one time format for places, stays, rides and pins [TP-0093]`

### Task 2: Opening hours for the trip day's weekday (I4)

**Files:**
- Create: `app/src/lib/opening-hours.ts`
- Test: `app/src/lib/opening-hours.test.ts`
- Modify: `app/src/app/trip/[id]/page.tsx` (add `hours` to `AugmentedPlace` `:144-156` and the `augmentDayWithHotels` input type `:179-189`; map `dayHours`)
- Modify: `app/src/components/days-accordion.tsx:12-38`, `app/src/components/sortable-place-item.tsx:25-51`, `app/src/components/place-row.tsx:8-37` (add `dayHours?: DayHours | null` to each `Place` type)
- Modify: `app/src/components/place-row.tsx:99-142` (closed badge), `:199-211` (Hours field)
- Modify: `app/src/components/itinerary-list.module.css` (`.hoursToday`, `.hoursAll`)

**Interfaces:**
- Consumes: `ClockLang` (Task 1).
- Produces: `export type DayHours = { weekday: string; text: string; closed: boolean }` and `export function hoursForDate(hours: string | null | undefined, dayIso: string | null, lang: ClockLang): DayHours | null`.

- [x] **Step 1: Write failing tests**

```ts
const G_EN = [
  'Monday: 11:00 AM – 9:00 PM', 'Tuesday: 11:00 AM – 9:00 PM',
  'Wednesday: Closed', 'Thursday: 11:00 AM – 9:00 PM', 'Friday: 11:00 AM – 9:00 PM',
  'Saturday: 10:00 AM – 2:00 PM, 5:00 – 10:00 PM', 'Sunday: Open 24 hours',
].join('; ');
// 2025-04-12 is a Saturday (the test trip's Day 1), 2025-04-16 a Wednesday.
it('picks the trip day and normalises spaces', () =>
  expect(hoursForDate(G_EN, '2025-04-12', 'en')).toEqual({ weekday: 'Sat', text: '10:00 AM – 2:00 PM, 5:00 – 10:00 PM', closed: false }));
it('flags a closed day', () =>
  expect(hoursForDate(G_EN, '2025-04-16', 'en')).toEqual({ weekday: 'Wed', text: 'Closed', closed: true }));
it('reads Thai weekday names', () =>
  expect(hoursForDate('วันจันทร์: 11:00–21:00; วันเสาร์: ปิดทำการ', '2025-04-12', 'th')).toEqual({ weekday: 'ส.', text: 'ปิดทำการ', closed: true }));
it('treats legacy "Today · …" seed text as daily hours', () =>
  expect(hoursForDate('Today · 11:00 – 21:00', '2025-04-12', 'en')).toEqual({ weekday: 'Sat', text: '11:00 – 21:00', closed: false }));
it('returns null for formats it cannot place on a weekday', () =>
  expect(hoursForDate('Mo-Sa 11:00-21:00', '2025-04-12', 'en')).toBeNull());
it('returns null without a date or hours', () => {
  expect(hoursForDate(G_EN, null, 'en')).toBeNull();
  expect(hoursForDate(null, '2025-04-12', 'en')).toBeNull();
});
```

- [x] **Step 2:** `pnpm vitest run src/lib/opening-hours.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - Weekday index: `new Date(`${dayIso}T00:00:00Z`).getUTCDay()`.
  - Labels are fixed arrays, not `Intl`: EN `Sun…Sat`, TH `อา. จ. อ. พ. พฤ. ศ. ส.`.
  - Split on `/\s*;\s*/`, the same split the row uses today (`place-row.tsx:204`). Replace `[   ]` with a regular space.
  - Line pattern: `^([^:：]+)[:：]\s*(.+)$`. Match the day token case-insensitively against EN full names or TH `วันอาทิตย์ … วันเสาร์`.
  - Closed when the rest matches `^(closed|ปิด(ทำการ)?)$`i.
  - Legacy: a single entry matching `^today\s*·\s*(.+)$`i.
  - Source context: Google `weekdayDescriptions` joined with `'; '` (`lib/places/google.ts:140,239`). The 18 seed places use `Today · …` (`lib/seed/days.ts`, e.g. `:50`).
- [x] **Step 4: Wire + render.**
  - `page.tsx`: in the Task 1 place map, add `dayHours: hoursForDate(p.hours, dayIso, lang)`.
  - `PlaceRow`, collapsed: when `place.dayHours?.closed`, add `<span className={styles.statusBadge} data-closed="temporary">Closed {weekday}</span>` after the Google status badge.
  - `PlaceRow`, expanded: when `dayHours` is set, the Hours field shows `<div className={styles.hoursToday}>{weekday} · {text}</div>`. When the source has more than one line, the full list follows inside `<details className={styles.hoursAll}><summary>All week</summary>…existing list…</details>`. When `dayHours` is null, keep the existing list unchanged.
  - CSS: `.hoursToday { font-weight: 600; color: var(--foreground) }`. `.hoursAll summary { color: var(--muted); cursor: pointer; font-size: 12px; min-height: 32px; display: flex; align-items: center }`.
- [x] **Step 5:** Tests PASS; `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [x] **Step 6:** Commit `feat(itinerary): opening hours for the trip day, warn when closed [TP-0093]`

### Task 3: Meta row, kind tile, photo on expand, unverified copy (I1, I3, §8)

**Files:**
- Create: `app/src/components/place-row-photo.tsx`
- Modify: `app/src/components/place-row.tsx:53-58` (KindIcon moves to the tile), `:61` (drop `thumbBg`), `:83-96` (tile), `:99-142` (meta), `:151-165` (unverified chip copy), `:179-180` (photo at top of expanded body)
- Modify: `app/src/components/itinerary-list.module.css:163-176` (`.placeThumb`), `:183-193` + `:195-204` (active wrap), `:206-219` (delete `.kindChip`), `:246-276` (shrink rules)

**Interfaces:**
- Consumes: `usePinPhoto(googleId)` (`components/use-pin-photo.ts:21`), `PreviewPhoto` / `PreviewPhotoLoading` (`place-preview-card.tsx:116,165`), `pinGoogleId` (`lib/map-helpers.ts:18`).
- Produces: `export function PlaceRowPhoto({ googleId }: { googleId: string | null }): React.JSX.Element | null` (`'use client'`). It returns `null` without an id or when the photo is `null`, shows `PreviewPhotoLoading compact` while `undefined`, and otherwise `<PreviewPhoto photo={photo} compact />`.

- [x] **Step 1: Tile.**
  - Replace the pastel swatch and SVG with `<div className={styles.placeThumb} data-kind={place.kind} aria-hidden="true"><KindIcon kind={place.kind} /></div>`.
  - CSS: center the icon at 20px. Default `background: var(--surface-2); color: var(--muted)`, `[data-kind='hotel']` uses `var(--stay-soft)` / `var(--stay)`, `[data-kind='transit']` uses `var(--move-soft)` / `var(--move)`.
  - `place.thumb` is no longer read. Leave the column alone; REQUIREMENTS is updated in Task 7.
- [x] **Step 2: Meta.** Order: TBD badge, Google status badge, closed-day badge (Task 2), `★ rating`, `· category`, `· price`. Remove the kind chip and the duration span; duration already shows in the expanded "When" field at `:191-198`. CSS: `.rating`, `.price`, `.metaSep` and the badges keep `flex-shrink: 0`, and `.metaText` (category) is the only shrinkable item. Add `.placeActive .placeName { white-space: normal }` and `.placeActive .placeMeta { flex-wrap: wrap }` / `.placeActive .metaText { white-space: normal }`, so the expanded row shows the full name and category.
- [x] **Step 3: Photo.** First child of `placeExpanded`: `<PlaceRowPhoto googleId={pinGoogleId(place.placeIdExternal)} />`. It only mounts while `active`, so collapsed rows never fetch.
- [x] **Step 4: Unverified chip copy** (`:161`): `<span>Not matched to a map place</span>` + `<span className={styles.chipAction}>Find on map</span>`. The href (`gmapsSearchUrl`) is unchanged. `.chipAction { font-weight: 600; text-decoration: underline }`.
- [x] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test` (tail -3) → green.
- [x] **Step 6:** Commit `feat(itinerary): one-ellipsis meta row, kind tile, photo on expand [TP-0093]`

### Task 4: "No location for {stop} · Fix location" segment chip (I5)

**Files:**
- Create: `app/src/lib/segment-fix.ts`
- Test: `app/src/lib/segment-fix.test.ts`
- Modify: `app/src/components/segment.tsx:8-26` (Place type gains `id`, `editHref?`, `synthetic?`; new props `editHrefBase?: string`), `:34-85` (unavailable branch)
- Modify: `app/src/components/sortable-place-item.tsx:216-228`, `:323-331` (pass `editHrefBase` and `canEdit` to both `<Segment>` calls)

**Interfaces:**
- Produces:
  ```ts
  type LocPlace = { id: string; name: string; lat?: number | null; lng?: number | null; editHref?: string; synthetic?: boolean };
  export function missingLocation(
    from: LocPlace | null | undefined,
    to: LocPlace | null | undefined,
    editHrefBase: string | null, // null = no link (viewer)
  ): { name: string; fixHref: string | null } | null;
  ```
  It returns null when either endpoint is absent or both have coordinates. It prefers `to`, the "next" stop in the spec. For the fix link it uses `p.editHref` when set (synthetic hotel → booking edit), else `${editHrefBase}/${p.id}/edit` for non-synthetic places, else null.

- [x] **Step 1: Write failing tests**

```ts
const base = '/trip/t/place';
const ok = { id: 'a', name: 'Tsuta Ramen', lat: 35.7, lng: 139.7 };
const noLoc = { id: 'b', name: 'Park Hotel Tokyo', lat: null, lng: null };
const hotel = { id: 'hotel-h1-end', name: 'Park Hotel Tokyo', lat: null, lng: null, synthetic: true, editHref: '/trip/t/booking/hotel/h1/edit' };
it('names the next stop', () => expect(missingLocation(ok, noLoc, base)).toEqual({ name: 'Park Hotel Tokyo', fixHref: '/trip/t/place/b/edit' }));
it('names the previous stop when only it is missing', () => expect(missingLocation(noLoc, ok, base)?.fixHref).toBe('/trip/t/place/b/edit'));
it('sends hotel stops to the booking', () => expect(missingLocation(ok, hotel, base)?.fixHref).toBe('/trip/t/booking/hotel/h1/edit'));
it('no link for viewers', () => expect(missingLocation(ok, noLoc, null)).toEqual({ name: 'Park Hotel Tokyo', fixHref: null }));
it('null when both located', () => expect(missingLocation(ok, { ...ok, id: 'c' }, base)).toBeNull());
```

- [x] **Step 2:** `pnpm vitest run src/lib/segment-fix.test.ts` → FAIL.
- [x] **Step 3: Implement** `missingLocation`. In `Segment`, replace `endpointMissing` (`:34-36`, `:59`) with `const missing = missingLocation(from, to, canEdit ? editHrefBase ?? null : null)`. Today a missing endpoint object (`to` null, an orphan segment row after the last stop; `sortable-place-list.tsx:203` passes `places[i + 1] ?? null`) also hits the unavailable branch. `missingLocation` returns null for it, which would render a mode picker for a leg to nowhere. So `Segment` returns `null` when `!from || !to`. The unavailable branch renders: icon · `No location for {missing.name}` (the name in `<b>`). When `missing.fixHref` is set, add `<Link className={styles.segNav} href={missing.fixHref}>Fix location</Link>`. The `GMaps` icon and the "Retry" directions link are removed. If `.tp-hit` exists (a11y-batch landed), add it to this link.
- [x] **Step 4:** Tests PASS; `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [x] **Step 5:** Commit `fix(itinerary): name the stop with no location and link to fix it [TP-0093]`

### Task 5: Icon segmented control for travel mode (I6)

**Files:**
- Create: `app/src/components/ui/segmented.tsx`
- Modify: `app/src/components/ui/index.ts` (export), `app/src/components/ui/README.md` (Primitives entry)
- Modify: `app/src/components/segment-mode-picker.tsx:20-35` (`onChange` becomes `commit(next: Mode)`, same body), `:37-48` (render)
- Modify: `app/src/components/day-mode-picker.tsx:49-73` (render; the confirm flow `:56`, `:75-87` is unchanged)
- Modify: `app/src/components/segment.tsx:89-103` (drop the separate mode icon when the picker shows)
- Modify: `app/src/components/itinerary-list.module.css:86-97` (`.segChip`: `border-radius: 16px; flex-wrap: wrap; row-gap: 4px; padding: 2px 4px 2px 10px`)
- Modify: `app/src/components/itinerary-sidebar.module.css:184-190` (`.dayHdr`: `flex-wrap: wrap; row-gap: 8px`)
- Delete: `app/src/components/segment-mode-picker.module.css` (no other importers)

**Interfaces:**
- Produces:
  ```ts
  export type SegmentedOption<T extends string> = { value: T; label: string; icon?: React.ReactNode; title?: string };
  export function Segmented<T extends string>(props: {
    value: T;
    options: SegmentedOption<T>[];
    onChange: (next: T) => void;   // not called when next === value
    ariaLabel: string;             // on the role="group" wrapper
    disabled?: boolean;
    className?: string;
  }): React.JSX.Element; // no global JSX namespace in @types/react 19
  ```
  The wrapper is `role="group"`. Each option is a `<button type="button" aria-pressed>`, at least `h-8 min-w-8`. With an `icon`, the label becomes `aria-label` and `title` (default `title = label`) and the icon renders at 16px. Without one, the label is visible text (`px-2 text-[12px] font-medium`). The wrapper uses `inline-flex rounded-lg border border-border bg-surface p-0.5`. Pressed: `bg-brand text-brand-foreground`. Unpressed: `text-muted hover:bg-surface-2`. Focus: `focus-visible:ring-2 focus-visible:ring-ring`. Disabled: `opacity-50 cursor-wait`.

- [x] **Step 1:** Implement `Segmented` + barrel export + a README row ("single choice among 2–5 options; aria-pressed buttons; ≥32px").
- [x] **Step 2:** `SegmentModePicker`: `<Segmented ariaLabel="Travel mode" value={mode} options={[{value:'drive',label:'Drive',icon:<Drive/>},{value:'walk',label:'Walk',icon:<Walk/>},{value:'transit',label:'Transit',icon:<Transit/>}]} onChange={commit} disabled={isPending} />`. `commit` is the body of today's `onChange` (`:20-35`) taking `next: Mode`.
- [x] **Step 3:** `DayModePicker`: `ariaLabel="Day default travel mode"`, options `mixed` (text `Mixed`, title `Mixed per leg`) + the three icons with titles `All Drive` / `All Walk` / `All Transit`. `onChange` reuses today's branching: `mixed` commits, anything else sets `pendingMode`.
- [x] **Step 4:** `Segment`: when `showPicker`, don't render `<span className={styles.segIcon}>` because the control carries the icons.
- [x] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [x] **Step 6:** Commit `feat(itinerary): icon segmented control for travel mode [TP-0093]`

### Task 6: Labelled day collapse bar (I7)

**Files:**
- Modify: `app/src/components/days-accordion.tsx:141-158` (collapsed card button: add `aria-expanded={false}`), `:187-231` (open-day bar)

The full-width `^` bar sits directly under the trip hero (`trip-cover.tsx`), so it reads as "collapse the hero" (review I7). It actually collapses the day.

- [x] **Step 1:** Rebuild the bar as `<button type="button" aria-expanded={true} …>`. Inside: the chevron, then visible text `Collapse Day {day.idx + 1}`. Use Tailwind token classes in place of the inline hex styles and the `onMouseEnter`/`onMouseLeave` handlers: `flex h-8 w-full items-center justify-center gap-1.5 border-b border-border bg-surface-2 text-[12px] font-medium text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring`. Keep the spinner branch. Drop `title` and `aria-label`, since the visible text is the name.
- [x] **Step 2:** `pnpm typecheck && pnpm lint` (tail -3).
- [x] **Step 3:** Commit `fix(itinerary): label the day collapse bar [TP-0093]`

### Task 7: Verify in the app + docs

- [ ] Run `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Open trip `79efe162-dfb2-46c2-ad46-a34695771b8b`.
- [ ] 390×844, Day 1. Meta lines show no stacked ellipses. The hotel row and place rows show the same time format (`3:00 PM`, `7:30 PM`). The ride pill shows `11:45 AM`. The kind tiles use token colors. Screenshot.
- [ ] Expand Tsuta Ramen. The photo loads with attribution, and Hours reads `Sat · 11:00 – 21:00`. Open the map: the pin card shows the same photo, and the network tab shows no second `/api/places/photo` call for that place.
- [ ] Leg into a stop without coordinates: `No location for … · Fix location` → opens that place's edit page (or the hotel booking edit). As a viewer, there is no link.
- [ ] Mode control: 32px buttons. Tap Walk → the segment updates. Day picker `All Drive` → the confirm modal still appears. Keyboard: Tab reaches each button, and Space toggles it.
- [ ] Day bar reads `Collapse Day 1`. A screen reader / accessibility snapshot shows `aria-expanded=true`.
- [ ] 1440×900: same checks. The day header wraps cleanly when the title is long.
- [ ] `MAPS_PROVIDER=open`: expanding a Google place shows no photo and no stuck spinner.
- [x] Update `AGENTS-INDEX.md`:
  - Itinerary table: `place-row-photo.tsx`.
  - UI primitives: `ui/segmented.tsx`.
  - Lib / Misc: `clock.ts` (`formatClock`), `opening-hours.ts` (`hoursForDate`, `DayHours`), `segment-fix.ts` (`missingLocation`).
  - Note `buildMapDays(…, lang)`.
  - Remove `segment-mode-picker.module.css` if listed.
- [x] Update `REQUIREMENTS.md`:
  - §5 "Place rows" becomes: `index circle · kind tile · name · meta (★ rating · category · price; badges) · time`. Expanded: `photo (Google places, loaded on expand) · when · hours for the trip day's weekday (full week under "All week") · address/phone/website · note`. Times use one format per UI language (en 12-hour, th 24-hour). A leg next to a stop with no location shows "No location for {stop} · Fix location".
  - §4 Place `thumb` note: "legacy placeholder colour; not rendered".
- [x] `pnpm typecheck && pnpm lint && pnpm test` (tail -3). Commit `docs(index): itinerary row helpers and segmented primitive [TP-0093]`

## Not done (with reason)

- **I8 floating List/Map toggle** over list content: the aside already has `pb-24` so the end of the list clears it. The mid-scroll overlap goes away with the bottom sheet (review §3.2 / §12 stage B), so it is not patched here.
- **Seed `Today · …` hours:** handled as daily hours by `hoursForDate`. Rewriting `lib/seed/days.ts` to weekday format adds nothing visible.
- **Booking cards** (`booking-card-stay.tsx:72`, `booking-card-ride.tsx:36`) still print raw `15:00`. They are outside the itinerary row. Follow-up: call `formatClock` there when the Bookings page gets `lang`.
- **Calendar trip-range view** (`calendar-trip-range.tsx:132,146`, TP-0089) also prints raw stop/booking times (`11:45` next to the itinerary's `11:45 AM`). Same follow-up: format at render (its sort compares the raw strings, so don't format in `calendar-queries.ts`).
