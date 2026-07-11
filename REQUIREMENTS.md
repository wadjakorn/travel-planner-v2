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

Top rail (desktop): Itinerary (default) · Calendar · Hotels · Transport · Budget · Notes · Help.

Header: brand · breadcrumb · saved-indicator · undo/redo · collaborator avatars · Share · Export · account dropdown.

Mobile (≤768px): rail collapses to bottom tab bar (Plan/Calendar/Hotels/Transport/Budget); Notes/Help in overflow.

Modals: Sign-in (full-page gate), Add booking (multi-step), Settings, Invite collaborator. Account menu = popover.

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
| place_id_external | string | | Google `place_id` |

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

REST API surface + quickstart: [API.md](API.md).

## 5. Itinerary

- Day chips above itinerary; click to switch active day. `+` chip = add day.
- Trip cover = hero card (title, dates, traveler count, cover image).
- Place rows: index circle · thumb · name · meta · time · expand. Expanded: phone/website/hours/tags/note/booking.
- Drag/reorder within a day → persist + recompute segments.
- Optimize-route strip: when order is suboptimal, banner offers one-click reorder ("save ~Xm driving").
- Drive/walk segments: distance + time + Navigate (gmaps deep link).
- Open in Maps (per-day): all-day route. Per-segment Navigate: leg only.
- Search & add: Places API; selecting suggestion inserts at end of active day.
- Recco sidebar: nearby suggestions, one-click add.
- Per-place freeform notes.

## 6. Bookings

### Hotels view
List of HotelBooking cards grouped by check-in date. Card: thumb · name · address · check-in/out · room · guests · ref · cost · cancellation · attachment download. Total = sum of `cost.amount`.

### Transport view
Cards grouped by `type`. Type icon + title + provider. Route: `from.code → to.code` with times/terminals/duration. Seats, bag, ref, cost, attachment.

### Add/Edit booking modal
Steps: type select → fields (type-specific) → review. Edit = same flow pre-filled. Delete = confirmation; soft delete with undo.

## 7. Budget

- Total spent: amount vs budget cap, progress bar (over-budget shown beyond 100%).
- Per-day, per-person, avg meal: derived metrics.
- Category bars: Transport / Hotels / Food / Activities / Shopping. Each: icon · label · amount · percent · subtotal.
- Recent expenses list.
- Add expense modal.
- Split bills (split with collaborators).
- Export CSV/PDF.

## 8. Calendar

- Month grid (7×N), locale-aware week start.
- Trip days highlighted; non-trip dimmed.
- Booking events plotted by date, color-coded: hotels purple, flights blue, trains green, cars orange, ferries teal.
- Click day → expand events. Click event → underlying booking.
- Month nav, jump-to-today, drag-to-reschedule.

## 9. Notes

Per-trip, three sections:
- **Packing list** — checklist; add/check/uncheck/remove.
- **Reservations** — checklist for things-to-confirm-before-trip.
- **Docs** — freeform rich-text blocks (title + body).

## 10. Map

- Pins for active day's places, numbered to match itinerary order. Position = `place.lat`/`place.lng`.
- Polyline route between pins (real route from Directions API, mode-aware, snapped to roads).
- Floating chips: day label (top), distance/time (bottom), layers/filter/locate (right).
- Pin clustering at zoom-out.

## 11. Auth

- Sign-in: Google OAuth + Email magic-link. (Apple deferred.)
- Account menu: active account info, accounts list, Add Google account, Invite collaborator, Settings, Sign out.
- Multi-account: switch in-place; per-device session.
- MFA optional (TOTP).
- Session refresh, logout-all-devices, active-session list, revoke device.

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

## 14. i18n

- Locales: `en`, `th`. Flat keyed strings.
- Default `en`; missing-key fallback to `en`.
- Interpolation, plurals, locale-aware dates/numbers (ICU).
- Pseudo-localisation in dev.

## 15. Theme

- `data-theme="light|dark"` on `<html>`. `system` follows `prefers-color-scheme`.
- CSS variables only — no hardcoded hex outside token files.

## 16. Client-state UX

- **Undo/Redo** — itinerary edits, booking add/edit/delete, expense add.
- **"Saved Xm ago"** — reflects server-acknowledged write.
- **Optimistic UI** — drag-reorder, checklist toggle; reconcile with server.
- **Toasts** — save errors, copy-link, invite-sent.

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
