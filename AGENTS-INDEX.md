# AGENTS-INDEX — file map for Travel Planner v2

Where to find things. Pairs with [AGENTS.md](AGENTS.md) (rules), [REQUIREMENTS.md](REQUIREMENTS.md) (what), [ARCHITECTURE.md](ARCHITECTURE.md) (why).

**Update rule**: when you add/move/rename a file under `app/src/`, update this index in the same PR.

---

## Quick reference

- Path alias: `@/*` → `app/src/*`
- Working dir for builds: `app/`
- Stack: Next.js 15 App Router · React 19 · TypeScript · Drizzle · Postgres (Neon) · Auth.js v5 · Tailwind v4 · `@vis.gl/react-google-maps`

### Scripts (`app/package.json`)

| Script | Command |
|---|---|
| `pnpm dev` | `next dev` (localhost:3000) |
| `pnpm build` | `next build` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `eslint` |
| `pnpm db:generate` | `drizzle-kit generate` |
| `pnpm db:push` | `drizzle-kit push` (dev branch) |
| `pnpm db:migrate` | `drizzle-kit migrate` (CI / prod) |
| `pnpm db:studio` | `drizzle-kit studio` |

### Env vars

`app/.env.example` is canonical. Required at runtime: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_SERVER`, `EMAIL_FROM`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Optional: `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Use `@/lib/maps-config` (`GOOGLE_MAPS_API_KEY`) — do not re-read `process.env` for the maps key.

---

## Entity → file map

Each row: schema row → mutation actions → query helper → forms / view components.

| Entity | Schema (`db/schema.ts`) | Actions | Reads | Forms / views |
|---|---|---|---|---|
| Trip | `trips` | `actions/trips.ts` (create, update, delete) · `actions/settings.ts` (save) | `lib/trip-queries.ts` `loadTrip` | `trip-create-form` · `trip-settings-form` · `settings-folio` · `trip-card` · `trip-rail` |
| Day | `days` | `actions/days.ts` (add, remove) · `actions/segments.ts` (`setDayDefaultModeAction`) | `loadTrip` (trip-queries) | `days-accordion` · `day-header` · `day-mode-picker` |
| Place | `places` | `actions/places.ts` (add, addInline, update, updateNote, remove, reorder, optimize) | `loadTrip` | `place-form` · `place-search-picker` · `place-manual-form` · `place-autocomplete` · `place-row` · `place-preview-modal` · `place-note-modal` · `sortable-place-list` · `sortable-place-item` |
| Segment | `segments` | `actions/segments.ts` (setMode, setDayDefault) | included in `loadTrip` | `segment` · `segment-mode-picker` |
| HotelBooking | `hotelBookings` | `actions/bookings.ts` (addHotel, addHotelInline, updateHotel, updateHotelInline, removeHotel, removeHotelRedirect) · `actions/segments.ts` (`setHotelLegModeAction`) | `lib/trip-queries.ts` `loadHotelsForTrip`, `loadBookingCounts`, `loadBookingsForTrip` | `hotel-form` (server wrapper) · `hotel-form-client` · `hotel-place-picker` · `hotel-search-picker` · `hotel-manual-form` · `hotel-dates-modal` · `hotel-preview-modal` · `hotel-edit-modal` · `hotel-edit-launcher` · `hotels-view` (legacy, redirects) · `bookings-view` · `booking-card-stay` · `booking-card-ride` |
| TransportBooking | `transportBookings` | `actions/bookings.ts` (addTransport, updateTransport, removeTransport) | `loadBookingCounts`, `loadTransportForTrip`, `loadBookingsForTrip` | `transport-form` (server wrapper) · `transport-form-client` · `transport-place-picker` · `itinerary-ride-row` |
| Expense | `expenses` | `actions/expenses.ts` (add, update, remove, `exportExpensesCsv`) | `lib/expense-queries.ts` | `expense-form` · `budget-view` — `loadEditableExpenses` feeds the overlay form's `EditableExpense` shape, `BudgetRow` feeds the displayed list; deliberately different shapes, don't reuse one for the other |
| Budget config | `trips.currency`, `trips.budgetConfig` (jsonb) | `actions/budget.ts` (`saveTripBudgetAction`) | read with the trip row | `budget-settings-form` |
| Note + ChecklistItem | `notes`, `checklistItems` | `actions/notes.ts` (8 actions: addNote, rename, updateDocBody, removeNote, add/toggle/reorder/remove checklist items) | `lib/note-queries.ts` | `notes-view` |
| Invite | `invites`, `tripMemberships` | `actions/invites.ts` (create, revoke, accept) | inline in `trip/[id]/settings/page.tsx` | `settings-folio` |
| Account / Session | Auth.js tables | `actions/auth.ts` (signIn, signOut) | `lib/auth.ts` | `account-menu` · `header` |
| TripMembership | `tripMemberships` | enforced via `lib/trip-access.ts` + `lib/with-trip-auth.ts` | `getTripRole`, `permsFor`, `canWrite`, `canManageInvites` | n/a (server-side guard) |
| AuditEvent | (table) | `lib/audit.ts` `writeAudit` | n/a | n/a |
| UserSettings | (cookie+DB) | `actions/settings.ts` `saveSettingsAction` | `lib/user-settings.ts`, `lib/user-settings-types.ts` | `settings-folio` · `settings/page.tsx` |
| Calendar view | derived | n/a | `lib/calendar-queries.ts` · `lib/ics-queries.ts` (.ics export) | `calendar-view` |
| Demo seed | n/a | `actions/seed.ts` `seedDemoTripAction` | `lib/seed-trip.ts` (data: `lib/seed/days.ts`, `lib/seed-days.ts`) | `trip-grid-empty` |

