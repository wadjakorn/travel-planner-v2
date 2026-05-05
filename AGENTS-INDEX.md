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
| Trip | `trips` | `actions/trips.ts` (create, delete) · `actions/settings.ts` (save) | `lib/trip-queries.ts` `loadTrip` | `trip-create-form` · `settings-modal` · `trip-card` · `trip-rail` |
| Day | `days` | `actions/days.ts` (add, remove) · `actions/segments.ts` (`setDayDefaultModeAction`) | `loadTrip` (trip-queries) | `days-accordion` · `day-header` · `day-mode-picker` |
| Place | `places` | `actions/places.ts` (add, addInline, update, updateNote, remove, reorder, optimize) | `loadTrip` | `place-form` · `place-search-picker` · `place-manual-form` · `place-autocomplete` · `place-row` · `place-preview-modal` · `place-note-modal` · `sortable-place-list` · `sortable-place-item` |
| Segment | `segments` | `actions/segments.ts` (setMode, persistLeg, setDayDefault) | included in `loadTrip` | `segment` · `segment-mode-picker` · `map-directions` |
| HotelBooking | `hotelBookings` | `actions/bookings.ts` (addHotel, addHotelInline, updateHotel, updateHotelInline, removeHotel) · `actions/segments.ts` (`setHotelLegModeAction`) | `lib/trip-queries.ts` `loadHotelsForTrip`, `loadBookingCounts` | `hotel-form` · `hotel-search-picker` · `hotel-manual-form` · `hotel-dates-modal` · `hotel-preview-modal` · `hotel-edit-modal` · `hotel-edit-launcher` · `hotels-view` |
| TransportBooking | `transportBookings` | `actions/bookings.ts` (addTransport, updateTransport, removeTransport) | `loadBookingCounts` | `transport-form` · `transport-form-route-fields` · `transport-form-meta-fields` · `transport-view` |
| Expense | `expenses` | `actions/expenses.ts` (add, update, remove, `exportExpensesCsv`) | `lib/expense-queries.ts` | `expense-form` · `budget-view` |
| Note + ChecklistItem | `notes`, `checklistItems` | `actions/notes.ts` (8 actions: addNote, rename, updateDocBody, removeNote, add/toggle/reorder/remove checklist items) | `lib/note-queries.ts` | `notes-view` |
| Invite | `invites`, `tripMemberships` | `actions/invites.ts` (create, revoke, accept) | inline in `settings/page.tsx` | `settings-modal` |
| Account / Session | Auth.js tables | `actions/auth.ts` (signIn, signOut) | `lib/auth.ts` | `account-menu` · `header` |
| TripMembership | `tripMemberships` | enforced via `lib/trip-access.ts` + `lib/with-trip-auth.ts` | `getTripRole`, `permsFor`, `canWrite`, `canManageInvites` | n/a (server-side guard) |
| AuditEvent | (table) | `lib/audit.ts` `writeAudit` | n/a | n/a |
| UserSettings | (cookie+DB) | `actions/settings.ts` `saveSettingsAction` | `lib/user-settings.ts`, `lib/user-settings-types.ts` | `settings-modal` |
| Calendar view | derived | n/a | `lib/calendar-queries.ts` | `calendar-view` |
| Demo seed | n/a | `actions/seed.ts` `seedDemoTripAction` | `lib/seed-trip.ts` (data: `lib/seed/days.ts`, `lib/seed-days.ts`) | `trip-grid-empty` |

---

## Pages & routes (`app/src/app/`)

| Path | Purpose |
|---|---|
| `layout.tsx` | Root layout, fonts, theme, i18n setup |
| `page.tsx` | Home — trip grid + empty state seed-demo |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | Root fallbacks |
| `sign-in/page.tsx` | OAuth sign-in (Google) + email magic-link |
| `sign-in/verify-request/page.tsx` | Magic-link sent confirmation |
| `sign-in/error/page.tsx` | OAuth error display |
| `invite/[token]/page.tsx` | Accept trip invite (creates `trip_membership`) |
| `trip/new/page.tsx` | Trip create form |
| `trip/[id]/layout.tsx` | Trip nav wrapper (`TripNav`) |
| `trip/[id]/page.tsx` | Trip hub: itinerary + map (RealMapCanvas) |
| `trip/[id]/calendar/page.tsx` | Multi-day calendar grid |
| `trip/[id]/hotels/page.tsx` | Hotels list view |
| `trip/[id]/transport/page.tsx` | Transport segments list |
| `trip/[id]/notes/page.tsx` | Collaborative notes editor |
| `trip/[id]/budget/page.tsx` | Budget summary + expenses |
| `trip/[id]/settings/page.tsx` | Trip settings (name, dates, members, invites) |
| `trip/[id]/day/[dayId]/place/new/page.tsx` | Add place to a day |
| `trip/[id]/place/[placeId]/edit/page.tsx` | Edit place |
| `trip/[id]/booking/hotel/new/page.tsx` | Add hotel booking |
| `trip/[id]/booking/hotel/[bookingId]/edit/page.tsx` | Edit hotel booking |
| `trip/[id]/booking/transport/new/page.tsx` | Add transport segment |
| `trip/[id]/booking/transport/[bookingId]/edit/page.tsx` | Edit transport segment |
| `trip/[id]/expense/new/page.tsx` | Add expense |
| `trip/[id]/expense/[expenseId]/edit/page.tsx` | Edit expense |
| `trip/[id]/budget/export/route.ts` | GET — CSV export of budget |
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
| `trips.ts` | `createTripAction`, `deleteTripAction` |

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
| `trip-nav.tsx` | Trip tab nav (hub, calendar, hotels, transport, notes, budget) |
| `trip-rail.tsx` / `trip-rail-frame.tsx` | Horizontal trip mini-cards |
| `trip-card.tsx` | Trip grid card |
| `trip-cover.tsx` | Cover thumbnail |
| `trip-grid-empty.tsx` | Empty-state w/ seed-demo button |

