# Design roadmap — PLAYBOOK (multi-agent execution)

> Companion to [INDEX](2026-10-29-design-roadmap-INDEX.md) (decisions, plans, tickets). This file is **how** to run the work with several agents without collisions. Written 2026-10-29 for the post-compact orchestrator.
> PM project: `travel-planner-v2` (`MgX5zmszbzrL`) · tickets TP-0078 … TP-0115 · every ticket description repeats its own slice of this playbook.

---

## 0. Before the first batch (once)

1. **Docs on main — ✅ done (#91, 2026-10-29).** The plans, scrutiny files, INDEX/PLAYBOOK, design review, Thai runbook and research doc are **untracked in the main checkout only**. Worktrees from `origin/main` won't see them. Open one docs PR `docs(design): roadmap plans + review [TP-0078..0115]` adding: `docs/design-review/` (minus `_plan-brief.md`/`_scrutiny-brief.md`/`_plan-notes.md` if the user prefers — they're orchestrator scratch), `docs/superpowers/plans/2026-10-29-*`, `docs/ops/google-maps-cloud-style.md`, `docs/research/2026-10-29-map-usability-test.md`. Do **not** add `.gitignore` (user's unrelated wanderlog change) or `docs/research/wanderlog/`. Squash-merge, then `git merge --ff-only origin/main` in the main checkout.
   - If the user declines: implementers read plans by absolute path from `/home/wadjakorn/development/travel-planner-v2/docs/...` and commit their own plan + scrutiny in their first commit (TP-0076/0077 style); after each merge delete the now-tracked untracked copy in the main checkout before fast-forwarding (identical-content check first).
2. `git fetch origin` · confirm `main` == `origin/main` · `pnpm` installed · `pm project list` works.
3. **TP-0080 (map style) is a user console task** — hand the user the Thai runbook `docs/ops/google-maps-cloud-style.md`; the orchestrator only verifies afterwards (screenshots at 3210). It doesn't block any code ticket.

---

## 1. Roles

| Role | Who | Does | Never |
|---|---|---|---|
| **Orchestrator** | main session | picks the batch, creates worktrees, dispatches agents, browser-verifies (serial), opens PRs, watches CI, merges, rebases dependents, moves tickets, updates INDEX §5 status | writes feature code itself (except conflict resolution / tiny verification fixes) |
| **Implementer** | 1 `general-purpose` agent per ticket, in its own worktree | reads plan + scrutiny + ticket, TDD per plan tasks, gates, commits | run a dev server, use Playwright, push, open PRs, edit `.env`, touch files outside its worktree |
| **Reviewer** | 1 fresh agent per ticket after implementer | runs the `scrutinize` skill on `git diff origin/main...HEAD` against the plan; fixes blockers/majors in the same worktree (commits) or reports | rubber-stamp; scope-creep beyond the plan |

Why browser verification is the orchestrator's: Google Maps only works on **port 3210** (browser-key referrer allowlist) and the Playwright MCP browser is **one shared browser** — two agents would fight over both. So it's strictly serial.

---

## 2. Lanes and batches

Hot files (edited by many plans): `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx`, `persistent-map.tsx`, `map-renderer-props.ts`, `globals.css`, `lib/map-helpers.ts`, `lib/day-augment.ts`, `itinerary-list.module.css`, `sortable-place-item.tsx`, `bookings-view.tsx`, `skeletons.tsx`, `trip/[id]/page.tsx`, `trip/[id]/layout.tsx`, `messages/*.json`.
Rule: **tickets in the same lane run one at a time**; different lanes run in parallel. Max ~4 implementers at once.

| Lane | Order (serial within lane) |
|---|---|
| **M — map canvas** | TP-0084 pins → TP-0092 route¹ → TP-0086 degraded → TP-0095 camera → TP-0096 hover → TP-0094 a11y-batch² → TP-0099 day-bar → TP-0100 search-distance → TP-0105 i18n P2b → TP-0101 telemetry ⏸ → TP-0110 overview (deferred) |
| **L — itinerary list** | TP-0079 route bug-fix → *(wait TP-0092)* → TP-0093 rows → *(a11y TP-0094 in lane M)* |
| **D — design system** | TP-0078 delete dead tree → TP-0083 foundations³ → TP-0097 modal (rest) → TP-0098 hex codemod⁴ |
| **B — bookings strings** | TP-0081 bookings-layout → TP-0085 copy/glossary → TP-0091 header Undo |
| **F — free** (any time, low overlap) | TP-0082 budget · TP-0087 calendar · TP-0089 nav · TP-0090 pin-picker (after TP-0078) · TP-0088 home ⏸ (after TP-0081) |
| **I — i18n** (last) | TP-0102 P0 (after TP-0085 + TP-0091) → TP-0103 P1 → TP-0104 P2a → TP-0106 P3 → TP-0107 P4 → TP-0108 P5 → *(P2b in lane M)* → TP-0109 P6 |

¹ also needs TP-0079 merged. ² also needs TP-0093 + TP-0078 merged. ³ land after TP-0084 so foundations drops its map-font edits. ⁴ needs TP-0093 + TP-0083 merged.
⏸ = decision pending (D14/D15) — **ask the user before dispatching**.

**Suggested batches** (start a batch when its blockers are merged; within a batch dispatch all at once):

| Batch | Parallel tickets | Notes |
|---|---|---|
| 1 | TP-0078 · TP-0079 · TP-0081 · TP-0082 · TP-0087 · TP-0089 | all Wave 0/F; merge order: 0078 → 0079 → 0081 → 0082 (migration 0022) → 0087 → 0089 |
| 2 | TP-0084 · TP-0090 · TP-0085 | 0085 after 0081 merged |
| 3 | TP-0092 · TP-0083 · TP-0091 | 0083 after 0084; 0091 after 0085 |
| 4 | TP-0093 · TP-0086 · TP-0097 | 0093 after 0092; 0086 after 0092 (lane M) |
| 5 | TP-0095 · TP-0098 | 0098 after 0093 + 0083 |
| 6 | TP-0096 | |
| 7 | TP-0094 | after 0093 |
| 8 | TP-0099 · TP-0102 | |
| 9 | TP-0100 · TP-0103 | |
| 10+ | i18n P2a/P3/P4/P5 serial · TP-0105 (lane M end) · TP-0109 last | ⏸ TP-0088 / TP-0101 when the user answers |

Follow-ups TP-0111…TP-0115 have **no plan** — each needs a short plan + scrutiny first (user rule: detailed plan → scrutiny → then execute) before an implementer is dispatched.

---

## 3. Per-ticket loop (orchestrator)

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant I as Implementer
  participant R as Reviewer
  O->>O: blockers merged? git fetch; worktree from origin/main; pnpm install; cp app/.env
  O->>O: pm move TP → doing
  O->>I: dispatch (prompt §4)
  I-->>O: report: commits, gates, deviations
  O->>R: dispatch (prompt §5)
  R-->>O: verdict + fix commits
  O->>O: rm -rf app/.next; dev on 3210; Playwright checklist (plan's final task); clean up DB test data
  O->>O: push; gh pr create; link_pull_request; gh pr checks --watch
  O->>O: gh pr merge --squash; delete remote branch; pm move → completed
  O->>O: rebase in-flight branches of the same lane; update INDEX §5
```

Commands (per ticket `TP-00NN`, slug from the plan):
```bash
cd /home/wadjakorn/development/travel-planner-v2 && git fetch -q origin
git worktree add ../travel-planner-v2-tp00NN -b feat/tp-00NN-<slug> origin/main
cd ../travel-planner-v2-tp00NN/app && pnpm install --frozen-lockfile && cp ../../travel-planner-v2/app/.env .env   # never read its values
pm --json task move --id TP-00NN --status doing        # backlog tickets: move to todo first (one legal step at a time)
```
Browser verification (orchestrator only, one at a time):
```bash
rm -rf app/.next   # stale Turbopack CSS bit TP-0076
MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210   # run_in_background; stop it with a separate command (never pkill -f inside a compound command — it matches the shell)
```
Test trip `79efe162-dfb2-46c2-ad46-a34695771b8b` ("Mount Fuji & Kamakura"), viewports 390×844 and 1440×900. Anything added to the trip during verification must be removed again. Headless Chrome has no WebGL → Google renders raster, MapLibre renders blank: MapLibre-only checks can't be done visually, say so in the PR.

PR conventions (match #88–#90): title `type(scope): … [TP-00NN]`; body sections **Problem / Change / Verification**, plan + scrutiny paths, ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; squash-merge; delete remote branch; then `git worktree remove` + `git branch -D` locally; fast-forward the main checkout.

Rebase rule: after any merge, every in-flight branch that touches the same hot files rebases on `origin/main`; conflicts are almost always "both sides added a prop/token/line" → keep both; then re-run gates. Cross-plan ownership rules are in INDEX §2 and in each `.scrutiny.md` "Cross-plan" section — the later-landing PR adapts.

---

### Lessons from Batch 1 (2026-10-30)

- **`main` requires up-to-date branches.** `gh pr merge` refuses a PR that is `BEHIND`. Merge strictly one at a time: rebase onto `origin/main` → re-run gates → `git push --force-with-lease` → wait for CI → merge. Check `gh pr view N --json state` says `MERGED` **before** deleting the remote branch — deleting it first closes the PR (happened to #93; recovered with `gh pr reopen`).
- **Rebase before starting the dev server, never in the same command.** A rebase that stops on a conflict leaves the tree half-applied and the server serves it. Run `git rebase origin/main`, confirm `Successfully rebased` and an empty `git diff --name-only --diff-filter=U`, then start the server. Conflicts so far were only `AGENTS-INDEX.md` / `REQUIREMENTS.md` rows — keep both sides.
- **Migrations:** the orchestrator applies a ticket's migration to the dev DB from that ticket's worktree with `pnpm exec drizzle-kit migrate` before the browser check (data-only + idempotent ones only; anything with DDL → ask the user first).
- **Undoing verification writes:** restore soft-deleted rows with a throwaway script run as `node --env-file=.env script.mjs` from `app/` (uses the `postgres` package; never print the env). Delete the script afterwards.
- **Reviewers find real bugs; so does the browser.** Batch 1: 3 of 6 reviews were fix-then-ship (focus-leave on the bookings chooser, days past the trip end hidden in Calendar, a budget PATCH that wiped `travelers`); the browser pass caught a missing space ("Set a budgetto") and an accessible name read as "8Bookings". Keep both steps.

## 4. Implementer prompt (template)

```
You implement ticket TP-00NN in an existing git worktree. Work ONLY inside /home/wadjakorn/development/travel-planner-v2-tp00NN (branch feat/tp-00NN-<slug>, based on origin/main with all blockers merged).
Read, in order:
1. `pm --json task get --id TP-00NN` (description = scope, decisions, dependencies, acceptance).
2. The plan docs/superpowers/plans/2026-10-29-<slug>.md — including the "Ticket(s)" and "✅ Decisions answered" header blocks, which override the body.
3. Its scrutiny file 2026-10-29-<slug>.scrutiny.md — especially "Cross-plan" notes; check which referenced plans are already merged (git log origin/main --oneline | grep TP-) and apply the "second-lander" adjustments.
4. AGENTS.md + the relevant AGENTS-INDEX.md sections.
Rules:
- Implement only the tasks in scope for THIS ticket (e.g. "Task 1 only"). Skip the plan's browser-verification task (the orchestrator does it) but DO its docs tasks (AGENTS-INDEX / REQUIREMENTS / ops docs).
- TDD where the plan gives tests. Before each commit: cd app && pnpm typecheck && pnpm lint && pnpm test (report only tails). Lint warnings already on main (2 in text-search.test.ts) are fine.
- Commit per plan task with the plan's message, using [TP-00NN] (never TP-XXXX). End every commit message with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Do NOT run a dev server, use Playwright, push, open PRs, read .env values, or touch other checkouts.
- If the plan is wrong about the code, adapt minimally and list the deviation.
Final report: commits (hash+subject), files changed, gate results, deviations + why, what the browser verifier must check closely.
```

## 5. Reviewer prompt (template)

```
Review ticket TP-00NN in worktree /home/wadjakorn/development/travel-planner-v2-tp00NN as an outsider. Invoke the `scrutinize` skill on `git diff origin/main...HEAD` against the plan docs/superpowers/plans/2026-10-29-<slug>.md (+ its .scrutiny.md and the ticket description). Trace real code paths, not just the diff. Fix every blocker/major you're confident about directly in the worktree (gates must pass; commit with [TP-00NN] + the Co-Authored-By line). Do not push, run dev servers, or touch other checkouts. Report: verdict, findings (applied / left for the orchestrator), anything the browser check must cover.
```

---

## 6. Status tracking

- PM board is the source of truth for status (`todo → doing → completed`). Move `completed` only after the PR is merged and the prod deploy for the merge commit is green (`gh api repos/wadjakorn/travel-planner-v2/commits/<sha>/statuses`).
- After each merge, tick the ticket in INDEX §5 (add `✅ #PR`).
- If a plan turns out wrong mid-flight: stop that ticket, update the plan + scrutiny, tell the user if it changes a decision.
