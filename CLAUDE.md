# Travel Planner v2 — Claude Code

> Pointer file. Canonical agent-facing instructions live in [AGENTS.md](AGENTS.md).

## MANDATORY pre-work read chain

**Before any non-trivial change, read these files in this order. Do not skip.** They form the authoritative chain — each links onward to the next.

1. [AGENTS.md](AGENTS.md) — agent brief (repo state, dev cmd, conventions, delegation rules). Start here.
2. [REQUIREMENTS.md](REQUIREMENTS.md) — functional spec (what the product must do, entity tables, page-by-page behaviour).
3. [ROADMAP.md](ROADMAP.md) — phased build plan (status snapshot, DoD checklists, what's deferred).
4. [ARCHITECTURE.md](ARCHITECTURE.md) — stack decisions (how the app is built).
5. [README.md](README.md) — human-onboard doc.

Conflict resolution: REQUIREMENTS > ROADMAP > AGENTS > this file. If unclear, ask the user.

Trivial change exception: typo fixes, single-line CSS tweaks, localized bug fixes that touch ≤2 files within one already-understood area. Anything crossing modules, adding entities, changing schema, or affecting more than 2 files = read the chain.

## Why a pointer

Cross-tool agent files (`AGENTS.md`) are an emerging convention shared by multiple coding tools. Keeping content in `AGENTS.md` once, and pointing to it from tool-specific files like this one, prevents drift.

## Claude Code specifics

- Static prototype lives in [`design/`](design/). Dev server in `.claude/launch.json` under name `npx-serve` (serves `design/` on port 3001). Start with `mcp__Claude_Preview__preview_start`.
- Real-app rebuild target dir: [`app/`](app/) (created during Phase 0 scaffold).
- `.claude/`, `.playwright-mcp/`, `.vscode/`, screenshots, and `design/uploads/*.png|jpg` are gitignored.

## Token discipline
- Plan mode only for ≥3-file architecture changes.
- After commits print sha only, no recap.
- Read files via offset+limit; never re-read in same session.
- Build verify = tail -3 lines.
- Mechanical edits → cavecrew-builder; investigations → cavecrew-investigator.
- Sonnet for routine; Opus only when ambiguous.