### Forms
| File | Purpose |
|---|---|
| `trip-create-form.tsx` | New trip (name, dates) |
| `place-form.tsx` | Edit place full form |
| `place-manual-form.tsx` | Manual fallback when Maps API missing |
| `hotel-form.tsx` | Hotel booking add/edit |
| `hotel-manual-form.tsx` | Manual hotel fallback (used inside `hotel-search-picker`) |
| `transport-form.tsx` | Orchestrator — composes route-fields + meta-fields |
| `transport-form-route-fields.tsx` | From/To location + datetime + terminal |
| `transport-form-meta-fields.tsx` | Duration / seats / bag / cost / attachment |
| `expense-form.tsx` | Expense add/edit |
| `submit-button.tsx` | Disabled-during-submit primitive |

### Map
| File | Purpose |
|---|---|
| `real-map-canvas.tsx` | Orchestrator — APIProvider + Map + overlays |
| `map-pin-badge.tsx` | Numbered marker badge |
| `map-active-focus.tsx` | Pans map to active place |
| `map-directions.tsx` | Routes lib calls + polyline rendering + persistence wiring |
| `map-panel-toggle.tsx` | Mobile show/hide map button |

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
| `hotels-view.tsx` | Hotels list page |

### Tab views
| File | Purpose |
|---|---|
| `calendar-view.tsx` | Multi-day grid |
| `transport-view.tsx` | Transport list |
| `notes-view.tsx` | Notes editor (checklist + doc) |
| `budget-view.tsx` | Budget summary + expense list |
| `settings-modal.tsx` | Trip settings (name, dates, members, invites) |

### Primitives
| File | Purpose |
|---|---|
| `modal-shell.tsx` | Reusable overlay+dialog (use this for new modals; in-flight migration of older modals) |
| `icons.tsx` | Icon sprite library (30+ named exports) |
| `spinner.tsx` | Loading spinner |
| `saved-ago.tsx` | "Saved Xm ago" badge |
| `theme-watcher.tsx` | Dark-mode listener (currently disabled) |

---

## Lib (`app/src/lib/`)

### Auth + access
| File | Purpose |
|---|---|
| `auth.ts` | NextAuth v5 config (Google + email + Drizzle adapter) |
| `with-trip-auth.ts` | `requireUserId`, `requireTripWrite`, `requireTripOwner` — call at top of every server action |
| `trip-access.ts` | `getTripRole`, `canWrite`, `canManageInvites`, `assertCanWrite`, `permsFor` — role helpers (with React `cache`) |

### Form / data parsing
| File | Purpose |
|---|---|
| `form-parsers.ts` | `trimOrNull`, `parseNumber`, `parseInt32` — use these in every server action |

### Maps
| File | Purpose |
|---|---|
| `maps-config.ts` | `GOOGLE_MAPS_API_KEY` — single source for the API key |
| `places-adapter.ts` | `adaptSuggestions`, `kindFromTypes`, `Prediction`, `Kind` |
| `place-details.ts` | `fetchPlaceDetails(placesLib, id, fields)` — Places `fetchFields` bridge |
| `map-helpers.ts` | `Pin`, `Mode`, `KIND_COLOR`, `MODE_COLOR`, `toGoogleMode`, `centroid`, `deriveZoom` |
| `gmaps.ts` | Google Maps URL builders |

### Queries (read paths)
| File | Purpose |
|---|---|
| `trip-queries.ts` | `loadTrip`, `loadHotelsForTrip`, `loadBookingCounts` — primary trip-hub reader |
| `calendar-queries.ts` | Calendar tab reads |
| `expense-queries.ts` | Budget aggregation |
| `note-queries.ts` | Notes reads |

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
