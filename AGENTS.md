# Agent instructions — Travel Planner v2

Canonical agent-facing brief. Tool-specific files (`CLAUDE.md`, etc.) point here.

## Authoritative docs

1. [REQUIREMENTS.md](REQUIREMENTS.md) — functional spec, entity tables.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — stack decisions, env vars, layout.
3. [AGENTS-INDEX.md](AGENTS-INDEX.md) — file map (where to find X). Read first when locating code.
4. [README.md](README.md) — human onboard.

REQUIREMENTS wins on conflict.

## Repo

- Real app in [`app/`](app/). Next.js 15 App Router + Drizzle + Postgres on Neon + Auth.js + Vercel.
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

## Delegation

| Subagent | Use for |
|----------|---------|
| `fast-coder` | 1–3 file mechanical edits, shape decided |
| `fast-researcher` | Read-only "where is X" — parallelize |
| `fast-doc` | Routine markdown edits |
| `cavecrew-*` | Compressed output (saves main-thread context) |

Skip delegation when: design intent unclear, cross-file refactor, security-sensitive, branch/commit/PR/deploy.

Parallel rule: independent delegations → one message, multiple Agent calls.
