# Architecture

> Stack decisions for the Travel Planner v2 real-app rebuild.
> Source of truth for *how* the app is built. Pairs with
> [REQUIREMENTS.md](REQUIREMENTS.md) (*what*) and [ROADMAP.md](ROADMAP.md) (*when*).
> If you're picking up this repo, read those two first; this file assumes
> the spec and phase plan are familiar.

## Decision summary

| Layer | Choice | Reason in one line |
|-------|--------|--------------------|
| Frontend | Next.js 15 (App Router) | One framework for UI + RSC + route handlers + middleware. |
| Language | TypeScript | Required by Drizzle + Next.js patterns we want. |
| Styling | Tailwind v4 + CSS variables | Mockup tokens port directly to CSS vars; Tailwind utility for layout. |
| Database | Postgres on Neon | Managed, branched per preview deploy, free tier covers dev. |
| ORM | Drizzle | TS-first, fast, no codegen, SQL-shaped. |
| Migrations | drizzle-kit | Generates SQL from schema, applies via Neon. |
| Auth | Auth.js (NextAuth) v5 | Self-hosted, Drizzle adapter, supports Google + Email magic-link. |
| Identity providers | Google OAuth + Email magic-link | Apple deferred (cost + verification work). |
| Maps | Google Maps JS API + Places + Directions | Key already provisioned. |
| Hosting | Vercel | Native Next.js integration, preview deploys per PR. |
| Object storage | TBD (Phase 10) | Frontrunner: Cloudflare R2 (zero egress). |
| Email | TBD (Phase 8) | Frontrunner: Resend. |
| Repo layout | Monorepo-style same-repo | `design/` (prototype), `app/` (real app), root docs. One git history. |
| Package manager | pnpm | Faster, disk-efficient. Lockfile committed. |

## Why Next.js 15 (App Router)

- React 19 RSC by default — itinerary view is read-heavy, server-rendered place cards keep client JS small.
- Route handlers replace a separate API service: `/api/trip/[id]` lives next to `/trip/[id]/page.tsx`, one deploy.
- Middleware covers auth gating, locale negotiation, role checks at the edge.
- Vercel hosting is zero-config for Next; preview deploys per PR are free.
- Largest ecosystem of patterns for the things we need (auth, ORM, OG images, image optimisation, i18n).

Trade-offs: Server Component / Client Component split is a learning curve in places (esp. forms with optimistic UI — Phase 2). We accept it.

## Database — Postgres on Neon

- Trip / Day / Place / Booking schema is highly relational. NoSQL would force join logic into the app.
- Neon: serverless Postgres, branching matches Vercel preview deploys (each PR gets a DB branch).
- Free tier: 0.5 GB storage, 191 compute hours/month — enough for dev + low-traffic prod.
- Connection: `@neondatabase/serverless` HTTP driver inside Next.js route handlers (works on Edge runtime). Standard `postgres-js` for Node-runtime jobs (migrations, scripts).

Migration policy:
- Every schema change goes through `drizzle-kit generate` → committed SQL → `drizzle-kit migrate` in CI before deploy.
- No hand-edited SQL in production. `drizzle-kit push` only for local dev.

## ORM — Drizzle

