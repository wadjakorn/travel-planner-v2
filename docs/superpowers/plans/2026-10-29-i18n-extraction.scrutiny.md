# Scrutiny: 2026-10-29-i18n-extraction.md

Outsider review, traced against `main` @ `6f6f7a2`. Applied fixes are marked **[applied]**. Fixes left for the user are marked **[open]**.

## Intent

Move the hard-coded English UI text into `messages/{en,th}.json`, add a lint guard so new literals can't come back, then make the language follow the user so Thai works across the app.

**Simpler alternative pass.**
- *Adopt next-intl.* The old `i18n.ts` header even says "swap to next-intl". It would give plurals, ICU and the RSC/client split for free. The plan's own helpers come to about 60 lines (`withFallback`, `pluralKey`, `pseudoLocalize`, a context provider), and the app needs only 2 languages and flat keys (REQUIREMENTS §14). The no-new-dependency choice is reasonable. Not a finding.
- *Skip the ratchet and just extract.* No. Without a guard, the ~840 literals regrow. Keep the guard, but make it actually catch the strings (B1).
- *Server-only `t()` with labels passed as props* (what the header plan does) instead of a client provider. That doesn't scale to ~60 client components, so the provider is right. Cost: one dictionary (~86 keys today, ~800 later; ≈30 KB raw, ≈8 KB gzip) inlined in the root layout's RSC payload on each full page load. Root layouts are not re-sent on soft navigations. Acceptable.

## Trace

- `lib/i18n.ts` is `server-only`. `tServer()` = `tFor(await getLang())`, and `tFor` reads `DICTS[lang]` directly (`i18n.ts:37-46`). `getDict()` is a separate path that nothing calls today. `getLang()` returns `'en'` (`:17-19`).
- `lib/i18n-client.ts` `makeT(dict)` has **no callers** (grep). Client components currently get no translations at all. The only `t()` users are server code: `trip-rail.tsx:57`, `(home)/page.tsx:44`, `sign-in/not-invited/page.tsx:27`, and `public-landing.tsx:126` (`tFor(getLandingLang())`).
- The root layout (`app/layout.tsx`) reads only `cookies()`, and it is deliberately DB-free: `lib/session-cookie.ts:1-3` says "no DB lookup, so it can run in the root layout on every request for free". Sessions are database sessions (`lib/auth.ts:56`), so `auth()` is a DB query.
- `saveSettingsAction` writes the `lang` cookie on every save, signed in or not (`actions/settings.ts:44-47`), then calls `revalidatePath('/', 'layout')`. The landing switch writes the same cookie (`:83-88`).
- The ESLint rules come from `eslint-plugin-react@7.37.5`, which `eslint-config-next` registers. I re-ran the plan's measuring command: **607 hits in 73 files** (plan: ~606 / 71). Then I tested both rules with `eslint --stdin`, which needs no file writes.

## Findings

### B1. The guard misses whole classes of user-facing strings, so "can't creep back in" is false **[applied]**
- **Evidence.** I ran `eslint --stdin` with the plan's exact rules on a snippet. Flagged: `<p>`-style text and `` {`${n} places`} ``. **Not flagged:** `{a ? 'Edit stay' : 'Add stay'}`, `{a && 'Saved'}`, `title={a ? 'Delete this' : 'Remove that'}`, `` aria-label={`Remove ${name}`} ``, `confirmLabel="Remove"`. At HEAD that means about 87 plural ternaries in JSX children (`bookings-view.tsx:240`, `budget-view.tsx:213,221`, `trip-cover.tsx:19-20`, …), about 39 conditional attribute values (`bookings-view.tsx:456`), 28 template-literal attributes, and 21 `toast({title})` calls. That is roughly 175 strings the guard can't see, and the P6 "flip to `src/**` and lint passes" step would sign off on them.
- **Why it matters.** P6 would turn Thai on with English plurals and aria-labels scattered through every screen, while CI stays green.
- **Change.** The plan now has five `no-restricted-syntax` selectors: attribute descendant `Literal`, attribute `TemplateElement`, direct-child conditional/logical literals in JSX children, nested ternary, and `toast()` title/description. It also adds `confirmLabel`/`emptyLabel` to the attribute list and allowlists the brand, `404`, `$…$$$$` and `+1d`. I measured the selectors on the repo: the direct-child form gives **0 className false positives**. The descendant form hit `className` strings inside `.map()` callbacks (`calendar-view.tsx:192`, `notes-view.tsx:140`), which is why the plan pins `>`. The P0 sanity check now uses `--stdin` on all four shapes plus two negatives, and the P6 glob includes `.ts` so the toast selector reaches `use-poi-preview.ts`.

