# Travel Planner — Functional Requirements

## 1. Product

Wanderlog-style group travel planner. Multi-day itineraries, hotel/transport bookings, shared budget, packing notes, collaborator invites. Target: small groups planning leisure trips.

## 2. Roles

| Role | Capabilities |
|------|--------------|
| Owner | Full edit; manage invites; delete trip; settings |
| Editor | Edit itinerary, bookings, budget, notes |
| Viewer | Read-only |

Server-side enforcement on every mutation.

## 3. Pages

Left rail (md+): Itinerary (default) · Calendar · Bookings · Budget · Notes · Settings (trip owner only). Each item is an icon with a visible 12px label under it. Notes is shown as coming soon (disabled); `/trip/[id]/notes` still renders, with no rail item active.

Mobile (<768px): the same items as a bottom tab bar (icon + 12px label). It hides while scrolling down (and returns when scrolling stops) and is hidden in full-map mode. There is no overflow menu. Rail and bar are both hidden on add/edit form pages.

Bookings is one page for stays and transport (filter All / Stays / Transport). `/trip/[id]/hotels` and `/trip/[id]/transport` redirect to it.

Header: brand · trip title (sm+) · saved-indicator · collaborator avatars · account dropdown. Not shipped (open decision, design review 2026-10-28 §11 Q5): global undo/redo (bookings have Undo on delete, §6), Share, Export, Help.

Modals: Sign-in (full-page gate), Add booking (multi-step), Settings, Invite collaborator. Account menu = popover.

`/` is public: a signed-out visitor gets a landing page (what the app is, plus an
OG card so the URL previews properly when shared), not a redirect to sign-in.
Signed in, `/` is the trip grid as before.

## 4. Domain model

### Trip
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | string | ✓ | |
| subtitle | string | | |
| startDate / endDate | ISO date | ✓ | |
| cover | string | | cover-art identifier |
| collaborators | Collaborator[] | | |
| days | Day[] | ✓ | |

- Editing a trip's dates must preserve the existing itinerary structure. If a proposed date change would shorten the inclusive trip length below the current day span, the save is rejected with a validation error rather than leaving orphaned days or bookings behind. Expanding the range is allowed.

### Day
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| label | string | ✓ | "Sat" |
| num | number | ✓ | day-of-month |
| date | string | ✓ | full label |
| title | string | ✓ | |
| summary | { distance, time } | | day total |
| optimizeSavings | { time, swap } | | shown when reorder saves time |
| places | Place[] | ✓ | ordered |
| segments | Segment[] | | len = places.len − 1 |

