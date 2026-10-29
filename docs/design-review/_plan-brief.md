# Shared brief for plan-writing agents (design review follow-up)

You are writing **implementation plans only**. Do NOT edit any source code, do NOT create branches/worktrees, do NOT commit, do NOT run a dev server, do NOT read values in any `.env` file.

## Repo
- Main checkout: `/home/wadjakorn/development/travel-planner-v2` (on `main`, HEAD `6f6f7a2`). Real app in `app/` — Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Drizzle/Postgres, Auth.js, `@vis.gl/react-google-maps` (google mode) + `react-map-gl/maplibre` (open mode), vitest.
- Read first: `AGENTS.md`, then `AGENTS-INDEX.md` (file map — use it to locate code instead of blind grepping), `REQUIREMENTS.md` sections relevant to your scope. Conflict: REQUIREMENTS > AGENTS.
- Token discipline: read files with offset/limit, don't re-read.

## Source of the work
- Design review (Thai, the spec for all plans): `docs/design-review/2026-10-28-ui-ux-review.md` (section numbers below refer to it). Screenshots in `docs/design-review/shots/`.
- Already shipped (do NOT re-plan): TP-0076 mobile stop carousel + mobile day switcher (`components/map-stop-carousel.tsx`, `lib/map-carousel.ts`, `fitPadding` in `lib/map-helpers.ts`), TP-0077 POI tap → preview → add (`components/use-poi-preview.ts`, `poi` field set, nearest-stop distance `formatNear` in previews). Read their plans as format/quality exemplars:
  - `docs/superpowers/plans/2026-10-29-mobile-map-stop-carousel.md`
  - `docs/superpowers/plans/2026-10-29-map-poi-click-add.md`

## Plan format (mandatory)
- Read and follow the writing-plans skill exactly: `/home/wadjakorn/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-plans/SKILL.md` (header, Global Constraints, Review Focus, Tasks with Files/Interfaces/steps, self-review). Plans argue from the spec; cite review sections.
- Save to `docs/superpowers/plans/2026-10-29-<slug>.md` (slug given in your scope). Ticket placeholder in commit messages: `[TP-XXXX]` (tickets are created later).
- Verify every file path, symbol, and signature you reference against the actual code (cite `file:line` where it helps). A plan that names a function that doesn't exist is a failed plan.
- Tests: vitest (`cd app && pnpm vitest run <path>`); gates before each commit: `pnpm typecheck && pnpm lint && pnpm test`. Browser verification task uses `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210` (3210 is in the Google browser-key referrer allowlist) with Playwright at 390×844 and 1440×900; test trip id `79efe162-dfb2-46c2-ad46-a34695771b8b` ("Mount Fuji & Kamakura", 5 days).
- Each plan must be independently shippable as one PR. If your scope has a product decision the user hasn't made, put a **"Decision needed"** section at the top with your recommended default and build the plan on that default.
- Keep plans proportional: signatures, exact values, test names/assertions — not full function bodies.
- Every plan ends with a task that updates `AGENTS-INDEX.md` (and `REQUIREMENTS.md` if behavior/spec changes).
- Note in a short **"Touches"** line under the header which shared hot files the plan modifies (e.g. `real-map-canvas-google.tsx`, `persistent-map.tsx`, `globals.css`) — used to sequence PRs and avoid conflicts.

## Project conventions
- Comments rare, only WHY. Server components by default. Map renderers imported only via selectors (`real-map-canvas.tsx`, `pin-picker-map.tsx`). Shared design primitives in `app/src/components/ui/` (see its README) — extend, don't fork. Colors via tokens in `app/src/app/globals.css` — no new hex outside token files. Brand name "Traver Planel" is intentional — never "fix" it.
- Google Maps cost matters: cite SKU/cost impact for any new Google call (see `docs/ops/maps-cost-guardrails.md`, `docs/research/2026-10-23-google-places-billing-verification.md`).

## Final report to the orchestrator (concise)
List: plan file path(s), one-line goal each, Touches line, Decision-needed items (with your default), dependencies on other plans, and any review finding you judged not worth doing (with reason).
