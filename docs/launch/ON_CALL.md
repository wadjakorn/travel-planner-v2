# On-call

## Rota

Single primary, no shadow during v1. Weekly hand-off Mondays 09:00 +07.

| Week | Primary | Backup |
|------|---------|--------|
| TBD  | TBD     | TBD    |

Populate before T-7 freeze ([CHECKLIST.md](CHECKLIST.md)).

## Paging policy

| Severity | Definition | Page within | Resolve within |
|----------|------------|-------------|----------------|
| P0       | Site down, signin broken, data loss in flight | 5 min | 1 hour |
| P1       | One feature broken (bookings, budget, notes), > 5 % users affected | 15 min | 4 hours |
| P2       | Single user blocked, cosmetic regression, slow page | next business day | 1 week |
| P3       | Tech debt, polish, documentation gap | backlog | n/a |

## Escalation

1. On-call primary acks within page window.
2. If no ack in 5 min for P0, page backup.
3. If no ack in 10 min for P0, page team lead.
4. Team lead is the incident commander for any P0.

## Tools the on-call needs access to

- GitHub repo + Vercel deploy permissions.
- Neon console (DB) — read-only by default; promote to write only inside a declared incident.
- Status page admin.
- #launch + #incident-response Slack channels.
- Telemetry dashboard (provider TBD — Phase 11G).
- This repo, especially [ROLLBACK.md](ROLLBACK.md) and [INCIDENT.md](INCIDENT.md).

## What on-call is NOT for

- Customer-support questions (route to support@).
- Feature requests (route to roadmap PR).
- Performance investigations without a paging signal (file an issue).

## Hand-off checklist

End-of-week, primary writes a one-line status in #on-call:

```
Week N: 0 P0, X P1s, Y P2s. Notable: <single sentence>. Open incidents: <link or none>.
```
