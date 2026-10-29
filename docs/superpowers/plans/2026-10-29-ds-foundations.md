# Design-System Foundations (contrast, fonts, Thai type, header + motion tokens) Implementation Plan

> **Ticket:** TP-0083

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three failing color tokens, put every map surface on the app font, make Thai text render with enough line-height, set a 12px text floor, wire `<html lang>`, and replace the `57px` header offset and raw transition timings with tokens. Each rule gets a vitest guard so it doesn't drift back.

**Architecture:** Token edits in `globals.css` `:root` (plus the matching dark values), then mechanical find/replace in the files that hardcode those values. One new test file, `app/src/app/design-foundations.test.ts`, parses `globals.css` to assert the WCAG ratios and scans `app/src/**` for regressions: `-apple-system`, sub-12px text, a literal `57px`, raw transition timings, and tight `line-height`. Nothing changes structurally. No new components and no new dependencies.

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme inline`), CSS modules, vitest (node env, `src/**/*.test.ts`).

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md`, covering §0 TL;DR #7 + #8, §5 Perceivable (A2, A3, A4, A7, A8), §6 rows Spacing / Typography / Motion and the "ลำดับที่ควรทำ" items (1) and (5), and §10 ticket DS-01.

**Touches:** `app/src/app/globals.css` (`:root`, dark block, `@theme inline`, `body`, new Thai block), `app/src/app/layout.tsx` (`lang`), `header.module.css`, and the five map files `pin-card.tsx`, `map-pin-badge.tsx`, `map-preview-marker.tsx`, `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx` (one `fontFamily` value each). It also makes mechanical one-line edits in about 25 CSS modules and TSX files for font sizes, `transition` timings, and `57px`. Those are listed per task. Hot-file overlap: the map-pin-redesign plan also sets `var(--font-sans)` in `map-preview-marker.tsx` and `pin-card.tsx` and deletes `map-pin-badge.tsx`. Whichever plan lands second drops its own font hunk. `itinerary-list.module.css` and `itinerary-sidebar.module.css` are also rewritten by `2026-10-29-ds-hex-codemod.md`, which depends on this plan, so it lands second. `layout.tsx`: the i18n-extraction plan's P0 also adds a `getLang()` call there and defers `<html lang>` to its P6. If this plan lands first, P6 only has to un-force `getLang()`; if P0 lands first, reuse its `lang` binding. `bookings-view.module.css` is also edited by the bookings-layout plan, in different rules (font-size and line-height lines only here). `trip-rail-frame.tsx:88` is the same line the nav-labels plan rewrites (`md:w-14` → `md:w-[72px]`); whichever lands second keeps `md:top-(--header-h)` / `var(--header-h)` (the `57px` guard fails otherwise). Plans that add new CSS after this one must respect its guards: 12px text floor (map-route-lines' `RouteLegLabel` is specced at 11px → 12px), `--dur-*` in module transitions, no literal `57px`. Thai line-height is owned here: i18n P6 drops its own `:lang(th) body { line-height: 1.6 }` line. See `2026-10-29-ds-foundations.scrutiny.md`.

## Decision needed

1. **`--ring` value.** Two options:
   - `--brand-700` `#0f766e`: 5.47:1 on white, 4.98:1 on `--surface-2`. This is the review's A2 recommendation.
   - `--brand-600` `#0d9488`: 3.74:1 / 3.41:1. Also passes, and it reads lighter next to a brand-filled button.

   **Default: `#0f766e`.** It has the larger margin on legacy `#f2f2f7` surfaces (4.90 vs 3.36). `Button` draws its ring with `ring-offset-2 ring-offset-background` (`ui/button.tsx:42`), so a same-color ring around a primary button is still separated by a white gap.
