# Agent instructions — Travel Planner v2

This file is the canonical agent-facing brief. Tools that read tool-specific files (Claude Code reads `CLAUDE.md`, Cursor reads `.cursorrules`, etc.) should defer to this document. Sibling tool files exist as thin pointers to keep one source of truth.

## Authoritative docs

Read these BEFORE changing code:

1. [REQUIREMENTS.md](REQUIREMENTS.md) — functional spec (what the product must do). Source of truth for the real-app rebuild. Entity tables, page-by-page behaviour, real-app additions beyond the mockup.
2. [ROADMAP.md](ROADMAP.md) — phased build plan (when each capability ships). Status snapshot at top, DoD checklists per phase. Update status when phases progress.
3. [README.md](README.md) — human-onboard doc (what this repo is, quickstart, repo map).

If anything in this file conflicts with REQUIREMENTS.md, REQUIREMENTS.md wins. If ROADMAP.md and REQUIREMENTS.md disagree on scope, ROADMAP.md wins (it tracks what's actually being built next).

## Repo state — at a glance

- The **static HTML/CSS/JS prototype** lives in [`design/`](design/). Exported from Claude Design.
- React 18 via CDN + Babel standalone inside `design/`. No build step. No backend. No persistence.
- The **real-app rebuild** lives (or will live) in [`app/`](app/) per ROADMAP Phase 0. Stack: Next.js 15 (App Router) + Drizzle + Postgres on Neon + Auth.js + Vercel.
- Cross-cutting docs (this file, REQUIREMENTS, ROADMAP, README) live at repo root.

## Entry point (prototype)

[`design/index.html`](design/index.html) — open directly in browser or serve `design/` with any static server. Originally shipped from Claude Design as `Travel Planner.html`; renamed so static servers serve it at `/`.

## Dev (prototype)

```bash
# Recommended — matches .claude/launch.json
npx serve design -l 3001

# Or
python3 -m http.server 3000 --directory design
```

Then open `http://localhost:3001/` (or `:3000`).

For Claude Code: `mcp__Claude_Preview__preview_start` with name `npx-serve` reads `.claude/launch.json` and starts the same server. Configurations:

| Name | Command | Port |
|------|---------|------|
| `npx-serve` | `npx serve design -l 3001` | 3001 |
| `python-static-server` | `python3 -m http.server 3000 --directory design` | 3000 |

## Architecture (prototype)

Single-page app, all scripts loaded in order in [`index.html`](design/index.html):

| File | Role |
|------|------|
| [`design-tokens.css`](design/design-tokens.css) | Apple-style colour + type tokens |
| [`styles.css`](design/styles.css) | App shell, itinerary, map, place cards |
| [`bookings.css`](design/bookings.css) | Hotels/transport views + add-booking modal |
| [`other-views.css`](design/other-views.css) | Calendar, budget, notes |
| [`account.css`](design/account.css) | Dark/light theme tokens, sign-in, account menu, settings |
| [`apple-polish.css`](design/apple-polish.css) | HIG overrides + mobile responsive |
| [`data.js`](design/data.js) | `TRIP`, `SEARCH_RESULTS` seed data |
| [`bookings-data.js`](design/bookings-data.js) | `BOOKINGS` (hotels + transport) |
| [`i18n.js`](design/i18n.js) | `I18N` strings (en/th), `ACCOUNTS`, `INVITES` |
| [`icons.jsx`](design/icons.jsx) | `window.Ico` icon library |
| [`map.jsx`](design/map.jsx) | `MapCanvas` SVG component |
| [`place-row.jsx`](design/place-row.jsx) | `PlaceRow`, `Segment`, gmaps URL helpers |
| [`sidebar-parts.jsx`](design/sidebar-parts.jsx) | `DayHeader`, `OptimizeStrip`, `AddPlace`, `Recco`, `TripCover` |
| [`bookings-views.jsx`](design/bookings-views.jsx) | `HotelsView`, `TransportView` |
| [`add-booking-modal.jsx`](design/add-booking-modal.jsx) | `AddBookingModal` (multi-step) |
| [`other-views.jsx`](design/other-views.jsx) | `CalendarView`, `BudgetView`, `NotesView` |
| [`account.jsx`](design/account.jsx) | `SignInScreen`, `AccountMenu`, `SettingsModal`, `InviteModal` |
| [`app.jsx`](design/app.jsx) | App root — all state, routing, orchestration |
| [`tweaks-panel.jsx`](design/tweaks-panel.jsx) | Standalone `TweaksPanel` utility shipped from design as a reusable component library. **Not wired into `index.html`** — kept for design parity, may be wired in or removed later. |

## Conventions (prototype)

- All components attach to `window.*` (no module system — CDN React).
- Theme: `data-theme` attribute on `<html>` (`"light"` / `"dark"`).
- Rail view state = `itinerary` / `calendar` / `hotels` / `transport` / `budget` / `notes`.
- Mobile breakpoint: ≤ 768px → single column + bottom tab bar.

## How agents should work in this repo

1. Read REQUIREMENTS.md before any non-trivial change.
2. The mockup is the source of truth for visual + behaviour; this doc is summary.
3. **Do not introduce a build step on the prototype itself.** Keep `design/` single-file-static so it stays runnable as a design reference. The real-app rebuild lives in `app/`.
4. If a field is added to `design/data.js` / `design/bookings-data.js` / `design/i18n.js`, update the entity table in REQUIREMENTS.md §4 in the same change.
5. When closing a phase, tick its DoD checkboxes in ROADMAP.md. Do not erase old checks.
6. Do not commit screenshots, `design/uploads/*.png|jpg`, `.playwright-mcp/`, `.claude/`, `.vscode/` — see [`.gitignore`](.gitignore).
7. Do not commit unless asked. The user controls commit timing.

## Delegation — when to spawn a subagent

Main thread runs Opus (deep reasoning). Delegate **mechanical** work to project-local subagents pinned to Sonnet 4.6 for speed and parallelism. Definitions live in `.claude/agents/`.

| Subagent | When to use | Tools |
|----------|-------------|-------|
| `fast-coder` | 1–3 file mechanical edits where shape is decided (rename, add field, wire import, implement-from-signature). | Read, Edit, Write, Grep, Glob, Bash |
| `fast-researcher` | Read-only "where is X / what calls Y / what fields does Z have". Returns `path:line: brief` table. **Spawn multiple in parallel** for cross-file scoping. | Read, Grep, Glob, Bash |
| `fast-doc` | Routine markdown edits where outline is decided (fill section, update table, tick checklist). | Read, Edit, Write, Grep, Glob |

Do **not** delegate when:
- Design intent is unclear (main thread decides shape first).
- Cross-file refactor needs repo-wide reasoning.
- Security-sensitive (auth, crypto, env, prod config).
- Branch/commit/PR/deploy decisions.

Parallelism rule: when multiple delegations are independent, dispatch them in **one message with multiple Agent tool calls** so they run concurrently.

Built-in caveman subagents (`cavecrew-investigator`, `cavecrew-builder`, `cavecrew-reviewer`) remain available and apply caveman-compression on the way back — use them when you specifically want compressed output to save main-thread context.

## Tool-specific pointer files

| Tool | Pointer | Status |
|------|---------|--------|
| Claude Code | [`CLAUDE.md`](CLAUDE.md) | thin pointer to this file |
| OpenAI Codex / Aider / Cursor / others | `AGENTS.md` (this file) | canonical |

If you add a new tool that uses its own conventions file, add a thin pointer there instead of duplicating content.