### M1. Pseudo-localisation was wired where the server never looks **[applied]**
- **Evidence.** The plan applied `pseudoLocalize` in `getDict()`. But `tServer()` → `tFor()` → `DICTS[lang]` (`i18n.ts:37-46`) never calls `getDict()`.
- **Why it matters.** In P0 Step 5, "trip rail renders ⟦…⟧" would fail, because the trip rail uses `tServer`. In P1–P5 Step 4, "any plain English left is a missed string" would report every server-extracted string as missed, so the check would be useless.
- **Change.** Build `DICTS` itself pseudo-localised when `I18N_PSEUDO=1` (dev only). Step 5 now checks a server surface (trip rail plus the home heading).

### M2. P6 put `auth()` and a settings query into the root layout on every request **[applied]**
- **Evidence.** Under P6, `getLang = cache(() => resolveLang((await auth())?.user?.id))`, which is a session lookup plus a `user_settings` select. `getLang()` is awaited in `app/layout.tsx`, so this would run on every page, including `/`, sign-in and the landing. The root layout is built to avoid DB work (`session-cookie.ts:1-3`, TP-0072 streaming of `(home)/loading.tsx`).
- **Why it matters.** It adds two DB round-trips to every request's time-to-first-byte, and it blocks the streamed skeletons TP-0072 shipped.
- **Simpler and equivalent.** The cookie is already written on every Settings save and by the landing switch, so the cookie and the account row only diverge on a new device. Change: `getLang` = cookie → Accept-Language → `en` (pure `resolveLangFrom`, no row), and sign-in seeds the cookie from the row (`auth.ts` `callbacks.signIn` :71 / `events.signIn`). Decision 3 is now satisfied by construction. `loadUserSettingsRow`/`resolveLang` are gone, and the `lib/user-settings.ts` touch moves to `lib/auth.ts`.
- **[open, small]** Whether `cookies().set()` inside the Auth.js callback reaches the response needs a 5-minute check during P6. The plan has a documented fallback: per-device language until Settings is saved once.

### M3. P3 would translate 7 dead files (~100 strings) **[applied]**
- **Evidence.** Import graph at HEAD: `hotels-view.tsx` has no importer. `hotel-edit-launcher` and `hotel-search-picker` are imported only by `hotels-view`. `hotel-preview-modal`, `hotel-dates-modal` and `hotel-manual-form` are imported only by `hotel-search-picker`. `hotel-edit-modal` is imported only by `hotel-edit-launcher`. The plan deleted `hotels-view.tsx` but still extracted the other six (39 literals with the original rules, about 100 with the extended selectors).
- **Change.** P3 deletes the chain instead of extracting it, coordinated with `ds-modal-consolidation`, which deletes the same subtree. Whichever lands first does the deletion. `hotel-place-picker.tsx` is live (imported by `hotel-form-client.tsx`) and stays in P3.

### M4. Files missing from every phase **[applied]**
- **Evidence.** Diffing the lint output against the phase lists found `trip-cover.tsx` (8 plural ternaries), `trip-card.tsx`, `expense-modal-host.tsx`, `place-note-launcher.tsx` (`Edit note for ${placeName}`), `sortable-place-list.tsx`, `map-preview-marker.tsx` (template attributes, previously listed only as a "not lint-visible" note) and `use-poi-preview.ts` (toasts). The P6 date-site list also missed `api-tokens-section.tsx:175`, a bare `toLocaleDateString()` with no locale, which can cause a hydration mismatch. It also cited `calendar-view.tsx:452`, but that file already takes a `locale`, with formatting at :46,51,455,460.
- **Change.** Each file is now assigned to a phase, and the phase table counts were re-measured.

