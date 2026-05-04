# Travel Planner v2

Wanderlog-style group travel planner. Multi-day itineraries, hotel/transport bookings, shared budget, packing notes, collaborator invites.

## Stack

Next.js 15 (App Router) + Drizzle + Postgres on Neon + Auth.js + Vercel. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Quickstart

```bash
cd app
pnpm install
cp .env.example .env   # fill secrets — see ARCHITECTURE.md for required vars
pnpm db:push           # apply schema to Neon dev branch
pnpm dev               # http://localhost:3000
```

## Docs

| Doc | Purpose |
|-----|---------|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Functional spec. Read before code changes. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, env vars, repo layout, security baseline. |
| [AGENTS.md](AGENTS.md) | Agent brief — repo state, dev cmd, conventions, delegation. |
| [CLAUDE.md](CLAUDE.md) | Claude Code pointer to AGENTS.md. |
| [`app/README.md`](app/README.md) | App-level dev notes. |

## Contributing

1. Read [REQUIREMENTS.md](REQUIREMENTS.md).
2. Match data shapes to entity tables (§4). Update spec same PR if shape changes.
3. Bug fixes: no surrounding cleanup. New features: stack decisions in ARCHITECTURE.md.
