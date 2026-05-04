# Travel Planner v2 — Claude Code

Pointer file. Canonical agent brief: [AGENTS.md](AGENTS.md).

## Pre-work read order

1. [AGENTS.md](AGENTS.md) — repo state, dev cmd, conventions.
2. [REQUIREMENTS.md](REQUIREMENTS.md) — functional spec.
3. [ARCHITECTURE.md](ARCHITECTURE.md) — stack decisions.

Conflict: REQUIREMENTS > AGENTS > this file.

Trivial change exception: typo fix, single-line CSS, ≤2-file localized fix.

## Token discipline

- Read files via offset+limit; never re-read in same session.
- Build verify = tail -3 lines.
- Mechanical edits → cavecrew-builder; investigations → cavecrew-investigator.
- Sonnet for routine; Opus only when ambiguous.
