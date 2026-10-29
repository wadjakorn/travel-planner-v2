# Scrutiny: DS foundations (contrast, fonts, Thai type, header + motion tokens)

Plan: [2026-10-29-ds-foundations.md](2026-10-29-ds-foundations.md). Traced against `main` @ `6f6f7a2`.

## Intent

Fix the three failing color tokens (ring, field border, success), move map popups onto the app font, raise Thai line-height, set a 12px text floor, wire `<html lang>`, and replace the `57px` header offset and raw transition timings with tokens. Each rule gets a vitest guard.

### Simpler alternatives considered

- **Tokens only, no guards.** Rejected. Every item here is a regression magnet: 67 sub-12px sizes and 33 hard-coded transitions crept in without a guard. The source-scan tests are cheap (one file, no deps).
- **Split into two PRs (tokens/font/lang vs the 25-file mechanical sweep).** Reasonable but not required. Tasks 4–5 are pure value swaps that the guards enumerate. Kept as one PR.
- **`--space-*` / `--radius-pill`.** The plan already declines these with evidence (`--spacing: .25rem` is emitted, checked in `.next/dev/static/chunks/src_app_globals_css_*.css`; `--radius-full` exists at `globals.css:69`). Agree.

## Verified claims

- **Contrast ratios: all correct.** Recomputed with WCAG 2.x luminance: `#0f766e` 5.47 on white, 4.98 on `#f4f4f5`, 4.90 on `#f2f2f7`. `#0d9488` 3.74 / 3.41 / 3.36. `#14b8a6` 2.49. `#8a8a93` 3.42 / 3.11 / 3.07. `#d4d4d8` 1.48. `#15803d` 5.02 / 4.56. `#16a34a` 3.30. Dark: `#71717a` 3.67 on `#18181b`, 4.12 on `#09090b` (3.08 on dark `--surface-2`), `#3f3f46` 1.70, `#2dd4bf` 9.52, `#22c55e` 7.78. Muted `#6e6e77` 4.59 on `--surface-2`.
- **Same-color ring on brand fills.** `Button` uses `ring-offset-2 ring-offset-background` (`ui/button.tsx:42`), and the global fallback is `outline-offset: 2px` (`globals.css:186-190`). The white gap is real.
- **`--font-sans` exists at runtime**, and the font variables sit on `<html>` (`layout.tsx:68`), so `var(--font-sans)` resolves inside Google's `.gm-style` subtree. The five `-apple-system` lines are exactly the ones listed (`pin-card.tsx:20`, `map-pin-badge.tsx:32`, `map-preview-marker.tsx:45`, `real-map-canvas-google.tsx:174`, `real-map-canvas-maplibre.tsx:148`).
- **`57px` sites:** match the grep (`trip-aside-class.ts:6`, `trip-rail-frame.tsx:88`, `trip-create-form.tsx:41`, `itinerary-sidebar.module.css:91`, transport/hotel/expense form modules). No numeric `57` elsewhere.
- **Tight line-heights:** the module scan finds exactly the 4 to fix plus the 5 allowlisted selectors.
- **`--input` consumers:** besides `public-landing.module.css:73` (decorative dots → `--border-strong`, correct), the only non-field uses are `trip-create-form.module.css:66 .cancelBtn` and `transport-form.module.css:241 .stepper`. Both are controls, so a 3:1 border is fine.
- **Unlayered Thai rules beat Tailwind:** correct. Tailwind v4 utilities are in `@layer utilities`, and unlayered wins regardless of specificity.

## Findings

### 1. Major: the Thai line-height floor never reaches Tailwind-sized text

- **Finding:** `[lang|='th'] { line-height: var(--leading-body) }` plus `body { line-height }` only affect elements that inherit line-height. Every Tailwind `text-xs/sm/base/lg/xl/2xl` sets its own `line-height: var(--tw-leading, var(--text-sm--line-height))`.
- **Why it matters:** most UI text uses those utilities (`text-sm` alone appears 54× in TSX). Once P6 un-forces Thai, it would render at 1.33 (`text-xs`) / 1.43 (`text-sm`), below the review's 1.5 floor (§0 #8). The plan's main Thai claim would hold only for module-styled text.
- **Evidence:** compiled `globals.css` chunk, `.text-sm { font-size: var(--text-sm); line-height: var(--tw-leading, var(--text-sm--line-height)); }`, with `--text-xs--line-height: calc(1 / .75)` and `--text-sm--line-height: calc(1.25 / .875)`.
- **Change:** in the `[lang|='th']` block, re-declare `--text-{xs,sm,base,lg}--line-height: var(--leading-body)` and `--text-{xl,2xl}--line-height: var(--leading-heading)`. Custom properties inherit, so every descendant `text-*` picks them up. The test asserts the overrides, and Task 6 measures a `text-sm` paragraph. **Applied.**

### 2. Major: the `<html lang>` test breaks when i18n P0 lands

- **Finding:** the test asserts `/await getLang\(\)/`. i18n P0 rewrites `layout.tsx` to `const [lang, dict] = await Promise.all([getLang(), getDict()])` (`2026-10-29-i18n-extraction.md:82`), which doesn't match.
- **Why it matters:** whichever of the two lands second gets a red test for a correct layout.
- **Change:** assert `<html … lang={lang}>`, the absence of `lang="en"`, and that `getLang()` is called, whatever the shape. Task 3 tells the implementer to reuse P0's binding if it exists. **Applied.**

