# AGENTS-INDEX — file map for Travel Planner v2

Where to find things. Pairs with [AGENTS.md](AGENTS.md) (rules), [REQUIREMENTS.md](REQUIREMENTS.md) (what), [ARCHITECTURE.md](ARCHITECTURE.md) (why).

**Update rule**: when you add/move/rename a file under `app/src/`, update this index in the same PR.

---

## Quick reference

- Path alias: `@/*` → `app/src/*`
- Working dir for builds: `app/`
- Stack: Next.js 16 App Router · React 19 · TypeScript · Drizzle · Postgres (Neon) · Auth.js v5 · Tailwind v4 · `react-map-gl/maplibre` (MapLibre GL, OpenFreeMap) · `@vis.gl/react-google-maps` (google mode)

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

`app/.env.example` is canonical. Required at runtime: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_SERVER`, `EMAIL_FROM`. Optional: `GEOAPIFY_API_KEY` (server-only; Photon fallback without it).

---

## Entity → file map

Each row: schema row → mutation actions → query helper → forms / view components.

| Entity | Schema (`db/schema.ts`) | Actions | Reads | Forms / views |
|---|---|---|---|---|
| Trip | `trips` | `actions/trips.ts` (create, update, delete) · `actions/settings.ts` (save) | `lib/trip-queries.ts` `loadTrip` | `trip-create-form` · `trip-settings-form` · `settings-folio` · `trip-card` · `trip-rail` |
| Day | `days` | `actions/days.ts` (add, remove) · `actions/segments.ts` (`setDayDefaultModeAction`) | `loadTrip` (trip-queries) | `days-accordion` · `day-header` · `day-mode-picker` |
| Place | `places` | `actions/places.ts` (add, addInline, update, updateNote, remove, reorder, optimize) | `loadTrip` | `place-form` · `place-search-picker` · `place-manual-form` · `place-autocomplete` · `place-row` · `place-preview-modal` · `place-preview-card` · `place-note-modal` · `sortable-place-list` · `sortable-place-item` |
| Segment | `segments` | `actions/segments.ts` (setMode, setDayDefault) | included in `loadTrip` | `segment` · `segment-mode-picker` |
| HotelBooking | `hotelBookings` | `actions/bookings.ts` (addHotel, addHotelInline, updateHotel, updateHotelInline, removeHotel, removeHotelRedirect, restoreHotel) · `actions/segments.ts` (`setHotelLegModeAction`) | `lib/trip-queries.ts` `loadHotelsForTrip`, `loadBookingCounts`, `loadBookingsForTrip` | `hotel-form` (server wrapper) · `hotel-form-client` · `hotel-place-picker` · `bookings-view` · `booking-card-stay` · `booking-card-ride` |
| TransportBooking | `transportBookings` | `actions/bookings.ts` (addTransport, updateTransport, removeTransport, restoreTransport) | `loadBookingCounts`, `loadTransportForTrip`, `loadBookingsForTrip` | `transport-form` (server wrapper) · `transport-form-client` · `transport-place-picker` · `itinerary-ride-row` |
| Expense | `expenses` | `actions/expenses.ts` (add, update, remove, `exportExpensesCsv`) | `lib/expense-queries.ts` | `expense-form` · `budget-view` — `loadEditableExpenses` feeds the overlay form's `EditableExpense` shape, `BudgetRow` feeds the displayed list; deliberately different shapes, don't reuse one for the other |
| Budget config | `trips.currency`, `trips.budgetConfig` (jsonb; `budgetConfig.travelers` = per-person divisor → `lib/trip-travelers.ts`) | `actions/budget.ts` (`saveTripBudgetAction`) | read with the trip row | `budget-settings-form` |
| Note + ChecklistItem | `notes`, `checklistItems` | `actions/notes.ts` (8 actions: addNote, rename, updateDocBody, removeNote, add/toggle/reorder/remove checklist items) | `lib/note-queries.ts` | `notes-view` |
| Invite | `invites`, `tripMemberships` | `actions/invites.ts` (create, revoke, re-issue, accept) → `lib/services/invite-service.ts` (accept + regenerate, takes an executor) | inline in `trip/[id]/settings/page.tsx`; link shown once by `invite-link-reveal.tsx` | `settings-folio` |
| Account / Session | Auth.js tables | `actions/auth.ts` (signIn, signOut) | `lib/auth.ts` | `account-menu` · `header` |
| TripMembership | `tripMemberships` | enforced via `lib/trip-access.ts` + `lib/with-trip-auth.ts` | `getTripRole`, `permsFor`, `canWrite`, `canManageInvites` | n/a (server-side guard) |
| AuditEvent | (table) | `lib/audit.ts` `writeAudit` | n/a | n/a |
| UserSettings | (cookie+DB) | `actions/settings.ts` `saveSettingsAction` · `setLandingLangAction` (landing EN/ไทย switch → `lang` cookie) | `lib/user-settings.ts`, `lib/user-settings-types.ts` | `settings-folio` · `settings/page.tsx` |
| Calendar view | derived | n/a | `lib/calendar-queries.ts` · `lib/calendar-trip-range.ts` · `lib/ics-queries.ts` (.ics export) | `calendar-view` · `calendar-trip-range` |
| Demo seed | n/a | `actions/seed.ts` `seedDemoTripAction` | `lib/seed-trip.ts` (data: `lib/seed/days.ts`, `lib/seed-days.ts`) | `trip-grid-empty` |

---

## Pages & routes (`app/src/app/`)

| Path | Purpose |
|---|---|
| `layout.tsx` | Root layout, fonts (Geist + Noto Sans Thai fallback via `--font-sans`/`--font-mono`), theme, i18n setup, `<html lang>` from `getLang()` |
| `globals.css` | Design tokens (color, radius, shadow, z, `--header-h`, motion `--dur-*`/`--ease`, leading `--leading-*`), Thai line-height block (`[lang\|='th']`), global focus/reduced-motion |
| `design-foundations.test.ts` | DS guards: token contrast (ring/input/success ≥ WCAG), no platform font stacks, Thai leading, `<html lang>`, 12px text floor, no literal `57px`, module transitions on `--dur-*` (helpers `app/test/css-tokens.ts` + `app/test/src-files.ts`) |
| `(home)/page.tsx` | Home — trip grid signed in; public landing + `anon` rate-limit bucket signed out |
| `(home)/layout.tsx` / `(home)/loading.tsx` | Home chrome: Header (signed in only) stays mounted while `TripGridSkeleton` streams |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | Root fallbacks (`PageSkeleton`) |
| `sign-in/page.tsx` | OAuth sign-in (Google) + email magic-link |
| `sign-in/verify-request/page.tsx` | Magic-link sent confirmation |
| `sign-in/error/page.tsx` | OAuth error display (+ `RateLimited`) |
| `sign-in/not-invited/page.tsx` | Invite-only rejection page; never echoes the attempted address |
| `invite/[token]/page.tsx` | Accept trip invite (creates `trip_membership`) |
| `trip/new/page.tsx` | Trip create form |
| `trip/[id]/layout.tsx` | Header + `TripRail` + flex shell; builds map data + hosts the persistent map (Maps #3b) |
| `trip/[id]/loading.tsx`, `trip/[id]/{budget,bookings,calendar,settings,notes}/loading.tsx` | Destination-shaped skeletons from `skeletons.tsx`; chrome stays mounted in the layout |
| `trip/[id]/{booking,expense,day,place}/loading.tsx` | Form-route skeletons (`FormPanelSkeleton`, `PlaceSearchSkeleton`, `PlaceFormSkeleton`) built on each form's own shell classes |
| `trip/[id]/page.tsx` | Trip hub: itinerary list column (map now in the layout) |
| `opengraph-image.tsx` | Root OG card for the shared production URL: headline + real landing screenshot (static, prerendered, no DB) |
| `api/internal/prune-rate-limit/route.ts` | Cron target: delete stale `rate_limit` rows (`Bearer $CRON_SECRET`) |
| `trip/[id]/opengraph-image.tsx` | OG image (Maps #5): Static Map + title; public trips only, generic card otherwise |
| `trip/[id]/calendar/page.tsx` | Calendar: trip-range view (default) or month grid (`?view=`/`?ym=`) |
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
| `api/internal/purge-google-volatile/route.ts` | Cron target (`0 20 * * *` UTC): purge Google rating/reviews/hours older than 30 days (`Bearer $CRON_SECRET`) |
| `api/internal/google-resync/route.ts` | Cron target (`0 19 * * *` UTC): refresh Google details for upcoming trips' places, Google mode only (`Bearer $CRON_SECRET`) |
| `api/places/photo-ref/route.ts` | GET `?id=<google place id>` → `{ photo }` fresh first-photo ref (IDs-Only details, unbilled; never cached — Google ToS) for the pin card; own `gplaces:details:photo` cap; session required |
| `api/places/photo/route.ts` | GET `?name=places/…/photos/…` → JSON `{ uri }` (no-store) short-lived Google photo URL for the preview / pin card image; own `gplaces:photo` daily cap, never latches Google off; session required |
| `api/places/autocomplete/route.ts` | GET place search (Google first when `MAPS_PROVIDER=google`, else Geoapify, Photon fallback); a pasted Google Maps link or share text → suggestions; session required |
| `api/places/details/route.ts` | GET place details by provider-prefixed id |
| `api/me/route.ts` | GET current user from session |

Place-search proximity bias lives in `lib/places/bias.ts` (wire parsing and provider mapping), `lib/places/bias-center.ts` (pure trip/day centers), and `components/place-bias-context.tsx` (trip-layout context for search pickers).

---

## Server actions (`app/src/app/actions/`)

All exports start with `'use server';`. After auth migration, every action begins with `const userId = await requireUserId();` (from `@/lib/with-trip-auth`).

| File | Exports |
|---|---|
| `auth.ts` | `signInGoogleAction`, `signOutAction` |
| `bookings.ts` | `addHotelAction`, `addHotelInlineAction`, `updateHotelAction`, `updateHotelInlineAction`, `removeHotelAction`, `addTransportAction`, `updateTransportAction`, `removeTransportAction`, `restoreHotelAction`, `restoreTransportAction` (Undo of a list delete; return `ActionResult`; service `restoreHotel`/`restoreTransport` in `booking-service.ts` — write check on the booking's own trip, only within `UNDO_WINDOW_MS`) |
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
| `public-landing.tsx` | Signed-out `/` landing: hero + real product shots (`src/assets/landing/*.jpg`, demo trip captured at 2x) + features + footer. EN/TH copy from `landing_*` dict keys; language via `lib/landing-lang.ts` |
| `account-menu.tsx` | User avatar dropdown |
| `trip-rail.tsx` / `trip-rail-frame.tsx` / `trip-rail-items.ts` | Trip nav: icon + 12px label (rail 72px md+, bottom bar 56px mobile), mounted once by the trip layout; items from `trip-rail-items.ts` `railItemIds` (Notes shown disabled until shipped, Settings owner-only); active item from `useSelectedLayoutSegment`, pending ring via `useLinkStatus`; hidden on add/edit form routes |
| `skeletons.tsx` | Per-route loading skeletons (trip grid, itinerary, budget, bookings, calendar, settings, notes, form panel, place search/edit, generic page) |
| `trip-aside-class.ts` | `TRIP_ASIDE_CLASS` — itinerary column sizing shared by the page and its skeleton |
| `trip-card.tsx` | Trip grid card |
| `trip-delete-button.tsx` | Trip delete trigger; opens shared `confirm-dialog` |
| `confirm-dialog.tsx` | Shared destructive-action confirm, built on `ui/modal.tsx` (`role="alertdialog"`, Cancel prominent and gets initial focus, so Enter cancels); stacks above an open `Modal` by portal order; used by trip + booking removal, note discard, day-mode override |
| `trip-cover.tsx` | Cover thumbnail |
| `trip-grid-empty.tsx` | Empty-state w/ seed-demo button |

### UI primitives (`components/ui/`)

Shared, token-driven design-system primitives. Extend these for new UI — don't add a parallel button/card/modal. Full reference (tokens, dark mode, usage): [`components/ui/README.md`](app/src/components/ui/README.md).

| File | Purpose |
|---|---|
| `ui/button.tsx` | `Button` — variant (primary/secondary/outline/ghost/danger) + size (sm/md/lg/icon) + `loading` state |
| `ui/card.tsx` | `Card` — surface container (`rounded-2xl`, border, no shadow); used by error/not-found |
| `ui/badge.tsx` | `Badge` — variant (neutral/brand/success/warning/danger) |
| `ui/input.tsx` | `Input`/`Textarea`/`Select` (`invalid` → `aria-invalid` + danger border; `size` md\|lg on Input/Select), `inputClasses()` for non-`Input` fields, `Label` |
| `ui/skeleton.tsx` | `Skeleton` — shimmer placeholder (`.tp-skeleton`, `--skeleton` token; `.tp-on-muted` on surface-2 panels) |
| `ui/cn.ts` | `cn()` — tailwind-merge class joiner so caller `className` deterministically wins |
| `ui/index.ts` | Barrel — import all of the above from `@/components/ui` (the convention) |
| `ui/page-container.tsx` | `PageContainer` — content-width wrapper (`--page-max: 1200px`); server-safe |
| `ui/modal.tsx` | `Modal`, `useTopmostOverlay` — the only overlay shell: portal, scrim at `--z-modal` (above header/rail), focus trap/restore, Esc (topmost only), scroll lock; `onRequestClose` is a request not a command; `size="sm"` for single-field dialogs |
| `ui/scroll-lock.ts` | `bodyScrollLock` — ref-counted body scroll lock used by `Modal`, so nested modals closing together restore scrolling |
| `ui/segmented.tsx` | `Segmented`, `SegmentedOption` — single choice among 2–5 options: `role="group"` of `aria-pressed` buttons, ≥ 32×32 px, icon options use `label` as aria-label + title. Travel-mode pickers |
| `ui/overlay-link.tsx` | `OverlayLink` — link to the standalone route that opens an overlay on a plain left click; modified/middle clicks navigate. Every overlay trigger uses this |

### Forms
| File | Purpose |
|---|---|
| `trip-create-form.tsx` | New trip (name, dates) |
| `trip-settings-form.tsx` | Edit trip name + dates from settings |
| `place-form.tsx` | Edit place full form |
| `place-manual-form.tsx` | Manual fallback when Maps API missing; location via `LocationField` (required error focuses its input) |
| `hotel-form.tsx` | Server entry — thin wrapper around hotel-form-client |
| `hotel-form-client.tsx` | Intent-first Add/Edit hotel form: Places picker, derived nights, Additional-info disclosure, inline delete (booking design, matches transport-form-client) |
| `hotel-place-picker.tsx` | `/api/places` (Geoapify/Photon) search, lodging ranked first → name+address chip; reports name/address/lat/lng/placeId |
| `transport-form.tsx` | Server entry — thin wrapper around transport-form-client |
| `transport-form-client.tsx` | Intent-first Add/Edit form: Places pickers, computed title, TZ-aware arrival, duration steppers |
| `transport-place-picker.tsx` | `/api/places` (Geoapify/Photon) search → editable code chip; reports selection + utcOffsetMinutes |
| `expense-form.tsx` | Expense add/edit |
| `submit-button.tsx` | `SubmitButton` — pending = `Button loading` (spinner, disabled, label keeps width); no `pendingText`. The only submit control (`PendingButton` was removed, don't reintroduce it). `ActionSubmit` (`action-form.tsx`) is the same for `ActionForm` |

### Map
| File | Purpose |
|---|---|
| `location-field.tsx` | Shared picker field: coords/Google Maps link input (Enter/blur applies), the pin picker with a centre crosshair, "Use map center" (enabled once the map reports a centre), polite status line |
| `pin-picker-map.tsx` | Selector for the manual place pin picker: picks `-google` or `-maplibre` via `useMapRenderer()`; import this, not the renderers |
| `pin-picker-map-maplibre.tsx` / `pin-picker-map-google.tsx` | The two pin-picker renderers: click/tap or keyboard pan; cooperative gestures; `onCenterChange` (camera settled) / `focus` (recentre request, zoom ≥ `PICKER_FOCUS_ZOOM`); google has no `reuseMaps`, one load per open |
| `persistent-map.tsx` | Persistent+lazy map host — reads day/place from URL, mounted by the trip **layout** (Maps #3b); an empty day keeps the map, framed on `emptyDayFallback` (placeholder only when the trip has no located place) |
| `lib/maps/viewport-store.ts` | External store for the settled, normalized itinerary-map viewport; gates bias by route, visibility, and day |
| `real-map-canvas.tsx` | Selector for the trip map: picks `-google` or `-maplibre` via `useMapRenderer()` |
| `real-map-canvas-maplibre.tsx` | MapLibre `<Map>` + overlays (`onActivate` prop); frames each day with `fitBounds`; empty day: fallback frame + bottom-left note (`emptyNote`) |
| `real-map-canvas-google.tsx` | Google `<Map>` (`reuseMaps`, Advanced Markers) + overlays; mounts only while visible (`use-trip-map-visible.ts`); same `fitPadding` / max zoom 14 framing; empty day: fallback frame + bottom-left note (`emptyNote`) in place of the distance chips |
| `google-maps-api.tsx` | `GoogleMapsApi`: the single `APIProvider` wrapper (apiKey only; load error -> `markDegraded('load_error', e)`) every Google map mounts under |
| `maps-config-provider.tsx` | `MapsConfigProvider` (server config -> client), `useMapRenderer`, `useGoogleMapsConfig`; owns the per-page-session MapLibre fallback (`markDegraded(reason, detail?)` via `degradeOnce`: one log line, `onDegrade(reason)` hook; no-op in open mode; `gm_authFailure` -> `'auth'`) |
| `map-degraded-chip.tsx` | `MapDegradedChip`: top-right "Backup map · Google unavailable" chip in the MapLibre trip canvas while the session is degraded; dismiss lasts the page session (module flag) |
| `map-renderer-props.ts` | `RealMapCanvasProps`, `PinPickerMapProps`, `LatLng`: props shared by both renderers |
| `map-pick-dot.tsx` | `PickDot`: the blue dot marking a picked location, shared by both pickers |
| `use-trip-map-visible.ts` | `useTripMapVisible`: true when the map section is on screen (md+ or mobile full-map); `useIsWide` (md+) |
| `map-pin.tsx` / `map-pin.module.css` | `MapPin` (stop: drop / stay square, kind icon, active ring + name label; `interactive` = MapLibre named `<button>`, Google names the `AdvancedMarker` via `title`) + `PreviewPin` (dashed drop, `+`, pulses once). Colors = `--map-pin-*` tokens |
| `map-route-google.tsx` / `map-route-maplibre.tsx` | Day route lines (casing + mode-styled dashed line + mid-leg arrow, no labels); Google = non-clickable `Polyline`s (below the marker pane), MapLibre = one `tp-route` geojson source with casing / line / arrow-symbol layers, arrow images re-added after a style swap via `setMissingStyleImageResolver`; used inside the matching canvas, no selector |
| `map-active-focus-maplibre.tsx` / `map-active-focus-google.tsx` | Camera rules (`mapFocus`, TP-0095): reveal-only pin/POI focus (no move inside the safe area, else a minimal pan), search-preview framing, empty-day fallback, reduced-motion Google moves (`moveCamera`); refits on `frameSig` change; preview waits for a non-zero map size; used inside the matching canvas, no selector |
| `map-preview-context.tsx` | `MapPreviewProvider` (trip layout, renders no DOM) + `useMapPreview`: the search-result preview shared by picker and map (TP-0062) and the mobile full-map flag (mirrors `body[data-fullmap]`) |
| `pin-card.tsx` / `use-pin-photo.ts` | Active-pin card for an added Google place (photo + attribution, name, category · time, Google Maps link) + `PinTooltip` (hover, both renderers); text on light-locked `--map-card-*` (`pin-card.module.css`); photo ref fetched fresh per page session (`createCachedLookup`); image URL via `use-photo-uri.ts`, both read through `use-cached-value.ts` |
| `map-preview-marker.tsx` | `PreviewMarker` (renders `PreviewPin`) + `PreviewPopupBody` (the popup card, both renderers; `near` = nearest-stop distance line) |
| `use-poi-preview.ts` | `usePoiPreview`: tap a Google POI on the trip map (Google renderer, editors, `poiAdd`) → `fields=poi` details (page-session cache) → shared map preview (owner `poi`) → Add to the shown day (TP-0077) |
| `active-place-scroller.tsx` | Desktop: scrolls the itinerary to `?placeId=`'s row (`data-place-id`) when it changes, e.g. a pin click |
| `map-panel-toggle.tsx` | Mobile show/hide map button (CSS-only, no remount); state in `MapPreviewProvider` so "View on map" can open it |
| `map-stop-carousel.tsx` | Mobile full-map only (TP-0076): swipeable strip of the day's stops + day switcher; settled swipe / card tap -> `router.replace` (`select` in `persistent-map.tsx`), pin tap scrolls the strip; per-stop Navigate link. While it shows, the renderers skip the active pin card (`hidePinCard`) and globals.css hides zoom + distance chips |

Persistent map (Maps #3b): the `<Map>` lives in `trip/[id]/layout.tsx` (via `persistent-map.tsx`), not the page, so a single map instance survives day + sub-page navigation. The layout builds all days' pins with `lib/day-augment.ts` (`buildMapDays(trip, hotels, units, lang)` → pin `time` via `formatClock`; `MapDay.pins` numbered by list position, so a stop without coords leaves a gap, + `MapDay.legs` via `buildMapLegs`; `dayLegs` = per-leg mode by `segment.idx` + hotel legs, shared with the list in `trip/[id]/page.tsx` so list and map agree; also exports `ridesForDay` — transport bookings → itinerary, by dayIdx); the client component selects the active day via `useSearchParams` + gates to the itinerary route via `usePathname`, lazy-mounting the map on first open.

Routes API dropped (Maps #3a): `map-directions.tsx`, `lib/routes-server.ts`, and `actions/routes.ts` removed — per-leg routing is deep-linked out via `lib/gmaps.ts`. The on-map day route is straight lines between stored coords (`map-route-*.tsx`, no API call); leg distance/time is no longer auto-computed (existing persisted values remain).

→ helpers in `lib/map-helpers.ts` (`Pin`, `Mode`, `MapLeg`, `KIND_COLOR` = `var(--map-pin-*)`, `MODE_COLOR` / `ROUTE_NONE_COLOR` / `ROUTE_CASING_COLOR` = hex mirrors of `--map-route-*`, `LatLng`, `centroid` (null when empty — no default city), `deriveZoom`, `pinBounds`, `fitPadding`, `initialCamera` (points → preview → world view), `emptyDayFallback` (previous day → upcoming stay → whole trip), `emptyDayNote`, `frameSig`)
→ camera pixel math in `lib/map-camera.ts` (`toViewPx` / `offsetCenter` Web Mercator, `revealPan` minimal pan into a safe rect, `activeSafeArea` / `previewSafeArea` card clearance, `previewPadding`; flat camera only) — unit-tested
→ route rules in `lib/map-route.ts` (`routeStyle` color + dash, `googleDash`, `legsGeoJSON`, `arrowImageId` / `modeFromArrowImageId`, `arrowBitmap`; widths 3 / casing 7) — unit-tested
→ pin rules in `lib/map-pin.ts` (`pinTitle` accessible name, `pinShape`, `pinAnchor`, `pinPopupOffset`, `pinZIndex` + `PREVIEW_Z_INDEX` + `POPUP_Z_INDEX`; owns the shared marker z-scale: ghost 1 · route label 5 · pin 10 · cluster 15 · hover 50 · active 100 · preview 1000 · MapLibre popups 1100; the MapLibre `Map` is `isolation: isolate` so marker z-indexes stay inside it) — unit-tested
→ map tokens `--map-pin-*` / `--map-route-*` / `--map-card-*` in `globals.css` `:root` only (light in both themes); `lib/map-tokens.test.ts` checks contrast, the route-color mirrors (`MODE_COLOR`, `ROUTE_NONE_COLOR`, `ROUTE_CASING_COLOR`) and the light lock (helpers in `app/test/css-tokens.ts`)
→ carousel helpers in `lib/map-carousel.ts` (`dayNav`, `stopNavUrl`, `stopActivateHref`, `indexOfPin`) — unit-tested
→ search preview model in `lib/map-preview.ts` (`MapPreview`, `previewReducer` request tokens, `mapFocus(FocusInput)` camera outcomes, `PREVIEW_FRAME_MAX_M` (50 km: frame the day with a search preview), `POI_PREVIEW_OWNER`, `createCoordsResolver`, `toMapPreviewData`, `photoSrc`, `metersBetween` / `nearestStop` / `formatNear`) — unit-tested

### Itinerary
| File | Purpose |
|---|---|
| `days-accordion.tsx` | Per-day collapsible w/ place list |
| `day-header.tsx` | Day title + summary + add button |
| `day-mode-picker.tsx` | Default-mode selector for a day (`Segmented`: Mixed + Drive/Walk/Transit icons; non-mixed asks to confirm) |
| `sortable-place-list.tsx` | dnd-kit list orchestrator |
| `sortable-place-item.tsx` | Single drag-handle row |
| `place-row.tsx` | Place row: kind tile · name · meta (`★ rating · category · price` + TBD / Google closure / `Closed {weekday}` badges); expanded: photo, when, trip-day hours (`dayHours`, full week under "All week"), contact, note |
| `place-row-photo.tsx` | `PlaceRowPhoto` — expanded-row photo for Google places; shares the pin card's session cache (`usePinPhoto` + `PreviewPhoto`), so row + pin bill one Place Photo; fetches nothing while mobile full-map hides the list (carousel swipes expand rows) |
| `google-refresh-button.tsx` | "Update from Google" button on the edit-place page (Google mode only) |
| `segment.tsx` | Single transport segment row; a leg next to a stop without coords shows "No location for {stop} · Fix location" (`missingLocation`); renders nothing when an endpoint is absent |
| `segment-mode-picker.tsx` | Mode switcher (drive/walk/transit icon `Segmented`) |
| `optimize-strip.tsx` | "Save 47m by reordering" CTA |

### Place pickers (Geoapify/Photon search via `/api/places/*`)
| File | Purpose |
|---|---|
| `use-place-search.ts` | Hook: debounced search, ignores stale responses |
| `search-attribution.tsx` | Search-provider attribution line |
| `place-autocomplete.tsx` | Inline autocomplete input (used inside place-form) |
| `place-search-picker.tsx` | Add-place orchestrator |
| `place-preview-modal.tsx` | Confirm-place preview modal (mobile row tap / page variant); body is `place-preview-card.tsx` |
| `place-preview-card.tsx` | `PlacePreviewCard`: name, address, Google Maps link, Close, Add (+ photo with attribution); shared by the modal and the map preview popup (`compact`) |
| `place-note-launcher.tsx` / `place-note-modal.tsx` | Per-place quick-note modal |

→ search state in `components/use-place-search.ts` (debounce, stale-response guard); results from `lib/places/client.ts`; `components/search-attribution.tsx` shows OSM/Geoapify credit.

### Tab views
| File | Purpose |
|---|---|
| `calendar-view.tsx` | Calendar shell: Trip \| Month switch, month grid |
| `calendar-trip-range.tsx` | Trip-range columns (one per trip day + "Before/After trip" edges; stacked < md, column strip ≥ md) |
| `bookings-view.tsx` | Consolidated travel-wallet: single-column timeline (stays + rides), filter, gap markers, add chooser (header on desktop, floating on mobile) |
| `booking-card-stay.tsx` | Hotel key-card |
| `booking-card-ride.tsx` | Transport boarding-pass card |
| `itinerary-ride-row.tsx` | Transport ride row shown on the itinerary day, links to /bookings |
| `notes-view.tsx` | Notes editor (checklist + doc) |
| `alert.tsx` | Shared page-level notice (warning/danger/info + one action) |
| `budget-view.tsx` | Budget summary (bookings + other split, merge suggestions) + mixed expense/booking list |
| `budget-settings-form.tsx` | Currency, budget target, travelers + per-category caps (client) |
| `budget-merge-button.tsx` | "Merge into booking" — confirm, then soft-delete the duplicate logged expense (client) |
| `expense-form.tsx` | Add/edit expense — booking-form shell; currency comes from the trip; imperative `requestClose` handle for overlay hosts |
| `expense-modal-host.tsx` | Client island owning the budget page's expense add/edit overlay (`ExpenseModalHost`) + leaf triggers (`ExpenseAddTrigger`, `ExpenseRowTrigger`) consumed from server-rendered `budget-view.tsx` |
| `settings-folio.tsx` | Shared settings folio shell + primitives for /settings and /trip/[id]/settings |

### Primitives
| File | Purpose |
|---|---|
| `toast.tsx` | `ToastProvider` + `useToast().toast({ title, description?, variant?, action?, duration? })` — aria-live region; optional `action: { label, onAction }` text button (default duration 8 s instead of 4 s); every timer pauses while the toast is hovered or holds focus. Used for the bookings "Booking deleted" + Undo toast |
| `confirm-dialog.tsx` | Destructive-action confirm dialog — built on `ui/modal.tsx` (`role="alertdialog"`, Cancel gets initial focus); stacks above an open `Modal` by portal order, and the overlay stack gives it Escape alone |
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
| `access-policy.ts` | Pure: `normalizeEmail`, `maskEmail`, `parseAllowlist`, `isAllowlisted` (unit-tested) |
| `safe-redirect.ts` | Pure: `safeCallbackPath` — clamps a post-login `?callbackUrl` to a same-origin page path; `signInPath(returnTo)` — `/sign-in?callbackUrl=…` (used by the trip layout + trip page so a signed-out member returns to the trip) (unit-tested) |
| `anon-rate-limit.ts` | `consumeAnonBudget(bucket)` — hashed-IP keys, `signin`/`join`/`anon` budgets |
| `with-trip-auth.ts` | `requireUserId`, `requireTripWrite`, `requireTripOwner` — call at top of every server action |
| `trip-access.ts` | `getTripRole`, `canWrite`, `canManageInvites`, `assertCanWrite`, `permsFor` — role helpers (with React `cache`) |

### Form / data parsing
| File | Purpose |
|---|---|
| `form-parsers.ts` | `trimOrNull`, `parseNumber`, `parseInt32` — use these in every server action |
| `budget-config.ts` | `parseBudgetConfig` (form) / `parseBudgetConfigInput` (REST + import) / `parseTravelers` — amount, basis, caps, travelers |
| `form-dirty.ts` | `snapshotForm`, `serializeEntries`, `isDirty` — pure dirty-detection for a `<form>` (node-testable, skips `File` values) |

### Maps
| File | Purpose |
|---|---|
| `places/types.ts` | `PlaceSuggestion`, `PlaceDetails`, kinds shared by client + server |
| `places/place-id.ts` | Provider-prefixed `placeIdExternal` encode/parse (bare = legacy Google) |
| `places/lang.ts` | Query language detection (Thai etc.) for search `lang` |
| `places/kind.ts` | Provider category → app `Kind` |
| `places/utc-offset.ts` | Timezone → UTC offset (transport arrival time) |
| `places/tz-lookup.ts` | lat/lng → IANA timezone |
| `places/geoapify.ts` | Geoapify autocomplete + place-details (server, 30-day data cache) |
| `places/photon.ts` | Photon fallback client |
| `places/gmaps-link.ts` | Parse Google Maps URLs/share text (`extractGmapsUrl`, name/coords/CID); `expandShortLink` follows allowlisted redirects only (the one `fetch`) |
| `places/parse-location.ts` | `parseLocationInput`: pasted coords (decimal pair, `° N/S/E/W`) or a Google Maps link (via `gmaps-link.ts`; short links rejected) → lat/lng; `formatLatLng` (5 dp) |
| `places/search.ts` | Orchestrates Google (google mode; breaker + budgets) → Geoapify → Photon (server) |
| `places/google.ts` | Google Places (New) autocomplete + details client (fixed field masks `basic` / `full` / `preview` / `poi` (Pro, map POI tap), `no-store`; `googleRefreshDetails` + `GOOGLE_REFRESH_MASK` for the Stage C refresh); `google-fake.ts` serves fixtures for `GOOGLE_PLACES_FAKE` |
| `places/session.ts` | Autocomplete session token (`takeSession()` clears it before any await) |
| `places/pick.ts` | Picker helpers: hotel/transport/place selections and form values from a pick (null-safe lat/lng), `placeFormData` (add-place FormData), `googlePickJson` |
| `places/google-sync.ts` | 30-day TTL (`visibleVolatile`), `googleSyncOnUpdate`, `mergeGoogleRefresh`, `statusBadgeLabel`, `apiPlaceView` (strips `googleSnapshot` / `*SyncedAt`) |
| `services/google-sync-service.ts` | `purgeExpiredVolatile` (used by the purge cron), `selectResyncCandidates`, `writeRefreshPatch`, `refreshOne`, `runGoogleResync` (resync cron), `refreshPlaceFromGoogle` (button) |
| `maps/config.ts` | `MAPS_CONFIG`: `MAPS_PROVIDER` parsing, google needs all four vars (else open + warning), Preview forced open, Google caps and keys, `poiAdd` (`MAPS_POI_ADD`); `toClientMapsConfig` (client payload: renderer, browserKey, mapId, poiAdd only) |
| `maps/client-config.ts` | `ClientMapsConfig`, `OPEN_CLIENT_CONFIG`, `effectiveRenderer` |
| `maps/degraded.ts` | `DegradeReason` (`load_error` / `auth` / `render_error`), `degradeOnce` (warn-once + `onDegrade`, `enabled: false` in open mode), `degradedLogLine`, `DEGRADED_LABEL` |
| `maps/google-auth-failure.ts` | `onGoogleAuthFailure`: chains a `window.gm_authFailure` handler, returns cleanup |
| `places/client.ts` | Browser fetch wrapper for `/api/places/*` |
| `api/place-link.ts` | v1 API: `googleMapsUrl` + address geocode → coords, `gcid:` id, `warnings[]`; `LinkBudget` (50 lookups, 20 s, 300 geocodes/user/24 h) |
| `map-style.ts` | OpenFreeMap style URLs (light/dark) — change here if OpenFreeMap is down |
| `maplibre-worker.ts` | Sets maplibre worker URL for Turbopack; side-effect imported by map components |
| `map-helpers.ts` | `Pin`, `Mode`, `MapLeg`, `LatLng`, `KIND_COLOR`, `MODE_COLOR`, `ROUTE_NONE_COLOR`, `ROUTE_CASING_COLOR`, `centroid`, `deriveZoom`, `pinBounds`, `fitPadding`, `initialCamera`, `emptyDayFallback`, `emptyDayNote`, `frameSig` |
| `map-camera.ts` | Camera pixel math: `toViewPx`, `offsetCenter`, `revealPan`, `activeSafeArea`, `previewSafeArea`, `previewPadding`, card clearances |
| `map-pin.ts` | Pin rules: `pinTitle`, `pinShape`, `pinAnchor`, `pinPopupOffset`, `pinZIndex`, `PREVIEW_Z_INDEX`, `POPUP_Z_INDEX` |
| `map-route.ts` | Day route rules: `routeStyle`, `googleDash`, `legsGeoJSON`, `arrowImageId` / `modeFromArrowImageId`, `arrowBitmap`, `ROUTE_WIDTH` / `CASING_WIDTH` |
| `gmaps.ts` | Google Maps URL builders (`gmapsDirectionsUrl`, `gmapsNavigateUrl` = from the device location, `gmapsSearchUrl`) |
| `static-map.ts` | Geoapify Static Maps URL builder + fetch→data-URI (server-only `GEOAPIFY_API_KEY`, no signing) for the OG image |
| `trip-date-bounds.ts` | `tripDateBounds(start, end)` → `{min, max, fallback}` (±3d) for booking date pickers |

### Queries (read paths)
| File | Purpose |
|---|---|
| `trip-queries.ts` | `loadTripsForUser` (owned + shared, carries `role`), `loadTrip`, `loadHotelsForTrip`, `loadBookingCounts`, `loadBookingsForTrip`, `loadTransportForTrip` — primary trip-hub reader |
| `calendar-queries.ts` | Calendar tab reads — `loadCalendarEvents` (via pure `eventsFromBookings`, events carry `time`), `loadItineraryDays`, `loadItineraryStops` |
| `calendar-trip-range.ts` | Pure: `resolveCalendarView` (trip vs month), `tripRangeEnd`, `tripRangeAvailable`, `buildTripRange` (columns + outside count) |
| `ics.ts` | RFC 5545 writer — escaping, 75-octet folding, all-day DTEND exclusive (pure) |
| `ics-queries.ts` | Trip → VEVENT list + `exportTripIcs` (DB reads) |
| `expense-queries.ts` | Budget aggregation — expenses + costs derived from bookings, single-currency; `fromBookings`/`fromExpenses` split; one-to-one `MergeSuggestion`s (logged hotel/transport expense = booking cost); `RECENT_LIMIT`, `loadEditableExpenses` |
| `trip-travelers.ts` | One headcount for hub + budget: `resolveTravelers` (explicit `budgetConfig.travelers` ?? editors + 1), `loadTravelersCount`, `countEditors`, `resolveBudgetTarget` |
| `budget-share.ts` | `formatShare` ("<1%", ">99%", no clamp above 100) + unrounded `sharePct` |
| `editable-expense.ts` | `toEditableExpense` mapper — DB row → the form-shaped `EditableExpense` (unit-tested, pure) |
| `currency.ts` | ISO-4217 alpha-3 normalization, shared by forms + services |
| `note-queries.ts` | Notes reads |
| `bookings-merge.ts` | Pure merge/sort of hotels+transport + gap-night detection (BookingItem) |
| `booking-format.ts` | computeNights / nightsLabel / formatCost / shortDate for booking cards; `bookingsEmptyCopy(filter)` — filter-aware Bookings empty state |
| `transport-compute.ts` | deriveCode, shortPlaceLabel, computeTitle, computeArrival (TZ), arrivalBadge |
| `hotel-compute.ts` | computeNights, nightsLabel, computeCheckOut (calendar/UTC date math) |

### Misc
| File | Purpose |
|---|---|
| `audit.ts` | `writeAudit({...})` — best-effort audit log writer |
| `touch-trip.ts` | `touchTrip(tripId)` — bumps `trip.updatedAt` |
| `undo.ts` | Pure: `UNDO_WINDOW_MS` (10 min), `isUndoable(deletedAt, now)` — server window for the booking-delete Undo (unit-tested) |
| `units.ts` | Distance + temperature unit conversion (metric ↔ imperial) |
| `clock.ts` | `formatClock(raw, lang)`, `ClockLang` — one clock format per UI language (`en` `h:mm AM`, `th` `HH:mm`); free text passes through. Applied in `trip/[id]/page.tsx` (places, rides) and `buildMapDays` (pins) |
| `opening-hours.ts` | `hoursForDate(hours, dayIso, lang)` → `DayHours` (`weekday`, `text`, `closed`) — the trip day's line of Google `weekdayDescriptions` (EN/TH day names) or seed `Today · …`; null without a date |
| `segment-fix.ts` | `missingLocation(from, to, editHrefBase)` — the leg's stop without coords (next stop first) + its fix link (hotel → booking edit; null for viewers) |
| `i18n.ts` / `i18n-client.ts` | Server / client translators (`tFor(lang)` for an explicit language) |
| `i18n-messages.test.ts` | en/th parity + glossary guard (Thai collision pairs; see REQUIREMENTS §14 Glossary) |
| `landing-lang.ts` | Signed-out landing language: `lang` cookie → Accept-Language → `en` |
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
- Use `Modal` from `@/components/ui` (`open`, `onRequestClose`, `title`, `size`); confirmations use `ConfirmDialog`. Don't reinvent the overlay div — `ui/dialog-guard.test.ts` rejects hand-rolled `role="dialog"`/`aria-modal`.

### Maps API
- Place search goes through `/api/places/autocomplete` and `/api/places/details` (`app/api/places/*/route.ts`) via `lib/places/client.ts` and `components/use-place-search.ts`. `GEOAPIFY_API_KEY` is read server-side only.
- Import map renderers only through the selector files (`real-map-canvas.tsx`, `pin-picker-map.tsx`); never import `*-google`/`*-maplibre` directly. The selectors load each renderer via `dynamic(..., { ssr: false })`.

### Maps types/helpers
- `Pin`, `Mode` types from `@/lib/map-helpers`. Don't redefine.

---

## Out-of-scope of this index

- Detailed entity field shapes → `REQUIREMENTS.md` §4
- Stack rationale → `ARCHITECTURE.md`
- Conventions / delegation rules → `AGENTS.md`
- Onboarding for humans → `README.md`
- Maps Platform SKUs, quota caps & budget alerts → `docs/ops/maps-cost-guardrails.md`
