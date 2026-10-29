# Plan-writing notes (orchestrator scratch)

## map-pin-redesign / map-route-lines
- Touches: globals.css, lib/map-helpers.ts, real-map-canvas-google/maplibre, map-preview-marker, pin-card (deletes map-pin-badge); routes: lib/day-augment.ts, page.tsx, map-renderer-props, persistent-map, canvases.
- Decisions (defaults): pins/popups stay light in dark mode; color by kind (day view); stay pin keeps number + bed corner icon; leg w/o mode → neutral slate; labels only with stored time.
- Route depends on pin Task 1 (tokens).
- BUGS found: page.tsx:244 segment lookup by array position not segment.idx (wrong modes when rows missing); map numbering only counts pins with coords → numbers drift from list. Route plan fixes both (dayLegs).
- Deferred: same-coords merge "1·4" (→ day-bar plan?), ghost pins (MAP-09), row hover (MAP-06), nearest-stop dashed line (MAP-11).
- Overlap: font-sans in map files with ds-foundations; both add tokens to globals.css.

## a11y-pin-picker / a11y-batch
- pin-picker Touches: map-renderer-props, pin-picker-map-google/maplibre, place-manual-form, hotel-manual-form, hotel-edit-modal, trip-create-form.module.css. New shared LocationField. Defaults: no short-link expansion in field; submit enabled + validate on submit; "Use map center".
- batch Touches: globals.css (new block), both real-map-canvas-*, pin-card, map-preview-marker, map-panel-toggle, ui/button, ui/input (conditional A17), sortable-place-*, segment.tsx, notes-view, error pages, package.json (axe-core devDep).
- Defaults: A11 labelled group (not dialog); A12 keep toggle aria-pressed; axe-core devDep via Playwright MCP; A17 skip if modal-consolidation did it.
- Dep: modal-consolidation rewrites hotel-edit-modal overlay → rebase.
- Not done: server guard messages (only crafted requests); avatars not interactive; reorder handle invisible on touch (discoverability, out of scope); manual form defaults Tokyo (similar to M12 — candidate for camera-rules/empty-day fallback).

## map-camera-rules / map-hover-sync / map-degraded-notice
- camera Touches: map-active-focus-*, real-map-canvas-*, persistent-map, map-renderer-props, map-canvas.module.css, lib/map-helpers, lib/map-preview. New lib/map-camera.ts. Decisions: show map on empty day (fallback framing + note) [default yes]; preview framed alone if >50 km from every stop.
- hover Touches: real-map-canvas-*, persistent-map, map-renderer-props, map-pin-badge (→ MapPin if pin plan first), sortable-place-item, place-row, itinerary-list.module.css, lib/map-helpers. New lib/maps/hover-store.ts (keyed by day). Decisions: tooltip+card both; aria-current.
- degraded Touches: maps-config-provider, google-maps-api, google-map-error-boundary, real-map-canvas-maplibre, map-canvas.module.css, persistent-map (copy). New lib/maps/degraded.ts. No decisions.
- Skipped: maxZoom 15/top 72 desktop; M4 dashed line → route plan; geocode destination fallback; telemetry (none exists — research/telemetry plan adds); pin focus→row (vis.gl no focus props).