### Place
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | unique within trip |
| kind | enum | ✓ | `hotel` / `food` / `sight` / `transit` |
| name | string | ✓ | |
| category | string | | "Michelin · Ramen" |
| rating | number? | | 0–5 |
| reviews | number? | | |
| time | string | | "8:30 AM" |
| duration | string | | "1h 30m" |
| price | enum? | | `Free`/`$`/`$$`/`$$$`/`$$$$` |
| address | string | | |
| phone | string | | |
| website | string | | |
| hours | string | | |
| tags | string[] | | |
| thumb | string (#hex) | | placeholder colour |
| note | string | | personal note |
| booking | { ref, room, nights, total } | | inline booking summary |
| lat / lng | number | | |
| place_id_external | string | | Provider place ID — bare = Google (legacy rows), `geoapify:<id>`, `osm:<N|W|R><id>` |

### Segment
| Field | Type | Required |
|-------|------|----------|
| mode | enum (`drive`/`walk`/`transit`) | ✓ |
| distance | string | ✓ |
| time | string | ✓ |

### Collaborator
| Field | Type | Required |
|-------|------|----------|
| accountId | string | ✓ |
| role | enum | ✓ |

### HotelBooking
| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| name | string | ✓ |
| address | string | |
| checkIn / checkOut | { date, time } | ✓ |
| nights | number | ✓ |
| room | string | |
| guests | number | ✓ |
| ref | string | ✓ |
| cost | { amount, currency } | ✓ |
| cancellation | string | |
| contact | string | |
| notes | string | |
| attachment | object-storage key | |
| dayIdx | number | ✓ |

### TransportBooking
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | |
| type | enum | ✓ | `flight`/`train`/`car`/`ferry` |
| title | string | ✓ | |
| provider | string | | |
| ref | string | ✓ | |
| from / to | Endpoint | ✓ | `{code, name, time, date, terminal}` |
| duration | string | | |
| seats | string | | |
| bag | string | | |
| cost | { amount, currency } | | |
| attachment | object-storage key | | |
| dayIdx | number | ✓ | |

### Account
| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| name | string | ✓ |
| email | string | ✓ |
| avatar | url | |
| provider | enum (`google`/`apple`/`email`) | ✓ |
| createdAt | ISO timestamp | ✓ |
| lastSignInAt | ISO timestamp | |
| mfaEnabled | bool | ✓ |

### Invite
| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| tripId | string | ✓ |
| invitedBy | accountId | ✓ |
| email | string | ✓ |
| role | enum (`editor`/`viewer`) | ✓ |
| status | enum (`pending`/`accepted`) | ✓ |
| token | signed string | ✓ |
| expiresAt | ISO timestamp | ✓ |
| acceptedAt | ISO timestamp | |

### Expense
| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| tripId | string | ✓ |
| dayIdx | number? | |
| category | enum (`transport`/`hotels`/`food`/`activities`/`shopping`/`other`) | ✓ |
| amount | number | ✓ |
| currency | string | ✓ |
| paidBy | accountId | ✓ |
| splitWith | accountId[] | |
| note | string | |
| at | ISO timestamp | ✓ |

### Note
Per-trip, three sections.

| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| tripId | string | ✓ |
| section | enum (`packing`/`reservations`/`docs`) | ✓ |
| body | string \| ChecklistItem[] | ✓ |
| updatedAt | ISO timestamp | ✓ |

ChecklistItem = `{ id, text, done }`.

### ApiToken
Per-user personal access token for the REST API (machine auth). Only the
SHA-256 hash is stored; the plaintext (`tp_<base64url>`) is shown once at
creation. Live while `revokedAt` is null.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | |
| userId | string | ✓ | owner |
| name | string | ✓ | user-facing label |
| tokenHash | string | ✓ | sha256(plaintext), unique |
| createdAt | ISO timestamp | ✓ | |
| lastUsedAt | ISO timestamp? | | stamped on each successful auth |
| revokedAt | ISO timestamp? | | set on revoke; token then rejected |

### ApiIdempotencyKey
Dedup store for API `POST`s. A retried create carrying the same
`Idempotency-Key` header returns the cached response instead of a duplicate.
Scoped per user; only 2xx responses cached.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | |
| userId | string | ✓ | scope |
| key | string | ✓ | unique per (userId, key) |
| statusCode | number | ✓ | cached HTTP status |
| responseJson | json | ✓ | cached body |
| createdAt | ISO timestamp | ✓ | |

### ApiRateLimit
Per-token fixed-window counter backing the `/api/v1` rate limit (default 60
req/min per token). One row per token; a single atomic UPSERT increments the
count within the window or resets it once elapsed — no external store needed.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| tokenId | string | ✓ | PK, FK→ApiToken, cascade on delete |
| windowStart | ISO timestamp | ✓ | start of the current window |
| count | number | ✓ | requests seen in the current window |

REST API surface + quickstart: [API.md](API.md). Agents can import a whole plan
in one call — `POST /api/v1/trips/import` creates a new trip with its
days+places+hotels atomically (transaction); place/hotel provider IDs (`place_id_external`) are stored
as references only. See `docs/superpowers/specs/2026-07-11-api-plan-import-design.md`.

## 5. Itinerary

- Day chips above itinerary; click to switch active day. `+` chip = add day.
- Trip cover = hero card (title, dates, traveler count, cover image).
- Place rows: index circle · thumb · name · meta · time · expand. Expanded: phone/website/hours/tags/note/booking.
- Drag/reorder within a day → persist + recompute segments.
- Optimize-route strip: when order is suboptimal, banner offers one-click reorder ("save ~Xm driving").
- Drive/walk segments: distance + time + Navigate (gmaps deep link).
- Open in Maps (per-day): all-day route. Per-segment Navigate: leg only.
- Search & add: Places API; selecting suggestion inserts at end of active day.
- Manual add: set the location by coordinates, a Google Maps link, the map centre, or a tap; keyboard-only works (WCAG 2.1.1). The picker map uses cooperative gestures (one finger scrolls the page).
- Recco sidebar: nearby suggestions, one-click add.
- Per-place freeform notes.

## 6. Bookings

One Bookings page: stays and transport together, grouped by date, filter All / Stays / Transport, gap-night markers, Add booking chooser (Stay / Transport). Total = sum of `cost.amount` over all bookings in the trip currency; bookings in another currency are counted, not summed.
Layout: bookings render as one date-ordered column; add-booking is inline in the header on desktop, a floating pill on mobile.

### Stay card
Card: thumb · name · address · check-in/out · room · guests · ref · cost · cancellation · attachment download.

### Transport card
Type icon + title + provider. Route: `from.code → to.code` with times/terminals/duration. Seats, bag, ref, cost, attachment.

### Add/Edit booking modal
Steps: type select → fields (type-specific) → review. Edit = same flow pre-filled. Delete = confirmation; soft delete with undo ("Undo" on the "Booking deleted" toast after a delete from the bookings list or its edit overlay; the server accepts the restore for 10 minutes; deletes from the standalone edit page redirect and get no Undo).

## 7. Budget

- Total spent: amount vs budget cap, progress bar (over-budget shown beyond 100%).
- Per-day, per-person, avg meal: derived metrics.
- Category bars: Transport / Stays / Food / Activities / Shopping. Each: icon · label · amount · percent · subtotal.
- Recent expenses list.
- Add expense modal.
- Split bills (split with collaborators).
- Trip currency and budget basis are trip-level controls on `/trip/[id]/budget`.
- Per person divides by the trip's travelers (budget settings "Travelers", stored as `budgetConfig.travelers`, 1–99; blank = owner + editors). The trip hub shows the same number.
- Total = bookings + other expenses, shown as a split under the total; the bookings part equals the Bookings page total.
- A logged hotel/transport payment that exactly matches a booking of the same kind and currency is suggested for merging (one to one). Merging deletes the logged copy after confirmation, never automatically.
- Shares under 1% read "<1%" (and just under 100% reads ">99%"); shares are not clamped above 100%.
- No budget set: a neutral notice "No budget yet."; only the owner gets the "Set a budget" link (settings is owner-only).
- Export CSV/PDF.

## 8. Calendar

Default view: the trip's own dates, one column per day (bookings by time, then the day's stops in order), with up to 3 days either side when bookings fall there; month grid via a Trip | Month switch. Trips longer than 31 days, or with no start date (or no end date and no days), open on the month grid.

