# Architecture

Stack decisions for Travel Planner v2. Pairs with [REQUIREMENTS.md](REQUIREMENTS.md) (*what*).

## Decision summary

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | Next.js 15 App Router | UI + RSC + route handlers + middleware in one. |
| Language | TypeScript | Drizzle + Next patterns require it. |
| Styling | Tailwind v4 + CSS variables | Tokens port directly. |
| Database | Postgres on Neon | Branched per preview deploy, free tier covers dev. |
| ORM | Drizzle | TS-first, no codegen, SQL-shaped. |
| Migrations | drizzle-kit | Generates SQL → applied in CI. |
| Auth | Auth.js v5 | Drizzle adapter, Google + Email magic-link. |
| Maps | Google Maps JS + Places + Directions | Key already provisioned. |
| Hosting | Vercel | Native Next, preview deploys per PR. |
| Object storage | TBD | Frontrunner: Cloudflare R2. |
| Email | TBD | Frontrunner: Resend. |
| Package manager | pnpm | Lockfile committed. |

## Key constraints

- **Sessions**: database strategy (not JWT) — needed for instant revoke / device list (REQUIREMENTS §11).
- **Roles**: server-side check in every mutation against `trip_membership.role`. Middleware enforces sign-in only.
- **Migrations**: `drizzle-kit generate` → committed SQL → `drizzle-kit migrate` runs in the Vercel build (`vercel-build` script in `app/package.json`: `drizzle-kit migrate && next build`), so every deploy applies committed migrations before building. No `push` to prod. Requires `DATABASE_URL_UNPOOLED` (direct connection) in the Vercel build env. Prod's migration journal was baselined once (2026-07-10) since its schema predated `drizzle-kit migrate` — see ticket API-MIGR.
- **Maps cache**: geocode results long-lived; directions per `(places, mode)` 30-day TTL in Postgres to suppress repeat calls.
- **Place schema**: `place.lat` / `place.lng` + `place.place_id_external` (Google `place_id`).

## Repo layout

```
travel-planner-v2/
├── app/                 # Next.js 15
│   ├── src/
│   │   ├── app/         # App Router pages + route handlers
│   │   ├── db/          # Drizzle schema + client
│   │   ├── lib/         # auth, env, utils
│   │   └── components/  # RSC + client components
│   ├── drizzle/         # Generated migration SQL
│   ├── public/
│   └── *.config.ts, package.json, tsconfig.json
├── REQUIREMENTS.md
├── ARCHITECTURE.md
├── README.md
├── AGENTS.md
├── CLAUDE.md
└── .claude/             # gitignored
```

## Environment variables

Source: `app/.env.example` (committed). Never commit `app/.env`.

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres pooled |
| `DATABASE_URL_UNPOOLED` | Direct for migrations/scripts |
| `AUTH_SECRET` | Auth.js encryption (32+ bytes) |
| `AUTH_URL` | Auth.js callback base |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `EMAIL_SERVER` / `EMAIL_FROM` | SMTP for magic-link |
| `GOOGLE_MAPS_API_KEY` | Maps JS + Directions + Places |

## CI

| Job | Trigger | Runs |
|-----|---------|------|
| `lint` | every PR | `pnpm lint` |
| `typecheck` | every PR | `pnpm typecheck` |
| `test` | every PR | `pnpm test` |
| `migrate` | every Vercel deploy | `drizzle-kit migrate` via the `vercel-build` script (before `next build`) |
| `e2e` | nightly | Playwright on staging |

Vercel deploys separately (build = `vercel-build` → migrate then `next build`).

## Security baseline

- HTTPS-only (Vercel default).
- HTTP-only, `SameSite=Lax`, `Secure` session cookies (Auth.js default).
- Auth.js POST callbacks include CSRF token.
- Secrets via Vercel env vars.
- Rate-limit invite send + login attempts (Upstash Redis sliding window — TBD).
- CSP tightened iteratively.
