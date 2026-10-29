# Legacy Palette → Tokens Codemod (phase 1) Implementation Plan

> **Ticket:** TP-0098

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D8 — Apple blue and the optimize purple become brand teal** (default kept).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy Apple palette (raw hex/rgb) from the three biggest CSS modules and from the `days-accordion.tsx` inline styles. Replace Tailwind default-palette classes with semantic tokens in the non-map, non-calendar files. Add a vitest ratchet so the raw-color count can only go down.

**Architecture:** This is a mechanical mapping driven by one hex→token table (below). It adds a few semantic tokens to `globals.css` for families the current token set doesn't cover: the warning chip, the note chip, the rating star, and the travel-mode icons. Each migrated module drops its `[data-theme="dark"]` override blocks, because semantic tokens already swap per theme. Guard: `app/src/components/raw-color-guard.test.ts`.
- *Strict* files must contain zero raw colors.
- *Ratchet* covers every other source file. Its per-file count must **equal** the committed baseline (`raw-color-baseline.json`): above fails ("new raw color"), below also fails ("baseline stale, tighten it"), so a file that dropped can't silently climb back to its old allowance. `UPDATE_RAW_COLOR_BASELINE=1` regenerates the baseline.

**Tech Stack:** CSS modules, Tailwind v4 utilities, vitest (node env).

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §5 A5, §6 (hex 389 / rgb 94 / Tailwind palette 88; "(3) codemod hex ใน 3 module"), §10 Phase 3 "Hex codemod 3 module", §11 Q6 (dark mode). `REQUIREMENTS.md` §15 says: "CSS variables only — no hardcoded hex outside token files."

