# Travel Planner — Functional Requirements

> Source of truth: the static mockup at [`index.html`](index.html) and its
> linked component files. This spec captures what the prototype demonstrates
> today **plus** the real-app additions an actual production rebuild needs.
> Stack-agnostic — implementation choices live in (future) `ARCHITECTURE.md`.

Conventions used below:
- "Mockup" = behaviour visible in the current prototype.
- "Real-app" = additions beyond the mockup, called out in §19.
- File:line references point at the prototype file that documents the field/behaviour. Verify against the file when in doubt — file wins, this doc is summary.

## 1. Product summary

Wanderlog-style group travel planner. Users plan multi-day trips with day-by-day itineraries, manage hotel and transport bookings, track shared budget, keep packing/reservation notes, and invite collaborators. Mockup ships a fully-populated example trip ("Mount Fuji & Kamakura · Apr 12–16, 2026"). Target users: small groups (couples, friends, family) planning leisure trips end-to-end in one place.

## 2. Personas & roles

| Role | Capabilities | Source |
|------|--------------|--------|
| Owner | Full edit; manage invites; delete trip; settings; billing (real-app) | implicit — first signed-in account on a trip |
| Editor | Edit itinerary, bookings, budget, notes; cannot manage invites | [`i18n.js:51`](i18n.js) `role_editor` |
| Viewer | Read-only across all views | [`i18n.js:52`](i18n.js) `role_viewer` |

Mockup does not gate UI by role — all controls are visible. Real-app must enforce role server-side.

## 3. Pages & navigation

Top-level rail (left side, desktop) — exactly these views, in order:

| View | Default? | Source |
|------|----------|--------|
| Itinerary | ✓ | [`app.jsx`](app.jsx), [`sidebar-parts.jsx`](sidebar-parts.jsx) |
| Calendar |  | [`other-views.jsx`](other-views.jsx) `CalendarView` |
| Hotels |  | [`bookings-views.jsx`](bookings-views.jsx) `HotelsView` |
| Transport |  | [`bookings-views.jsx`](bookings-views.jsx) `TransportView` |
| Budget |  | [`other-views.jsx`](other-views.jsx) `BudgetView` |
| Notes |  | [`other-views.jsx`](other-views.jsx) `NotesView` |
| Help |  | stub in mockup — real-app needs content |

Header: brand · breadcrumb (trip title) · saved-indicator · undo/redo · collaborator-avatar stack · Share · Export · account-avatar dropdown.

Mobile (≤768px breakpoint, see [`apple-polish.css`](apple-polish.css)): rail collapses, bottom tab bar with Plan / Calendar / Hotels / Transport / Budget; Notes/Help reachable via overflow.

Modals (rendered above shell):
- Sign-in screen — full-page gate before app shell ([`account.jsx`](account.jsx) `SignInScreen`)
- Add booking — multi-step (type → fields → review) ([`add-booking-modal.jsx`](add-booking-modal.jsx))
- Settings ([`account.jsx`](account.jsx) `SettingsModal`)
- Invite collaborator ([`account.jsx`](account.jsx) `InviteModal`)
- Account menu — popover dropdown, not a modal ([`account.jsx`](account.jsx) `AccountMenu`)

## 4. Domain model

All shapes below are derived from the mockup's seed data. Types are inferred (`string` unless qualified).

### Trip — [`data.js:5-291`](data.js)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | string | ✓ | "Mount Fuji & Kamakura" |
| subtitle | string |  | location summary |
| dates | string | ✓ | display range; real-app should also store `startDate`/`endDate` as ISO |
| cover | string |  | cover-art identifier ("fuji" → mock SVG) |
| collaborators | Collaborator[] |  | header avatar stack |
| days | Day[] | ✓ | one entry per trip day |
| recco | Recco[] |  | sidebar suggestions |

### Day — [`data.js:16-283`](data.js)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| label | string | ✓ | "Sat", "Sun" — short weekday |
| num | number | ✓ | day-of-month |
| date | string | ✓ | full date label |
| title | string | ✓ | "Arrival in Tokyo" |
| summary | { distance, time } |  | day total — display strings |
| optimizeSavings | { time, swap } |  | shown when reorder will save time |
| places | Place[] | ✓ | ordered |
| segments | Segment[] |  | drive/walk between consecutive places; len = places.len − 1 |

