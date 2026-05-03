# Travel Planner — Build Roadmap

> Phased plan to convert the static mockup into a production app.
> Source for what to build: [REQUIREMENTS.md](REQUIREMENTS.md).
> This file tracks **how** and **in what order**.

Conventions:
- **Size** = rough engineering effort assuming 1 senior full-stack dev. Multiply by team size with realistic coordination overhead. Adjust to your context.
- **DoD** (Definition of Done) = checklist that closes the phase. Every item testable.
- **Depends on** = phase ordering; do not start a phase until deps are ✅.
- **Status** legend: ⬜ not started · 🟡 in progress · ✅ done · ⏸ blocked.

---

## Status snapshot

| Phase | Title | Status | Owner |
|-------|-------|--------|-------|
| 0 | Stack decision & repo scaffold | 🟡 |  |
| 1 | Auth & accounts | 🟡 |  |
| 2 | Trip / day / place CRUD | ⬜ |  |
| 3 | Bookings (hotels + transport) | ⬜ |  |
| 4 | Real maps + geocoding | ⬜ |  |
| 5 | Budget & expenses | ⬜ |  |
| 6 | Notes | ⬜ |  |
| 7 | Calendar + sync | ⬜ |  |
| 8 | Invites & sharing | ⬜ |  |
| 9 | Settings, i18n, theme | ⬜ |  |
| 10 | Offline, attachments, audit log | ⬜ |  |
| 11 | Polish, perf, a11y, launch | ⬜ |  |

Update this table as phases move. Keep one row of truth.

---

## Phase 0 — Stack decision & repo scaffold

**Size**: 3–5 days · **Depends on**: nothing.

Open question this phase closes: what tech stack do we build on?

### Decisions to make

1. **Frontend** — React + Vite SPA · Next.js · Remix · SvelteKit · other.
2. **Backend** — bundled with frontend (Next.js / Remix) · separate Node/Bun server · Go · Rust · other.
3. **Database** — Postgres · SQLite · MySQL · Firestore. Recommended: Postgres.
4. **ORM / query layer** — Prisma · Drizzle · Kysely · raw SQL.
5. **Auth provider** — Clerk · Auth.js · Supabase Auth · Firebase Auth · self-rolled.
6. **Map provider** — Mapbox · Google Maps · MapLibre + OSM. (Cost vs. control.)
7. **Object storage** — S3 · Cloudflare R2 · GCS.
8. **Email** — Postmark · SendGrid · SES · Resend.
9. **Hosting** — Vercel · Cloudflare · Fly · Railway · self-hosted.
10. **Where the rebuild lives** — same repo (new `app/` dir, prototype stays in repo root) · sibling repo · monorepo.

### Deliverables

- `ARCHITECTURE.md` at repo root — captures every decision above with one-paragraph rationale + costs.
- New project scaffolded per stack decision, pushed to its target location.
- CI green: lint + typecheck + test runner installed (no real tests yet).
- Local dev runnable in one command (`pnpm dev` / `bun dev` / `yarn dev`).
- README of the rebuild scaffold links back to this repo's REQUIREMENTS.md.
- Database migration tooling installed and a baseline empty migration committed.
- Secrets pattern picked (`.env.example` checked in; real `.env` gitignored).

### DoD

- [x] ARCHITECTURE.md merged.
- [x] `git clone && <bootstrap>` works on a fresh machine in < 10 min. (`pnpm install && cp .env.example .env && pnpm dev` — ~2 min on warm cache.)
- [ ] CI runs on every PR. *(deferred to Phase 0.5 follow-up)*
- [ ] Empty deploy-to-staging pipeline works. *(deferred to Phase 0.5 follow-up — needs Neon + Vercel project linkage)*
- [x] Stack decisions ratified by team / user.

### Risks / unknowns

- Auth provider lock-in.
- Map provider pricing at scale.
- Offline-mode requirements may push toward IndexedDB + a sync layer (CRDT, replicache, etc.) — note this and revisit at Phase 10.

