# Agent instructions — Travel Planner v2

This file is the canonical agent-facing brief. Tools that read tool-specific files (Claude Code reads `CLAUDE.md`, Cursor reads `.cursorrules`, etc.) should defer to this document. Sibling tool files exist as thin pointers to keep one source of truth.

## Authoritative docs

Read these BEFORE changing code:

1. [REQUIREMENTS.md](REQUIREMENTS.md) — functional spec (what the product must do). Source of truth for the real-app rebuild. Entity tables, page-by-page behaviour, real-app additions beyond the mockup.
2. [ROADMAP.md](ROADMAP.md) — phased build plan (when each capability ships). Status snapshot at top, DoD checklists per phase. Update status when phases progress.
3. [README.md](README.md) — human-onboard doc (what this repo is, quickstart, repo map).

If anything in this file conflicts with REQUIREMENTS.md, REQUIREMENTS.md wins. If ROADMAP.md and REQUIREMENTS.md disagree on scope, ROADMAP.md wins (it tracks what's actually being built next).

## Repo state — at a glance

- This repo currently holds a **static HTML/CSS/JS prototype** exported from Claude Design.
- React 18 via CDN + Babel standalone. No build step. No backend. No persistence.
- Real-app rebuild is planned per [ROADMAP.md](ROADMAP.md) — Phase 0 (stack decision + scaffold) has not started yet.

## Entry point

[`index.html`](index.html) — open directly in browser or serve with any static server. Originally shipped from Claude Design as `Travel Planner.html`; renamed so static servers serve it at `/`.

## Dev

```bash
# Recommended — matches .claude/launch.json
npx serve . -l 3001

# Or
python3 -m http.server 3000
```

Then open `http://localhost:3001/` (or `:3000`).

For Claude Code: `mcp__Claude_Preview__preview_start` with name `npx-serve` reads `.claude/launch.json` and starts the same server. Configurations:

| Name | Command | Port |
|------|---------|------|
| `npx-serve` | `npx serve . -l 3001` | 3001 |
| `python-static-server` | `python3 -m http.server 3000` | 3000 |

## Architecture (prototype)

Single-page app, all scripts loaded in order in [`index.html`](index.html):

| File | Role |
|------|------|
| [`design-tokens.css`](design-tokens.css) | Apple-style colour + type tokens |
| [`styles.css`](styles.css) | App shell, itinerary, map, place cards |
| [`bookings.css`](bookings.css) | Hotels/transport views + add-booking modal |
| [`other-views.css`](other-views.css) | Calendar, budget, notes |
| [`account.css`](account.css) | Dark/light theme tokens, sign-in, account menu, settings |
| [`apple-polish.css`](apple-polish.css) | HIG overrides + mobile responsive |
| [`data.js`](data.js) | `TRIP`, `SEARCH_RESULTS` seed data |
| [`bookings-data.js`](bookings-data.js) | `BOOKINGS` (hotels + transport) |
| [`i18n.js`](i18n.js) | `I18N` strings (en/th), `ACCOUNTS`, `INVITES` |
| [`icons.jsx`](icons.jsx) | `window.Ico` icon library |
| [`map.jsx`](map.jsx) | `MapCanvas` SVG component |
| [`place-row.jsx`](place-row.jsx) | `PlaceRow`, `Segment`, gmaps URL helpers |
| [`sidebar-parts.jsx`](sidebar-parts.jsx) | `DayHeader`, `OptimizeStrip`, `AddPlace`, `Recco`, `TripCover` |
| [`bookings-views.jsx`](bookings-views.jsx) | `HotelsView`, `TransportView` |
| [`add-booking-modal.jsx`](add-booking-modal.jsx) | `AddBookingModal` (multi-step) |
| [`other-views.jsx`](other-views.jsx) | `CalendarView`, `BudgetView`, `NotesView` |
| [`account.jsx`](account.jsx) | `SignInScreen`, `AccountMenu`, `SettingsModal`, `InviteModal` |
| [`app.jsx`](app.jsx) | App root — all state, routing, orchestration |
| [`tweaks-panel.jsx`](tweaks-panel.jsx) | Standalone `TweaksPanel` utility shipped from design as a reusable component library. **Not wired into `index.html`** — kept for design parity, may be wired in or removed later. |

## Conventions (prototype)

- All components attach to `window.*` (no module system — CDN React).
- Theme: `data-theme` attribute on `<html>` (`"light"` / `"dark"`).
- Rail view state = `itinerary` / `calendar` / `hotels` / `transport` / `budget` / `notes`.
- Mobile breakpoint: ≤ 768px → single column + bottom tab bar.

## How agents should work in this repo

1. Read REQUIREMENTS.md before any non-trivial change.
2. The mockup is the source of truth for visual + behaviour; this doc is summary.
3. **Do not introduce a build step on the prototype itself.** Keep it single-file-static so it stays runnable as a design reference. The real-app rebuild lives in a different directory or repo (TBD per Phase 0).
4. If a field is added to `data.js` / `bookings-data.js` / `i18n.js`, update the entity table in REQUIREMENTS.md §4 in the same change.
5. When closing a phase, tick its DoD checkboxes in ROADMAP.md. Do not erase old checks.
6. Do not commit screenshots, `uploads/*.png|jpg`, `.playwright-mcp/`, `.claude/`, `.vscode/` — see [`.gitignore`](.gitignore).
7. Do not commit unless asked. The user controls commit timing.

## Tool-specific pointer files

| Tool | Pointer | Status |
|------|---------|--------|
| Claude Code | [`CLAUDE.md`](CLAUDE.md) | thin pointer to this file |
| OpenAI Codex / Aider / Cursor / others | `AGENTS.md` (this file) | canonical |

If you add a new tool that uses its own conventions file, add a thin pointer there instead of duplicating content.