- Trip view: `?view=trip|month` wins; then a `?ym=` link opens the month grid; then the rule above. A start-only trip ends on its last itinerary day. Itinerary days added past the end date still get columns (within 31 days of the start). Edge columns are labelled "Before trip" / "After trip"; bookings further out are counted with a link to the month view. At most 8 stops per day, then "+N more".

Month view:

- Month grid (7×N), locale-aware week start.
- Trip days highlighted (brand tint); non-trip dimmed.
- Booking events plotted by date, color-coded: hotels purple, flights blue, trains green, cars orange, ferries teal.
- Click day → expand events. Click event → underlying booking.
- Month nav, jump-to-today, drag-to-reschedule.

## 9. Notes

Per-trip, three sections:
- **Packing list** — checklist; add/check/uncheck/remove.
- **Reservations** — checklist for things-to-confirm-before-trip.
- **Docs** — freeform rich-text blocks (title + body).

## 10. Map

- Pins for active day's places, numbered to match itinerary order (a stop without coordinates has no pin and leaves a gap in the numbers, e.g. 1, 3). Position = `place.lat`/`place.lng`.
- Pins: colored by kind from map tokens (light in both themes), kind icon as a non-color cue, active keeps its color with a ring + name label; each pin's accessible name is `Stop n: name, time` on both renderers.
- Day route: straight dashed lines between consecutive stops in list order (no Routes/Directions API, no API cost), colored by leg mode (walk / drive / transit; neutral grey dotted when the leg has no stored mode — no extra control, the list's segment picker sets it), white casing, a direction arrow mid-leg; no time label. Legs touching a stop without coordinates, or under 10 m, are not drawn. Lines sit under the pins and never take clicks. Per-leg routing is still deep-linked out to Google Maps URLs.
- Floating chips: day label (top), distance/time (bottom), layers/filter/locate (right).
- Pin clustering at zoom-out.
- Tap a map POI → preview card (name, address, photo, distance to the nearest stop) → add to the active day (Google mode, editors; `MAPS_POI_ADD=off` restores Google's own info window).

## 11. Auth

- Sign-in: Google OAuth + Email magic-link. (Apple deferred.)
- Account menu: active account info, accounts list, Add Google account, Invite collaborator, Settings, Sign out.
- Multi-account: switch in-place; per-device session.
- MFA optional (TOTP).
- Session refresh, logout-all-devices, active-session list, revoke device.
- **Invite-only registration** (`INVITE_ONLY`, default off). While on, a sign-in
  attempt completes only for an address that already has an account, sits in
  `ACCESS_ALLOWLIST`, or holds a pending unexpired trip invite. Everyone else
  lands on `/sign-in/not-invited` — before any `user` row is created and before
  any magic link is sent. Existing users are unaffected; the check is derived,
  never backfilled. Plan: `docs/plans/invite-only-access.md`.
- **Anonymous rate limiting.** Per-IP fixed-window budgets on the three surfaces
  an anonymous caller can reach: the sign-in actions, `/invite/[token]` and the
  public landing page. A signed-in user is never limited. The OAuth callback is
  deliberately excluded — a 429 there would break a legitimate in-flight sign-in.

## 12. Sharing & invites

- Invite by email; role select (Editor/Viewer).
- Send → adds Invite row; transactional email send.
- Copy trip link; signed token with expiry.
- Resend / revoke / regenerate.
- Status chip (pending/accepted) on invite row.
- Collaborator avatars in header (accepted + owner).

## 13. Settings

User-scoped (per account, not per trip).

| Group | Setting | Values |
|-------|---------|--------|
| Appearance | theme | light / dark / system |
| Language | locale | English / ไทย |
| Units | unit system | Metric / Imperial |
| Notifications | email_updates | bool |
| Notifications | push_alerts | bool |
| Privacy | public_trip | bool |

Feature settings audit for shipped post-TP-0008 work:

| Feature | Setting? | Scope | Ticket |
|---------|----------|-------|--------|
| Calendar default view (trip range / month) | No separate setting | N/A; trip range when dated and ≤ 31 days, else month; per-visit switch, no stored setting | TP-0087 |
| Calendar week start day | No separate setting | User-level via locale / language | none |
| Calendar booking spans | No separate setting | N/A; always visible in the calendar | none |
| .ics export: itinerary vs bookings | No separate setting | N/A; export includes itinerary days and bookings | none |
| .ics export: alarm / reminder lead time | No separate setting | N/A; export does not encode alarms | none |
| Maps default travel mode | No separate setting | N/A; mode is per segment / day | none |
| Maps distance units | Yes | User-level; reuse `AppSettings.units` | existing user settings |
| Budget currency / budget basis | Yes | Trip-level; stored on the trip | existing budget settings |

## 14. i18n

- Locales: `en`, `th`. Flat keyed strings.
- Default `en`; missing-key fallback to `en`.
- Interpolation, plurals, locale-aware dates/numbers (ICU).
- Pseudo-localisation in dev.

### Glossary

| Concept | EN | TH | Rule |
|---|---|---|---|
| Hotel booking | Stay / stays | ที่พัก | Never "Hotel" in UI copy (`hotel` stays as a code/enum value) |
| Transport booking | Transport; count = "transport bookings" | การเดินทาง | Never "Ride" in UI copy |
| Itinerary stop | Place / places | สถานที่ | "Stop {n}" only as a map ordinal |
| Itinerary | Itinerary | แผนเที่ยว | |
| Trip notes | Notes | โน้ต | "บันทึก" is reserved for Save |
| Save | Save | บันทึก | |
| Delete | Gone for everyone: trip, day, stay, transport, expense, note, checklist item | ลบ | Dialog title, confirm button and toast all say Delete |
| Remove | Take out of a container: place from a day, member from a trip | เอาออก | |

New UI copy uses these terms; the en/th dictionaries are checked by `lib/i18n-messages.test.ts`.

## 15. Theme

- `data-theme="light|dark"` on `<html>`. `system` follows `prefers-color-scheme`.
- CSS variables only — no hardcoded hex outside token files.

## 16. Client-state UX

- **Undo** — "Undo" on the toast after deleting a booking (10-minute window; bookings are soft-deleted). No global undo/redo stack.
- **"Saved Xm ago"** — reflects server-acknowledged write.
- **Optimistic UI** — drag-reorder, checklist toggle; reconcile with server.
- **Toasts** — save errors, copy-link, invite-sent. A toast with an action (Undo) shows 8 s, and its timer pauses while hovered or focused.

## 17. Cross-cutting

### Persistence
- Server-backed CRUD across all entities.
- Soft delete (7-day undo for trips, immediate for items).
- Last-write-wins minimum; CRDT/OT desirable for itinerary reorder.

### Audit log
- Per-trip activity feed; surfaced under Settings → Activity. Retain 90 days.

### Sync
- Push-style sync (WebSocket/SSE/polling — TBD).
- Conflict UI when two devices edit same place.

### Offline
- Read-only browsing of last-loaded trip when offline (IndexedDB cache).
- Replay queued mutations on reconnect; conflict toasts.
- Online-only: place search, geocoding, real-map tiles, invite send.

### Attachments
- Object-storage backed; signed URLs upload + download.
- 25 MB limit; PDF/JPG/PNG/HEIC.
- Virus scan before download URL valid.

### Rate limits
- Per-account: invite 10/day, search 60/min, expense 300/day.
- Per-IP login throttle.
- Captcha on password reset / sign-up.
- REST API (`/api/v1`): per-token 60 req/min → `429` + `Retry-After`. See ApiRateLimit.

### Telemetry
- Events: trip_created, day_added, place_added, booking_added, invite_sent, budget_viewed.
- Error reporting (Sentry-class).
- Opt-out per `settings.privacy`.

## 18. Non-functional

- Responsive ≥320px; rail → bottom tab bar at ≤768px.
- WCAG 2.1 AA.
- FCP <1.5s broadband; itinerary interactive <2.5s. Code-split per top-level view.
- Browsers: last 2 stable Safari/Chrome/Firefox/Edge; iOS Safari 16+; Android Chrome 110+.
- Privacy: respect `public_trip`; collaborator emails never leak to viewers.
