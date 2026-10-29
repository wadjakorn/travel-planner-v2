# Shared brief for plan-scrutiny agents

You did NOT write these plans. Review them as an outsider, then fix them.

## Procedure (per plan, in order)
1. Invoke the `scrutinize` skill (Skill tool, skill name `scrutinize`) and follow it exactly: intent + mandatory simpler-alternative pass → trace the proposed flow against the REAL code at HEAD (`/home/wadjakorn/development/travel-planner-v2`, branch `main`) → verify each claim (paths, symbols, signatures, line refs, behavior, tests actually exercising the path, cost claims) → findings ordered blocker → major → nit, each with evidence.
2. Write the findings to `docs/superpowers/plans/<plan-basename>.scrutiny.md` (repo convention; see existing `*.scrutiny.md` files for tone). End with a verdict line: ship / fix-then-ship / rework / reject.
3. **Apply the fixes directly to the plan file** for every blocker/major you're confident about (fix-then-ship). Mark in the scrutiny file which findings were applied and which are left for the user (only product decisions or genuine uncertainty should be left).
4. If a plan should be merged into another, split, or dropped, say so with the reason; don't silently delete content.

## Rules
- Do NOT edit source code, branches, commits, or `.env` values. Only the plan files and their `.scrutiny.md` siblings.
- Context: design review `docs/design-review/2026-10-28-ui-ux-review.md` (spec), plan-format rules in `docs/design-review/_plan-brief.md`, orchestrator notes with cross-plan conflicts in `docs/design-review/_plan-notes.md` — READ the notes; resolve the cross-plan items that involve your plans (e.g. who owns a shared change, which plan goes first) and record the resolution in both scrutiny files when it affects another group's plan (append a short "Cross-plan" note to the other plan's scrutiny file if it exists, otherwise list it in your final report).
- Verify "dead code" claims yourself (grep imports/usages) before relying on them.
- Token discipline: read with offset/limit.

## Final report (concise)
Per plan: verdict, number of blockers/majors found and applied, any unresolved decision for the user, cross-plan resolutions.