### Place — [`data.js:21-277`](data.js)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | unique within trip |
| kind | enum | ✓ | `hotel` / `food` / `sight` / `transit` |
| name | string | ✓ |  |
| category | string |  | e.g. "Michelin · Ramen" |
| rating | number? |  | 0–5; nullable |
| reviews | number? |  | review count |
| time | string |  | "8:30 AM" |
| duration | string |  | "1h 30m" |
| price | enum? |  | `Free` / `$` / `$$` / `$$$` / `$$$$` / null |
| address | string |  |  |
| phone | string |  |  |
| website | string |  | host only ("parkhoteltokyo.com") |
| hours | string |  | display string; real-app needs structured open hours |
| tags | string[] |  | freeform chips |
| thumb | string (#hex) |  | swatch colour for placeholder thumb |
| note | string |  | personal note from user |
| booking | { ref, room, nights, total } |  | inline booking summary; cross-reference with HotelBooking/TransportBooking |
| x, y | number |  | mock-map coords on 1000×700 viewBox; real-app: `lat`/`lng` |

### Segment — [`data.js:59-62`](data.js)

| Field | Type | Required |
|-------|------|----------|
| mode | enum (`drive` / `walk` / `transit`) | ✓ |
| distance | string | ✓ |
| time | string | ✓ |

### Collaborator — [`data.js:10-14`](data.js)

| Field | Type | Required |
|-------|------|----------|
| initials | string (2 chars) | ✓ |
| color | string (#hex) | ✓ |

(Real-app extends to full Account + role; mockup uses display-only stub.)

### HotelBooking — [`bookings-data.js:5-77`](bookings-data.js)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ |  |
| name | string | ✓ |  |
| address | string |  |  |
| checkIn | { date, time } | ✓ |  |
| checkOut | { date, time } | ✓ |  |
| nights | number | ✓ | derivable from dates |
| room | string |  |  |
| guests | number | ✓ |  |
| ref | string | ✓ | confirmation number |
| cost | { amount, currency } | ✓ |  |
| cancellation | string |  |  |
| contact | string |  |  |
| notes | string |  |  |
| attachment | { name, size } |  | file metadata only in mockup; real-app: object-storage key |
| thumb | string (#hex) |  | placeholder colour |
| dayIdx | number | ✓ | which trip day this booking belongs to |

### TransportBooking — [`bookings-data.js:78-139`](bookings-data.js)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ |  |
| type | enum | ✓ | `flight` / `train` / `car` / `ferry` |
| title | string | ✓ |  |
| provider | string |  |  |
| ref | string | ✓ |  |
| from | Endpoint | ✓ | see below |
| to | Endpoint | ✓ |  |
| duration | string |  |  |
| seats | string |  |  |
| bag | string |  | baggage allowance |
| cost | { amount, currency } |  |  |
| attachment | { name, size } |  |  |
| dayIdx | number | ✓ |  |

Endpoint = `{ code, name, time, date, terminal }` — all strings.

### Account — [`i18n.js:108-111`](i18n.js)

| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| name | string | ✓ |
| email | string | ✓ |
| avatar | string (#hex) | ✓ |
| initials | string | ✓ |
| active | boolean | ✓ |

Real-app: replace `avatar` (colour swatch) with image URL; add `provider` (google/apple/email), `createdAt`, `lastSignInAt`, `mfaEnabled`.

### Invite — [`i18n.js:113-117`](i18n.js)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ |  |
| email | string | ✓ |  |
| name | string? |  | null until invitee fills it |
| role | enum | ✓ | `editor` / `viewer` |
| status | enum | ✓ | `pending` / `accepted` |
| avatar | string (#hex) | ✓ | swatch in mockup |
| initials | string | ✓ |  |

Real-app: add `tripId`, `invitedBy`, `expiresAt`, `acceptedAt`, signed token.

### Expense (real-app)

Mockup shows category bars + a recent-expense list visually but does not seed an Expense array. For real-app:

| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| tripId | string | ✓ |
| dayIdx | number? |  |
| category | enum (`transport` / `hotels` / `food` / `activities` / `shopping` / `other`) | ✓ |
| amount | number | ✓ |
| currency | string | ✓ |
| paidBy | accountId | ✓ |
| splitWith | accountId[] |  |
| note | string |  |
| at | ISO timestamp | ✓ |

### Note (real-app)

Mockup shows three sections (packing checklist, reservations checklist, free-form docs). Spec: per-trip, not per-day. Real-app:

| Field | Type | Required |
|-------|------|----------|
| id | string | ✓ |
| tripId | string | ✓ |
| section | enum (`packing` / `reservations` / `docs`) | ✓ |
| body | string \| ChecklistItem[] | ✓ |
| updatedAt | ISO timestamp | ✓ |

ChecklistItem = `{ id, text, done: boolean }`.

### Toast (client-only)

`{ id, kind: 'info'/'error'/'success', text, ttl }` — ephemeral, never persisted.

## 5. Itinerary features

- **Day chips** — pill row above itinerary; click to switch active day. Add (`+`) chip = create extra day (real-app).
- **Trip cover** — hero card with title, dates, traveler count, cover image. Editable title (real-app).
- **Place rows** — ordered cards: index circle · thumb · name · meta · time · expand toggle. Expanded view shows phone/website/hours/tags/note/booking summary.
- **Drag/reorder** — within a day. Mockup is visual-only; real-app must persist + recompute segments.
- **Optimize-route strip** — when a day's order is suboptimal, banner offers "Reorder this day to save ~Xm driving" with one-click apply. Source: [`sidebar-parts.jsx`](sidebar-parts.jsx) `OptimizeStrip`.
- **Drive/walk segments** — between consecutive places; show distance + time + Navigate button (gmaps deep link).
- **Open in Maps** — per-day button: opens directions for all-day route. Per-segment Navigate: directions for that leg only. URL format in [`place-row.jsx`](place-row.jsx).
- **Search & add** — search field above itinerary; suggestions from `SEARCH_RESULTS`. Selecting one inserts at end of active day. Real-app: places API.
- **Recco** — sidebar block with nearby suggestions, one-click add. Source: [`sidebar-parts.jsx`](sidebar-parts.jsx) `Recco`.
- **Notes per place** — short freeform text under place row.

## 6. Bookings

### Hotels view ([`bookings-views.jsx`](bookings-views.jsx) `HotelsView`)
- List of HotelBooking cards grouped by check-in date.
- Each card: thumb · name · address · check-in/out · room · guests · ref · cost · cancellation · attachment download.
- Empty state: "No hotels yet" + Add button.
- Total: sum of `cost.amount` across hotels.

### Transport view ([`bookings-views.jsx`](bookings-views.jsx) `TransportView`)
- Cards grouped by `type`. Type icon + title + provider.
- Route visualization: `from.code` → `to.code` with times, terminals, duration in middle.
- Seats, baggage, ref, cost, attachment.

### Add booking modal ([`add-booking-modal.jsx`](add-booking-modal.jsx))
Multi-step flow:
1. **Type select** — hotel | flight | train | car | ferry.
2. **Fields** — type-specific form. Hotel: name/address/dates/times/room/guests/ref/cost/cancellation/notes/attachment. Transport: title/provider/ref/from{code,name,time,date,terminal}/to{...}/seats/bag/cost/attachment.
3. **Review** — read-only summary, Save button.

Edit booking = same flow pre-filled (real-app — mockup only adds, no edit).

Delete: confirmation dialog. Real-app: soft delete with undo.

## 7. Budget

Source: [`other-views.jsx`](other-views.jsx) `BudgetView`. Real-app needs server-side aggregation; mockup does the math client-side from a hardcoded total.

- **Total spent** — currency + amount, vs. budget cap, progress bar (over-budget shown beyond 100%).
- **Per-day, per-person, avg meal** — derived metrics on a side card.
- **Category bars** — Transport / Hotels / Food & dining / Activities / Shopping & misc. Each: icon · label · amount · percent · subtotal description (e.g. "4 bookings · 59%").
- **Recent expenses** — list with date, label, optional category dot, amount.
- **Add expense** button → modal (real-app — mockup is visual).
- **Split bills** button → split-with-collaborators flow (real-app).
- **Export** button → CSV/PDF (real-app).

## 8. Calendar

Source: [`other-views.jsx`](other-views.jsx) `CalendarView`. Mockup ships April 2026 (matches the example trip).

- Month grid (7×N), Sunday-start (real-app: locale-aware).
- Trip days highlighted; non-trip days dimmed.
- Booking events plotted by date — color-coded: hotels purple, flights blue, trains green, cars orange, ferries teal.
- Legend chips below grid.
- Click day → expand to show all events that day. Click event → open the underlying HotelBooking/TransportBooking.
- Real-app: month nav arrows, jump-to-today, drag to reschedule.

## 9. Notes

Source: [`other-views.jsx`](other-views.jsx) `NotesView`. Per-trip, three sections:

- **Packing list** — checklist; add/check/uncheck/remove items.
- **Reservations** — checklist for things-to-confirm-before-trip.
- **Docs** — freeform rich-text blocks (mockup uses placeholder cards). Each block: title (editable) + body.

Real-app: full rich text, image embeds, share-with-collaborators per block.

## 10. Map

Source: [`map.jsx`](map.jsx) `MapCanvas`. Mockup ships a hand-drawn SVG of the Mt. Fuji region (1000×700 viewBox) with land gradients, parks, lakes, roads, city labels, the Fuji peak with snow detail.

Behaviour:
- Pins for the active day's places, numbered to match the itinerary order.
- Pin position = `place.x` / `place.y` (mock coords).
- Polyline route between pins.
- Floating chips: day label (top), distance/time (bottom), layers/filter/locate controls (right side).

Real-app: pluggable map provider (Mapbox / Google / MapLibre). Replace `x/y` with `lat/lng`. Real geocoding on place add. Polyline = real route from a directions API (snapped to roads, mode-aware).

## 11. Auth

Source: [`account.jsx`](account.jsx).

- **Sign-in screen** — full-page gate before the app renders. Three buttons: Continue with Google, Apple, Email.
- Mockup: clicking any button calls `onSignIn('a1')` and lands as account `a1` (`Yuna Tanaka`). No real auth.
- **Account menu** (header avatar) — shows active account name/email, list of `accounts` (`Your accounts`), Add Google account, Invite collaborator, Settings, Sign out.
- **Multi-account** — switch active account in-place; header avatar updates. Mockup state is in-memory; real-app: per-device session.

Real-app:
- Real provider integration (Google / Apple / email-magic-link).
- Forgot-password / passwordless flow.
- MFA optional.
- Session refresh, logout-all-devices.
- CSRF + secure-cookie + same-site=lax minimums.

## 12. Sharing & invites

Source: [`account.jsx`](account.jsx) `InviteModal`.

- **Invite by email** — input accepts email or paste-link.
- **Role select** — Editor / Viewer.
- **Send invite** — adds to `INVITES` list (mockup mutates in-memory).
- **Copy link** — copies the trip URL.
- **Status** — pending / accepted; status chip on invite row.
- **Collaborator avatars** — accepted invites + owner shown in header avatar stack.
- **Pending invites list** — grouped under Pending in the modal.

Real-app:
- Signed invite link with embedded token, server-side resolution.
- Email send via transactional provider; resend / revoke.
- Expiry on invite tokens.
- Role enforcement on every server endpoint.

## 13. Settings

Source: [`account.jsx`](account.jsx) `SettingsModal`. All values are user-scoped (apply per account, not per trip).

| Group | Setting | Values | Source |
|-------|---------|--------|--------|
| Appearance | theme | light / dark / system | [`i18n.js:25-28`](i18n.js) |
| Language | locale | English / ไทย | [`i18n.js:29-31`](i18n.js) |
| Units | unit system | Metric (km, °C) / Imperial (mi, °F) | [`i18n.js:32-34`](i18n.js) |
| Notifications | email_updates | bool | [`i18n.js:35-36`](i18n.js) |
| Notifications | push_alerts | bool | [`i18n.js:37`](i18n.js) |
| Privacy | public_trip | bool | [`i18n.js:38-39`](i18n.js) |

Real-app: persist to user profile; honour units everywhere distances/temperatures render; obey notifications when sending mail/push.

## 14. i18n

Source: [`i18n.js`](i18n.js).

- Locales today: `en`, `th`. Bundle ships every UI string in both.
- Storage in mockup: `window.I18N[locale][key]` — flat keyed object, no nesting/plurals/interpolation.
- Active locale = settings selection; default `en`.

Real-app:
- Keep flat keys for portability; swap runtime to a standard library (e.g. `intl-messageformat` / ICU).
- Add interpolation, plurals, gender, locale-aware dates/numbers.
- Pseudo-localisation in dev; missing-key fallback to `en`.
- Translation pipeline (e.g. POEditor / Crowdin) with checked-in source-of-truth file.

## 15. Theme

- Selector: `data-theme="light"|"dark"` on `<html>`.
- Tokens: [`design-tokens.css`](design-tokens.css) (Apple-style colour + type tokens), extended in [`account.css`](account.css) with dark-mode overrides.
- `system` value follows `prefers-color-scheme`.
- Component CSS uses tokens only — no hardcoded hex outside token files.

Real-app: same tokens, port to whatever CSS-in-JS / utility framework the chosen stack uses; keep `data-theme` switch.

## 16. Client state worth preserving

When implementing for real, do not regress these UX details:

- **Undo/Redo** — header buttons. Stack of itinerary edits (place add/remove/reorder, booking add/edit/delete, expense add).
- **"Saved Xm ago"** indicator — must reflect server-confirmed write, not just local state.
- **Optimistic UI** — drag-reorder, check checklist item, etc. should update instantly + reconcile with server.
- **Toast notifications** — for save errors, copy-link, invite-sent, etc.
- **Account menu close-on-outside-click** — see [`account.jsx:61-65`](account.jsx).

## 17. Out of scope (mockup stubs)

These buttons render in the mockup but do nothing today. Real-app must define behaviour:

- **Share** (header) — likely opens a share-sheet with public URL + invite shortcut.
- **Export** (header) — likely PDF/iCal export of itinerary + bookings.
- **Help** (rail bottom) — likely opens docs / chat / shortcut palette.
- **Add expense / Split bills / Export** (Budget view) — see §6.

## 18. Non-functional requirements

- **Responsive** — works at ≥320px width; rail collapses to bottom tab bar at ≤768px.
- **Accessibility** — WCAG 2.1 AA. Keyboard reachable, visible focus, labelled icon buttons (mockup uses `aria-label` on most icon-only buttons), colour-contrast compliant in both themes.
- **Performance** — first contentful paint < 1.5s on broadband; itinerary view interactive < 2.5s. Real-app: code-split per top-level view.
- **Browser support** — last 2 stable versions of Safari/Chrome/Firefox/Edge; iOS Safari 16+; Android Chrome 110+.
- **Offline** — see §19 (offline mode).
- **Internationalisation** — see §14. Right-to-left out of scope until a target market needs it.
- **Privacy** — respect `public_trip` flag; collaborator emails never leak to viewers.

## 19. Real-app additions beyond mockup

Sections sourced from prototype above. The following are **not in the mockup** but a production rebuild needs them.

- **Persistence**
  - Server-backed CRUD for trips / days / places / segments / hotel bookings / transport bookings / accounts / invites / expenses / notes / settings.
  - REST or GraphQL — choice deferred to ARCHITECTURE.md.
  - Soft delete (undo window: 7 days for trips, immediate for items).
  - Concurrent edit handling — last-write-wins minimum; CRDT or OT desirable for itinerary reorder.

- **Account recovery**
  - Forgot-password / magic-link by email.
  - Optional MFA (TOTP).
  - Active-session list, revoke device.

- **Real maps**
  - Pluggable provider (Mapbox / Google / MapLibre).
  - Geocoding on place add (text → lat/lng + structured address).
  - Real route polylines from directions API; mode-aware (drive/walk/transit).
  - Pin clustering at zoom-out.
  - Replace `place.x`/`place.y` with `place.lat`/`place.lng` in storage.

- **Real invites**
  - Signed invite tokens with server-side resolution and expiry.
  - Transactional email send (SendGrid / SES / Postmark — TBD).
  - Resend / revoke / regenerate.
  - Server-enforced role check on every mutation.

- **Audit log**
  - Per-trip activity feed: who created/edited/deleted what, when.
  - Surfaced to owner under Settings → Activity.
  - Retain 90 days minimum.

- **Multi-device sync**
  - Push-style sync via WebSocket / SSE / polling — TBD.
  - "Saved Xm ago" reflects server-acknowledged write.
  - Conflict UI when two devices edit the same place.

- **Offline mode**
  - Read-only browsing of last-loaded trip when network down.
  - Local cache (IndexedDB) for trip + bookings + notes.
  - Replay queued mutations on reconnect, show conflict toasts.
  - Features that explicitly require online: place search, geocoding, real-map tiles, invite send.

- **File attachments**
  - Object-storage backed (S3 / R2 / GCS).
  - Signed URLs for upload + download; never serve from app server.
  - Size limit: 25 MB per attachment; types: PDF, JPG, PNG, HEIC.
  - Virus scan pipeline before download URL becomes valid.

- **Rate limiting & abuse**
  - Per-account quotas: invite send (10/day), search (60/min), expense add (300/day).
  - Per-IP login throttle.
  - Captcha on password reset / sign-up.

- **Telemetry**
  - Product analytics events: trip_created, day_added, place_added, booking_added, invite_sent, budget_viewed.
  - Error reporting (Sentry-class).
  - Opt-out honoured per `settings.privacy` (TBD: extend settings with telemetry toggle).

- **Billing**
  - Out of scope for v1 unless free tier only.
  - If monetised: free tier + paid tier (collaborator limit, attachment quota, real maps).
  - Stripe (or equivalent) — TBD.

## Verification — keep this doc honest

Whenever this file changes, also re-verify against the mockup:

```bash
# entity field counts should match the data files
node -e 'console.log(Object.keys(require("./data.js") || window.TRIP || {}))' # crude — open in browser instead
grep -c "^##" REQUIREMENTS.md  # should be ≥ 19 (one per top-level section)
```

If a field is added to `data.js` / `bookings-data.js` / `i18n.js`, update the corresponding entity table here in the same change.
