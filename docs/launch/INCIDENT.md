# Incident response

## Roles

- **Incident commander (IC)** — drives the call. Default = on-call primary; team lead for P0.
- **Communicator** — posts to status page + #launch. Default = backup on-call.
- **Investigator** — reads logs, writes hotfix. Anyone available.

One person can wear multiple hats during a small incident; never combine IC + communicator on a P0.

## During an incident

1. IC declares the incident in `#incident-response`: severity + one-line summary.
2. Communicator updates status page within 30 min of paging.
3. IC keeps a running log in the incident thread: timestamps + actions.
4. Mitigation > diagnosis. Roll back ([ROLLBACK.md](ROLLBACK.md)) before debugging.
5. If user data is at risk, treat as P0 regardless of % affected.

## Postmortem template

Write within 5 business days for any P1+. Blameless — focus on systems, not people.

```markdown
# Postmortem: <one-line title>

**Date**: YYYY-MM-DD
**Severity**: P0 / P1
**Duration**: <Xh Ym from first user impact to resolve>
**Authors**: <names>
**Status**: Draft / In review / Final

## Summary
<2–3 sentences a stakeholder can read in 30 seconds.>

## Impact
- Users affected: <count or %>
- Features impacted: <list>
- Data integrity: <intact / partial / lost — and what>
- Money / contractual fallout: <yes/no>

## Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | First customer report |
| HH:MM | Page sent to on-call |
| HH:MM | Mitigation applied |
| HH:MM | Resolved |

## Root cause
<Technical explanation. Avoid "human error" — explain the system that allowed the error.>

## What went well
- <bullets>

## What went badly
- <bullets>

## Where we got lucky
- <bullets>

## Action items
| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | <e.g. add unit test that catches this case> | <name> | YYYY-MM-DD |
| 2 | <e.g. wire alert on this metric> | <name> | YYYY-MM-DD |

Each action item gets a tracked issue; close the postmortem when all are filed (not when all are done).
```

## Anti-patterns to avoid

- Blaming the deployer.
- "We'll be more careful next time" as an action item.
- Action items with no owner or no date.
- Postmortems that never get written because the bug was small. Write them anyway — write them short.
