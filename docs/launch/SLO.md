# Service-level objectives

Targets are aspirational for v1; revisited at the T+30 retro with real traffic data.

## Definitions

- **Availability**: % of HTTP requests to `/`, `/trip/*`, `/api/*` returning a 2xx or 3xx in a rolling 28-day window.
- **Read latency**: p95 end-to-end response for `/trip/[id]` (server render + first byte) measured from the Vercel edge.
- **Mutation latency**: p95 end-to-end for any server action (`add*Action`, `update*Action`, `remove*Action`, `seed*Action`).

## Targets

| Metric | Target | Hard floor |
|--------|--------|------------|
| Availability | 99.5 % | 99.0 % |
| Read latency p95 | 1.5 s | 3.0 s |
| Mutation latency p95 | 1.0 s | 2.5 s |
| Auth flow success rate | 99 % | 97 % |
| DB connection error rate | < 0.1 % | < 1 % |

## Error budget

- 99.5 % availability ≈ 3.6 hours of downtime per 28-day window.
- Burn rate alert: > 2 % of monthly budget in 1 hour pages on-call.
- Burn rate alert: > 10 % of monthly budget in 6 hours pages on-call + escalates.
- If 50 % of budget burned mid-cycle, freeze non-critical deploys until error rate normalises.

## Out of scope for v1

- Calendar drag-reschedule (deferred — not in critical path).
- Live sync (Phase 11J).
- Email delivery latency (gated on provider pick).
- Offline mode (Phase 11J).

## Measurement

- Vercel Analytics for read latency + availability.
- Drizzle query timing logged via Edge runtime hooks (Phase 11G telemetry).
- Auth.js flow events sent to telemetry sink.

Review cadence: weekly during the first 4 weeks; monthly after.
