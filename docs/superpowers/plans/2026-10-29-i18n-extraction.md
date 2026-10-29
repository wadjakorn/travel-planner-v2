# i18n Extraction + Thai Language Implementation Plan

> **Tickets:** P0 = **TP-0102** · P1 = **TP-0103** · P2a = **TP-0104** · P2b = **TP-0105** · P3 = **TP-0106** · P4 = **TP-0107** · P5 = **TP-0108** · P6 = **TP-0109** — use the matching key in commit messages instead of TP-XXXX.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every user-facing English literal in the app UI into `messages/en.json` + `th.json`, add a lint guard so new literals can't creep back in, and finally stop forcing `getLang()` to `'en'`, so the Language setting (and the landing's EN/ไทย switch) controls the whole app.

**Architecture:** Phase 0 adds the plumbing without moving any strings: a client `I18nProvider`/`useT()` fed by the root layout, en-fallback for missing Thai keys, a plural helper, pseudo-localisation, a key-parity test, and an ESLint ratchet (`react/jsx-no-literals` + `no-restricted-syntax`, both already installed via `eslint-config-next`) scoped to a growing list of migrated files. Phases 1–5 each extract one area of the app as one PR and add its files to the ratchet. Phase 6 resolves the language from the user setting/cookie/Accept-Language, sets `<html lang>`, makes dates locale-aware, and turns on the Language control in Settings.

**Tech Stack:** Next.js 16 App Router (server components + `'use client'`), React 19 context, ESLint 9 flat config (`eslint-plugin-react@7.37.5`), vitest. No new dependencies.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §8 (translation note: "`getLang()` บังคับให้เป็น `en` และมีข้อความ hardcode ประมาณ 520 จุด"), §5 A8 (`<html lang="en">` hardcoded), §6, §10 roadmap `p3e`. REQUIREMENTS §13 (Language: English / ไทย), §14 (flat keys, `en` default, missing-key fallback to `en`, interpolation, plurals, locale-aware dates, pseudo-localisation in dev).

**Touches:** P0: `app/layout.tsx`, `eslint.config.mjs`, `lib/i18n.ts`, `lib/i18n-client.ts`. P1–P5: the files listed per phase (incl. the hot files `persistent-map.tsx`, `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx`, `map-stop-carousel.tsx`, `place-search-picker.tsx`, `bookings-view.tsx`, `header.tsx`) plus `messages/*.json` in every phase. P6: `lib/i18n.ts`, `lib/auth.ts` (sign-in seeds the `lang` cookie), `lib/landing-lang.ts`, `app/layout.tsx`, `app/settings/page.tsx`, `globals.css`, plus the date-format sites.

## Dependencies / sequencing