### 3. Major (simplification): the same test helpers would be written three or four times

- **Finding:** this plan defines test-local `rootTokens`, `contrast`, and `srcFiles`. Hex-codemod re-implements `rootTokens`/`contrast` ("same approach as design-foundations.test.ts"). Modal-consolidation creates `app/test/src-files.ts`. Map-pin-redesign writes its own `contrast` in `map-tokens.test.ts`.
- **Why it matters:** CSS-parsing regexes that diverge produce guards that disagree, for example on whether `[data-theme="dark"] .tp-on-muted` (`globals.css:237`) gets parsed as the dark block.
- **Change:** this plan (it lands first) creates `app/test/css-tokens.ts` (`readGlobals`, `rootTokens`, `contrast`) and `app/test/src-files.ts` (`srcFiles`, `readSrc`). Hex and modal import them, and whichever plan lands first creates them. The `rootTokens` selector match is anchored. **Applied** here and in the hex and modal plans. Map-pin-redesign: see Cross-plan.

### 4. Minor: a fixed header height with 12px padding leaves 32px for 36px content

- **Finding:** `.header` has `padding: 12px 24px` (`header.module.css:5`). With `height: 57px` and border-box, the content box is 32px. The signed-out "Sign in" link is `h-9` (36px, `header.tsx:118`) and would overflow onto the border.
- **Evidence:** every `<Header>` call site passes a user today (`(home)/layout.tsx:17` renders it only when signed in; settings and trip pages require auth), so this is latent.
- **Change:** `padding: 0 24px` together with `height: var(--header-h)`. Centering is unchanged, and the content gets 56px. **Applied.**

### 5. Minor: the 12px guard missed ternaries and quoted px

- **Finding:** `fontSize:\s*([\d.]+)\b` doesn't see `fontSize: compact ? 10 : 12` or `fontSize: '11px'`. Five ternary sites exist today (`place-preview-card.tsx:41,57,72,76`, `map-pin-badge.tsx:23`), all ≥12 for now.
- **Change:** capture the whole `fontSize:` expression and check every number in it. Verified that there are no false positives at HEAD. **Applied.**

### 6. Nit: counts drift from HEAD

- The 12px sweep is 67 hits, not ~75. Transitions: `itinerary-list` 2, `account-menu` 2. The plan already says the failing test is authoritative. **Applied** (numbers corrected).

### 7. Nit: left as is

- `--ease` has no consumer, because the plan leaves `ease` keywords in place. That's harmless, but it is the same "token with no consumers" argument the plan uses against `--space-*`. Either swap `ease` → `var(--ease)` in the transitions it already touches, or drop the token.
- Module rules with `line-height` 1.3–1.49 on body text still sit under the Thai 1.5 floor (the guard's threshold is the heading floor, 1.3). Acceptable for this PR; revisit in i18n P6 Thai QA.
- `.trigger:focus-visible { box-shadow: 0 0 0 2px var(--ring) }` (`account-menu.module.css:25-28`) has no offset over a colored avatar. Check it in Task 6.

## Cross-plan resolutions

- **i18n-extraction:** P0 keeps `<html lang="en">`. If foundations lands first, P6's `layout.tsx:63` edit is already done, and P6 only un-forces `getLang()`. **P6 drops its `:lang(th) body { line-height: 1.6 }` line** (`i18n-extraction.md:173`): foundations owns Thai leading, and finding 1 makes it cover Tailwind text too.
- **map-pin-redesign:** owns the font in `pin-card.tsx`/`map-preview-marker.tsx` once it rewrites them, and deletes `map-pin-badge.tsx`. Whichever lands second drops its font hunk; the `-apple-system` guard holds either way. Its `map-tokens.test.ts` should import `contrast`/`rootTokens` from `app/test/css-tokens.ts` instead of a local copy.
- **map-route-lines:** `RouteLegLabel` is specced at **11px** (`map-route-lines.md:214`). That fails this plan's 12px guard, so bump it to 12px.
- **nav-labels:** rewrites `trip-rail-frame.tsx:82-90` with `md:top-[57px]` (`nav-labels.md:94`). That fails the `57px` guard, so use `md:top-(--header-h)` and `md:h-[calc(100dvh_-_var(--header-h))]`. The 10px badge it defers (`nav-labels.md:136`) is fixed here (Task 4, `trip-rail.tsx:100`).
- **map-hover-sync:** any new module `transition` must use `--dur-*`. Its `120ms` is `var(--dur-fast)`.
- **hex-codemod:** depends on this plan. Shared helpers per finding 3.

## Verdict

**Fix-then-ship.** Token values and ratios are right, and the guards are a good idea. Finding 1 was the real gap: without it, the Thai line-height floor would have missed most of the app. Findings 1–5 are applied. No decision is left for the user beyond the plan's own Decision-needed defaults, which I agree with.

## Cross-plan (appended by the home-trip-cards scrutiny, 2026-10-29)
- `home-trip-cards` rewrites the trip-card avatars to 28 px / `text-xs` (`trip-card.tsx:141-159`). Home owns those lines. If it lands first, drop the `trip-card.tsx:146,154` `text-[9px]` items from the 12 px sweep. The calendar month grid's `text-[10px]` sites stay with this plan, because `calendar-trip-range` does not touch them.