2. **The 12px floor covers everything**, including 11px mono eyebrow labels, the boarding-pass `.fl` labels, and avatar initials. **Default: yes.** The review asks for a floor (A7), labels are going to be translated into Thai (`messages/th.json`), and an exemption list would need its own guard.
3. **Spacing tokens and `--radius-pill`.** **Default: add neither.**
   - Spacing: Tailwind v4 already ships the spacing scale (`--spacing: 0.25rem`, emitted at runtime). Only 6 of the review's 53 "arbitrary" values are spacing (`px-[…]`, `mt-[…]`). The rest are sizes plus the `57px` header offset, which this plan tokenises as `--header-h`. Document `calc(var(--spacing) * n)` for CSS modules in the README instead of adding a parallel `--space-*` scale with no consumers.
   - `--radius-pill`: `--radius-full: 9999px` already exists (`globals.css:69`). The hex-codemod plan maps `980px` to `var(--radius-full)`.
4. **Fix the dark `--input` too** (`#3f3f46` is 1.70:1 on dark `--surface`). Dark mode can't be reached today (see `layout.tsx:40-47`), but the fix is one line. **Default: yes**, using `#71717a` (3.67:1 on `#18181b`, 4.12:1 on `#09090b`).

## Global Constraints

- Token values exactly (ratios computed with WCAG 2.x relative luminance):
  - `--ring: var(--brand-700)` (`#0f766e`): 5.47:1 vs `#ffffff`, 4.98:1 vs `--surface-2` `#f4f4f5`. Was `#14b8a6` at 2.49:1.
  - `--input: #8a8a93`: 3.42:1 vs `#ffffff`, 3.11:1 vs `#f4f4f5`, 3.07:1 vs legacy `#f2f2f7`. Was `#d4d4d8` at 1.48:1.
  - `--success: #15803d`: 5.02:1 as text on `#ffffff`, 4.56:1 on `#f4f4f5`; white `--success-foreground` on it is 5.02:1. Was `#16a34a` at 3.30:1.
  - New `--border-strong: #d4d4d8` (the old `--input`) is for *decorative* borders and dots that were borrowing `--input`. It is exposed as `--color-border-strong` in `@theme inline`.
  - Dark: `--input: #71717a`. Dark `--ring` `#2dd4bf` (9.52:1) and dark `--success` `#22c55e` (7.78:1) already pass and stay unchanged.
