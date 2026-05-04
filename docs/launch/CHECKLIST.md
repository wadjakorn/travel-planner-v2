# Launch checklist

Day-of cutover. Each step has an owner + a verification step. No green check without verification.

## T-7 days — freeze prep

- [ ] Branch protection on `main`: required reviews ≥ 1, status checks must pass.
- [ ] CI green on `main` for 7 consecutive days.
- [ ] All Phase 11 DoD items either ticked or explicitly deferred to v1.1 in [ROADMAP.md](../../ROADMAP.md).
- [ ] [SLO.md](SLO.md) signed off by team lead.
- [ ] [ON_CALL.md](ON_CALL.md) rota populated for the first 4 weeks post-launch.
- [ ] Staging trip seeded with realistic data; smoke-tested by 2 humans.
- [ ] Lighthouse ≥ 90 (Perf / A11y / Best Practices / SEO) on itinerary, hotels, transport, budget.
- [ ] axe-core CI clean.

## T-3 days — comms prep

- [ ] Status page provisioned ([STATUS.md](STATUS.md)) and DNS pointing at it.
- [ ] Customer-facing announcement drafted (timing, what changed, support contact).
- [ ] Internal #launch Slack channel created; on-call paged in.
- [ ] DB backup verified — restore tested into a throwaway Neon branch within the last 24h.

## T-1 day — final prep

- [ ] Code freeze enforced. Hotfix protocol active: only on-call may merge.
- [ ] Vercel production environment vars audited: `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `EMAIL_SERVER`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_APP_URL`.
- [ ] Telemetry endpoint reachable; test events arriving in dashboard.
- [ ] [ROLLBACK.md](ROLLBACK.md) printed and pinned in #launch.

## T-0 — cutover

- [ ] On-call confirms readiness in #launch.
- [ ] Promote staging build to production via Vercel "Promote to production" on the green deployment.
- [ ] DNS — confirm A/AAAA + CNAME pointing at Vercel; TTL ≤ 300s for the first 24h.
- [ ] Run smoke tests against `https://<prod-domain>/`:
  - [ ] Sign in with Google.
  - [ ] Sign in with magic link.
  - [ ] Create new trip.
  - [ ] Add a place; reorder.
  - [ ] Add a hotel + transport booking.
  - [ ] Add an expense.
  - [ ] Open Calendar; bookings appear.
  - [ ] Invite a teammate; teammate accepts; teammate sees trip.
  - [ ] Toggle theme to dark; reload; persists.
  - [ ] Toggle language to ไทย; reload; persists.
- [ ] Status page set to "Operational".
- [ ] Public announcement sent.

## T+1 day — observe

- [ ] Error rate < SLO threshold ([SLO.md](SLO.md)).
- [ ] No P0/P1 incidents.
- [ ] Telemetry events landing as expected; bounce rate baseline captured.
- [ ] On-call hand-off documented in #launch.

## T+7 days — retro

- [ ] Launch retro scheduled.
- [ ] Postmortem written for any P1+ incidents during launch week.
- [ ] Roadmap updated with v1.1 priorities based on user feedback.