---

## Pages & routes (`app/src/app/`)

| Path | Purpose |
|---|---|
| `layout.tsx` | Root layout, fonts (Geist + Noto Sans Thai fallback via `--font-sans`/`--font-mono`), theme, i18n setup |
| `page.tsx` | Home — trip grid signed in; public landing + `anon` rate-limit bucket signed out |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | Root fallbacks |
| `sign-in/page.tsx` | OAuth sign-in (Google) + email magic-link |
| `sign-in/verify-request/page.tsx` | Magic-link sent confirmation |
| `sign-in/error/page.tsx` | OAuth error display (+ `RateLimited`) |
| `sign-in/not-invited/page.tsx` | Invite-only rejection page; never echoes the attempted address |
| `invite/[token]/page.tsx` | Accept trip invite (creates `trip_membership`) |
| `trip/new/page.tsx` | Trip create form |
| `trip/[id]/layout.tsx` | Header + flex shell; builds map data + hosts the persistent map (Maps #3b) |
| `trip/[id]/page.tsx` | Trip hub: itinerary list column (map now in the layout) |
| `opengraph-image.tsx` | Root OG card for the shared production URL (static, no DB) |
| `api/internal/prune-rate-limit/route.ts` | Cron target: delete stale `rate_limit` rows (`Bearer $CRON_SECRET`) |
| `trip/[id]/opengraph-image.tsx` | OG image (Maps #5): Static Map + title; public trips only, generic card otherwise |
| `trip/[id]/calendar/page.tsx` | Multi-day calendar grid |
| `trip/[id]/calendar/export/route.ts` | `.ics` download (RFC 5545); 401 without session, 404 for non-members |
| `trip/[id]/bookings/page.tsx` | Consolidated Bookings (stays + transport) view |
| `trip/[id]/hotels/page.tsx` | Legacy — redirects to /bookings |
| `trip/[id]/transport/page.tsx` | Legacy — redirects to /bookings |
| `trip/[id]/notes/page.tsx` | Collaborative notes editor |
| `trip/[id]/budget/page.tsx` | Budget summary + expenses + budget settings (currency, target, caps) |
| `settings/page.tsx` | Account preferences + API tokens |
| `trip/[id]/settings/page.tsx` | Trip details + budget + people + integrations + delete |
| `trip/[id]/day/[dayId]/place/new/page.tsx` | Add place to a day |
| `trip/[id]/place/[placeId]/edit/page.tsx` | Edit place |
| `trip/[id]/booking/hotel/new/page.tsx` | Add hotel booking |
| `trip/[id]/booking/hotel/[bookingId]/edit/page.tsx` | Edit hotel booking |
| `trip/[id]/booking/transport/new/page.tsx` | Add transport (intent-first form) |
| `trip/[id]/booking/transport/[bookingId]/edit/page.tsx` | Edit transport (intent-first form) |
| `trip/[id]/expense/new/page.tsx` | Add expense |
| `trip/[id]/expense/[expenseId]/edit/page.tsx` | Edit expense |
| `trip/[id]/budget/export/route.ts` | GET — CSV export of budget (known gap: expense rows only, no booking-derived costs) |
| `api/auth/[...nextauth]/route.ts` | Auth.js v5 route handler |
| `api/me/route.ts` | GET current user from session |

---

## Server actions (`app/src/app/actions/`)

All exports start with `'use server';`. After auth migration, every action begins with `const userId = await requireUserId();` (from `@/lib/with-trip-auth`).

| File | Exports |
|---|---|
| `auth.ts` | `signInGoogleAction`, `signOutAction` |
| `bookings.ts` | `addHotelAction`, `addHotelInlineAction`, `updateHotelAction`, `updateHotelInlineAction`, `removeHotelAction`, `addTransportAction`, `updateTransportAction`, `removeTransportAction` |
| `days.ts` | `addDayAction`, `removeDayAction` |
| `expenses.ts` | `addExpenseAction`, `updateExpenseAction`, `removeExpenseAction`, `exportExpensesCsv` |
| `invites.ts` | `createInviteAction`, `revokeInviteAction`, `acceptInviteAction` |
| `notes.ts` | `addNoteAction`, `renameNoteAction`, `updateDocBodyAction`, `removeNoteAction`, `addChecklistItemAction`, `toggleChecklistItemAction`, `reorderChecklistItemsAction`, `removeChecklistItemAction` |
| `places.ts` | `addPlaceAction`, `addPlaceInlineAction`, `updatePlaceAction`, `updatePlaceNoteAction`, `removePlaceAction`, `reorderPlacesAction`, `optimizeRouteAction` |
| `seed.ts` | `seedDemoTripAction` |
| `segments.ts` | `setSegmentModeAction`, `persistSegmentLegAction`, `setHotelLegModeAction`, `setDayDefaultModeAction` |
| `settings.ts` | `saveSettingsAction` |
| `trips.ts` | `createTripAction`, `updateTripAction`, `deleteTripAction` |

### Action conventions

- `requireUserId()` from `@/lib/with-trip-auth` — auth gate
- `requireTripWrite(tripId)` — auth + role check for write
- `requireTripOwner(tripId)` — auth + owner-only check
- `trimOrNull` / `parseNumber` / `parseInt32` from `@/lib/form-parsers` — form data parsing
- `touchTrip(tripId)` from `@/lib/touch-trip` — bumps `trip.updatedAt`
- `writeAudit(...)` from `@/lib/audit` — audit log
- Domain-specific `ownsX(userId, id)` helpers stay co-located with their action file (they fetch + role-check in one shot)

---

## Components (`app/src/components/`)

### Layout / chrome
| File | Purpose |
|---|---|
| `header.tsx` | App header (logo, account-menu) |
| `account-menu.tsx` | User avatar dropdown |
| `trip-nav.tsx` | Trip tab nav (hub, calendar, bookings, notes, budget) |
| `trip-rail.tsx` / `trip-rail-frame.tsx` | Horizontal trip mini-cards |
| `trip-card.tsx` | Trip grid card |
| `trip-delete-button.tsx` | Trip delete trigger; opens shared `confirm-dialog` |
| `confirm-dialog.tsx` | Shared destructive-action confirm modal (Cancel prominent); used by trip + booking removal |
| `trip-cover.tsx` | Cover thumbnail |
| `trip-grid-empty.tsx` | Empty-state w/ seed-demo button |

### UI primitives (`components/ui/`)

Shared, token-driven design-system primitives. Extend these for new UI — don't add a parallel button/card/modal. Full reference (tokens, dark mode, usage): [`components/ui/README.md`](app/src/components/ui/README.md).

| File | Purpose |
|---|---|
| `ui/button.tsx` | `Button` — variant (primary/secondary/outline/ghost/danger) + size (sm/md/lg/icon) + `loading` state |
| `ui/card.tsx` | `Card`, `CardHeader`, `CardBody`, `CardTitle` — surface container |
| `ui/badge.tsx` | `Badge` — variant (neutral/brand/success/warning/danger) |
| `ui/input.tsx` | `Input`, `Textarea`, `Select`, `Label` — form fields with consistent focus rings |
| `ui/skeleton.tsx` | `Skeleton` — pulsing loading placeholder |
| `ui/cn.ts` | `cn()` — tailwind-merge class joiner so caller `className` deterministically wins |
| `ui/index.ts` | Barrel — import all of the above from `@/components/ui` (the convention) |
| `ui/page-container.tsx` | `PageContainer` — content-width wrapper (`--page-max: 1200px`); server-safe |
| `ui/modal.tsx` | `Modal`, `useTopmostOverlay` — overlay shell: portal, scrim, focus trap/restore, Esc, scroll lock; `onRequestClose` is a request not a command; `size="sm"` for single-field dialogs |
| `ui/overlay-link.tsx` | `OverlayLink` — link to the standalone route that opens an overlay on a plain left click; modified/middle clicks navigate. Every overlay trigger uses this |

### Forms
| File | Purpose |
|---|---|
| `trip-create-form.tsx` | New trip (name, dates) |
| `trip-settings-form.tsx` | Edit trip name + dates from settings |
| `place-form.tsx` | Edit place full form |
| `place-manual-form.tsx` | Manual fallback when Maps API missing |
| `hotel-form.tsx` | Server entry — thin wrapper around hotel-form-client |
| `hotel-form-client.tsx` | Intent-first Add/Edit hotel form: Places picker, derived nights, Additional-info disclosure, inline delete (booking design, matches transport-form-client) |
| `hotel-place-picker.tsx` | Google Places (lodging) search → name+address chip; reports name/address/lat/lng/placeId |
| `hotel-manual-form.tsx` | Manual hotel fallback (used inside `hotel-search-picker`) |
| `transport-form.tsx` | Server entry — thin wrapper around transport-form-client |
| `transport-form-client.tsx` | Intent-first Add/Edit form: Places pickers, computed title, TZ-aware arrival, duration steppers |
| `transport-place-picker.tsx` | Google Places search → editable code chip; reports selection + utcOffsetMinutes |
| `expense-form.tsx` | Expense add/edit |
| `submit-button.tsx` | `SubmitButton` — disabled-during-submit primitive; the only submit control (`PendingButton` was removed, don't reintroduce it) |

### Map
| File | Purpose |
|---|---|
| `persistent-map.tsx` | Persistent+lazy map host — reads day/place from URL, owns the one `MapsProvider`, mounted by the trip **layout** (Maps #3b) |
| `real-map-canvas.tsx` | Presentational `<Map>` + overlays (provider hoisted out; `onActivate` prop) |
| `map-pin-badge.tsx` | Numbered marker badge |
| `map-active-focus.tsx` | Recenters map on active place / day (pin-set) change |
| `map-panel-toggle.tsx` | Mobile show/hide map button (CSS-only, no remount) |

Persistent map (Maps #3b): the `<Map>` lives in `trip/[id]/layout.tsx` (via `persistent-map.tsx`), not the page, so a single Dynamic Maps load survives day + sub-page navigation. The layout builds all days' pins with `lib/day-augment.ts` (`buildMapDays`, also exports `ridesForDay` — transport bookings → itinerary, by dayIdx); the client component selects the active day via `useSearchParams` + gates to the itinerary route via `usePathname`, lazy-mounting the map on first open.

Routes API dropped (Maps #3a): `map-directions.tsx`, `lib/routes-server.ts`, and `actions/routes.ts` removed — per-leg routing is deep-linked out via `lib/gmaps.ts`. No on-map polylines; leg distance/time is no longer auto-computed (existing persisted values remain).

→ helpers in `lib/map-helpers.ts` (`Pin`, `Mode`, `KIND_COLOR`, `MODE_COLOR`, `toGoogleMode`, `centroid`, `deriveZoom`)

### Itinerary
| File | Purpose |
|---|---|
| `days-accordion.tsx` | Per-day collapsible w/ place list |
| `day-header.tsx` | Day title + summary + add button |
| `day-mode-picker.tsx` | Default-mode selector for a day |
| `sortable-place-list.tsx` | dnd-kit list orchestrator |
| `sortable-place-item.tsx` | Single drag-handle row |
| `place-row.tsx` | Static (non-drag) place row |
| `segment.tsx` | Single transport segment row |
| `segment-mode-picker.tsx` | Mode switcher (drive/walk/transit) |
| `optimize-strip.tsx` | "Save 47m by reordering" CTA |

### Place pickers (Google Places search)
| File | Purpose |
|---|---|
| `place-autocomplete.tsx` | Inline autocomplete input (used inside place-form) |
| `place-search-picker.tsx` | Add-place orchestrator |
| `place-preview-modal.tsx` | Confirm-place preview modal |
| `place-note-launcher.tsx` / `place-note-modal.tsx` | Per-place quick-note modal |

→ shared adapters in `lib/places-adapter.ts` (`adaptSuggestions`, `kindFromTypes`, `Prediction`, `Kind`)

### Hotel pickers
| File | Purpose |
|---|---|
| `hotel-search-picker.tsx` | Add-hotel orchestrator |
| `hotel-dates-modal.tsx` | Check-in / check-out date+time modal (also exports `HotelDates` type) |
| `hotel-preview-modal.tsx` | Confirm-hotel preview modal |
| `hotel-edit-modal.tsx` / `hotel-edit-launcher.tsx` | Quick-edit modal |
| `hotels-view.tsx` | Hotels list page (legacy — page redirects to /bookings) |

### Tab views
| File | Purpose |
|---|---|
| `calendar-view.tsx` | Multi-day grid |
| `bookings-view.tsx` | Consolidated travel-wallet: stays + rides, filter, gap markers, add chooser |
| `booking-card-stay.tsx` | Hotel key-card |
| `booking-card-ride.tsx` | Transport boarding-pass card |
| `itinerary-ride-row.tsx` | Transport ride row shown on the itinerary day, links to /bookings |
| `notes-view.tsx` | Notes editor (checklist + doc) |
| `alert.tsx` | Shared page-level notice (warning/danger/info + one action) |
| `budget-view.tsx` | Budget summary + mixed expense/booking list |
| `budget-settings-form.tsx` | Currency, budget target + per-category caps (client) |
| `expense-form.tsx` | Add/edit expense — booking-form shell; currency comes from the trip; imperative `requestClose` handle for overlay hosts |
| `expense-modal-host.tsx` | Client island owning the budget page's expense add/edit overlay (`ExpenseModalHost`) + leaf triggers (`ExpenseAddTrigger`, `ExpenseRowTrigger`) consumed from server-rendered `budget-view.tsx` |
| `settings-folio.tsx` | Shared settings folio shell + primitives for /settings and /trip/[id]/settings |

### Primitives
| File | Purpose |
|---|---|
| `confirm-dialog.tsx` | Destructive-action confirm dialog — its own implementation, not built on `ui/modal.tsx`; sits at `--z-toast` so it stacks above a `Modal`, and claims the topmost-overlay slot so Escape reaches only it |
| `use-dirty-form.ts` | `useDirtyForm()` — binds `lib/form-dirty.ts` to a `<form>` ref; gates close paths through one discard-confirm (not unit-tested — browser-verified) |
| `icons.tsx` | Icon sprite library (30+ named exports) |
| `spinner.tsx` | Loading spinner |
| `saved-ago.tsx` | "Saved Xm ago" badge |
| `theme-watcher.tsx` | Dark-mode listener (currently disabled) |

---

## Lib (`app/src/lib/`)

### Auth + access
| File | Purpose |
|---|---|
| `auth.ts` | NextAuth v5 config (Google + email + Drizzle adapter) + `callbacks.signIn` invite gate; exports `NOT_INVITED_PATH` |
| `access-gate.ts` | `hasGrant`/`grantSource` — existing account → existing user → `ACCESS_ALLOWLIST` → pending trip invite |
| `access-policy.ts` | Pure: `normalizeEmail`, `parseAllowlist`, `isAllowlisted` (unit-tested) |
| `anon-rate-limit.ts` | `consumeAnonBudget(bucket)` — hashed-IP keys, `signin`/`join`/`anon` budgets |
| `with-trip-auth.ts` | `requireUserId`, `requireTripWrite`, `requireTripOwner` — call at top of every server action |
| `trip-access.ts` | `getTripRole`, `canWrite`, `canManageInvites`, `assertCanWrite`, `permsFor` — role helpers (with React `cache`) |

### Form / data parsing
| File | Purpose |
|---|---|
| `form-parsers.ts` | `trimOrNull`, `parseNumber`, `parseInt32` — use these in every server action |
| `form-dirty.ts` | `snapshotForm`, `serializeEntries`, `isDirty` — pure dirty-detection for a `<form>` (node-testable, skips `File` values) |

### Maps
| File | Purpose |
|---|---|
| `maps-config.ts` | `GOOGLE_MAPS_API_KEY` — single source for the API key |
| `places-adapter.ts` | `adaptSuggestions`, `kindFromTypes`, `Prediction`, `Kind` |
| `place-details.ts` | `fetchPlaceDetails(placesLib, id, fields)` — Places `fetchFields` bridge |
| `map-helpers.ts` | `Pin`, `Mode`, `KIND_COLOR`, `MODE_COLOR`, `toGoogleMode`, `centroid`, `deriveZoom` |
| `gmaps.ts` | Google Maps URL builders |
| `static-map.ts` | Static Maps URL builder + fetch→data-URI (server key, optional HMAC signing) — Maps #5 |
| `trip-date-bounds.ts` | `tripDateBounds(start, end)` → `{min, max, fallback}` (±3d) for booking date pickers |

### Queries (read paths)
| File | Purpose |
|---|---|
| `trip-queries.ts` | `loadTrip`, `loadHotelsForTrip`, `loadBookingCounts`, `loadBookingsForTrip`, `loadTransportForTrip` — primary trip-hub reader |
| `calendar-queries.ts` | Calendar tab reads |
| `ics.ts` | RFC 5545 writer — escaping, 75-octet folding, all-day DTEND exclusive (pure) |
| `ics-queries.ts` | Trip → VEVENT list + `exportTripIcs` (DB reads) |
| `expense-queries.ts` | Budget aggregation — expenses + costs derived from bookings, single-currency; `RECENT_LIMIT`, `loadEditableExpenses` |
| `editable-expense.ts` | `toEditableExpense` mapper — DB row → the form-shaped `EditableExpense` (unit-tested, pure) |
| `currency.ts` | ISO-4217 alpha-3 normalization, shared by forms + services |
| `note-queries.ts` | Notes reads |
| `bookings-merge.ts` | Pure merge/sort of hotels+transport + gap-night detection (BookingItem) |
| `booking-format.ts` | computeNights / nightsLabel / formatCost / shortDate for booking cards |
| `transport-compute.ts` | deriveCode, shortPlaceLabel, computeTitle, computeArrival (TZ), arrivalBadge |
| `hotel-compute.ts` | computeNights, nightsLabel, computeCheckOut (calendar/UTC date math) |

### Misc
| File | Purpose |
|---|---|
| `audit.ts` | `writeAudit({...})` — best-effort audit log writer |
| `touch-trip.ts` | `touchTrip(tripId)` — bumps `trip.updatedAt` |
| `units.ts` | Distance + temperature unit conversion (metric ↔ imperial) |
| `i18n.ts` / `i18n-client.ts` | Server / client translators |
| `user-settings.ts` / `user-settings-types.ts` | Settings loader (server-only) + client-safe types |
| `seed-trip.ts` + `seed/days.ts` | Demo "Mount Fuji & Kamakura" seed data |
| `seed-days.ts` | `seedTripDays(tripId, start, end)` — empty-day generator on trip create |

---

## DB (`app/src/db/`)

| File | Purpose |
|---|---|
| `schema.ts` | Drizzle ORM schema — every entity (565 LOC, single source of truth) |
| `index.ts` | DB client (`db`) — Neon serverless |

Migrations: `app/drizzle/` (committed SQL).

---

## How to add things

### New server action
1. Pick the matching `actions/*.ts` file (or create one if a new entity).
2. Add `'use server';` at top if new file.
3. Start with `const userId = await requireUserId();` (or `requireTripWrite(tripId)` if you have the tripId).
4. Use `trimOrNull` / `parseNumber` / `parseInt32` from `@/lib/form-parsers`.
5. End with `await touchTrip(tripId)`, `await writeAudit({...})`, then `revalidatePath(...)` or `redirect(...)`.
6. Update the **Server actions** table in this file.

### New entity
1. Add table in `db/schema.ts`.
2. `pnpm db:generate` → commit the SQL in `app/drizzle/`.
3. Add an action file under `app/src/app/actions/`.
4. Add a query file under `app/src/lib/` if it has reads.
5. Update `REQUIREMENTS.md` §4 entity tables (source of truth).
6. Update **Entity → file map** in this file.

### New modal
- Use `<ModalShell ariaLabel="..." onClose={...}>`. Don't reinvent the overlay div.

### Maps API
- Import `GOOGLE_MAPS_API_KEY` from `@/lib/maps-config`. Don't read `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` directly.
- Import `adaptSuggestions` / `kindFromTypes` from `@/lib/places-adapter`.

### Maps types/helpers
- `Pin`, `Mode` types from `@/lib/map-helpers`. Don't redefine.

---

## Out-of-scope of this index

- Detailed entity field shapes → `REQUIREMENTS.md` §4
- Stack rationale → `ARCHITECTURE.md`
- Conventions / delegation rules → `AGENTS.md`
- Onboarding for humans → `README.md`
- Maps Platform SKUs, quota caps & budget alerts → `docs/ops/maps-cost-guardrails.md`
