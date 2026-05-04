# Status page

## Provider

Pick one before T-3:

- **Atlassian Statuspage** — battle-tested, $29/mo.
- **Instatus** — cheaper, similar UX.
- **GitHub Status as a public repo** — free, less polished.

Default for v1: Statuspage. Owner: team lead.

## Components surfaced

| Component | What "operational" means |
|-----------|--------------------------|
| Web app | `https://<prod>/` returns 200 |
| Sign-in | Auth.js callbacks succeed |
| Database | Neon read query < 1s p95 |
| Maps | Google Maps tiles loading |

## Comm flow during an incident

1. On-call posts to #launch within 10 min of paging.
2. Within 30 min, status page set to **Investigating** with a one-sentence customer message.
3. Update status every 30 min until resolved (even if no new info — say "still investigating").
4. On resolve, flip to **Resolved**, link the postmortem when it lands.

## Templates

**Investigating:**
> We're investigating reports of <feature> being unavailable. We'll update within 30 minutes.

**Identified:**
> We've identified the cause as <one-line technical, non-jargony>. Working on a fix.

**Monitoring:**
> A fix has been deployed. We're monitoring to confirm it holds.

**Resolved:**
> The incident is resolved. Postmortem in <N> business days.

Avoid speculation, ETAs we won't hit, and blame.