## map-day-bar-ghost-pins / map-trip-overview / map-search-distance (3 plans)
- day-bar Touches: persistent-map, both canvases, map-renderer-props (drops dayLabel; adds ghosts/onGhostClick), map-pin-badge, map-stop-carousel (label), globals.css, map-canvas.module.css. Includes same-coords merge "1·4" (cycles). Hotel-every-night already done. Defaults: day bar push history; ghost click → switch day, nothing selected; no ghosts mobile.
- overview Touches: persistent-map, canvases, props, map-pin-badge, map-day-bar, lib/map-carousel, globals.css (8 day colors), package.json (supercluster@9.1.0). Depends on day-bar. Defaults: supercluster both renderers; color per day; point click → opens its day; not on mobile.
- search-distance Touches: place-search-picker (+css), use-place-search, lib/places/*, autocomplete route, trip layout, persistent-map/days-accordion/map-day-bar (1 line each). Google autocomplete has no coords → send `origin` for distanceMeters (no extra SKU). Floating search = "/" shortcut + button only.
- CONFLICT RISK: pin-redesign deletes map-pin-badge; day-bar/overview/hover edit map-pin-badge → order pin-redesign first.

## budget-correctness / home-trip-cards / bookings-layout / calendar-trip-range (4 plans)
- budget Touches: db/schema.ts + migrations 0022/0023, expense-queries, budget-view, alert.module.css, expense-form, expense-service. Decisions: NEW trips.travelers nullable col (fallback owner+editors; backfill collaborators+1); expense→booking FK link (2 nullable cols) + "Count once" suggestion (not auto); neutral alert tone. SCHEMA CHANGE x2.
- home Touches: trip-card, trips-browser, static-map, trip-queries, skeletons(TripGrid), (home)/page; new route trip/[id]/cover-map (server-proxied signed static map, 24h cache). Decisions: remove sort select; raise Static Maps quota 200→400/day (~$4/mo max); straight path line.
- bookings Touches: bookings-view + css, skeletons(Bookings); deletes lib/use-media-query.ts.
- calendar Touches: calendar-view, calendar-queries, calendar/page, skeletons(Calendar). Defaults: ordered list per day; trip view default if dates & ≤31 days; teal tint.
- Not planned: map on Bookings (Dynamic Maps cost), photo cover, hourly axis.
- FOUND: "Split bills" button no-op (budget-view.tsx:184-188); "Set a budget" link → 404 for editors (fixed in budget plan); home avatars from seed-only collaborators list.
- skeletons.tsx trivial conflicts; migration numbering collision → renumber second.

## itinerary-rows / ux-copy-glossary / nav-labels
- rows Touches: place-row, itinerary-list.module.css, segment.tsx, sortable-place-item, both mode pickers, days-accordion, itinerary-sidebar.module.css(.dayHdr), trip page, layout (1 arg), buildMapDays signature (day-augment), new ui/segmented.tsx; deletes segment-mode-picker.module.css. Defaults: time format follows UI lang (en 12h, th 24h) — no setting exists; kind-icon tile collapsed, photo on expand (shared cache).
- FOUND: "Today · …" hours is literal seed data; hero collapse = day collapse bar.
- copy Touches: messages en/th, place-preview-card, budget-view, bookings-view, lib/booking-format, hotel/transport/expense forms, day-header, notes-view, sortable-place-item (aria), place-form, place-manual-form, hotel pages metadata, trip settings, REQUIREMENTS §14. Defaults: TH Itinerary "แผนเที่ยว"; trash label "Remove {name} from this day"; hotel kind "Stay". Adds en/th key-parity test.
- nav Touches: trip-rail, trip-rail-frame, new trip-rail-items.ts, REQUIREMENTS §3/§6. Defaults: visible desktop labels (rail 56→72px); Share/Export/Undo/Help stay in spec under "Not shipped"; Notes removed from list (no flag).
- FOUND: AGENTS-INDEX lists nonexistent trip-nav.tsx; hotels-view.tsx imported nowhere (dead old hotel flow → delete candidate).
- buildMapDays signature changed by rows plan AND route plan → conflict hot spot (lib/day-augment.ts).

## i18n-extraction / header-share-export / maps-cloud-style-runbook / research-usability-telemetry
- i18n: 7 PRs (P0 plumbing useT/fallback/plurals/pseudo/parity/lint; P1 shell/auth/home 112/24; P2 itinerary+map 124/21; P3 bookings 158/13; P4 budget/cal/notes 110/5; P5 settings 85/7; P6 un-force getLang). ~606 literals/71 files. Lint: react/jsx-no-literals + no-restricted-syntax (no new deps), growing allowlist. Defaults: server/API errors stay EN; Thai Gregorian years; lang cookie when no settings row; stored data not translated.
- header Touches: header.tsx, trip layout, toast.tsx, account-menu, bookings-view, messages. Share copies trip link (invite tokens are hashed); owners get Invite → settings People. Export → .ics + CSV. Undo: drop global stack from spec; only "Undo" on "Booking removed" toast (10 min, soft delete).
- cloud-style runbook (docs/ops/google-maps-cloud-style.md, Thai): new feature names (2025-03 migration); light+dark per Map ID; restaurants faint not hidden; temples/shrines shown like attractions (deviation from §7.1). No code.
- telemetry: own ui_event table + sendBeacon POST /api/telemetry, fixed allowlist props, random per-tab session id, ?ut=P1 tag, 90-day prune cron. Not Vercel Analytics (Hobby plan lacks custom events). Touches persistent-map, carousel, picker, use-poi-preview, toggle, segment, maps-config-provider, google-maps-api, error boundary, db/schema.ts (+migration), vercel.json. Defaults: honor GPC/DNT + TELEMETRY=off, signed-in only, 90 days.
- Order: copy-glossary → i18n; header → i18n P1.
- FOUND: account-menu "Invite collaborator" no-op (header plan removes); place delete one-tap permanent no confirm (sortable-place-item.tsx:196) → recommend follow-up; settings form hidden lang='en' would reset Thai users once un-forced (P6 covers).

## ds-foundations / ds-hex-codemod / ds-modal-consolidation
- foundations: --ring→#0f766e (5.47), --input→#8a8a93 (3.42), --success→#15803d (5.02); dark --input #71717a; new --border-strong; ~75 sub-12px places/22 files; <html lang>; --header-h; motion tokens. Touches globals.css, layout.tsx, header.module.css, font line in pin-card/map-pin-badge/map-preview-marker/canvases, ~25 modules.
- codemod: depends on foundations; 3 modules + days-accordion (+new module css) + spinner + 8 palette files; new tokens --warning-soft/strong/border, --note-*, --rating; vitest ratchet baseline JSON. Excludes map files, calendar-view, trip forms.
- modal: 4 live dialogs → Modal (confirm-dialog, day-mode override, place-preview-modal, manual-add in picker); DELETES dead hotels-view subtree (8 files). Bugs: hand-rolled dialog zIndex 100 under sticky header (1100); day-mode confirm window Enter confirms even on Cancel. Modal +initialFocusRef/role/describedBy; Input invalid + lg; ActionSubmit → Button loading (drop pendingText); keep Card on error pages. Guard test against role=dialog outside Modal.
- CROSS-PLAN: a11y-pin-picker edits hotel-manual-form/hotel-edit-modal (modal plan says dead → verify!); a11y-batch edits dead hotels-view/hotel-search-picker; i18n P3 also deletes hotels-view; font-sans overlap w/ pin-redesign; --map-route-* tokens overlap; html lang overlap w/ i18n P1/P6.
- Not planned: --space-* scale, --radius-pill (use --radius-full), Thai 13px min, all raw buttons. AGENTS-INDEX ModalShell recipe wrong.

# SCRUTINY RESULTS
## map visuals
- pin-redesign: fix-then-ship (3 majors applied). CSS vars resolve in AdvancedMarker/MapLibre/InfoWindow DOM. Dark-mode check via theme=dark cookie. MapLibre anchor key fix. ORDER: pin-redesign → route-lines → hover-sync → day-bar → trip-overview; later plans add 1 prop to MapPin (highlight/label/color). Shared marker z-order section added.
- route-lines: fix-then-ship (2 majors). Both bugs CONFIRMED (page.tsx:244 segment lookup; pin numbering). Task 1 could ship alone as a bug-fix PR. route-lines owns buildMapDays numbering/legs; itinerary-rows adds defaulted `lang` arg after. Polyline exists in vis.gl 1.8.3 (loads free geometry lib).
- cloud-style runbook: ship (minors fixed). Feature names verified vs current docs.
- DECISIONS: (1) cut mid-leg time labels? (no real data since Routes API removal; recommend cut) (2) Cloud style Retail→Shopping hidden? (default hidden; hides markets like Komachi-dori from tap)
- ds-foundations should drop map-font edits if pin-redesign lands first.

## day-bar / overview / search-distance
- day-bar: fix-then-ship (1 blocker + 4 majors applied). Depends on pin-redesign. Deletes dayLabel/overlayTl chip. Ghost dots a11y fixed. Merged-pin hover bug fixed. DECISION: day bar from md (768) or ≥1024 (spec §7.4).
- search-distance: fix-then-ship. Autocomplete (New) returns distanceMeters with origin (docs silent on billing → no per-field pricing). Future field masks must include distanceMeters. DECISIONS: origin precision 3 vs 4 decimals; hide "≈ 0 m".
- trip-overview: fix-then-ship, RECOMMEND DEFER (low prio/medium effort; ghost pins cover most). Uses history.pushState for ?view=trip. DECISIONS: defer?; drop city connector lines v1?
- ORDER: pin-redesign → (camera-rules, hover-sync, route-lines, a11y-batch) → day-bar → search-distance map button → trip-overview.
- Shared marker z-order (pin-redesign owns): ghost 1, route label 5, pin 10, cluster 15, hover 50, active 100, preview 1000.
- Desktop map top row: day bar left + search button right.
- Follow-up (not fixed): Back/list day chips change day without clearing search preview (existing).
- Forwarded hover-sync/degraded items to the camera/hover scrutinizer.

## a11y-pin-picker / a11y-batch / itinerary-rows / nav-labels
- Dead files CONFIRMED (hotels-view subtree). All 4 fix-then-ship/ship; hunks on dead files dropped.
- pin-picker now edits only place-manual-form. Submit button: second-lander uses Button loading.
- a11y-batch: .tp-hit overlap fixed (.segment min-height 44 on touch; reorder handle removed from touch list). Map summary via `summary` prop from persistent-map. isNavigationError covers NEXT_HTTP_ERROR_FALLBACK;404 (6 existing inline checks have same bug!).
- itinerary-rows: owns buildMapDays 4th arg `lang='en'` after route-lines. Segment renders nothing if endpoint missing.
- nav-labels: 72px rail OK (map 296px @768).
- ORDER: route-lines → itinerary-rows → a11y-batch; itinerary-rows → ds-hex-codemod.
- DECISIONS: (1) Notes page is built & works — re-enable instead of hiding? (commit 00dedec disabled it) [recommend re-enable] (2) time format 12h for all until i18n P6 (hotel/ride 15:00 → 3:00 PM) [recommend keep].
- Forwarded to modal + header scrutinizers.

## camera-rules / hover-sync / degraded-notice
- All fix-then-ship, no new decisions.
- camera: POI tap → scroll-into-view only (no zoom-out); search preview → frame day+preview. Empty-day note bottom-left. One extra billed load possible (empty-day-only session) — update guardrails doc. Google safe-area math from center/zoom/size (no projection). Tilted map → fallback panTo.
- hover: store is sole hover state; .place.placeLinked after dark block; depends on pin-redesign (MapPin `highlight`).
- degraded: markDegraded no-op unless renderer google; uses telemetry reason names; `onDegrade(reason)` hook; chip top:68px md+; lands before telemetry.
- After pin-redesign: camera clearances active 280→330, preview 340→370, fit top 48→64 (second-lander).
- Forwarded telemetry item to copy/i18n/header/telemetry scrutinizer.

## ds-foundations / ds-hex-codemod / ds-modal-consolidation
- All fix-then-ship. Dead code confirmed again. Ratios verified.
- foundations: Thai rule overrides text-xs/sm line-height vars; html lang test flexible; SHARED test helpers in app/test/ (other plans import); header padding 0 24px; 12px guard catches ternaries.
- codemod: exact-match baseline (stale report); collapse bar via Tailwind token classes; lands AFTER itinerary-rows; ~310 raw colors remain (~260 after dead delete). DECISION: Apple blue / optimize purple → brand teal (visible change).
- modal: BLOCKER fixed — shared counting scroll lock for stacked Modals. Task 1 (delete dead hotels-view tree) ships FIRST as its own PR so other plans drop hunks.
- Cross: i18n P6 drops Thai line-height (foundations owns), P3 skips dead files; pin-redesign/foundations second-lander drops fonts; --map-route-* defined once by first-lander; route label 11px→12px; nav-labels uses --header-h; hover-sync 120ms → motion token; search-distance no dark rule in picker css.

## ux-copy / i18n / header / telemetry
- All fix-then-ship.
- i18n: BLOCKER fixed — lint guard missed ~175 strings (ternaries, cond attrs, template aria, toast titles) → 5 selectors, 0 FP measured. Pseudo-loc applied to dicts. P6 lang from cookie (no auth()/DB in root layout; sign-in copies setting → cookie). P3 deletes dead files. P2 split (itinerary first; map files after map plans). useTp plurals _one/_other. OPEN: cookie set in Auth.js signIn callback works? (fallback per-device).
- copy: budget banner moved to budget-correctness; +4 strings; toast "Booking deleted". DECISIONS: "แผนเที่ยว", "Remove … from this day", "Stay", rename budget "Hotels"→"Stays".
- header: split PR A (Undo on Booking deleted toast, timer pauses on hover/focus) + PR B (Share/Export). Trip redirects now carry return URL (fix: signed-out member landed on home). DECISIONS: ship PR B at all? (Export exists on cal/budget/settings; Share members-only); navigator.share on mobile; friendlier non-member page than 404.
- telemetry: custom table justified. Migration order: budget 0022 then telemetry 0023. Added trip_view event, 30-min idle session reset, pin click only on open. Research doc: participants sign in first. DECISION: ">2 toggles" both directions or to-map only; is 3 weeks of usage enough.
- Key-parity test: copy plan creates, i18n extends.

## budget / home / bookings / calendar
- budget: NO schema change now — travelers in budget_config jsonb (API/import already accept); dedupe = "Merge into booking" (confirm → removeExpenseAction), 1:1 matching; one data-only migration 0022 (demo travelers). Docs target agent-skill/travel-planner-api/SKILL.md (API.md stale). DECISIONS: merge vs FK link (default merge; loses label/note); travelers in budget_config vs column (default budget_config).
- home: BLOCKER — server-caching Static Maps violates ToS → signed URL w/ referrer-locked browser key in plain <img>, no proxy; needs console: enable Maps Static API on browser key. 5:2 covers keep logo. DECISION: avatars real members follow-up. EXISTING ISSUE: OG image caches Google Static Maps 24h server-side → ToS ticket.
- bookings: .headActions; land first in bookings-view; don't merge with home.
- calendar: range end falls back to last itinerary day; end<start → month grid.
- Raw-color baseline regenerate if codemod first. Home owns trip-card avatars/delete (deletes trip-delete-button.tsx).