---

## Phase 1 — Auth & accounts

**Size**: 5–7 days · **Depends on**: Phase 0.

### Scope

- Sign-in screen at `/sign-in` matching mockup ([`account.jsx`](account.jsx) `SignInScreen`).
- Provider buttons: Google, Apple, Email (magic link).
- Session persistence (HTTP-only cookies, refresh).
- `/me` endpoint returns current Account.
- Account menu in header — switch active account, sign out.
- Add-account flow — link a second Google account to the same session.
- Settings → Account tab placeholders for future MFA / device list.

### Domain — REQUIREMENTS.md §4 Account, §11 Auth

DB tables (Postgres example, adapt to chosen DB):
```sql
account (id, email UNIQUE, name, avatar_url, provider, provider_subject, mfa_enabled, created_at, last_sign_in_at)
session (id, account_id FK, expires_at, refresh_token_hash)
```

### Deliverables

- Sign-in pages, callback handlers per provider.
- Session middleware on every server route.
- E2E: sign in → see app shell → sign out → blocked from app shell.
- Error states: provider failure, invalid magic-link, expired session.

### DoD

- [x] User can sign in with Google. *(Apple deferred per ARCHITECTURE.md; Email magic-link wired but needs SMTP — Phase 8 lands the production provider.)*
- [x] Sessions survive page reload but not browser-wide cookie clear. *(Database session strategy; opaque cookie ID, server-side row.)*
- [ ] Multi-account switch works in-place; header avatar updates. *(Deferred to Phase 1.5 — Auth.js v5 needs bespoke account-link UX. Header shows single active account.)*
- [x] Forgot-password / passwordless flow shipped. *(Email magic-link via Auth.js Nodemailer provider; verify-request and error pages live. Real SMTP per Phase 8.)*
- [x] CSRF, secure-cookie, same-site=lax verified. *(Auth.js v5 defaults: HTTP-only, Secure, SameSite=Lax; CSRF token built into POST callbacks.)*
- [ ] Auth E2E passes in CI on staging. *(Deferred to Phase 0.5 follow-up — needs CI + staging Vercel + Neon branch wired up.)*

Slice ledger:
- A `7f66638` — sign-in screen + Google OAuth wired end-to-end.
- B `36e76bb` — app-shell header (AccountMenu + SettingsModal) + page redirect.
- C `pending` — error page, verify-request page, submit-button loading state, Auth.js pages config.

### Risks