- **Copy/glossary plan first (review ticket COPY-01).** It fixes specific wording (§8 table: "Route unavailable…", "Unverified place…", preview copy, Day chip, distance chip, empty states, Delete vs Remove) and the glossary (Stay/ที่พัก, Transport/การเดินทาง, Place/สถานที่, Notes/**โน้ต**, Delete/ลบ, Remove/เอาออก). Extraction then moves the *corrected* English into keys, and Thai drafts follow that glossary. Any phase whose files COPY-01 touches waits for COPY-01 to merge.
- **Header plan** (`2026-10-29-header-share-export.md`) ships before Phase 1. Its new `header.tsx`/`bookings-view.tsx`/`toast.tsx` strings are then extracted in P1/P3.
- Map plans that edit `persistent-map.tsx` / canvases / `map-stop-carousel.tsx` / `map-preview-marker.tsx` / `pin-card.tsx`: **P2b (map surfaces) ships after the map plans have merged**; P2a (itinerary + place forms) does not wait for them. Conversions are mechanical (literal → `t()`), but the map files are the busiest in the repo right now, so keep the window short.
- **Dead hotel chain:** `ds-modal-consolidation` deletes the dead `hotels-view` subtree. P3 does not extract any of those files; whichever PR lands first deletes the chain (see P3).
- **Parity test:** the copy/glossary plan creates `lib/i18n-messages.test.ts` (key parity + glossary). P0 extends that file instead of creating a second parity test.
- Phases 1–5 are independent of each other once P0 merges (P2b additionally waits for the map plans). P6 needs P1–P5.

## Decision needed

| # | Question | Default (built on) |
|---|---|---|
| 1 | Server-side error text (`ServiceError` messages, `actionError` from services, REST API errors) | **Stays English.** The REST API contract is English, and these messages are shared with `/api/v1`. Only messages written in UI-layer code (`actionOk('Preferences saved')`, toasts, component copy) get keys. Revisit with per-`code` mapping if Thai users hit them often. |
| 2 | Thai dates: Buddhist (2569) or Gregorian (2026) years | **Gregorian.** Booking data (flights, hotels) is Gregorian, and mixing years in one screen confuses. `localeTag('th')` becomes `'th-TH-u-ca-gregory'`. |
| 3 | Where the rendered language comes from | **The `lang` cookie is authoritative for rendering** (cookie → Accept-Language → `en`); no `auth()`/DB read in the root layout. `saveSettingsAction` already writes the cookie on every save (`actions/settings.ts:44-47`) and the landing switch writes the same cookie (`:83-88`), so the account row and the cookie only diverge on a *new device*. The account row seeds the cookie at sign-in (P6). This also honours the landing's promise that a visitor's pick "carries over once they sign in". *(Changed by scrutiny: the original "row wins" precedence put a DB query in the root layout; see `2026-10-29-i18n-extraction.scrutiny.md` M2.)* |
| 4 | Persisted data built from English labels (e.g. transport titles from `lib/transport-compute.ts` `TYPE_LABEL`, seed data) | **Not translated.** It is user data once stored. Only render-time labels are translated. |

## Measured scope (HEAD `6f6f7a2`)

Measured with the guard config itself (so the numbers are reproducible). Run from `app/`; `/tmp/i18n-rules.json` holds the two rules from the P0 ESLint block below (severity `warn`):

```bash
node_modules/.bin/eslint src -f json -o /tmp/i18n.json --rule "$(cat /tmp/i18n-rules.json)"
```

Result at `6f6f7a2`: **~607 literals with the original two rules (432 JSX text + 175 direct attribute literals, 73 files)**, plus **~240 that only the extended selectors catch**: 87 string branches of ternaries / `&&` in JSX children (almost all plurals: `{n === 1 ? 'stay' : 'stays'}`, `bookings-view.tsx:240`, `budget-view.tsx:213,221`, `trip-cover.tsx:19-20`, …), ~39 conditional attribute values (`title={x ? 'Remove this ride?' : 'Remove this stay?'}`, `bookings-view.tsx:456`), 28 template-literal attributes (`` aria-label={`Remove ${place.name}`} ``), and 21 `toast({ title: '…' })` calls. `react/jsx-no-literals` itself only sees direct children and template literals in a child container; it does **not** see ternary branches or any attribute expression (verified with `eslint --stdin`). Still not lint-visible, handled by grep in each phase: `actionOk/actionError` literals in `app/actions/{settings,budget,trips}.ts`, ~20 `metadata` titles, module-level label maps (`TYPE_LABEL` in `booking-card-ride.tsx:13` / `itinerary-ride-row.tsx:12`, budget category labels `budget-view.tsx:69`, `expense-form.tsx:76`, `app/trip/[id]/settings/page.tsx:38`), and template strings built outside JSX (`budget-view.tsx:129`, `persistent-map.tsx:137`, `days-accordion.tsx:318`).

| Phase (= PR) | Area | Files | Literals |
|---|---|---|---|
| P0 | Plumbing + guard | — | 0 |
| P1 | Shell, auth, home, errors, skeletons | 27 | ~146 |
| P2a | Itinerary + place forms | 17 | ~140 |
| P2b | Map surfaces (after the map plans) | 9 + `use-poi-preview.ts` | ~52 |
| P3 | Bookings (stays + transport); dead hotel chain deleted, not extracted | 7 | ~176 |
| P4 | Budget, expenses, calendar, notes | 6 | ~180 |
| P5 | Account + trip settings | 7 | ~112 |
| P6 | Un-force `getLang()`, `<html lang>`, locale dates, Language control, Thai QA | — | — |

Counts are original rules + extended selectors (scrutiny re-measure). Each phase is 110–180 mechanical conversions plus the matching JSON keys, roughly a 400–600 line diff: reviewable, and the guard proves completeness, so review is about key names and Thai drafts.

Excluded from the guard: `app/opengraph-image.tsx`, `app/trip/[id]/opengraph-image.tsx` (shared social cards stay English), `lib/seed/**`, `*.test.ts`. Allowlisted strings (not translated): the brand `Traver Planel` (`public-landing.tsx:140,242`), `404` (`not-found.tsx:8`), the price-level options `$`…`$$$$` (`place-form.tsx:105-108`), unit suffixes kept as symbols (`+1d`, `itinerary-ride-row.tsx:44`), emoji.

## Global Constraints

- **Keys:** flat snake_case (REQUIREMENTS §14 "Flat keyed strings"), `<area>_<subject>[_<qualifier>]`. Areas: `nav_`, `auth_`, `home_`, `trip_`, `err_`, `itin_`, `place_`, `map_`, `stay_`, `ride_`, `booking_`, `budget_`, `expense_`, `cal_`, `notes_`, `settings_`, `tripset_`. Qualifier suffixes: `_title`, `_body`, `_label`, `_placeholder`, `_aria`, `_hint`, `_toast`, `_error`. Plurals: `_one` / `_other`. Keep the existing 86 keys as they are (`save`, `cancel`, `done`, `share`, `landing_*`, …). A new key is unprefixed only if it is a verb reused in ≥ 3 areas.
- **Whole sentences only:** one key per sentence, with `{var}` placeholders. Never concatenate fragments (Thai word order differs). Product names (Google Maps, Traver Planel) stay inside the string.
- **Brand:** "Traver Planel" is intentional. Never "fix" it, and never translate it.
- **Glossary:** the copy/glossary plan's glossary is binding for both languages (Stay/ที่พัก, Transport/การเดินทาง, Place/สถานที่, Notes/โน้ต, Delete/ลบ, Remove/เอาออก).
- **Server components** use `const t = await tServer()`. **Client components** use `const t = useT()` (P0). Do not prop-drill `Dict`.
- **`th.json` must hold every `en.json` key** (parity test). At runtime a missing or empty Thai value falls back to English (REQUIREMENTS §14).
- **No new dependencies**: no next-intl, no i18next, no new ESLint plugin.
- Gates before every commit: `cd app && pnpm typecheck && pnpm lint && pnpm test` (tail -3).

## Review Focus

1. **Settings save silently flips language.** `settings/page.tsx:76` posts a hidden `lang` taken from `loadAccountSettings`, which defaults to `'en'` when no row exists. Once P6 un-forces, a user on Thai via cookie who saves Units would be reset to English. P6 replaces the hidden input with the real control seeded from the *resolved* language. Test `resolveLangFrom` precedence plus a manual check (Task P6).
2. **Interpolation drift.** A Thai string that drops or renames `{name}` renders literally. The parity test asserts identical placeholder sets per key (P0).
3. **Plural with `n = 0` / `1`** in English ("1 places"). `pluralKey` uses `Intl.PluralRules`. Test en 0/1/2 and th 1 (P0).
4. **Thai overflow.** Thai runs 10–30% longer and needs extra line height for upper/lower vowels. Map chips, the day switcher and toasts must not have a fixed width. P6 QA screenshots at 390 px, plus pseudo-loc (+30% length) in dev from P0.
5. **Server/client language mismatch:** a client `useT()` showing EN while the server rendered TH. Both read the single `lang` the root layout passes to `I18nProvider`. Test that `I18nProvider` gets `lang` from `getLang()` in the same render (P0 layout wiring; manual check P6).

---

### Task P0: Plumbing + lint ratchet (no strings moved)

**Files:**
- Modify: `app/src/lib/i18n.ts` (keep `getLang()` returning `'en'`; `DICTS.th = withFallback(en, th)`; when `process.env.I18N_PSEUDO === '1'` and `NODE_ENV !== 'production'`, build **`DICTS` itself** with `pseudoLocalize` applied to every value. It must be `DICTS`, not `getDict()`: `tServer()` → `tFor()` reads `DICTS[lang]` directly (`i18n.ts:37-46`) and never calls `getDict()`, so pseudo applied only in `getDict()` would leave every server-rendered string plain and make the P1–P5 "only ⟦…⟧ left" check useless)
- Modify: `app/src/lib/i18n-client.ts` (add pure helpers below; `makeT` unchanged)
- Create: `app/src/components/i18n-provider.tsx` (`'use client'`)
- Modify: `app/src/app/layout.tsx` (`const [lang, dict] = await Promise.all([getLang(), getDict()])`; wrap the body's providers in `<I18nProvider lang={lang} dict={dict}>`; `<html lang>` stays `"en"` until P6)
- Modify: `app/eslint.config.mjs` (ratchet block)
- Test: `app/src/lib/i18n-client.test.ts`; extend `app/src/lib/i18n-messages.test.ts` (created by the copy/glossary plan; create it here if that plan has not merged)

**Interfaces:**
- Produces:
  ```ts
  // lib/i18n-client.ts (client-safe)
  export function withFallback(en: Dict, th: Partial<Dict>): Dict;         // empty/missing th → en
  export function pluralKey(lang: Lang, base: string, n: number): MessageKey; // `${base}_${new Intl.PluralRules(lang).select(n) === 'one' ? 'one' : 'other'}`
  export function pseudoLocalize(s: string): string;                        // '⟦' + accented + ~30% pad + '⟧', {vars} untouched
  export function placeholders(s: string): string[];                        // sorted unique {var} names
  // components/i18n-provider.tsx
  export function I18nProvider(p: { lang: Lang; dict: Dict; children: React.ReactNode }): JSX.Element;
  export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string; // outside a provider: English dict, never throws
  export function useTp(): (base: string, n: number, vars?: Record<string, string | number>) => string; // t(pluralKey(lang, base, n), { n, ...vars }) — the ~90 plural ternaries use this
  export function useLang(): Lang;
  ```
  `Lang` moves to `i18n-client.ts` (client-safe) and is re-exported from `i18n.ts`, so client code never imports the `server-only` module.
- ESLint block (append after `...nextTs`):
  ```js
  const TEXT_ATTR = '/^(aria-label|placeholder|title|alt|label|description|hint|successMessage|reason|scopeLabel|scopeTitle|navLabel|confirmLabel|emptyLabel)$/';
  const WORD = '/[A-Za-z]{2,}/';
  const MSG = 'User-facing text: add a key to messages/en.json + th.json and use t()/useT().';
  const I18N_SELECTORS = [
    `JSXAttribute[name.name=${TEXT_ATTR}] Literal[value=${WORD}]`,                 // title="…", title={x ? '…' : '…'}
    `JSXAttribute[name.name=${TEXT_ATTR}] TemplateElement[value.raw=${WORD}]`,     // aria-label={`Remove ${name}`}
    `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > Literal[value=${WORD}]`, // {n === 1 ? 'stay' : 'stays'}
    `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > ConditionalExpression > ConditionalExpression > Literal[value=${WORD}]`,
    `CallExpression[callee.name='toast'] Property[key.name=/^(title|description)$/] Literal[value=${WORD}]`,
  ].map((selector) => ({ selector, message: MSG }));
  const I18N_DONE = ['src/components/trip-rail.tsx']; // grows each phase; P6 replaces with ['src/**/*.{ts,tsx}'] minus I18N_EXEMPT
  { files: I18N_DONE, rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true, allowedStrings: ['·','.','+',',','▾','‹','›','−','%','/',':','~','|','→','–','—','×','✕','…','Traver Planel','404','$','$$','$$$','$$$$','+1d'] }],
      'no-restricted-syntax': ['error', ...I18N_SELECTORS],
  } }
  ```
  The child-expression selectors use direct-child `>` on purpose: a descendant match also hits `className` strings inside `.map()` callbacks (`calendar-view.tsx:192`, `notes-view.tsx:140`). Measured on `6f6f7a2`, the five selectors produce 0 className/key false positives. Note `no-restricted-syntax` is one rule: a file-scoped block **replaces** any global `no-restricted-syntax` config for those files, so if one is ever added globally, merge the arrays.
  Seeded with `trip-rail.tsx`; P0 extracts its two remaining template labels (`` `${label} (coming soon)` ``, `` `${label} — coming soon` ``, `trip-rail.tsx:82,84`) unless the nav-labels plan already removed them. A flat-config `files: []` is invalid.

- [x] **Step 1: Failing tests**
  - `withFallback({a:'A',b:'B'}, {a:'ก', b:''})` → `{a:'ก', b:'B'}`.
  - `pluralKey('en','itin_places',1) === 'itin_places_one'`; `0` and `2` → `_other`; `pluralKey('th','itin_places',1) === 'itin_places_other'`.
  - `pseudoLocalize('Add to {day}')` starts with `⟦`, ends with `⟧`, still contains `{day}`, and its length ≥ 1.3 × the input length.
  - `i18n-messages.test.ts` (extend): for every key, `placeholders(th[k])` equals `placeholders(en[k])`. (Key parity and non-empty values are already asserted there by the copy/glossary plan.)
  - `useT()` with no provider returns the English string for `'save'` (pure helper test on the context default; no DOM needed).
- [x] **Step 2:** `cd app && pnpm vitest run src/lib/i18n-client.test.ts src/messages` → FAIL.
- [x] **Step 3:** Implement helpers, provider, layout wiring and ESLint block.
- [x] **Step 4:** Tests PASS. `pnpm lint` passes. Sanity-check the guard without touching files: pipe a snippet with `<p>Hello</p>`, `{a ? 'Edit stay' : 'Add stay'}`, `` aria-label={`Remove ${x}`} `` and `toast({ title: 'Saved' })` through `node_modules/.bin/eslint --stdin --stdin-filename src/components/trip-rail.tsx`: all four must error; `className={a ? 'flex' : 'hidden'}` and `{t('save')}` must not.
- [ ] **Step 5:** `I18N_PSEUDO=1 pnpm dev -p 3210` → the trip rail labels (server, `tServer`) and the home heading (`(home)/page.tsx`, `tServer`) render `⟦…⟧`; everything else stays plain (that is the un-extracted surface).
- [x] **Step 6:** Document in `AGENTS.md` Conventions: "UI text: keys in `messages/*.json`; `tServer()` in server components, `useT()` in client; files under the i18n ratchet fail lint on literals." Commit `feat(i18n): provider, fallback, plurals, pseudo-loc, lint ratchet [TP-XXXX]`.

### Phase task template (P1–P5)

Every extraction phase follows the same steps, so each phase below lists only its files, counts and notes.

- [ ] **Step 1 (failing test = the guard):** add the phase's files to `I18N_DONE`. `pnpm lint` → FAIL with the phase's count (± changes since `6f6f7a2`).
- [ ] **Step 2:** For each file: JSX text and listed attributes become `t('…')`. Then grep the same files for strings lint can't see and extract those too: `` rg -n "actionOk\(|actionError\(|metadata|label: '|`[A-Z][a-z]+[^`]*\$\{" <files> ``. Plurals go through `useTp()` / `pluralKey` with `_one`/`_other` keys, never a ternary. Static `export const metadata = { title }` becomes `generateMetadata()` using `tServer()`.
- [ ] **Step 3:** Add the keys to `en.json` (copy unchanged, except wording already fixed by COPY-01) and Thai drafts to `th.json` using the glossary and the review §8 TH column where it covers the string.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` → pass. `I18N_PSEUDO=1 pnpm dev -p 3210`: every screen in the phase shows only `⟦…⟧` text (any plain English left is a missed string). Fix and repeat.
- [ ] **Step 5:** PR description: a 3-column table `key | en | th` of the new keys (from `git diff -U0 src/messages/`) for the owner's Thai review. Thai is invisible until P6, so review comments can land in a follow-up commit. Commit `refactor(i18n): extract <area> strings [TP-XXXX]`.

### Task P1: Shell, auth, home, errors, skeletons (112 literals, 24 files)

`app/(home)/page.tsx` 3 · `app/error.tsx` 3 · `app/not-found.tsx` 3 · `app/sign-in/page.tsx` 11 · `app/sign-in/error/page.tsx` 3 · `app/sign-in/not-invited/page.tsx` 1 · `app/sign-in/verify-request/page.tsx` 6 · `app/invite/[token]/page.tsx` 16 · `app/trip/[id]/error.tsx` 4 · `app/trip/[id]/booking/loading.tsx` 1 · `app/trip/[id]/expense/loading.tsx` 1 · `components/header.tsx` 4 · `account-menu.tsx` 7 · `trip-grid-empty.tsx` 4 · `trips-browser.tsx` 7 · `trip-create-form.tsx` 13 · `trip-delete-button.tsx` 3 · `route-progress.tsx` 1 · `toast.tsx` 2 · `pending-saves.tsx` 2 · `confirm-dialog.tsx` 1 · `skeletons.tsx` 10 · `trip-rail-frame.tsx` 1 · `public-landing.tsx` 5 · `trip-cover.tsx` 8 (plurals; missing from the original list) · `trip-card.tsx` 1 (missing from the original list)

Notes: `public-landing.tsx` keeps `tFor(lang)` until P6. `header.tsx`'s `labels` prop from the header plan is replaced by `useT()` here (drop the prop and the layout's label building). Error boundaries (`error.tsx`) are client components and use `useT()`; their copy must not depend on the failed tree.

**Status: done in TP-0103** (27 files in `I18N_DONE`, 115 new keys; review added `app/trip/new/page.tsx`, whose `New trip` metadata title no phase listed). As built:
- `header.tsx` had no `labels` prop on main (header PR B was not built, D10), so it just calls `useT()`.
- `I18N_DONE` holds real paths; `eslint.config.mjs` escapes `[` so `[id]`/`[token]` routes are linted (`i18n-guard.test.ts` covers it).
- Server components made async for `tServer()`: `TripGridEmpty`, `TripCover` (plurals via `pluralKey`), and the skeletons' `LoadingRegion` (callers pass `labelKey`).
- Kept English on purpose: `error.message` from the thrown error (Decision 1), the not-invited `mailto:` subject (addressed to the owner), `trip-card.tsx` `MONTH` abbreviations in `formatDateRange` (date formatting → P6), language endonyms `EN`/`ไทย`.
- Signed-out surfaces other than the landing (rate-limit page on `/`, sign-in pages, root toasts/route progress) use `tServer()`/the root provider, i.e. forced `en` until P6, even when the landing shows ไทย.
- Allowlisted the decorative ✈️ in `allowedStrings`.

### Task P2: Itinerary + map: two PRs (P2a itinerary/place, P2b map surfaces)

**P2a** (no wait): `day-header`, `day-mode-picker`, `days-accordion`, `place-row`, `sortable-place-item`, `sortable-place-list` (missing from the original list), `segment`, `segment-mode-picker`, `optimize-strip`, `place-form`, `place-manual-form`, `place-note-modal`, `place-note-launcher` (missing from the original list), `place-preview-card`, `place-search-picker`, `search-attribution`, `itinerary-ride-row`. **P2b** (after the map plans merge): `pin-card`, `persistent-map`, `map-panel-toggle`, `map-stop-carousel`, `real-map-canvas-google`, `real-map-canvas-maplibre`, `google-refresh-button`, `map-preview-marker` (template attrs `Preview: ${name}`), `use-poi-preview.ts` (toasts; `.ts`, so only the toast selector applies).

Original per-file counts (two original rules only):

`day-header.tsx` 4 · `day-mode-picker.tsx` 9 · `days-accordion.tsx` 2 · `place-row.tsx` 8 · `sortable-place-item.tsx` 2 · `segment.tsx` 4 · `segment-mode-picker.tsx` 4 · `optimize-strip.tsx` 3 · `place-form.tsx` 32 · `place-manual-form.tsx` 14 · `place-note-modal.tsx` 5 · `place-preview-card.tsx` 6 · `place-search-picker.tsx` 8 · `search-attribution.tsx` 4 · `pin-card.tsx` 2 · `persistent-map.tsx` 1 · `map-panel-toggle.tsx` 3 · `map-stop-carousel.tsx` 6 · `real-map-canvas-google.tsx` 3 · `real-map-canvas-maplibre.tsx` 3 · `google-refresh-button.tsx` 1

Also (not flagged by lint): `` `Day ${day.idx + 1} · ${day.label} ${day.num}` `` (`persistent-map.tsx:137`) → `t('map_day_chip', { n, weekday, num })`. `` `Day ${day.idx + 1}` `` (`days-accordion.tsx:318`) → `itin_day_n`. `map-preview-marker.tsx:53` `Add to {day}` → `map_add_to_day`. `` `Stop ${pin.idx}` `` in `map-stop-carousel.tsx`. Toasts in `use-poi-preview.ts` and `place-search-picker.tsx` ("Place added", "Couldn't add place", "Couldn't load that place"). `itinerary-ride-row.tsx` `TYPE_LABEL` → `ride_type_<type>` keys (`flight|train|car|ferry`). `day.label` (weekday) comes from server data formatting and is handled in P6 with the locale. Google's own attribution strings ("Powered by Google") stay as they are (ToS).

**Status: P2a done in TP-0104** (21 files in `I18N_DONE`, 149 new keys; English byte-identical, checked by matching every new `en` value against the removed `origin/main` literals). As built:
- Added beyond the P2a list (no phase had them): `location-field.tsx` (only used by `place-manual-form`), `place-preview-modal.tsx` (already clean, now guarded), and the place pages `trip/[id]/place/[placeId]/edit/page.tsx` + `trip/[id]/day/[dayId]/place/new/page.tsx` (static `metadata` → `generateMetadata()`). `segment-fix.ts` has no copy; its "No location for {name} · Fix location" lives in `segment.tsx`.
- `place-form.tsx` is an async server component (`tServer()`); `place-row`, `segment`, `optimize-strip`, `search-attribution` gained `'use client'` (all were already rendered only from client components) so they can call `useT()`.
- Mode labels are shared keys `itin_mode_{mixed,drive,walk,transit}`; the day-mode confirm body takes `{mode}` = the label lower-cased (`"drive"`, as before). `itinerary-ride-row` `TYPE_LABEL` → `ride_type_{flight,train,car,ferry}` (itinerary says "Car"; P3's booking card says "Car rental", so it needs its own key). `itin_day_n` feeds the map preview's `dayLabel`; its fallback is `itin_day_generic` ("day").
- Inline-element sentences are one key split around the placeholder: `itin_optimize_body` (`{time}` bold), `itin_segment_no_location` (`{name}` bold), `place_attr_powered_by` (`{provider}` = the Geoapify link).
- `lib/places/parse-location.ts` `LOCATION_ERROR_COPY` → `LOCATION_ERROR_KEY` (parse error → key). `statusBadgeLabel` (google-sync) stays English for its tests; `place-row` maps its result to `place_status_closed_*`.
- Manual-form categories: the stored value stays English (Decision 4), only the option label is a `place_cat_*` key. Same for the price option `Free`.
- Kept as they are in every language (Thai value = English): `Google Maps`, `Powered by {provider} · © OpenStreetMap` (attribution ToS), the example address placeholder. `https://…` placeholder is a constant; `1h 30m`, `4.5`, `1200`, the phone and the coordinates placeholders are not words and stay literal.
- Shared error description `err_try_again_body` ("Try again.") for the toasts; reused existing `add_day`, `add_place`, `open_in_maps`, `cancel`, `save`.
- Day titles (`Day 1`, stored) and `dayHours.weekday` are data: P6 / Decision 4.

**Status: P2b done in TP-0105** (21 files in `I18N_DONE`, 42 new keys; English byte-identical, checked by matching every new `en` value against the removed `origin/main` literals and every removed literal against `en.json`; the composed strings (`pinTitle`, `mapSummary`, `emptyDayNote`, the active day chip) keep their original English test expectations). As built:
- Added beyond the P2b list (files the later map plans created, or no phase had): `map-day-bar.tsx` ("Trip days", "Previous day"/"Next day", chips), `map-degraded-chip.tsx`, `map-pin.tsx` (`Preview: {name}`, `pinTitle` fallback), plus copy-free map files now guarded: `map-search-button`, `map-ghost-dot`, `real-map-canvas`, `map-route-{google,maplibre}`, `pin-picker-map{,-google,-maplibre}`, `google-map-error-boundary`.
- Pure helpers take the caller's translator (pattern from P3's `arrivalBadge(a, t)`); `Translate` / `TranslatePlural` types now live in `lib/i18n-client.ts`: `pinTitle(pin, t)` (`map_pin_title[_time]`), new `stopName(p, t)` (name, else `map_stop_n` "Stop {n}"; replaces the inline "Stop n" fallbacks in the pin card, carousel, ghosts, preview distance and map summary), `groupTitle(g, t)`, `ghostTitle(g, t)`, `dayTitle(d, t)`, `dayChip(d, t, active)`, `mapSummary(day, pins, t, tp)` (plural `map_summary_*`), `emptyDayNote(n, f, t)` (one whole-sentence key per fallback), `formatNear(n, units, t)` / `suggestionNear(s, pins, units, t)`. `nearestStop` returns `{ stop, meters }` and `GhostPin` carries `name?` + `idx`, so the "Stop n" fallback is resolved at display time. `DEGRADED_LABEL` and `travelChipLabel` are gone (keys `map_degraded_label`, `map_travel_total_aria`).
- Key names: the plan's `map_day_chip` for `Day {n} · {weekday} {num}` is `map_day_title` (matches `dayTitle`); `map_day_chip` is the short `D{n}` chip and `map_day_chip_active` its `D{n} · {weekday} {num}` form. `map_add_to_day` as planned.
- Reused: `itin_day_n` / `itin_day_generic` (POI preview `dayLabel`), `place_search_near` (map preview "≈ {dist} from {stop}", same string as the search rows), `itin_segment_navigate` (carousel Navigate), `place_preview_close` (pin card ✕), `place_added_toast`, `place_add_error_toast`. The Google refresh outcomes are `place_refresh_*` (`error` and `unavailable` share one key, as before).
- The carousel's screen-reader prefix keeps its trailing space in markup (`{t('map_carousel_stop_prefix')} </span>`), so the button name stays "Stop 1: Senso-ji".
- Kept as they are: `pin.category` (stored, Decision 4), `MapDay.label` weekday and `summaryDistance`/`summaryTime` (server formatting → P6), `degradedLogLine` (console only), Google/OSM attribution, the `/` shortcut glyph.

### Task P3: Bookings: stays + transport (158 literals, 13 files)

`bookings-view.tsx` 22 · `booking-card-ride.tsx` 7 · `booking-card-stay.tsx` 10 · `hotel-form-client.tsx` 42 · `hotel-place-picker.tsx` 1 · `transport-form-client.tsx` 35 · `transport-place-picker.tsx` 2 (original counts; ~176 with the extended selectors)

Notes: **do not extract the dead hotel chain; delete it** (if `ds-modal-consolidation` has not already). Verified at `6f6f7a2`: `hotels-view.tsx` has no importer; `hotel-edit-launcher.tsx` and `hotel-search-picker.tsx` are imported only by `hotels-view.tsx`; `hotel-preview-modal`, `hotel-dates-modal`, `hotel-manual-form` only by `hotel-search-picker.tsx`; `hotel-edit-modal` only by `hotel-edit-launcher.tsx`. That is 7 files and ~100 flagged strings the original P3 would have translated for nothing. `hotel-place-picker.tsx` is live (imported by `hotel-form-client.tsx`). `booking-card-ride.tsx:13` `TYPE_LABEL` reuses P2's `ride_type_*` keys (if P3 lands first, P3 creates them). Undo toast strings from the header plan ("Booking deleted", "Undo", "Booking restored", "Couldn't restore booking"; the glossary makes it *deleted*) → `booking_deleted_toast`, `undo`, `booking_restored_toast`, `booking_restore_error`. Split stays/transport into two PRs if review prefers (transport = `transport-form-client.tsx` + `transport-place-picker.tsx`).

**Status: done in TP-0106** (14 files in `I18N_DONE`, 114 new keys; one PR, not split; English byte-identical, checked by matching every new `en` value against the removed `origin/main` literals and every removed literal against `en.json`). As built:
- The dead hotel chain was already deleted by TP-0078 (#92); nothing to delete here.
- Added beyond the P3 list: the server wrappers `hotel-form.tsx` / `transport-form.tsx` (no copy, now guarded) and the five booking pages (`trip/[id]/bookings/page.tsx`, `booking/{hotel,transport}/new/page.tsx`, `booking/{hotel,transport}/[bookingId]/edit/page.tsx`): static `metadata` → `generateMetadata()`.
- Keys: `booking_*` (list, Undo toasts, shared form fields), `stay_*`, `ride_*`, plus `undo`. Reused: `bookings`, `hotels` (the "Stays" filter tab), `transport`, `delete`, `cancel`, `notes`, `trip_nights_*`, `place_load_error`, `err_try_again_body`, `ride_type_{flight,train,ferry,car}`. The booking card's car label is its own key, `ride_type_car_rental` ("Car rental"); the form's type picker keeps `ride_type_car` ("Car").
- The header count is two plurals, `booking_stays_*` · `booking_rides_*` ("2 stays · 1 transport booking"). The transport preview "Arrives **{arrival}**" is one key split around `{arrival}`.
- `lib/booking-format.ts` `bookingsEmptyCopy` → `bookingsEmptyKeys` (filter → keys). `lib/transport-compute.ts` `arrivalBadge(a, t)` takes the caller's translator (`ride_arrival_*`; tested in en and th). The English `nightsLabel` helpers in `booking-format.ts` and `hotel-compute.ts` are deleted; the card and form use `tp('trip_nights', n)`.
- Kind/mode comparisons inside a `title` attribute (`pendingDelete?.kind === 'ride'`, the overlay title) are hoisted into consts: the guard flags any word literal under a text attribute.
- Kept as they are: the computed transport title (`computeTitle`, stored as the booking's `title`, Decision 4; the form preview shows what will be saved), example values in placeholders as module constants (`ABC123`, `JL5 · 3XK9Q2`, `LAX`/`NRT`, `14A`, `Toyota Alphard`), restore errors from the server (`result.message`, Decision 1), and the `en-US` date formatting (`dayHeading`, `formatDay`, the arrival date, `shortDate`) → P6.

### Task P4: Budget, expenses, calendar, notes (110 literals, 5 files)

`budget-view.tsx` 29 · `budget-settings-form.tsx` 17 · `expense-form.tsx` 24 · `calendar-view.tsx` 19 · `notes-view.tsx` 21 · `expense-modal-host.tsx` (missing from the original list) — ~180 with the extended selectors, mostly plural ternaries in `budget-view.tsx` / `budget-settings-form.tsx`

Also `app/actions/budget.ts` (3 `actionOk/actionError` literals that the UI shows). Budget category labels (`BUDGET_CATEGORIES[].label`, passed in `settings/page.tsx`) → `budget_cat_<id>` keys looked up at render time.

**Status: done in TP-0107** (16 files in `I18N_DONE`, 146 new keys; English byte-identical, checked by a script that matches every static fragment of each new `en` value against the removed `origin/main` source (plural ternaries expanded per branch) and every removed word literal against `en.json`). As built:
- Added beyond the P4 list: `budget-merge-button.tsx` (TP-0082) and `calendar-trip-range.tsx` (TP-0087), both newer than the plan, plus the area's pages: `trip/[id]/{budget,calendar,notes}/page.tsx` and `expense/new` + `expense/[expenseId]/edit` (static `metadata` → `generateMetadata()`; the expense pages' and budget page's `Day {n} · {date}` option label → `expense_day_option`) and the three `loading.tsx` (no copy, now guarded).
- `budget-view`, `calendar-view`, `calendar-trip-range` and `notes-view` are server components and became `async` (`tServer()`, plurals via `pluralKey(lang, …)`); their sync sub-components (`ChipList`, `Column`, the notes sections, `formatRel`) take the caller's `t`.
- Category labels are keys; the stored value stays the category id. The budget page and the expense form label categories differently on main ("Food & dining" vs "Food", "Misc" vs "Other"), so there are two sets: `budget_cat_*` and `expense_cat_*`. The `other` category reads `budget_cat_misc` / `expense_cat_misc`, because the parity test treats any `_other` suffix as a plural. `BudgetSettingsForm` now takes `categories: ExpenseCategory[]` and labels them itself, so `trip/[id]/settings/page.tsx` (P5) passes ids only. Budget basis options → `budget_basis_*` (stored value unchanged).
- `app/actions/budget.ts` is form-only, so its messages (missing trip, forbidden, session expired, currency format, "Budget saved") are `budget_*` keys via `tServer()`. `parseBudgetConfig` errors stay English (shared with REST, Decision 1).
- Sentences split around an element: the no-budget banner (`budget_none_body`, `{link}`), the currency-relabel warning (`budget_relabel_body_*`, `{strong}` = "not converted"), the expense form's bookings note (`expense_bookings_note`, `{link}`). The hero split stays two keys (`budget_hero_in_bookings` is the link text, `budget_hero_other_expenses` the span) joined by the allowlisted ` + `.
- Plurals that were ternaries: `budget_unpriced_title_*`, `budget_excluded_title_*`, `budget_items_*`, `budget_relabel_body_*`, `cal_bookings_*`, `cal_outside_*`. Strings that were always plural on main stay one key so English is unchanged: `notes_count` ("{checklists} checklists · {docs} docs"), `cal_more` ("+{n} more").
- Reused: `budget`, `calendar`, `notes`, `save`, `cancel`, `delete`, `trip_travelers_*`, `trip_places_*`, `booking_stays_*` / `booking_rides_*` (the unpriced breakdown), `booking_additional_info`, `booking_save_changes`, `booking_discard_title` / `booking_discard_confirm`, and the calendar legend `stay_kind_label` + `ride_type_{flight,train,car,ferry}`.
- Kept as they are: new notes' default titles `New checklist` / `New doc` (stored as the note title, Decision 4; module constants), the expense row label fallback to the raw category id (`expense-queries.ts`), merge-suggestion labels (user data), and all date/number formatting (`fmt`/`fmtDate` with `undefined` locale, `formatRange`, `formatRel`'s `en-US` date, `monthShort` in the aria label) → P6.

### Task P5: Account + trip settings (85 literals, 7 files)

`app/settings/page.tsx` 21 · `app/trip/[id]/settings/page.tsx` 31 · `settings-folio.tsx` 5 · `api-tokens-section.tsx` 13 · `invite-link-reveal.tsx` 4 · `trip-settings-form.tsx` 8 · `trip-settings-delete.tsx` 3

Also `app/actions/settings.ts` `actionOk('Preferences saved')` → the `ActionForm successMessage` is already passed from the page (`settings/page.tsx:69`). Use the key there and keep the action's literal as the API fallback (Decision 1). `app/actions/trips.ts` (1 literal). The Language field stays "deferred" until P6, but its copy is extracted now.

**Status: done in TP-0108** (10 files in `I18N_DONE`, 74 new keys; English byte-identical, checked by a script that runs the guard on each `origin/main` file and matches every flagged literal against `en.json`, and matches every static fragment of each new and reused `en` value against the `origin/main` source. The only intended change is the API token error toasts below). As built:
- Added beyond the P5 list: `trip/[id]/settings/loading.tsx` and the form shells the panes render, `action-form.tsx` and `submit-button.tsx` (no copy, now guarded). `budget-settings-form.tsx` was already guarded in P4 and the page passes it category ids only.
- Both pages are async server components (`tServer()`); static `metadata` → `generateMetadata()` (`settings`, `tripset_title`). The client components (`settings-folio`, `api-tokens-section`, `invite-link-reveal`, `trip-settings-form`, `trip-settings-delete`) use `useT()`.
- `SettingsFolio` no longer composes copy from `scopeLabel`: the phone back link was `All {scopeLabel.toLowerCase()} settings`, now a required `backLabel` prop (`settings_back_all` / `tripset_back_all`), and `navLabel` is required (its `` `${scopeLabel} settings sections` `` fallback was dead: both callers pass it).
- `saveSettingsAction` and `updateTripAction` are form-only, so their messages are keys via `tServer()` (pattern from P4's `budget.ts`): `settings_saved_toast`, `tripset_saved_toast`, `tripset_err_missing_trip`. The plan's "keep the action's literal as the API fallback" would not work: `ActionForm` toasts `result.message ?? successMessage`, so an English literal in the action wins in every language. `ServiceError` messages from `updateTrip` and the shared `AUTH_MESSAGES` in `lib/action-result.ts` stay English (Decision 1).
- `api-tokens-section.tsx` toasts no longer show `err.message` (redacted in production, raw in dev): they log with `logActionFailure` and show `settings_token_{create,revoke}_error` + `err_try_again_body` ("Try again."), the `lib/action-errors.ts` pattern. This is the one visible English change. The map callbacks' `t` parameter was renamed (`token`, `list`) so it no longer shadows the translator.
- Sentences around inline elements are one key split on the placeholder: `settings_token_hint` (`{code}` = the `Authorization: Bearer <token>` module constant) and `tripset_intro` (`{link}` = "account settings").
- Reused: `settings`, `settings_title`, `nav_all_trips`, `nav_loading_aria` (the folio's link spinner), `appearance`, `language`, `done`, `role_editor` / `role_viewer` (member tags), `trip_delete_label` / `trip_delete_confirm_title` / `trip_delete_confirm_body` (same copy as the home card's delete), `trip_new_dates_label` / `trip_new_start_aria` / `trip_new_end_aria` / `trip_new_date_error` (same date fields as the create form), `booking_save_changes`, `err_try_again_body`. `settings_copy_once` ("Copy this now — it won’t be shown again.") is shared by the token and invite reveals, `settings_revoke` by tokens and invites.
- Kept as they are: the example address placeholder `friend@example.com` (module constant), the `.ics` filename (built from the trip slug), member names/emails, and the date formatting (`formatInviteExpiry` with `undefined` locale, the token list's bare `toLocaleDateString()`) → P6.
- Left for P6 (not in any phase, not lint-visible): `app/layout.tsx` metadata `description` (the landing tagline), `components/saved-ago.tsx` (`Saved` prefix and `formatAgo`'s "just now" / "{n}m ago", which the original `saved_*` keys already cover), `lib/action-result.ts` `AUTH_MESSAGES` (shown inline by every `ActionForm`; Decision 1 or a key per message), and the `en-US` date in `app/trip/[id]/page.tsx`. After P5 the guard run over all of `src/` flags only `app/opengraph-image.tsx` (2 literals, exempt).

### Task P6: Un-force `getLang()`, `<html lang>`, locale-aware dates, Language control

**Files:**
- Create: `app/src/lib/lang-resolve.ts` (pure)
- Test: `app/src/lib/lang-resolve.test.ts`, `app/src/lib/week.test.ts` (extend)
- Modify: `app/src/lib/i18n.ts` (`getLang = cache(async () => process.env.I18N_FORCE_EN === '1' ? 'en' : resolveLangFrom({ cookie: (await cookies()).get('lang')?.value, acceptLanguage: (await headers()).get('accept-language') }))`; remove the "FUTURE ENHANCE" comment). **No `auth()` and no DB read:** the root layout calls `getLang()` on every request, sessions are database sessions (`lib/auth.ts:56`), and the root layout is deliberately DB-free so `/` can stream its skeleton before it knows who is asking (`lib/session-cookie.ts:1-3`, TP-0072).
- Modify: `app/src/lib/auth.ts` `callbacks.signIn` (:71) or `events.signIn`: after a successful sign-in, if the user has a `user_settings` row, set the `lang` cookie from `row.lang` (same options as `actions/settings.ts:47`). This is what makes the account setting follow the user to a new device. Verify `cookies().set()` takes effect inside the Auth.js callback route; if it does not, drop this step and accept per-device language until the user saves Settings once (document it in REQUIREMENTS §14).
- Modify: `app/src/lib/landing-lang.ts` (keep `langFromAcceptLanguage`; remove `getLandingLang`) and `components/public-landing.tsx:125` (`getLang()`)
- Modify: `app/src/lib/week.ts:10` (`th: 'th-TH-u-ca-gregory'`)
- Modify: `app/src/app/layout.tsx:63` (`lang={lang}`, closes review A8)
- Modify: `app/src/app/settings/page.tsx` (replace the Language `SettingsDeferred` with `SettingsSegmented name="lang"` options `english`/`thai`, `defaultValue` = resolved lang; delete the hidden `lang` input at :76)
- Modify: date/number sites → `localeTag(lang)`: `components/trip-card.tsx` `formatDateRange` (hard-coded English `MONTH` abbreviations; found in P1), `lib/booking-format.ts:23,31` (add a `locale` param), `app/trip/[id]/page.tsx:253`, `components/bookings-view.tsx:69`, `calendar-view.tsx` (already takes a `locale`; check its source at :46,51,455,460), `api-tokens-section.tsx:175` (`toLocaleDateString()` with **no** locale: browser locale, a hydration-mismatch source), `hotel-form-client.tsx:78`, `notes-view.tsx:363`, `transport-form-client.tsx:233`, `budget-view.tsx:80,89`, `app/trip/[id]/settings/page.tsx:51`. **Keep** `lib/places/utc-offset.ts:5` `'en-US'`: it parses an offset string and is not display text.
- Modify: `app/src/app/globals.css` (`:lang(th) body { line-height: 1.6; }`, the extra room Thai upper/lower vowels need per review §8; font-size minimums are review A7's separate ticket)
- Modify: `app/.env.example` (`I18N_FORCE_EN=` kill switch, `I18N_PSEUDO=` dev only)

**Interfaces:**
- Produces: `export function resolveLangFrom(i: { cookie: string | undefined; acceptLanguage: string | null }): Lang`. Precedence: valid `cookie` → `langFromAcceptLanguage(acceptLanguage)` → `'en'`.

- [x] **Step 1: Failing tests**
  - `resolveLangFrom({ cookie:'th', acceptLanguage:'en' })` → `'th'` (Decision 3).
  - `{ cookie:'xx', acceptLanguage:'th-TH,th;q=0.9' }` → `'th'`; `{ cookie: undefined, acceptLanguage: null }` → `'en'`.
  - `new Date('2026-10-29T00:00:00Z').toLocaleDateString(localeTag('th'), { year:'numeric', timeZone:'UTC' })` contains `2026` (Decision 2); `weekStart(localeTag('th'))` is unchanged (existing test).
- [x] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** PASS + gates.
- [x] **Step 5:** Flip the ratchet: `I18N_DONE = ['src/**/*.{ts,tsx}']` with `ignores: I18N_EXEMPT` (OG images, `lib/seed/**`, `**/*.test.ts`). `.ts` matters for the `toast(...)` selector (`use-poi-preview.ts`). `pnpm lint` passes (else a straggler was missed: extract it).
- [ ] **Step 6: Thai QA.** With `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, Settings → Language → ไทย → Save. Playwright 390×844 and 1440×900 on `/`, `/trip/79efe162-dfb2-46c2-ad46-a34695771b8b` (itinerary, full-map + carousel, pin card, search preview), bookings, budget, calendar, notes, settings, trip settings, sign-in (signed out, cookie `lang=th`). Check: no English left except brand/Google attribution and user data; no clipped chip/toast/button; `<html lang="th">`; years 2026; saving Units keeps ไทย (Review Focus 1). Then switch back to English and repeat a spot check.
- [ ] **Step 7:** `I18N_FORCE_EN=1` → the whole app is English again (rollback without revert).
- [x] **Step 8:** Commit `feat(i18n): language follows settings/cookie; Thai enabled [TP-XXXX]`.

**Status: built in TP-0109** (steps 6–7, browser QA and the `I18N_FORCE_EN` spot check, are the orchestrator's). Four commits: language resolution, dates/numbers, guard flip, docs. English is unchanged: every English date/number site still formats with `en-US` (`localeTag('en')`, asserted), the hand-rolled formatters (`trip-card` range, `formatAgo`) keep their old code path and have tests comparing them with the pre-P6 functions verbatim, and the dnd-kit keys are the library's English defaults word for word. As built:
- `lib/lang-resolve.ts` (pure): `resolveLangFrom`, plus `LANG_COOKIE` / `LANG_COOKIE_OPTIONS` shared by `saveSettingsAction`, `setLandingLangAction` and sign-in. `lib/landing-lang.ts` keeps only `langFromAcceptLanguage` + `isLang` (now pure, no `server-only`/`next/headers`). `getLang()` is `cache()`d and reads `cookies()` + `headers()`; `i18n.test.ts` mocks `next/headers` and covers cookie → Accept-Language → `en` and `I18N_FORCE_EN`.
- Caching: unchanged. The root layout already read `cookies()` (theme, session flag), so every page route was already dynamic; `pnpm build` prerenders the same set as before (`/_global-error`, icons, `/opengraph-image`). The OG images don't render the layout and stay English.
- Sign-in seeding: Auth.js `events.signIn` (not `callbacks.signIn`, which runs before the user row exists and returns the invite-gate verdict) reads `user_settings.lang` and sets the cookie. Verified in the source rather than in a browser: the event runs inside the `/api/auth/callback/*` route handler, and Next 16 merges `cookies().set()` from a route handler into whatever `Response` the handler returns (`app-route/module.js`, `appendMutableCookies`). No row (Language never saved) leaves the cookie alone, so a landing pick survives. A failure is logged and never blocks sign-in. Caveat: pre-P6 rows all hold `lang='en'` (the hidden input posted the default), so a user who ever saved Settings is put back on English at sign-in until they pick ไทย once.
- Settings: the hidden `lang` input is gone; Language is `SettingsSegmented name="lang"` (`english`/`thai` keys) seeded from `getLang()`. `settings_language_deferred` is deleted. The saved toast is `tFor(lang)` with the language just posted (the request still carries the old cookie), and `setLandingLangAction` now revalidates `('/', 'layout')` so `<html lang>` and the client dictionary refresh too.
- `<html lang={lang}>` was already bound by ds-foundations; the landing wrapper's own `lang` is dropped. `globals.css` is untouched: Thai leading is foundations' `[lang|='th']` block (cross-plan note), which now applies app-wide.
- Leftovers from P5: root `generateMetadata()` (description = `landing_title`); `SavedAgo` → `saved_ago` "Saved {ago}" + `formatAgo(ms, t)` (new `saved_sec_ago`; its `prefix` prop had no caller and is gone); `AUTH_MESSAGES` → `err_session_expired_save` / `err_forbidden_change` via `tServer()` (`toActionResult` is called only from form actions); the trip page's `en-US` cover date.
- Dates/numbers (all `localeTag(lang)`): `trip-card` (`formatTripRange` in new `lib/date-format.ts`; Thai via `Intl.DateTimeFormat#formatRange`, "12–15 ก.ค. 2026"), `booking-format.ts` `formatCost`/`shortDate` (+`locale` param, default `en-US`) and their callers, `bookings-view` `dayHeading`, `hotel-form-client` `formatDay`, `transport-form-client` arrival, `budget-view` money + dates (was `undefined` = server default `en-US`), `notes-view` `formatRel`, trip settings `formatInviteExpiry` (was `undefined`), `api-tokens-section` last-used (was bare `toLocaleDateString()`, the browser locale: hydration mismatch fixed), trip page cover dates. The calendar already took a locale; it now gets Gregorian Thai through `localeTag`.
- `localeTag('th')` = `th-TH-u-ca-gregory`. ICU's Thai `weekday: 'short'` is the full name (อาทิตย์), so `week.ts` gained `shortWeekday(locale)` (`narrow` for Thai: อา, จ, …; `short` elsewhere) used by the calendar header, the calendar trip-range columns and day chips.
- Day weekday/date (`day.label` "Sat", `day.date` "Saturday, April 12") are English text stored on the day row. `dayDisplay(stored, iso, lang)`: English shows them as stored; Thai formats `startDate + idx` (else `day.dateIso`). Applied to the itinerary day chips/header, `MapDay.label` (map day bar/titles) and the expense pages' day options (`expense_day_option`, from `day.dateIso`).
- Times: D2 (times follow the UI language) was already built by `lib/clock.ts` for places, rides and pins (Thai `15:00`). Booking cards and the calendar trip range still print the stored raw times; formatting them would change English (`11:45` → `11:45 AM`), so that stays the INDEX hand-off it was.
- Distances/durations: `summaryDistance`/`summaryTime` are stored strings and `formatDistance`/`formatNear`/the transport-form duration build unit symbols (`8.4 km`, `5.2 mi`, `350 ft`, `1h 30m`); kept as symbols in every language, like `+1d`.
- dnd-kit: `sortable-place-list` passes `accessibility.announcements` + `screenReaderInstructions` from `itin_dnd_*` keys. English values are dnd-kit's defaults verbatim (still announcing item ids, as before); naming the place instead is an a11y follow-up for both languages.
- Guard: `I18N_DONE` → `I18N_FILES = ['src/**/*.{ts,tsx}']` with `ignores: I18N_EXEMPT` (`app/opengraph-image.tsx`, `app/trip/[[]id]/opengraph-image.tsx`, `lib/seed/**`, `lib/seed-trip.ts`, `lib/seed-days.ts`, `**/*.test.ts`). Without the exemptions only `app/opengraph-image.tsx` would flag (2). Stragglers found by grep (not lint-visible): `PlaceAutocomplete`'s default placeholder (the place form shows it) and its load error → existing `place_search_placeholder` / `place_load_error`. Left English on purpose (Decision 1): errors thrown from server actions (`Invalid invite`, `Amount is required`, …) reach the error boundary as `error.message`.
- Not changed: REST/MCP JSON, `.ics` export, OG images, stored data. No API.md / agent-skill change (nothing agent-visible).

### Task P7: Docs (fold into P0 and P6 PRs)

- [x] P0 PR: `AGENTS-INDEX.md` Components: `i18n-provider.tsx` (`I18nProvider`, `useT`, `useLang`). Lib: update the `i18n.ts / i18n-client.ts` row (fallback, `pluralKey`, `pseudoLocalize`). Add a "How to add things → UI text" bullet: key naming + ratchet.
- [x] P6 PR: `AGENTS-INDEX.md` Lib: `lang-resolve.ts`; `landing-lang.ts` row (only `langFromAcceptLanguage` now); `auth.ts` (sign-in seeds the `lang` cookie). `REQUIREMENTS.md` §13: Language is live; §14: add "Resolution: `lang` cookie (written by Settings, the landing switch, and sign-in from the account setting) → Accept-Language → `en`; Thai dates use the Gregorian calendar; `I18N_FORCE_EN=1` kill switch." `ARCHITECTURE.md` env list: `I18N_FORCE_EN`, `I18N_PSEUDO`.
