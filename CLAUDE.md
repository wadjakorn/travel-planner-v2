# Travel Planner v2 — Claude Code

> Pointer file. Canonical agent-facing instructions live in [AGENTS.md](AGENTS.md).
> Read it first.

## Authoritative docs (linked here for convenience)

1. [REQUIREMENTS.md](REQUIREMENTS.md) — functional spec (what to build).
2. [ROADMAP.md](ROADMAP.md) — phased build plan (when each capability ships).
3. [ARCHITECTURE.md](ARCHITECTURE.md) — stack decisions (how the app is built).
4. [README.md](README.md) — human-onboard doc.
5. [AGENTS.md](AGENTS.md) — canonical agent brief (repo state, dev cmd, conventions).

If anything below conflicts with the docs above, the docs above win.

## Why a pointer

Cross-tool agent files (`AGENTS.md`) are an emerging convention shared by multiple coding tools. Keeping content in `AGENTS.md` once, and pointing to it from tool-specific files like this one, prevents drift.

## Claude Code specifics

- Static prototype lives in [`design/`](design/). Dev server in `.claude/launch.json` under name `npx-serve` (serves `design/` on port 3001). Start with `mcp__Claude_Preview__preview_start`.
- Real-app rebuild target dir: [`app/`](app/) (created during Phase 0 scaffold).
- `.claude/`, `.playwright-mcp/`, `.vscode/`, screenshots, and `design/uploads/*.png|jpg` are gitignored.