- Map UI font: `fontFamily: 'var(--font-sans)'`. `--font-sans` is emitted at runtime (checked in `.next/dev/static/chunks/src_app_globals_css_*.css`), and Google's `.gm-style` sets `Roboto, Arial`, so the value must be set explicitly on our popup roots. Inheriting it is not enough.
- Thai type: body line-height ≥ 1.5 and headings ≥ 1.3 (review §0 #8). Values: `--leading-body: 1.5` / `--leading-heading: 1.3` by default, and `1.6` / `1.35` under `[lang|='th']`. Tailwind v4 `text-xs/sm/base/lg/xl/2xl` set their own `line-height: var(--tw-leading, var(--text-sm--line-height))` (checked in the compiled `globals.css` chunk: `text-xs` 1.33, `text-sm` 1.43), so inherited body leading never reaches them; the Thai block re-declares those `--text-*--line-height` variables too.
- Minimum text size 12px: CSS `font-size`, Tailwind `text-[Npx]`, inline `fontSize`. The exceptions are `app/**/opengraph-image.tsx` (Satori raster, not DOM) and `components/hotels-view.module.css` (dead code, deleted by `2026-10-29-ds-modal-consolidation.md`).
- Motion tokens: `--dur-fast: 120ms`, `--dur-base: 180ms`, `--dur-slow: 280ms`, `--ease: cubic-bezier(0.25, 0.1, 0.25, 1)`. That curve is CSS `ease`, so swapping it in changes nothing visually. Duration mapping: ≤150ms (including `0.12s`/`0.15s`) → fast; 160–200ms → base; ≥250ms → slow.
- `--header-h: 57px`, and `.header` gets `height: var(--header-h)` so the token is authoritative, not just descriptive.
- No new hex outside `globals.css`. Brand name "Traver Planel" must not be "fixed".
- Dark mode stays pinned to light. Do not touch `NO_FLASH`/`ThemeWatcher`.

## Review Focus

1. **Ticket and folio layouts at 390px after the 9–11px → 12px bump.** Watch `bookings-view.module.css` `.fl` / `.kind` / `.bpDur` and `settings-folio.module.css` labels. Uppercase mono labels with `letter-spacing: .1em` can wrap or overflow the boarding-pass grid. Pinned by the 390×844 Bookings and Settings screenshots in Task 6.
2. **The header grows past 57px.** That happens with long trip titles, avatar stacks, or 320px widths. With a fixed `height`, the content would clip instead of pushing the page. Task 6 measures `header.getBoundingClientRect().height === 57` and checks there is no clipping at 320, 390, and 1440.
3. **Focus ring on brand-filled controls** (primary `Button`, active day chip): the ring is the same teal as the fill. Task 6 tabs to a primary button and the active day chip and checks the white offset gap is visible.
4. **`[lang|='th']` line-height on inline elements.** The landing EN/ไทย switch (`public-landing.tsx:107`, `lang={o.lang}`) now gets `line-height: 1.6`, which can change the pill height. Task 6 screenshots the landing switch in both languages.
5. **Darker `--input` on non-field borders.** `Button variant="outline"` (`ui/button.tsx:19`), the notes checkboxes (`notes-view.tsx:233,244`), and the trip-create inputs all get visibly heavier borders. This is intended (1.4.11), but `public-landing.module.css:73` (decorative browser dots) must move to `--border-strong`. Task 1 makes that move, and Task 6 screenshots the landing.

---

### Task 1: Contrast tokens + token test

**Files:**
- Modify: `app/src/app/globals.css:33-34,43` (`--input`, `--ring`, `--success`), `:92` (dark `--input`), `:12-83` (add `--border-strong`), `@theme inline` `:128` (add `--color-border-strong: var(--border-strong)`)
- Modify: `app/src/components/public-landing.module.css:73` (`var(--input)` → `var(--border-strong)`)
- Test (create): `app/src/app/design-foundations.test.ts`

**Interfaces:**
- Produces **shared** test helpers (outside `src/`, so vitest's `src/**/*.test.ts` include never runs them and the source scans never see them). The hex-codemod, modal-consolidation and map-pin-redesign plans import these instead of re-implementing them; whichever of those plans lands first creates the file if this plan hasn't landed:
  - `app/test/css-tokens.ts`:
    - `readGlobals(): string`: `readFileSync` of `app/src/app/globals.css`.
    - `rootTokens(selector: ':root' | '[data-theme="dark"]' = ':root'): Record<string, string>`: parses the block whose selector is exactly that (anchored at line start, so `[data-theme="dark"] .tp-on-muted` is not picked up), resolves `var(--x)` against `:root`, returns lower-case hex for colors and other values verbatim.
    - `contrast(a: string, b: string): number`: WCAG 2.x ratio for `#rgb` / `#rrggbb`.
  - `app/test/src-files.ts`:
    - `srcFiles(exts: string[]): { rel: string; text: string }[]`: `readdirSync(SRC, { recursive: true })`, where `SRC` is resolved via `new URL('../src/', import.meta.url)` (pattern: `lib/places/photon.test.ts:68`). `rel` is relative to `app/src`. It **excludes `*.test.ts`**, because the guards' own regex literals would otherwise match themselves.
    - `readSrc(rel: string): string`.
- Produces (CSS): `--border-strong`, `border-border-strong` utility.

- [ ] **Step 1: Write the failing test** (imports `rootTokens`, `contrast` from `../../test/css-tokens` and `srcFiles`, `readSrc` from `../../test/src-files`)

```ts
describe('tokens: WCAG contrast (review A2/A3/A4)', () => {
  const t = rootTokens(':root');
  it('focus ring ≥ 3:1 on page and surface-2', () => {
    expect(contrast(t['--ring'], t['--background'])).toBeGreaterThanOrEqual(3);
    expect(contrast(t['--ring'], t['--surface-2'])).toBeGreaterThanOrEqual(3);
  });
  it('field border ≥ 3:1 on surface and surface-2', () => {
    expect(contrast(t['--input'], t['--surface'])).toBeGreaterThanOrEqual(3);
    expect(contrast(t['--input'], t['--surface-2'])).toBeGreaterThanOrEqual(3);
  });
  it('success works as text and as a fill', () => {
    expect(contrast(t['--success'], t['--surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--success-foreground'], t['--success'])).toBeGreaterThanOrEqual(4.5);
  });
  it('muted text stays ≥ 4.5:1 on surface-2 (regression)', () => {
    expect(contrast(t['--muted'], t['--surface-2'])).toBeGreaterThanOrEqual(4.5);
  });
  it('dark field border ≥ 3:1', () => {
    const d = rootTokens('[data-theme="dark"]');
    expect(contrast(d['--input'], d['--surface'])).toBeGreaterThanOrEqual(3);
  });
  it('defines --border-strong for decorative borders', () => {
    expect(t['--border-strong']).toBe('#d4d4d8');
  });
});
```

- [ ] **Step 2: Run it.** `cd app && pnpm vitest run src/app/design-foundations.test.ts` should FAIL on ring (2.49), input (1.48), success (3.30), dark input (1.70), and `--border-strong` undefined.
- [ ] **Step 3: Implement the token values** from Global Constraints. Then move `public-landing.module.css:73` to `var(--border-strong)`. Leave `hotels-view.module.css:141` alone (dead code).
- [ ] **Step 4: Run again.** The test should PASS. Then run `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [ ] **Step 5: Commit** `fix(ds): focus ring, field border and success tokens pass WCAG AA [TP-0083]`

### Task 2: Map UI on the app font

**Files:**
- Modify: `app/src/components/pin-card.tsx:20`, `map-pin-badge.tsx:32`, `map-preview-marker.tsx:45`, `real-map-canvas-google.tsx:174`, `real-map-canvas-maplibre.tsx:148`. Change each `fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'` to `fontFamily: 'var(--font-sans)'`. Leave the colors on those lines alone (the map-pin-redesign plan owns them).
- No edit: `place-preview-card.tsx` sets no font. In the map popup it inherits from the `PreviewPopupBody` root (`map-preview-marker.tsx:45`), and in `place-preview-modal.tsx` it inherits from `body`.
- Test: `app/src/app/design-foundations.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('no platform font stacks in app source (review TL;DR #8)', () => {
  const hits = srcFiles(['.tsx', '.ts', '.css'])
    .filter((f) => /-apple-system|BlinkMacSystemFont/.test(f.text))
    .map((f) => f.rel);
  expect(hits).toEqual([]);
});
```

- [ ] **Step 2:** Run it. It should FAIL and list the 5 files.
- [ ] **Step 3:** Edit the 5 lines.
- [ ] **Step 4:** Run it. It should PASS. Run the gates.
- [ ] **Step 5: Commit** `fix(map): pins, cards and tooltips use --font-sans (Thai on Android/Windows) [TP-0083]`

### Task 3: Thai line-height + `<html lang>`

**Files:**
- Modify: `app/src/app/globals.css`:
  - Add `--leading-body: 1.5; --leading-heading: 1.3;` to `:root`.
  - Change `body` (`:175-179`) to also set `line-height: var(--leading-body);`.
  - Change `--text-title--line-height` (`:169`) from `1.25` to `1.3`.
  - Add a new block after `body`:
    ```css
    /* Thai stacks vowels and tone marks above and below the line; Latin
       leading clips them. Custom props + attribute selector so the value is
       re-declared where lang changes (inheritance alone would carry the
       parent's computed number). */
    [lang|='th'] {
      --leading-body: 1.6; --leading-heading: 1.35; line-height: var(--leading-body);
      /* Tailwind text-* utilities read these, not the inherited line-height. */
      --text-xs--line-height: var(--leading-body);
      --text-sm--line-height: var(--leading-body);
      --text-base--line-height: var(--leading-body);
      --text-lg--line-height: var(--leading-body);
      --text-xl--line-height: var(--leading-heading);
      --text-2xl--line-height: var(--leading-heading);
    }
    :is(h1, h2, h3, h4):lang(th) { line-height: var(--leading-heading); }
    ```
    These rules are unlayered, so they beat Tailwind `text-6xl` (line-height `1`) on the landing `<h1>` (`public-landing.tsx:154`).
- Modify the user-content rules, unconditionally. Thai place, hotel, and trip names show up inside the EN UI, where `:lang(th)` can't see them, so set `line-height: var(--leading-heading)` on:
  - `itinerary-list.module.css:188` `.placeName` (was `1.25`)
  - `itinerary-sidebar.module.css:72` `.coverTitle` (was `1.1`)
  - `bookings-view.module.css:246` `.bpName` (was `1.2`)
  - `bookings-view.module.css:277` `.stayTitle` (was `1.1`)
- Leave these alone: `bookings-view.module.css:230` `.bpCode` (Latin IATA code, `line-height:1` intended), `pin-card.tsx:34` / `place-preview-card.tsx:65` (`lineHeight: 0` on icon-only buttons, no text), and the static EN display headings `bookings-view .title` and `settings-folio .pageTitle/.paneTitle/.stubV`. The `:lang(th)` heading rule covers those once the UI itself is in Thai.
- Modify: `app/src/app/layout.tsx:63`. Replace `lang="en"` with `lang={lang}`, where `const lang = await getLang();` comes from `@/lib/i18n`. If i18n P0 already landed, reuse its `const [lang, dict] = await Promise.all([getLang(), getDict()])` binding instead of adding a second call. `getLang()` returns `'en'` today (`lib/i18n.ts:17-19`), so nothing changes now. The landing keeps its own `lang` on its wrapper (`public-landing.tsx:129`).
- Test: `design-foundations.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('leading tokens meet the Thai floor', () => {
  const t = rootTokens(':root');
  expect(Number(t['--leading-body'])).toBeGreaterThanOrEqual(1.5);
  expect(Number(t['--leading-heading'])).toBeGreaterThanOrEqual(1.3);
  const css = readGlobals();
  const th = css.match(/\[lang\|='th'\]\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(Number(th.match(/--leading-body:\s*([\d.]+)/)?.[1])).toBeGreaterThanOrEqual(1.5);
  expect(Number(th.match(/--leading-heading:\s*([\d.]+)/)?.[1])).toBeGreaterThanOrEqual(1.3);
  expect(css).toMatch(/:is\(h1, h2, h3, h4\):lang\(th\)\s*\{\s*line-height:\s*var\(--leading-heading\)/);
  for (const sz of ['xs', 'sm', 'base', 'lg']) expect(th).toMatch(new RegExp(`--text-${sz}--line-height:\\s*var\\(--leading-body\\)`));
  for (const sz of ['xl', '2xl']) expect(th).toMatch(new RegExp(`--text-${sz}--line-height:\\s*var\\(--leading-heading\\)`));
});
it('no module sets a unitless line-height < 1.3 outside the allowlist', () => {
  // rule-level scan: /([^{}]+)\{([^{}]*)\}/g → selector + body; unitless values only
  const ALLOW = new Set([
    'components/bookings-view.module.css::.bpCode',
    'components/bookings-view.module.css::.title',
    'components/settings-folio.module.css::.pageTitle',
    'components/settings-folio.module.css::.paneTitle',
    'components/settings-folio.module.css::.stubV',
  ]);
  expect(tightLineHeights().filter((k) => !ALLOW.has(k))).toEqual([]);
});
it('root layout derives <html lang> from getLang()', () => {
  const src = readSrc('app/layout.tsx');
  expect(src).not.toMatch(/lang="en"/);
  expect(src).toMatch(/<html[^>]*\blang=\{lang\}/);
  // Shape-agnostic: i18n P0 rewrites this to `const [lang, dict] = await Promise.all([getLang(), getDict()])`.
  expect(src).toMatch(/\bgetLang\(\)/);
});
```
(`tightLineHeights(): string[]` returns `"<rel>::<selector>"` for every `line-height: <n>` with `n < 1.3` in `**/*.module.css`, which is test-local. `readGlobals()` and `readSrc(rel)` come from the shared helpers in Task 1.)

- [ ] **Step 2:** Run it. It should FAIL: the tokens and `--text-*--line-height` overrides are missing, the four selectors above show up, and `lang="en"` is present.
- [ ] **Step 3:** Implement the edits listed in Files.
- [ ] **Step 4:** Run it. It should PASS. Run the gates.
- [ ] **Step 5: Commit** `feat(ds): Thai line-height floor + <html lang> from getLang [TP-0083]`

### Task 4: 12px text floor

**Files.** Every value below 12px becomes `12px`. In TSX, `text-[9px]`/`text-[10px]`/`text-[11px]` become `text-xs`, and inline `fontSize: 10|11` become `12`. Offenders at HEAD `6f6f7a2` (file: size × count):
- `app/sign-in/sign-in.module.css`: 11×1
- `components/account-menu.module.css`: 10×1, 11×2
- `bookings-view.module.css`: 9×1 (`.fl`), 10×3, 11×4, 11.5×2
- `budget-view.module.css`: 10×1, 11×3
- `calendar-view.tsx`: `text-[10px]`×4 (`:159,253,353,420`), `text-[11px]`×1 (`:406`)
- `expense-form.module.css`: 11×2
- `header.tsx:56,72`: `text-[10px]`×2 (avatar initials)
- `hotel-form.module.css`: 9.5×1, 11×3, 11.5×2
- `itinerary-list.module.css`: 10×2, 11×6
- `itinerary-ride-row.module.css`: 10×1, 11×1
- `itinerary-sidebar.module.css`: 10×1, 11×3
- `place-form.module.css`: 11×1
- `place-preview-card.tsx:139,169`: `fontSize: 11` (photo attribution)
- `search-attribution.tsx:7`: `fontSize: 10` (provider attribution has to stay legible)
- `segment-mode-picker.module.css`: 11×1
- `settings-folio.module.css`: 9.5×1, 10×3, 10.5×1, 11×1
- `transport-form.module.css`: 9.5×1, 10.5×1, 11×4
- `trip-card.tsx:146,154`: `text-[9px]`×2 (22px avatar chips)
- `trip-rail.tsx:100`: `text-[10px]` (badge; keep `leading-[18px]`)

The Step 2 failure output is the authoritative list (`file:size` per hit), so work from it rather than this table if the two disagree.
- Test: `design-foundations.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('no text below 12px (review A7)', () => {
  const EXEMPT = /(^|\/)opengraph-image\.tsx$|^components\/hotels-view\.module\.css$/;
  // fontSize: whole expression up to , or } so ternaries (`compact ? 10 : 12`)
  // and quoted px strings ('11px') are caught too.
  const re = /font-size:\s*([\d.]+)px|text-\[([\d.]+)px\]|fontSize:\s*([^,}\n]+)/g;
  const hits = srcFiles(['.css', '.tsx', '.ts'])
    .filter((f) => !EXEMPT.test(f.rel))
    .flatMap((f) => [...f.text.matchAll(re)]
      .flatMap((m) => m[3] !== undefined
        ? [...m[3].matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(?:px)?\b(?!\s*(?:rem|em|%))/g)].map((n) => Number(n[1]))
        : [Number(m[1] ?? m[2])])
      .filter((px) => px < 12)
      .map((px) => `${f.rel}:${px}`));
  expect(hits).toEqual([]);
});
```

- [ ] **Step 2:** Run it. It should FAIL with about 67 hits (counted at HEAD, `hotels-view.module.css` excluded).
- [ ] **Step 3:** Replace the values. Where a `line-height` is set in px next to the font (`itinerary-list.module.css:230` `.statusBadge` 16px), keep it, since 16/12 = 1.33.
- [ ] **Step 4:** Run it. It should PASS. Run the gates.
- [ ] **Step 5: Commit** `fix(ds): 12px minimum text size [TP-0083]`

### Task 5: `--header-h` + motion tokens

**Files:**
- Modify: `app/src/app/globals.css` `:root`. Add `--header-h: 57px; --dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 280ms; --ease: cubic-bezier(0.25, 0.1, 0.25, 1);`. Change `.tp-loading-in` (`:242`) `160ms` to `var(--dur-base)`. Keyframe animations (`tp-shimmer 1.6s`) stay as they are.
- Modify: `app/src/components/header.module.css:1-13`. Add `height: var(--header-h);` and change `padding: 12px 24px` to `padding: 0 24px`. With `align-items: center` the content sits in the same place, but it gets the full 56px instead of the 32px left by 12px padding, so a 36px control (the signed-out `h-9` Sign-in link, `header.tsx:118`) doesn't overflow the border.
- Replace `57px` with `--header-h`:
  - `trip-aside-class.ts:6` → `h-[calc(100dvh_-_var(--header-h)_-_56px)]` and `md:h-[calc(100dvh_-_var(--header-h))]`
  - `trip-rail-frame.tsx:88` → `md:top-(--header-h)` and `md:h-[calc(100dvh_-_var(--header-h))]`
  - `trip-create-form.tsx:41` → `min-h-[calc(100dvh_-_var(--header-h))]`
  - `itinerary-sidebar.module.css:91`
  - `transport-form.module.css:7,13,29,37`, `hotel-form.module.css:7,13,29,37`, `expense-form.module.css:10,26,34`. In CSS use `calc(100dvh - var(--header-h) - 96px)` etc. Update the `57px header` comments to name the token.
- Replace the transition timings in every `*.module.css` `transition` / `transition-duration` declaration, using the Global Constraints mapping. At HEAD that is (lines with a duration): `itinerary-sidebar` 4, `itinerary-list` 2, `budget-view` 3, `account-menu` 2, `trip-create-form` 2, `settings-folio` 2, `place-search-picker` 2, `sign-in` 2, `sortable-place-list` 1, `place-autocomplete` 1, `bookings-view` 4 (`0.18s`/`0.2s`/`0.12s`/`0.28s`), `transport-form` 2, `itinerary-ride-row` 1, `expense-form` 1, `hotel-form` 1. `transition: none` lines are not hits. Leave out `hotels-view.module.css` (dead) and inline TSX transitions (`days-accordion`, `map-pin-badge`, `place-preview-card`, `route-progress`, `toast`); the CSS guard doesn't cover TSX.
- Test: `design-foundations.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('header offset only via --header-h', () => {
  const hits = srcFiles(['.css', '.tsx', '.ts'])
    .filter((f) => f.rel !== 'app/globals.css' && /\b57px\b/.test(f.text)).map((f) => f.rel);
  expect(hits).toEqual([]);
  expect(rootTokens(':root')['--header-h']).toBe('57px');
});
it('CSS-module transitions use motion tokens', () => {
  const hits = srcFiles(['.module.css'])
    .filter((f) => f.rel !== 'components/hotels-view.module.css')
    .flatMap((f) => f.text.split('\n').map((l, i) => [l, i + 1] as const)
      .filter(([l]) => /transition[\w-]*\s*:[^;]*\b\d*\.?\d+m?s\b/.test(l))
      .map(([, n]) => `${f.rel}:${n}`));
  expect(hits).toEqual([]);
});
it('motion tokens exist', () => {
  const t = rootTokens(':root');
  expect([t['--dur-fast'], t['--dur-base'], t['--dur-slow']]).toEqual(['120ms', '180ms', '280ms']);
  expect(t['--ease']).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
});
```
(`rootTokens` returns non-color values verbatim.)

- [ ] **Step 2:** Run it. It should FAIL and list the files.
- [ ] **Step 3:** Implement. The global `prefers-reduced-motion` floor (`globals.css:259-268`) still zeroes every duration, so no extra work is needed there.
- [ ] **Step 4:** Run it. It should PASS. Run the gates.
- [ ] **Step 5: Commit** `refactor(ds): --header-h and motion tokens replace magic numbers [TP-0083]`

### Task 6: Browser verification

- [ ] Run `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, then use Playwright on trip `79efe162-dfb2-46c2-ad46-a34695771b8b` at 390×844 and at 1440×900.
- [ ] **Header:** `document.querySelector('header').getBoundingClientRect().height === 57` on `/`, `/trip/<id>`, and `/trip/<id>/bookings`. At 1440 the rail top sits flush under the header. At 320×640 nothing is clipped.
- [ ] **Focus:** Tab to a primary `Button`, a text field, and a day chip. The ring is teal with a visible gap. Screenshot each.
- [ ] **Fields:** borders read clearly on white and on `--surface-2` panels (trip settings, place search).
- [ ] **Map font:** hover a pin, click a pin (pin card), and preview a search result. For each, `getComputedStyle(el).fontFamily` on the popup root starts with the Geist family variable, not `-apple-system`. Rename a stop to `วัดพระแก้ว ทดสอบ` and check the tooltip uses Noto Sans Thai with no clipped tone marks.
- [ ] **Thai:** set cookie `lang=th` and open `/` signed out (landing). The `<h1>` computed line-height is ≥ 1.35 × font-size, a `text-sm` paragraph's computed line-height is ≥ 1.6 × font-size (proves the `--text-*--line-height` override reaches Tailwind sizes), and the EN/ไทย switch pill isn't distorted. Signed in, a place named `เชียงใหม่ ถ้ำ` in the itinerary list keeps its above-line marks unclipped.
- [ ] **12px floor:** Bookings (boarding pass + stay card), Settings, Budget, Calendar, and the trip-card avatars at 390 show no overflow or wrapping regressions. Screenshot each.
- [ ] `document.documentElement.lang === 'en'`.
- [ ] Save the screenshots to `docs/design-review/shots/ds-foundations/` (uncommitted, like the review's).

### Task 7: Docs

**Files:**
- Modify: `AGENTS-INDEX.md`:
  - Add a `globals.css` row to "Pages & routes" (`:60-63`): "Design tokens (color, radius, shadow, z, `--header-h`, motion, leading), Thai line-height block, global focus/reduced-motion".
  - Add `design-foundations.test.ts` to the same table.
- Modify: `app/src/components/ui/README.md`. In the token table, add rows for `--border-strong`, `--header-h`, `--dur-fast/base/slow` + `--ease`, and `--leading-body/heading`. Add three rules:
  - "Text ≥ 12px".
  - "Map popups set `fontFamily: var(--font-sans)` explicitly".
  - "Spacing in CSS modules: `calc(var(--spacing) * n)`".
  Then note that `--radius-full` covers pills.
- Modify: `REQUIREMENTS.md` §15 Theme. Add: "Focus ring ≥ 3:1 and field borders ≥ 3:1 (WCAG 1.4.11); body text ≥ 12px; Thai line-height ≥ 1.5 body / ≥ 1.3 headings". In §18, next to "WCAG 2.1 AA", add "guarded by `app/src/app/design-foundations.test.ts`".
- [ ] Commit `docs(ds): document foundation tokens and guards [TP-0083]`

---

## Self-review

- **Spec coverage:** A2/A3/A4 → Task 1. TL;DR #8 + Typography `-apple-system` → Task 2. Thai line-height + A8 → Task 3. A7 → Task 4. Spacing/`57px` + Motion → Task 5 + Decision 3.
- **Not done, on purpose:** A1, A5, A6 (map pins and legacy hex) belong to the map-pin-redesign and hex-codemod plans. Thai 13px minimum (A7's parenthetical) is not done because CSS can't express a language-conditional minimum size and the 12px floor already covers most of it.
- **Type consistency:** test helpers are `rootTokens`, `contrast`, `srcFiles`, `tightLineHeights`, `readGlobals`, `readSrc`, all in one file. Token names match between Global Constraints and the tasks.