**Depends on:** `2026-10-29-ds-foundations.md` (`--border-strong`, `--dur-*`, the shared test helpers `app/test/css-tokens.ts` / `app/test/src-files.ts`, and the `57px` → `--header-h` change in `itinerary-sidebar.module.css:91` and `trip-aside-class.ts`). Rebase onto it. **Land after `2026-10-29-itinerary-rows.md`**: rows Task 3 restructures `itinerary-list.module.css:163-276` (`.placeThumb`, active wrap, deletes `.kindChip`) and rows Task 6 rebuilds the day collapse bar in `days-accordion.tsx`. A colour codemod re-applies cleanly on top of a restructure (the guard lists what's left); the reverse is a hand-merge of ~100 changed lines. This plan coordinates with `2026-10-29-map-pin-redesign.md` Task 1 on the `--map-route-*` tokens (see Task 1).

**Touches:** `globals.css` (`:root` and dark-block token additions only), `itinerary-list.module.css`, `itinerary-sidebar.module.css`, `place-search-picker.module.css`, `days-accordion.tsx`, `spinner.tsx`, and the palette files `app/invite/[token]/page.tsx`, `sortable-place-item.tsx`, `notes-view.tsx`, `place-note-launcher.tsx`, `trip-aside-class.ts`, `trip-delete-button.tsx`, `saved-ago.tsx`, `app/(home)/page.tsx`.

Same-line conflicts to expect:
- The a11y-batch plan adds `tp-hit` to the same `className` strings in `sortable-place-item.tsx:190,241,300`, `place-note-launcher.tsx:25`, and `trip-delete-button.tsx:39`. It also edits `.searchRow` in `place-search-picker.module.css:46-53`.
- The map-hover-sync plan edits `itinerary-list.module.css`.

- The map-search-distance plan adds a dark override "next to `:304`" in `place-search-picker.module.css`; Task 4 here deletes every dark rule in that file. If this lands first, search-distance's `.itemNear` uses `var(--muted)` and needs no dark rule.

The a11y-batch, hover-sync and search-distance overlaps are trivial rebases; itinerary-rows is not (see Depends on). **Excluded on purpose** (they stay in the ratchet baseline):
- `persistent-map.tsx` and `map-stop-carousel.tsx`: owned by the map plans.
- `calendar-view.tsx`: its amber "trip days" highlight needs a design call, and CAL-01 restyles it.
- `trip-settings-form.tsx` and `trip-create-form.tsx`: rewritten by `2026-10-29-ds-modal-consolidation.md` Task 5.
- `pin-card.tsx`, `map-preview-marker.tsx`, `place-preview-card.tsx`, `lib/map-helpers.ts`: map-pin-redesign plan.

## Decision needed

1. **Legacy accents collapse into the brand.**
   - Apple blue `#0071e3` (active chips, links, spinners) and the optimize strip's purple (`#6b3fd9`, gradient `#f5f1ff→#eaf3ff`) become `--brand` teal.
   - Black primary actions (`#1d1d1f` fill, e.g. `.actionBtnPrimary`) **stay neutral** as `--foreground` fill on `--background` text. Turning them teal would change the visual hierarchy, and that is a redesign, not a codemod.

   **Default: as stated.** Alternative: fully pixel-preserving tokens such as a new `--accent-blue`. That would keep two accent colors alive, against §6.
2. **Delete the migrated modules' `[data-theme="dark"]` blocks** instead of re-tokenising them. **Default: delete.** Semantic tokens swap on their own, and dark mode is unreachable today:
   - `layout.tsx:40-47` resolves `system` → light, and the Appearance picker is a "coming soon" stub (`app/settings/page.tsx:92`).
   - Roughly 310 raw colors remain outside this PR (≈260 once modal-consolidation deletes the dead hotels-view subtree), so turning dark on now would show a mixed palette.
   - Map pins and popups are deliberately light-only (review §11 Q6; map-pin-redesign Decision 1).

   Enabling dark mode is out of scope.
3. **Itinerary travel-mode icons use the map route colors.** `--map-route-drive #1d4ed8`, `--map-route-walk #15803d`, `--map-route-transit #7c3aed`, as in the map-pin-redesign plan. Today they are `#2563eb` / `#16a34a` / `#7c3aed`, so list and map would agree. **Default: yes.**

## Global Constraints

- **Strict files** must contain no `#hex` and no `rgb(`/`rgba(` on any line. The one escape hatch is a line carrying `/* hex-ok: <reason> */`, allowed only for third-party brand marks. The single current use is the Google Maps glyph `#ea4335` (`itinerary-sidebar.module.css:231`).
- Named colors `white`/`black` are allowed only over photos or scrims (e.g. `.cover` text). Elsewhere use tokens.
- Tints use `color-mix(in srgb, var(--token) N%, transparent)`, keeping the original alpha as N.
- Pills: `border-radius: 980px` → `var(--radius-full)` in the files touched here.
- Dark mode stays pinned to light. Don't touch `layout.tsx` / `theme-watcher.tsx`.
- New tokens go only in `globals.css`, in `:root` plus the dark block. No hex anywhere else.

### Mapping table (light values; role decides when one hex has two)

| Legacy | Role | Token |
|---|---|---|
| `#1d1d1f`, `#424245` | text | `var(--foreground)` |
| `#1d1d1f` | primary-action fill / border | `var(--foreground)` (+ text `var(--background)`) |
| `#000` | hover of that fill | `color-mix(in srgb, var(--foreground) 85%, black)` |
| `#86868b`, `#6e6e73`, `#636366`, `#c7c7cc`, `#d2d2d7` | secondary text, icon, separator glyph | `var(--muted)` (fixes A5: 3.62 / 1.68 → 5.05:1) |
| `#d2d2d7` | field / search-row border | `var(--input)` |
| `#c7c7cc`, `#d2d2d7` | decorative border, dashed connector | `var(--border-strong)` |
| `#e5e5ea`, `#e8e8ed`, `#f2f2f7` | divider / card border | `var(--border)` |
| `#f5f5f7`, `#f2f2f7` | fill / hover fill | `var(--surface-2)` |
| `#f9f9fb`, `#fafafc` | near-white rest fill next to a `#f2f2f7` hover/active state | `color-mix(in srgb, var(--surface-2) 50%, var(--surface))`; use `var(--surface-2)` when no sibling state uses it |
| `#fff`, `#ffffff`, `white` | card / input background | `var(--surface)` |
| `#fff`, `#ffffff` | text on foreground/brand fill | `var(--background)` / `var(--brand-foreground)` |
| `#0071e3`, `#0f766e`, `#6b3fd9` | accent, link, active, focus shadow | `var(--brand)` |
| `rgba(0,113,227,a)`, `rgba(15,118,110,a)`, `rgba(45,212,191,a)` | accent tint | `color-mix(in srgb, var(--brand) a%, transparent)` |
| `#f5f1ff → #eaf3ff` gradient | optimize strip | `linear-gradient(135deg, var(--brand-50), var(--surface-2))` |
| `#c53030` / `#fed7d7` / `#fff5f5` | error text / border / fill | `var(--danger)` / `color-mix(… var(--danger) 30%, transparent)` / `color-mix(in srgb, var(--danger) 6%, var(--surface))` |
| `rgba(220,38,38,a)` | danger tint | `color-mix(… var(--danger) a%, transparent)` |
| `#b07000`, `rgba(180,83,9,a)` | warning text / tint | `var(--warning)` (4.07 → 5.02:1) / `color-mix(… var(--warning) a%, transparent)` |
| `#fff7e6` / `#8a5a00` / `#ffe1a8`, `#ffd180` / `#ffefcc` | unverified + route-unavailable chip | `var(--warning-soft)` / `var(--warning-strong)` / `var(--warning-border)` / hover `color-mix(in srgb, var(--warning-border) 35%, var(--warning-soft))` |
| `#fffbea` / `#6b5400`, `#b8860b` / `#f6e7a8` | note chip bg / text + icon / border | `var(--note-soft)` / `var(--note-fg)` / `var(--note-border)` |
| `#f5a623` | rating star | `var(--rating)` |
| `#2563eb` / `#16a34a` / `#7c3aed` | segment mode icon drive / walk / transit | `var(--map-route-drive)` / `-walk` / `-transit` |
| `#ea4335` | Google Maps glyph | keep + `/* hex-ok: Google brand */` |
| `rgba(0,0,0,.04–.15)` box-shadows | elevation | `var(--shadow-sm)` (≤ 3px blur) / `var(--shadow-lg)` (dropdown, 32px blur) |
| `rgba(255,255,255,.6–.85)` | busy veil / frosted button | `color-mix(in srgb, var(--surface) 60–85%, transparent)` |
| `rgba(255,255,255,.3)` / `rgba(29,29,31,.2)` | spinner track on dark / light | `color-mix(… var(--brand-foreground) 30%, transparent)` / `color-mix(… var(--foreground) 20%, transparent)` |
| `#2c2c2e #38383a #1c1c1e #98989d #3a3a3c #48484a #0a84ff #d4a017 #d4b44a #f5c518 #e0b020 #aeaeb2 #a78bfa #2e1f4a #2a1f40 #1a2a3a rgba(255,195,0,a) rgba(255,251,234,a) rgba(246,231,168,a) rgba(44,44,46,a) rgba(245,245,247,a)` | dark-only overrides | deleted with the dark blocks (Decision 2) |

Tailwind palette → token utilities:

| Legacy class | Token class |
|---|---|
| `text-zinc-500`, `text-zinc-600` | `text-muted` |
| `text-zinc-900`, `text-zinc-50` | `text-foreground` |
| `bg-zinc-50/100/200`, `hover:bg-zinc-100` | `bg-surface-2` / `hover:bg-surface-2` |
| `bg-zinc-900 text-white hover:bg-zinc-800` | `bg-foreground text-background hover:opacity-90` |
| `bg-white` (card) | `bg-surface` |
| `border-zinc-200` | `border-border` |
| `text-red-600`, `hover:text-red-600` | `text-danger`, `hover:text-danger` |
| `bg-red-50`, `hover:bg-red-50` | `bg-danger/10`, `hover:bg-danger/10` |
| `bg-emerald-500 border-emerald-500 text-white` | `bg-success border-success text-success-foreground` |
| any `dark:*-{zinc,red,amber,emerald}-*` | delete (token swaps) |

---

## Review Focus

1. **The black→foreground and blue→brand swaps lose a state distinction.** For example, `.placeActive` and the hover state could become the same `--surface-2`. Task 2 keeps active vs hover distinguishable (active gets a `--border-strong` border or a `--brand` tint), and Task 7 screenshots hover and active rows side by side.
2. **Dark block deleted, but it carried a non-color declaration.** Only delete a dark rule whose every declaration is a color now expressed by a swapping token. Keep any other declaration. Each per-file task's guard run plus a diff read covers this.
3. **The days-accordion hover moved from JS (`onMouseEnter`) to CSS.** It must still work on mouse and must not stick on touch. Tailwind v4 `hover:` is already gated by `@media (hover: hover)` (`globals.css:300-304`). Task 7 checks it at 390 (tap) and 1440 (hover).
4. **The warning chip and the note chip now come from two token families.** They must still look different from each other: amber versus pale-yellow sticky note. Task 1 pins their contrast, and Task 7 screenshots a day that has both.
5. **The ratchet baseline blocks unrelated PRs.** That happens when another plan adds a raw color, and (because the baseline is exact) also when one removes colors or deletes a file. The failure message must name the file, the count, the allowance, and the regenerate command, so the fix is obvious and a reviewer sees the diff in `raw-color-baseline.json`. Token mirrors in `lib/map-helpers.ts` use `hex-ok` so map plans don't trip it. Task 1 asserts the message text.

---

### Task 1: Semantic tokens + raw-color guard

**Files:**
- Modify: `app/src/app/globals.css`. Add to `:root` (light):
  - `--warning-soft: #fff7e6; --warning-strong: #8a5a00; --warning-border: #ffd180;`
  - `--note-soft: #fffbea; --note-fg: #6b5400; --note-border: #f6e7a8;`
  - `--rating: #f5a623;`
  - **Only if absent** (map-pin-redesign Task 1 defines the same values): `--map-route-walk: #15803d; --map-route-drive: #1d4ed8; --map-route-transit: #7c3aed;`

  Add to `[data-theme="dark"]` (values lifted from the blocks this plan deletes): `--warning-soft: rgb(255 195 0 / 0.08); --warning-strong: #f5c518; --warning-border: rgb(255 195 0 / 0.25); --note-soft: rgb(255 251 234 / 0.08); --note-fg: #d4b44a; --note-border: rgb(246 231 168 / 0.2);`
- Create: `app/src/components/raw-color-guard.test.ts`, `app/src/components/raw-color-baseline.json`

**Interfaces:**
- Consumes: `rootTokens`, `contrast` (`app/test/css-tokens.ts`), `srcFiles` (`app/test/src-files.ts`) from foundations Task 1.
- Produces (test-local):
  - `STRICT: string[]`: paths relative to `app/src`. Starts `[]`, and each later task appends.
  - `countRaw(text: string): number`: matches `/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b|rgba?\(/g`, skipping lines that contain `hex-ok`.
  - `countPalette(text: string): number`: matches `/\b(?:[\w-]+:)*(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|placeholder|decoration|accent|caret)-(?:zinc|gray|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b/g`.
  - Scan set: `srcFiles(['.css', '.tsx', '.ts'])` from the shared `app/test/src-files.ts` (foundations Task 1; excludes `**/*.test.ts`), minus `EXEMPT`: `app/globals.css` (the token file), `**/opengraph-image.tsx` (Satori renders outside the DOM and can't read CSS vars), `lib/seed/**` and `lib/seed-trip.ts` (seed data colors stored in the DB, ~30 hits).
  - TS mirrors of CSS tokens that a renderer needs as raw values (`lib/map-helpers.ts` `MODE_COLOR`/`KIND_COLOR`, and the map plans' `ROUTE_*_COLOR`) carry `// hex-ok: mirrors --map-… (parity-tested in map-tokens.test.ts)` on each line, so changing a mirrored value never touches the baseline.
- Baseline JSON shape: `{ "raw": Record<string, number>, "palette": Record<string, number> }` with sorted keys and zero counts omitted.

- [ ] **Step 1: Write the tests**

```ts
it('new token families are readable', () => {
  const t = rootTokens(); // shared helper: app/test/css-tokens.ts (foundations Task 1)
  expect(contrast(t['--warning-strong'], t['--warning-soft'])).toBeGreaterThanOrEqual(4.5); // 5.56
  expect(contrast(t['--note-fg'], t['--note-soft'])).toBeGreaterThanOrEqual(4.5);           // 7.00
  expect(contrast(t['--warning'], t['--warning-soft'])).toBeGreaterThanOrEqual(4.5);        // 4.71
  expect(t['--warning-soft']).not.toBe(t['--note-soft']);
});
it('strict files have no raw colors', () => {
  expect(STRICT.map((p) => [p, countRaw(read(p))]).filter(([, n]) => n)).toEqual([]);
});
it('raw colors and palette classes match the baseline exactly', () => {
  if (process.env.UPDATE_RAW_COLOR_BASELINE) return writeBaseline(scan());
  const drift = baselineDrift(scan(), readBaseline()); // [{ kind, file, count, allowed }], count !== allowed
  expect(drift, `${formatDrift(drift)}\nMore than allowed: remove the colors. Fewer (or file deleted): the baseline is stale. Either way, if intended run: UPDATE_RAW_COLOR_BASELINE=1 pnpm vitest run src/components/raw-color-guard.test.ts`).toEqual([]);
});
it('a file not in the baseline is held to zero', () => {
  expect(baselineDrift({ raw: { 'components/new.module.css': 1 }, palette: {} }, { raw: {}, palette: {} }))
    .toEqual([{ kind: 'raw', file: 'components/new.module.css', count: 1, allowed: 0 }]);
});
it('a drop below the baseline is reported as stale', () => {
  expect(baselineDrift({ raw: {}, palette: {} }, { raw: { 'components/gone.tsx': 3 }, palette: {} }))
    .toEqual([{ kind: 'raw', file: 'components/gone.tsx', count: 0, allowed: 3 }]);
});
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/components/raw-color-guard.test.ts` → FAIL (tokens missing; baseline file missing).
- [ ] **Step 3:** Add the tokens. Implement the helpers. Generate the baseline with `UPDATE_RAW_COLOR_BASELINE=1 pnpm vitest run src/components/raw-color-guard.test.ts`.
- [ ] **Step 4:** Run without the env var → PASS. Gates: `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [ ] **Step 5: Commit** `test(ds): raw-color + palette ratchet guard, warning/note/rating tokens [TP-0098]`

### Task 2: `itinerary-list.module.css` (98 raw → 0)

**Files:**
- Modify: `app/src/components/itinerary-list.module.css`. At HEAD it has 88 hex + 10 rgb/rgba (25 dark rules). Re-count after itinerary-rows lands.
- Modify: `raw-color-guard.test.ts` (`STRICT.push('components/itinerary-list.module.css')`), `raw-color-baseline.json` (regenerate)

- [ ] **Step 1:** Add the file to `STRICT`. Run the guard → FAIL with `count > 0`.
- [ ] **Step 2:** Apply the mapping table. Specific cases:
  - `.segHint` → `var(--warning)`.
  - `.segSep` → `var(--muted)`.
  - `.segMode_{drive,walk,transit} .segIcon` → `--map-route-*`.
  - `.chipNote*` → `--note-*`.
  - `.chipUnverified` and `.segmentUnavailable` → `--warning-*`.
  - `.rating svg` → `--rating`.
  - `.actionBtnPrimary` → foreground fill.
  - `.place`/`.pin` `background: white` → `var(--surface)`.
  - `.placeActive` keeps a visible difference from `.place:hover` (Review Focus 1).
  - `980px` → `var(--radius-full)`.

  Then delete every `:global([data-theme="dark"]) …` rule (lines `61`, `332-380`, `393`, `409`, `434`, `472`, `494`, `515`, `569-578`, `629-645`, and any others the guard still reports).
- [ ] **Step 3:** Guard → PASS. Regenerate the baseline (this entry drops out). Run the gates.
- [ ] **Step 4: Commit** `refactor(ds): itinerary-list on semantic tokens [TP-0098]`

### Task 3: `itinerary-sidebar.module.css` (61 raw → 0, except one `hex-ok`)

**Files:** `itinerary-sidebar.module.css`, guard `STRICT`, baseline.

- [ ] **Step 1:** Add to `STRICT` → FAIL.
- [ ] **Step 2:** Map the colors:
  - `.optStrip` → brand gradient, `.optIcon` → `var(--brand)` on `var(--surface)`.
  - `.dayChips` (`:85-96`) → `var(--surface)` bg, `var(--border)` bottom.
  - `.openMapsBtn svg` `#ea4335` → keep, with `/* hex-ok: Google brand */`.
  - The frosted cover button `rgba(255,255,255,.85)` (`:31`) → `color-mix(in srgb, var(--surface) 85%, transparent)`.
  - `color: white` over the cover photo stays.

  Delete the dark rules (`:306-400`).
- [ ] **Step 3:** Guard → PASS, regenerate the baseline, run the gates.
- [ ] **Step 4: Commit** `refactor(ds): itinerary-sidebar on semantic tokens [TP-0098]`

### Task 4: `place-search-picker.module.css` (61 raw → 0)

**Files:** `place-search-picker.module.css` (shared with the dead `hotel-search-picker.tsx`; no special handling), guard `STRICT`, baseline.

- [ ] **Step 1:** Add to `STRICT` → FAIL.
- [ ] **Step 2:** Map the colors:
  - `.searchRow` dashed border (`:51`) → `var(--input)`. If the a11y-batch plan landed its `:focus-within` ring here first, keep that ring.
  - Dropdown `box-shadow` (`:38`) → `var(--shadow-lg)`.
  - Error (`#c53030/#fed7d7/#fff5f5`) → danger.
  - `.itemPreviewed` (`:218`) → brand tint 8%.
  - Spinner tracks (`:180,187`) per the table.

  Delete the dark rules (`:259-344`).
- [ ] **Step 3:** Guard → PASS, regenerate the baseline, run the gates.
- [ ] **Step 4: Commit** `refactor(ds): place-search-picker on semantic tokens [TP-0098]`

### Task 5: `days-accordion.tsx` inline styles → token utilities; `Spinner` defaults

No new CSS module. `days-accordion.tsx` is a TSX file with inline styles, and Tailwind v4 already wraps `hover:` in `@media (hover: hover)` (see the comment at `globals.css:300-304`), so token utilities give the touch-safe hover for free. This is also the approach itinerary-rows Task 6 uses for the same collapse bar, so the two rebase onto each other trivially.

**Files:**
- Modify: `app/src/components/days-accordion.tsx:140-215,294-307`. Replace the `style={{…}}` objects with token utilities:
  - collapsed row wrapper: `px-5 py-1.5`
  - collapsed card button (`:144-156`): `block w-full cursor-pointer rounded-lg border border-border bg-surface-2 px-4 py-3 text-left text-sm font-semibold text-foreground` (`rounded-lg` = `--radius-lg` 12px)
  - date span: `ml-2 text-xs font-medium text-muted`
  - inline spinner wrapper: `ml-2 inline-block align-middle`
  - open day wrapper: `border-t border-border`
  - **collapse bar** (`:192-202`). If itinerary-rows Task 6 has landed, it already carries token classes: keep its markup and only check no raw color is left. Otherwise: `flex h-8 w-full cursor-pointer items-center justify-center border-b border-border bg-surface-2/50 text-muted transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-foreground`. Don't use `--accent` (same value as `--surface-2`).
  - busy veil (`:294-302`): `absolute inset-0 z-20 flex items-center justify-center bg-surface/60 backdrop-blur-[1px]`
  - Delete the `onMouseEnter`/`onMouseLeave` handlers (`:205-212`).
  - The spinners become `<Spinner … color="var(--brand)" trackColor="color-mix(in srgb, var(--brand) 20%, transparent)" />` (three call sites: `:173,215,307`).
- Modify: `app/src/components/spinner.tsx:18-19`. Defaults become `color ?? 'var(--foreground)'` and `trackColor ?? 'color-mix(in srgb, var(--foreground) 15%, transparent)'`.
- Modify: guard `STRICT` (`components/days-accordion.tsx`, `components/spinner.tsx`), baseline.

- [ ] **Step 1:** Add the two files to `STRICT` → FAIL (days-accordion 15 hex + 4 rgba, spinner 1 hex + 1 rgba).
- [ ] **Step 2:** Implement the changes listed in Files.
- [ ] **Step 3:** Guard → PASS, regenerate the baseline, run the gates.
- [ ] **Step 4: Commit** `refactor(ds): days-accordion on token utilities; Spinner token defaults [TP-0098]`

### Task 6: Tailwind default-palette classes → token utilities

**Files:** apply the class table to the following (named-hue counts at HEAD):
- `app/src/app/invite/[token]/page.tsx` (22; includes `:131,163` buttons and `:175` card)
- `sortable-place-item.tsx` (15; `:191,202,242,301,311`)
- `notes-view.tsx` (10; `:194,232,243,265`)
- `place-note-launcher.tsx` (3; `:25`)
- `trip-aside-class.ts` (2; `border-zinc-200 dark:border-zinc-800` → `border-border`)
- `trip-delete-button.tsx` (1; `:39` `text-zinc-600` → `text-muted`; `bg-white/85` over the cover photo stays)
- `saved-ago.tsx` (1; `:38`)
- `app/(home)/page.tsx` (1; `:33`)

Also modify the guard: add `STRICT_PALETTE: string[]` (these 8 files), asserted with `countPalette(...) === 0`, and regenerate the baseline.

- [ ] **Step 1:** Add `STRICT_PALETTE` and its test → FAIL (55 hits).
- [ ] **Step 2:** Replace per the table. Drop every `dark:` partner class.
- [ ] **Step 3:** Guard → PASS, regenerate the baseline, run the gates.
- [ ] **Step 4: Commit** `refactor(ds): Tailwind palette classes → semantic tokens [TP-0098]`

### Task 7: Browser verification

- [ ] Run `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Use Playwright on trip `79efe162-dfb2-46c2-ad46-a34695771b8b` at 390×844 and 1440×900.
- [ ] **Itinerary at 1440:**
  - Screenshot a row in each state: default, hover, active.
  - Screenshot a note chip, a rating, the three segment-mode icons, a "Route unavailable" chip, and an "Unverified" chip.
  - Screenshot the optimize strip and the day chips (sticky under the header).
  - Compare against `docs/design-review/shots/` pre-change shots. Expected differences: blue→teal accents and darker muted text. Nothing else.
- [ ] **Days accordion:** collapse a day. At 1440, hovering the collapse bar changes its fill. At 390, a tap doesn't leave a stuck hover. A move puts up the busy veil with a teal spinner.
- [ ] **Place search (inline + `/day/[dayId]/place/new`):** dashed search row, dropdown shadow, previewed item tint, error state (search `zzzzqqq` to empty).
- [ ] **Palette files:** `/invite/<bad-token>` (error copy is muted, the button reads as foreground fill), the notes checklist done state is green, the itinerary item edit/remove hover tints work, and "Saved Xm ago" is muted.
- [ ] Run `document.querySelectorAll('[style*="#"]').length` on the itinerary page. Nothing from days-accordion should show up.

### Task 8: Docs

- `AGENTS-INDEX.md`:
  - The Primitives table `:284` `spinner.tsx` gains "token defaults".
  - Add a row for `components/raw-color-guard.test.ts` + `raw-color-baseline.json`: "ratchet: raw hex/rgb and Tailwind palette classes may only decrease; `UPDATE_RAW_COLOR_BASELINE=1` regenerates".
- `app/src/components/ui/README.md` → Tokens:
  - Add rows for `--warning-soft/strong/border`, `--note-*`, `--rating`, `--map-route-*`.
  - Under the **Rule**, add the guard, the `hex-ok` escape hatch, and the regenerate command.
  - Under **Dark mode**, add a paragraph: "pinned to light until the ratchet baseline's `raw` total is near zero; see `2026-10-29-ds-hex-codemod.md` Decision 2".
- `REQUIREMENTS.md` §15:
  - Append: "Enforced by `raw-color-guard.test.ts` (ratchet)."
  - Note the current state: "`system` resolves to light until the Appearance picker ships."
- [ ] Commit `docs(ds): token families, raw-color ratchet, dark-mode status [TP-0098]`

---

## Self-review

- **Spec coverage:**
  - A5 (`#86868b`, `#c7c7cc`, `#d4a017`) → Task 2 (muted; `#d4a017` was dark-only, so it is deleted).
  - §6 "codemod hex ใน 3 module" → Tasks 2–4.
  - days-accordion → Task 5.
  - Tailwind palette → Task 6, covering 55 of 77 named-hue uses. The other 22 are in the excluded, owned files listed under Touches.
  - Guard → Task 1.
  - Dark pinned → Decision 2 + docs.
- **Remaining after this PR (tracked by the baseline):** about 310 raw colors in other modules and TSX at HEAD (555 total outside `globals.css` and tests, minus ~240 here; ≈260 once modal-consolidation deletes the hotels-view subtree's 54). The biggest are `sign-in.module.css` (24), `lib/trip-card-art.ts` (20), `map-canvas.module.css` (20), `place-autocomplete.module.css` (16), `place-preview-card.tsx` (13), and `day-mode-picker.tsx` (10, rewritten by the modal plan). Follow-up tickets take them one module per PR.
- **Type consistency:** `STRICT`, `STRICT_PALETTE`, `EXEMPT`, `countRaw`, `countPalette`, `scan`, `baselineDrift`, `readBaseline`, `writeBaseline`, and `formatDrift` are all in `raw-color-guard.test.ts`; `rootTokens`/`contrast`/`srcFiles` come from `app/test/`. The token names in the table match Task 1.