- Apple Sign In requires Apple Developer account + domain verification — gate dev work.
- Magic-link email deliverability (DKIM / SPF / DMARC) — start configuration early.
- Edge-middleware route gating skipped for Phase 1 (Drizzle adapter pulls Node-only modules + database session strategy can't validate at the edge). Phase 1.5 / 2 revisits with the Auth.js v5 split-config + JWT strategy choice.

---

## Phase 2 — Trip / Day / Place CRUD

**Size**: 8–10 days · **Depends on**: Phase 1.

### Scope

The itinerary view from REQUIREMENTS.md §5, but with **mock map only** (no real geocoding yet — kept as `x`/`y` placeholder fields). Real maps land in Phase 4.

- Create a trip (title, dates).
- Trip list page (user's trips).
- Trip detail = itinerary view.
- Day CRUD: add/remove days, reorder.
- Place CRUD: add (manual entry only, no search yet), edit, delete.
- Place reorder within a day (drag/drop).
- Optimize-route strip — suggest reorder based on a placeholder distance (Phase 4 swaps in real distances).
- "Saved Xm ago" indicator wired to last server-confirmed write.
- Undo/Redo on all itinerary mutations.
- Toast notifications.

### Domain — REQUIREMENTS.md §4 Trip / Day / Place / Segment

```sql
trip (id, owner_id FK account, title, start_date, end_date, cover, public, created_at, updated_at, deleted_at)
day (id, trip_id FK, idx, label, num, date, title, summary_distance, summary_time)
place (id, day_id FK, idx, kind, name, category, rating, reviews, time, duration, price, address, phone, website, hours, tags JSON, thumb, note, x, y, booking_id NULLABLE, created_at, updated_at, deleted_at)
segment (id, day_id FK, idx, mode, distance, time)
```

`tags` as JSON array; promote to a junction table later if filtering needs it.

### Deliverables

- REST or GraphQL endpoints per entity (per Phase 0 choice).
- Optimistic UI on every mutation; reconcile on server response.
- Server-side last-write-wins for concurrent edits (Phase 7 upgrades to real-time sync).
- E2E: create trip → add day → add 3 places → reorder → reload → state preserved.

### DoD

- [ ] All itinerary actions persist round-trip.
- [ ] Undo/Redo works across all mutations including reorder.
- [ ] "Saved Xm ago" updates live as the user edits.
- [ ] Soft delete (with 7-day undo for trips, immediate for items).
- [ ] Itinerary E2E flow green in CI.

### Risks

- Drag-and-drop reorder is fiddly — pick a vetted lib (dnd-kit) early.
- Schema changes get expensive after this phase ships — review carefully.

---

## Phase 3 — Bookings (hotels + transport)

**Size**: 6–8 days · **Depends on**: Phase 2.

### Scope

REQUIREMENTS.md §6. Hotels view, Transport view, multi-step add-booking modal, link bookings to days.

- HotelBooking + TransportBooking CRUD.
- Multi-step modal: type → fields → review.
- Edit a booking (mockup is add-only; real-app must edit).
- Delete with undo.
- Inline `place.booking` summary on the itinerary place row that owns the booking.
- Header collaborator avatars unaffected (they come from invites, Phase 8).
- Attachment field accepts a placeholder URL — real file upload deferred to Phase 10.

### Domain — REQUIREMENTS.md §4 HotelBooking / TransportBooking

```sql
hotel_booking (id, trip_id FK, day_idx, name, address, check_in_date, check_in_time, check_out_date, check_out_time, nights, room, guests, ref, cost_amount, cost_currency, cancellation, contact, notes, attachment_url, thumb, created_at, updated_at, deleted_at)
transport_booking (id, trip_id FK, day_idx, type, title, provider, ref, from_code, from_name, from_time, from_date, from_terminal, to_code, to_name, to_time, to_date, to_terminal, duration, seats, bag, cost_amount, cost_currency, attachment_url, created_at, updated_at, deleted_at)
```

### DoD

- [ ] Hotels view shows server-loaded bookings, totals correct.
- [ ] Transport view shows server-loaded bookings, type icons + route line render.
- [ ] Add-booking modal works for all 5 types (hotel, flight, train, car, ferry).
- [ ] Editing or deleting a booking updates the linked itinerary place's inline summary.
- [ ] Bookings E2E green.

### Risks

- Currency formatting must use locale (Phase 9 supplies it; ship USD-only here, format in Phase 9).

---

## Phase 4 — Real maps + geocoding

**Size**: 8–10 days · **Depends on**: Phase 2.

### Scope

REQUIREMENTS.md §10. Replace [`map.jsx`](map.jsx) mockmap with the chosen provider.

- Map component switches `place.x`/`place.y` to `place.lat`/`place.lng`. Migration converts existing rows (mockup data has fake coords — flag as such, treat as null on migration).
- Place add: text input → geocode → autocomplete suggestions → pick one → save with lat/lng + structured address.
- Real route polylines from a directions API; mode-aware (drive/walk/transit).
- Pin clustering at low zoom.
- Per-day route + total distance/time recomputed from real route data.
- Optimize-route strip uses real travel times.

### Schema migration

```sql
ALTER TABLE place
  ADD COLUMN lat DOUBLE PRECISION,
  ADD COLUMN lng DOUBLE PRECISION,
  ADD COLUMN place_id_external TEXT;  -- provider place id for re-fetch
-- x, y stay temporarily; drop in cleanup PR after data backfill or null-out.
```

### DoD

- [ ] Place add by typing finds real venues, persists structured address + lat/lng.
- [ ] Map renders real route line for the active day, snapped to roads.
- [ ] Distance/time chips reflect real route data.
- [ ] Optimize-route strip uses real travel-time savings.
- [ ] Clustering kicks in at zoom < N.

### Risks

- Provider rate limits + cost — instrument from day one.
- Geocoding ambiguity ("Park" → many) — surface a disambiguation UI.

---

## Phase 5 — Budget & expenses

**Size**: 5–7 days · **Depends on**: Phase 3.

### Scope

REQUIREMENTS.md §7.

- Expense CRUD.
- Server-side aggregation: total, per-day, per-person, avg meal, category bars.
- Add Expense modal.
- Recent expenses list.
- Split bills — link an expense to multiple accounts; show "you owe / you're owed" summary per pair.
- Export Budget as CSV (PDF optional, defer if scope tight).

### Domain — REQUIREMENTS.md §4 Expense

```sql
expense (id, trip_id FK, day_idx NULLABLE, category, amount, currency, paid_by FK account, note, at, created_at, deleted_at)
expense_split (id, expense_id FK, account_id FK, share_pct OR share_amount)
```

### DoD

- [ ] Add / edit / delete expense flows.
- [ ] Budget summary numbers match a hand-calc on a known seed dataset.
- [ ] Split-bills summary correct for 3+ collaborators with mixed splits.
- [ ] CSV export downloads valid file with header row.

### Risks

- Currency conversion across collaborators — defer multi-currency to a future phase; v1 = single trip currency, set on trip create.

---

## Phase 6 — Notes

**Size**: 3–4 days · **Depends on**: Phase 2.

### Scope

REQUIREMENTS.md §9.

- Three sections per trip: packing checklist, reservations checklist, docs.
- Checklist items: add, check/uncheck, reorder, delete.
- Docs: rich-text blocks with editable title and body. Use a vetted editor (Lexical, TipTap).
- Image embeds — defer to Phase 10 (uses attachment storage).

### Domain — REQUIREMENTS.md §4 Note

```sql
note (id, trip_id FK, section, position, body JSONB, updated_at)
checklist_item (id, note_id FK, idx, text, done, updated_at)
```

### DoD

- [ ] Three sections render with seed empty state.
- [ ] Checklist add/toggle/reorder/delete persists.
- [ ] Docs editor saves on blur and on Cmd-S; conflict-safe within Phase 7's sync model.

### Risks

- Rich-text serialization stability across editor upgrades — pick an editor with a stable schema.

---

## Phase 7 — Calendar + sync

**Size**: 8–12 days · **Depends on**: Phase 3, Phase 5, Phase 6.

### Scope (Calendar — REQUIREMENTS.md §8)

- Month grid; locale-aware first day-of-week.
- Trip days highlighted; non-trip dimmed.
- Booking events plotted; color-coded; legend.
- Day click → expand events; event click → open the booking.
- Month nav arrows, jump-to-today.
- Drag a booking event to a new date → updates the booking dates.

### Scope (Sync — REQUIREMENTS.md §16, §19 multi-device)

- Push channel (WebSocket or SSE — per Phase 0 stack choice).
- On every server-confirmed mutation, broadcast to other connected clients of the same trip.
- "Saved Xm ago" reflects server-acked time.
- Conflict UI when two clients edit the same place simultaneously (last-write-wins + a toast on the loser; CRDT optional later).

### DoD

- [ ] Calendar renders all booking events for a trip in correct month.
- [ ] Drag-reschedule a booking persists and re-renders calendar + bookings + itinerary.
- [ ] Two browsers logged in as the same user see live updates of edits within < 1s p95.
- [ ] Two collaborators on the same trip see each other's edits live.
- [ ] Disconnect/reconnect heals state without manual refresh.

### Risks

- WebSocket infrastructure on serverless edge — pick a hosted provider (Pusher / Ably / Liveblocks) if rolling-our-own is high-cost.

---

## Phase 8 — Invites & sharing

**Size**: 5–7 days · **Depends on**: Phase 1, Phase 7.

### Scope

REQUIREMENTS.md §12.

- Invite modal: email input, role select (editor/viewer), Send invite, Copy link.
- Server: create signed invite token, send email, store invite row.
- Accept-invite page (`/invite/:token`) — sign-in if not signed in, then attach to trip.
- Resend / revoke / regenerate invite (in Settings → Trip).
- Server-enforced role check on every mutation endpoint (viewer = read-only).
- Header avatar stack shows accepted collaborators + owner.
- Share button (header) — opens share sheet with public URL (gated by `public_trip` setting from §13) + invite shortcut.

### Domain — REQUIREMENTS.md §4 Invite

```sql
invite (id, trip_id FK, email, role, status, token_hash, invited_by FK account, expires_at, accepted_at, created_at)
trip_membership (id, trip_id FK, account_id FK, role, joined_at)  -- post-acceptance
```

### DoD

- [ ] Invite email arrives within 1 min of send (in staging with real provider).
- [ ] Acceptance flow attaches account to trip and routes to it.
- [ ] Viewer cannot mutate (UI hides controls + server rejects).
- [ ] Editor cannot manage invites; only owner can.
- [ ] Resend / revoke / regenerate work end-to-end.

### Risks

- Email reputation — warm domain early. Use the production provider in staging.

---

## Phase 9 — Settings, i18n, theme

**Size**: 4–6 days · **Depends on**: Phase 1.

### Scope (Settings — REQUIREMENTS.md §13)

- Persist appearance / language / units / notifications / privacy per account.
- Settings modal wired to server.
- "Public trip page" toggle gates the public-share URL behaviour from Phase 8.

### Scope (i18n — REQUIREMENTS.md §14)

- Swap mockup `window.I18N` to a real lib (`react-intl`, `i18next`, `formatjs/intl-messageformat`).
- Keep flat keys.
- Add interpolation, plurals, locale-aware date / number / currency.
- Pseudo-localisation in dev.
- Translation source-of-truth file under VCS; integrate translation pipeline (POEditor / Crowdin / Lokalise).
- Locale-aware first day-of-week feeds Phase 7 calendar.

### Scope (Theme — REQUIREMENTS.md §15)

- Tokens migrated from [`design-tokens.css`](design-tokens.css) + [`account.css`](account.css) to chosen styling system (CSS vars stay; framework optional).
- `data-theme` attribute drives all rendering.
- `system` value tracks `prefers-color-scheme` + listens for changes.

### DoD

- [ ] Switching language flips every visible string.
- [ ] Switching theme flips every visible colour without flash.
- [ ] Switching units flips every distance/temperature.
- [ ] Notifications toggles actually gate outbound email/push.
- [ ] Settings persist across sessions.

### Risks

- RTL — out of scope. Document explicitly so designers don't assume support.

---

## Phase 10 — Offline, attachments, audit log

**Size**: 10–14 days · **Depends on**: Phase 7, Phase 8.

### Offline mode — REQUIREMENTS.md §19

- Local cache (IndexedDB) for last-loaded trip + bookings + notes + expenses.
- Read-only browsing when network is down.
- Mutation queue: stage offline edits, replay on reconnect, surface conflicts.
- Service worker for app shell.
- Features explicitly online-only: place search, geocoding, real-map tiles, invite send, telemetry. Surface gracefully when offline.

### Attachments — REQUIREMENTS.md §19

- Object-storage backed (S3 / R2 / GCS — per Phase 0).
- Direct-to-storage upload via signed URL.
- Server records `attachment` row with `(name, size, mime, storage_key, uploaded_by, scanned)`.
- Virus scan pipeline (ClamAV or hosted) — `scanned` flips before download URL is signed.
- Size limit: 25 MB. Types: PDF, JPG, PNG, HEIC.

### Audit log — REQUIREMENTS.md §19

- `audit_log (id, trip_id FK, account_id FK, action, entity_type, entity_id, before JSONB, after JSONB, at)`.
- Surface in Settings → Trip → Activity (owner only).
- 90-day retention; cleanup job.

### DoD

- [ ] Pull network → trip remains browseable; mutations queue.
- [ ] Reconnect → queue replays cleanly; conflicts surface as toasts.
- [ ] Upload a 5 MB PDF; receive signed download URL; deny pre-scan.
- [ ] Audit-log entry written for every mutation in a smoke trip.
- [ ] Activity tab renders chronological events with actor + diff hint.

### Risks

- Conflict resolution UX — last-write-wins is acceptable for v1 but document the gaps.

---

## Phase 11 — Polish, perf, a11y, launch

**Size**: 8–12 days · **Depends on**: all prior.

### Scope

- WCAG 2.1 AA audit + fixes. Use axe-core in CI.
- Performance budget: FCP < 1.5s on broadband, itinerary interactive < 2.5s. Code-split per top-level view.
- Mobile breakpoint regression sweep at 320 / 390 / 768 / 1280 / 1440.
- Empty states across every view.
- Error boundaries + a global error page.
- Telemetry events wired (REQUIREMENTS.md §19): trip_created, day_added, place_added, booking_added, invite_sent, budget_viewed.
- Privacy policy + terms pages.
- Help (rail bottom) — wire to docs / shortcut palette / chat — pick one.
- Launch checklist: SLO targets, on-call rota, rollback plan, status page.

### DoD

- [ ] axe-core CI clean.
- [ ] Lighthouse ≥ 90 on Performance / Accessibility / Best Practices / SEO for itinerary, hotels, transport, budget views.
- [ ] All views have empty + error states.
- [ ] Telemetry events fire and land in the analytics dashboard.
- [ ] Production deploy and DNS cutover plan executed.
- [ ] Postmortem template and on-call docs ready.

### Risks

- Scope creep into a "Phase 12" of nice-to-haves — define cut-line before starting and hold it.

---

## Cross-cutting concerns

These do not belong to a single phase; address continuously.

- **Testing pyramid** — unit (Vitest / Jest), integration (Vitest + test DB), E2E (Playwright). Add tests in the phase that ships the code, not after.
- **Migrations** — every schema change goes through migration tooling; no hand-edits in prod.
- **Feature flags** — wrap risky cuts (real maps, sync, offline) so rollback is one toggle.
- **Observability** — structured logs from day one, error reporting at end of Phase 1, metrics + dashboards at Phase 5.
- **Security review** — once before Phase 8 (invites = abuse vector), once before Phase 11 launch.
- **Cost monitoring** — for map / email / object storage / hosting from Phase 4 onwards.

---

## How to update this file

- Move a phase's row in the **Status snapshot** table when its state changes.
- Tick DoD checkboxes inline as items land. Do not erase old checks — they document closure.
- If scope shifts, edit the phase in place and note the shift in a `### Changelog` block at the bottom of that phase.
- New phases (e.g. monetisation) go after Phase 11 with the next free number.

## Out of scope for the rebuild

These are explicitly **not** part of this roadmap. Punt to a future plan if needed.

- Native iOS / Android apps.
- Real-time chat among collaborators.
- AI trip-planning assistant.
- Multi-currency expense conversion (use single trip currency in v1).
- Right-to-left language support.
- Public trip discovery / social feed.
- Monetisation / billing — see REQUIREMENTS.md §19, deferred until a tier model is decided.
