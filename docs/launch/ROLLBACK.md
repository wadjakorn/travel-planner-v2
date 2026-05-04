# Rollback

Decision tree for backing out a bad deploy. Bias to roll back fast; root-cause later.

## When to roll back (no debate)

- P0 affecting > 1 % of users.
- Data corruption suspected.
- Auth flow broken.
- DB migration failed mid-apply.

## When to fix forward

- Cosmetic regression with no user-data risk.
- Single-feature break with a known one-line fix in flight.
- Telemetry gap — annoying, not user-facing.

## How to roll back — Vercel deploy

1. Open the Vercel project's Deployments tab.
2. Find the last known-good deployment (green check, no incident reports).
3. Click `…` → **Promote to production**.
4. Confirm DNS still points at Vercel; new deploy goes live within ~30s.
5. Post in #launch: `ROLLED BACK to <sha> — reason: <one line>`.
6. Open an incident in [INCIDENT.md](INCIDENT.md).

Estimated time: < 2 minutes.

## How to roll back — DB migration

We use `drizzle-kit push` (no migration history applied to prod). Implication: every schema change is a forward-only diff.

If a push left prod in a bad state:

1. **Stop traffic immediately** — Vercel deploy paused via dashboard.
2. Pull latest snapshot from Neon's branch tab (point-in-time recovery, default 7-day window).
3. Restore to a fresh Neon branch.
4. Update `DATABASE_URL` in Vercel to point at the restored branch.
5. Redeploy the previous app build.
6. Post-recovery: write a migration plan that catches the broken case in CI before re-applying.

Estimated time: 10–30 minutes depending on data size.

## What we do NOT do

- `git revert` on `main` to "undo" a deploy — too slow and may carry forward unrelated changes.
- Manual SQL on prod outside an incident — every direct-write must be approved by team lead and logged in #incident-response.
- Force-push `main`. Ever.

## Pre-flight before any prod deploy

- CI green on the candidate sha.
- Migration files (if any) reviewed by a second set of eyes.
- Vercel preview URL smoke-tested by the deployer.
- On-call ack'd in #launch.