- TS schema in `app/src/db/schema.ts` produces both SQL and TS types.
- No runtime codegen step (Prisma's main pain).
- Query builder reads like SQL; raw escape hatch (`sql\`...\``) when needed.
- Drizzle Studio for ad-hoc data inspection.

## Auth — Auth.js (NextAuth) v5

- Self-hosted in our Postgres via `@auth/drizzle-adapter`.
- Two providers in v1:
  - **Google OAuth** — `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` already provisioned.
  - **Email magic-link** — Auth.js Email provider; SMTP creds supplied by `EMAIL_SERVER` env. For dev: Mailpit container or any SMTP relay. For prod: locked-in transactional provider chosen at Phase 8 (Resend frontrunner).
- Session strategy: database (not JWT) — needed for instant revoke / device list in REQUIREMENTS §11.
- Apple Sign In **deferred**: requires Apple Developer Program ($99/yr), domain verification, JWT-signing client secrets. Add at Phase 1.5 if launch scope demands it; otherwise post-launch.

Roles enforcement (REQUIREMENTS §2): server-side check in every mutation route handler against `trip_membership.role`. Middleware enforces "must be signed in"; per-trip role check happens in handler logic since middleware can't query the DB cheaply.

## Maps — Google Maps

- User-supplied keys: `GOOGLE_MAPS_API_KEY` (client + server).
- Client: Google Maps JS API for the day-route view, Places Autocomplete for place search.
- Server: Directions API for real polylines + travel-time matrix used by Optimize-Route.
- Costs: free tier $200/mo Maps credit covers ~28k loads. Track usage from Phase 4. Cache geocode results (long-lived) and directions (per `(places, mode)` tuple, 30-day TTL) in Postgres to suppress repeat calls.

Place data model (Phase 4 schema migration): replace `place.x` / `place.y` with `place.lat` / `place.lng` + `place.place_id_external` (Google's `place_id`) so we can re-fetch / re-geocode without losing the binding.

## Hosting — Vercel

- Free Hobby tier for dev / staging.
- Pro tier (~$20/seat-month) at launch for production — needed for analytics, longer build minutes, real domains.
- Preview deploys: every PR gets `<branch>-<repo>.vercel.app` + a Neon DB branch.
- Edge runtime where it helps (auth middleware, lightweight reads); Node runtime for anything touching `node:crypto`, file streams, or Drizzle `postgres-js`.

## Storage — deferred to Phase 10

Frontrunner: **Cloudflare R2** (S3-compatible, zero egress fees, ~$0.015/GB-month).
Decision-deferred reason: bookings attach PDFs / images, but mockup ships none and ROADMAP defers attachments to Phase 10 (after sync, before launch). Avoid early lock-in.
Backup: **AWS S3** if R2 misses any feature we need at the time.

## Email — deferred to Phase 8

Frontrunner: **Resend** (cleanest dev experience, React Email templates, free 3k/month).
Phase 1 dev uses any SMTP relay (Mailpit container in `docker-compose.yml`) so Auth.js magic-link works without committing to a vendor.
Decision-deferred reason: production-grade transactional email needs domain warming, DMARC alignment — wasted work if launched too early. Postpone until invites become real (Phase 8).

## Repo layout

```
travel-planner-v2/
├── design/              # mockup (untouched, served by npx serve design)
├── app/                 # real app (Next.js 15)
│   ├── src/
│   │   ├── app/         # App Router pages + route handlers
│   │   ├── db/          # Drizzle schema + client
│   │   ├── lib/         # auth.ts, env.ts, utils
│   │   └── components/  # React components (RSC + client)
│   ├── drizzle/         # Generated migration SQL
│   ├── public/          # Static assets (favicon, OG image)
│   ├── package.json
│   ├── drizzle.config.ts
│   ├── next.config.ts
│   ├── tailwind.config.ts (or v4 inline)
│   └── tsconfig.json
├── REQUIREMENTS.md      # functional spec
├── ROADMAP.md           # phased build plan
├── ARCHITECTURE.md      # this file
├── README.md            # human onboard
├── AGENTS.md            # canonical agent brief
├── CLAUDE.md            # pointer to AGENTS.md
└── .claude/             # agent / preview config (partly gitignored)
```

One repo, one git history. Pros: docs co-located with both prototype + app, single PR can update spec + scaffold. Cons: CI complexity slightly higher (path filters per dir). Acceptable.

## Environment variables

Source of truth: `app/.env.example` (committed). Never commit `app/.env` (gitignored).

| Variable | Purpose | Required from |
|----------|---------|---------------|
| `DATABASE_URL` | Postgres connection (Neon pooled) | Phase 0 |
| `DATABASE_URL_UNPOOLED` | Direct Postgres for migrations / scripts | Phase 0 |
| `AUTH_SECRET` | Auth.js session encryption (32+ bytes random) | Phase 1 |
| `AUTH_URL` | Canonical app URL (Auth.js callbacks) | Phase 1 |
| `GOOGLE_CLIENT_ID` | Google OAuth | Phase 1 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Phase 1 |
| `EMAIL_SERVER` | SMTP URL for magic-link (e.g. `smtp://user:pass@host:port`) | Phase 1 |
| `EMAIL_FROM` | From-address for magic-link mail | Phase 1 |
| `GOOGLE_MAPS_API_KEY` | Maps JS + Directions + Places | Phase 4 |

Provisioning checklist for Phase 0 ratification:
- Neon project + DB + branch-per-PR enabled
- Vercel project linked to GitHub repo, env vars synced
- Google Cloud project exposes OAuth client (already provisioned by user)
- Local `.env` populated, `.env.example` matches

## Local dev

```bash
# One-time
cd app
pnpm install
cp .env.example .env       # fill in secrets
pnpm db:push               # apply schema to local/Neon dev branch

# Each dev session
pnpm dev                   # Next.js on http://localhost:3000
```

Prototype dev server (separate, served from `design/`):
```bash
npx serve design -l 3001   # http://localhost:3001
```

Both run simultaneously; ports don't collide.

## CI / CD

GitHub Actions workflow (added in Phase 0 sub-step 3 follow-up):

| Job | Triggers | Runs |
|-----|----------|------|
| `lint` | every PR | `pnpm lint` |
| `typecheck` | every PR | `pnpm typecheck` |
| `test` | every PR | `pnpm test` (unit + integration) |
| `migrate` | merges to `main` | `drizzle-kit migrate` against staging DB |
| `e2e` | nightly + pre-release | Playwright on staging URL |

Vercel runs deployments separately (no GH Actions deploy job).

## Security baseline

- HTTPS-only (Vercel default).
- HTTP-only, `SameSite=Lax`, `Secure` session cookies (Auth.js default).
- CSRF: Auth.js POST callbacks include built-in CSRF token; route handlers that mutate use Next's built-in fetch CSRF protection where applicable.
- Secrets via Vercel env vars; never in code or repo.
- Rate-limit invite send + login attempts at Phase 8 / 1 respectively (Upstash Redis sliding window — TBD).
- Content Security Policy: tightened iteratively, finalised at Phase 11 launch hardening.

## Out of scope (this doc)

- UI design system specifics — covered in REQUIREMENTS §15 + token files.
- Per-feature wire details — those live in REQUIREMENTS.
- Phase-by-phase delivery — that's ROADMAP.
- Monetisation, billing, native apps — deferred per ROADMAP "Out of scope".

## Changelog

- **2026-05-03**: Initial draft. Stack ratified (Next.js 15 + Drizzle + Neon + Auth.js + Vercel). Storage / Email deferred to Phase 10 / 8.
