# Agent instructions — Travel Planner v2

Canonical agent-facing brief. Tool-specific files (`CLAUDE.md`, etc.) point here.

## Authoritative docs

1. [REQUIREMENTS.md](REQUIREMENTS.md) — functional spec, entity tables.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — stack decisions, env vars, layout.
3. [AGENTS-INDEX.md](AGENTS-INDEX.md) — file map (where to find X). Read first when locating code.
4. [README.md](README.md) — human onboard.
5. [API.md](API.md) — public REST API (v1): auth, endpoints, agent quickstart.

REQUIREMENTS wins on conflict.

## Repo

- Real app in [`app/`](app/). Next.js 16 App Router + Drizzle + Postgres on Neon + Auth.js + Vercel.
- Cross-cutting docs at repo root.
- Gitignored: `.claude/`, `.playwright-mcp/`, `.vscode/`, screenshots, `app/.env`, `app/node_modules/`, `app/.next/`.

## Dev

```bash
cd app
pnpm install
cp .env.example .env   # fill secrets
pnpm db:push
pnpm dev               # localhost:3000
```

## Conventions

- Comments rare — only when WHY non-obvious.
- Server components by default; `'use client'` only when interactivity needs it.
- Entity tables in REQUIREMENTS.md §4 = source of truth. Update same PR when shape changes.
- Do not commit unless asked.

## Maps and place search

No Google Maps Platform. One optional key:

- **`GEOAPIFY_API_KEY`** — server-only (never `NEXT_PUBLIC_`). Used by `app/src/app/api/places/*` (autocomplete, details) and the OG static map. Free plan 3,000 credits/day. Without it, search falls back to Photon and the OG image has no map.
- **Basemap** — MapLibre GL via `react-map-gl/maplibre` on OpenFreeMap (no key) in `open` mode, Google Maps JS (`@vis.gl/react-google-maps`) in `google` mode, chosen by `MapsConfigProvider` (`components/maps-config-provider.tsx`). MapLibre style URLs live in `app/src/lib/map-style.ts`.
- **Photon** (komoot) — keyless fallback when Geoapify is missing, errors or returns 429.
- Map components side-effect import `lib/maplibre-worker.ts` (Turbopack worker URL) and are loaded via `dynamic(..., { ssr: false })`.
- `place_id_external` is provider-prefixed: bare = legacy Google id, else `geoapify:` / `osm:`.
- Google OAuth (`GOOGLE_CLIENT_ID/SECRET`) is unrelated and stays.

Ops: [docs/ops/maps-cost-guardrails.md](docs/ops/maps-cost-guardrails.md).

## Delegation

| Subagent | Use for |
|----------|---------|
| `fast-coder` | 1–3 file mechanical edits, shape decided |
| `fast-researcher` | Read-only "where is X" — parallelize |
| `fast-doc` | Routine markdown edits |
| `cavecrew-*` | Compressed output (saves main-thread context) |

Skip delegation when: design intent unclear, cross-file refactor, security-sensitive, branch/commit/PR/deploy.

Parallel rule: independent delegations → one message, multiple Agent calls.