### M5. P2 sat on the busiest files in the repo **[applied]**
- **Evidence.** P2 touched `persistent-map`, both canvases, `map-stop-carousel`, `pin-card` and `map-preview-marker`. About eight open map plans edit the same files (`_plan-notes.md`). "Conflicts are trivial" holds for one rebase, not for eight.
- **Change.** Split into P2a (itinerary and place forms, ships any time after P0) and P2b (map surfaces, after the map plans merge, about 52 strings).

### M6. Plurals: there was a helper, but no pattern for the ~90 ternaries **[applied]**
- `pluralKey(lang, base, n)` needs `lang` in every client call site. The plan now adds `useTp()` (`t(pluralKey(lang, base, n), { n, ...vars })`) and a phase-template rule: plurals use `_one`/`_other` keys and never a ternary. The B1 selector enforces this.

### Nits
- **[applied]** `useT()` outside a provider returns English instead of throwing. That keeps any component rendered without the layout (tests, future OG/portal) from crashing.
- **[applied]** The two parity tests are merged. The copy/glossary plan creates `lib/i18n-messages.test.ts`, and P0 extends it with the placeholder-set check instead of adding `messages/messages.test.ts`.
- `en.json` has 86 keys (the plan says 86; the glossary plan says 87). Cosmetic.
- `no-restricted-syntax` is a single rule. A file-scoped block replaces any global config of that rule for those files. There is no global use today. Noted in the plan.

## Phase size

Re-measured, original rules plus the extended selectors: P1 ~146, P2a ~140, P2b ~52, P3 ~176 (dead chain removed), P4 ~180, P5 ~112. Each phase is mechanical, with a matching JSON diff of about 400–600 lines. The guard proves completeness, so review effort goes to key names and Thai drafts. **Reviewable.** The P3 split into stays and transport stays optional.

## Cross-plan

- **Copy/glossary → i18n.** Copy goes first, as the plan says. The parity test is shared (see above). The header plan's toast is now "Booking deleted", so P3 uses `booking_deleted_toast`, not `booking_removed_toast`.
- **ds-modal-consolidation.** That plan owns deleting the dead hotel chain, and i18n P3 deletes it only if consolidation hasn't. The A8 `<html lang>` overlap: foundations may set `lang` statically; P6 makes it `{lang}`.
- **Header plan.** Its `labels` prop is throwaway once P0 lands. If P0 merges first, the header should use `useT()` directly (noted in the header scrutiny).

## Verdict

**fix-then-ship.** The guard as written would have passed P6 with ~175 English strings still in place. With B1 and M1–M5 applied, the plan is sound.

## Cross-plan (appended by the ds-foundations scrutiny, 2026-10-29)
- Foundations Task 3 sets `<html lang={lang}>` from `getLang()`, which is dynamic, not static, and returns `'en'` until P6. If foundations lands first, P0 reuses that binding (`const [lang, dict] = await Promise.all([getLang(), getDict()])` is fine; the foundations test accepts any shape that calls `getLang()` and renders `lang={lang}`), and P6's `layout.tsx:63` step is already done.
- **P6 drops `:lang(th) body { line-height: 1.6; }`** (`i18n-extraction.md:173`). Foundations owns Thai leading through `[lang|='th']`, which also re-declares Tailwind's `--text-{xs..2xl}--line-height`. A body-only rule would miss every `text-sm`/`text-xs` element.
- P3: don't extract the 7 dead hotel files (already applied here). Modal-consolidation ships its Task 1 deletion as a standalone first PR.

## Cross-plan (appended by the budget/home/calendar scrutiny, 2026-10-29)
- New literals to add to the phase lists if these plans land first:
  - **P1 (home):** "Upcoming", "No dates", "Past", "Trip settings", "Delete trip…", `Trip actions for {title}`.
  - **P4 (calendar):** "Trip", "Month", "Before trip", "After trip", "Nothing planned", "+{n} more", "{n} booking(s) outside these dates · Month view".
  - **P4 (budget):** the hero split `{b} in bookings + {e} other expenses`, the merge suggestion and its confirm copy, and the "Travelers" field and hint.
- `trip-delete-button.tsx` is deleted by home-trip-cards and its strings move to `trip-card-menu.tsx`.
