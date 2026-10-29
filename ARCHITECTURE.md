# Architecture

Stack decisions for Travel Planner v2. Pairs with [REQUIREMENTS.md](REQUIREMENTS.md) (*what*).

## Decision summary

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | Next.js 16 App Router | UI + RSC + route handlers + middleware in one. |
| Language | TypeScript | Drizzle + Next patterns require it. |
| Styling | Tailwind v4 + CSS variables | Tokens port directly. |
| Database | Postgres on Neon | Branched per preview deploy, free tier covers dev. |
| ORM | Drizzle | TS-first, no codegen, SQL-shaped. |
| Migrations | drizzle-kit | Generates SQL → applied in the Vercel production and preview builds (`vercel-build`). |
| Auth | Auth.js v5 | Drizzle adapter, Google + Email magic-link. |
| Maps | MapLibre (`react-map-gl/maplibre`) + OpenFreeMap tiles, or Google Maps JS (`@vis.gl/react-google-maps`) when `MAPS_PROVIDER=google`; Geoapify search/details/static map with Photon fallback; Google Maps URLs for deep links only | `GEOAPIFY_API_KEY` optional, server-only. |
| Hosting | Vercel | Native Next, preview deploys per PR. |
| Object storage | TBD | Frontrunner: Cloudflare R2. |
| Email | TBD | Frontrunner: Resend. |
| Package manager | pnpm | Lockfile committed. |

## Key constraints

- **Sessions**: database strategy (not JWT) — needed for instant revoke / device list (REQUIREMENTS §11).
- **Roles**: server-side check in every mutation against `trip_membership.role`. Middleware enforces sign-in only.
- **Migrations**: `drizzle-kit generate` → committed SQL → `drizzle-kit migrate` runs in the Vercel build (`vercel-build` in `app/package.json`), on **production** and **preview** deploys (`VERCEL_ENV`). Preview builds migrate the separate Preview DB, which all branches share: a branch's unmerged migration lands there, and a failed preview migrate only logs a warning and still builds (TP-0050; before that the Preview DB fell behind and trip pages crashed). Prod deploys apply committed migrations before `next build`; if migrate fails the build fails and nothing deploys. No `push` to prod. `drizzle.config.ts` prefers `DATABASE_URL_UNPOOLED` (direct connection) over the pooled `DATABASE_URL`, and the `vercel-build` script fails the production build fast if `DATABASE_URL_UNPOOLED` is unset — so migrations never run over the pooled/PgBouncer URL. Set `DATABASE_URL_UNPOOLED` in the Vercel production build env. Prod's migration journal was baselined once (2026-07-10) since its schema predated `drizzle-kit migrate` — see ticket API-MIGR.
- **Maps cache**: the Next data cache holds Geoapify and Photon responses for 30 days; the OG static map is cached for 7 days.
- **Place schema**: `place.lat` / `place.lng` + `place.place_id_external` (provider-prefixed: bare id = legacy Google, otherwise `geoapify:<id>` or `osm:<N|W|R><id>`).

## Repo layout

```
travel-planner-v2/
├── app/                 # Next.js 16
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
| `GEOAPIFY_API_KEY` | Place search/details + OG static map (server-only, optional; Photon fallback) |
| `INVITE_ONLY` / `ACCESS_ALLOWLIST` | Invite-only registration gate (default off) |
| `ACCESS_REQUEST_EMAIL` | `mailto:` target on `/sign-in/not-invited` |
| `RATE_LIMIT_IP_SALT` / `ANON_RATE_LIMIT_*` | Anonymous rate-limit key salt + budgets |
| `MAPS_PROVIDER` | `open` (default) or `google`; google needs `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_URL_SIGNING_SECRET`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID`, else open; forced open on Vercel Preview (`lib/maps/config.ts`) |
| `GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_URL_SIGNING_SECRET` | Google Places (New) + signed Static Maps (server-only; google mode) |
| `GOOGLE_MAPS_BROWSER_KEY` / `GOOGLE_MAPS_MAP_ID` | Google Maps JS key (referrer-locked) + vector Map ID; server reads at runtime, sent to the client via `MapsConfigProvider`; not `NEXT_PUBLIC_` |
| `GOOGLE_PLACES_DETAILS_FULL_DAILY_CAP` / `_BASIC_DAILY_CAP` / `GOOGLE_PLACES_AUTOCOMPLETE_DAILY_CAP` | Global daily Places budgets (defaults 30 / 80 / 300; fail open if the DB is down) |
| `GOOGLE_PLACES_FAKE` | Dev-only fixtures for Google mode; ignored when `NODE_ENV=production` |
| `CRON_SECRET` | Bearer token for both crons (`rate_limit` prune, Google volatile purge) |
| `I18N_FORCE_EN` | `1` = every page English whatever the `lang` cookie / Accept-Language say (i18n kill switch; unset normally) |
| `I18N_PSEUDO` | Dev-only: `1` pseudo-localises every string (`⟦…⟧`, +30%); ignored when `NODE_ENV=production` |

## CI

| Job | Trigger | Runs |
|-----|---------|------|
| `lint` | every PR | `pnpm lint` |
| `typecheck` | every PR | `pnpm typecheck` |
| `test` | every PR | `pnpm test` |
| `migrate` | production + preview Vercel deploy | `drizzle-kit migrate` via `vercel-build` before `next build` (production: fails the build on error; preview: warns and continues) |
| `e2e` | nightly | Playwright on staging |

Vercel deploys separately (production build = migrate then `next build`; preview build = `next build` only).

## Security baseline

- HTTPS-only (Vercel default).
- HTTP-only, `SameSite=Lax`, `Secure` session cookies (Auth.js default).
- Auth.js POST callbacks include CSRF token.
- Secrets via Vercel env vars.
- Rate-limit invite send + login attempts: **Postgres fixed-window, no external
  store.** `api_rate_limit` keys on token id for `/api/v1`; `rate_limit` keys on
  `bucket:sha256(ip + RATE_LIMIT_IP_SALT)` for anonymous traffic. Both run the
  same atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so a limit holds
  across serverless instances (Upstash/Redis not needed). The anonymous table is
  pruned by a Vercel cron (`app/vercel.json` → `/api/internal/prune-rate-limit`,
  `Bearer $CRON_SECRET`) because its keys are unbounded, unlike the
  FK-cascaded token table. A second cron, `/api/internal/purge-google-volatile`
  (`0 20 * * *` UTC, same `Bearer $CRON_SECRET`), nulls Google-sourced rating,
  reviews and hours older than 30 days; reads hide them earlier via
  `visibleVolatile` (`lib/places/google-sync.ts`, `lib/services/google-sync-service.ts`).
  A third cron, `/api/internal/google-resync` (`0 19 * * *` UTC, same bearer),
  re-fetches Google details for up to 20 places of upcoming trips per run
  (`runGoogleResync`, `lib/services/google-sync-service.ts`); it runs only in
  Google mode and returns `stopped:'disabled'` otherwise. The two purge/prune
  crons are independent of `MAPS_PROVIDER`.
- Registration is gated by `callbacks.signIn` (`lib/auth.ts` + `lib/access-gate.ts`)
  when `INVITE_ONLY` is on. The gate returns a **redirect string**, never `false`:
  the sign-in page drives both providers from server actions, which call `Auth()`
  in `raw` mode, and a falsy return throws `AccessDenied` out of the action into
  the root error boundary instead of reaching `pages.error`.
- CSP tightened iteratively.
