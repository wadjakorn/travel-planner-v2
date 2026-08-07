# Settings back link + Bookings add-bar gradient removal

Date: 2026-08-08
Status: design approved (revised after review), not implemented

Two small, independent UI fixes. No schema, server action, or query changes.

## Verified current state

Read at commit `7e71bf9` (`main`, up to date with `origin/main`).

| Fact | Evidence |
|---|---|
| Account settings renders no page-level nav | `app/src/app/settings/page.tsx:36-38` — only `<Header user={user} />` then `<main>` |
| …but the header already links home | `app/src/components/header.tsx:88-97` — brand `<Link href="/">` with `aria-label="Home — switch trip"`, `title="All trips"` |
| …and a phone-only back link already exists *inside* a section | `app/src/components/settings-folio.tsx:184-187` — `.paneBack` → "All account settings" |
| Trip pages all have real nav | `app/src/app/trip/[id]/settings/page.tsx:116`, `.../bookings/page.tsx:45`, `.../page.tsx` each render `<TripRail .../>` |
| TripRail = bottom bar on mobile, left rail on desktop | `app/src/components/trip-rail-frame.tsx:58-60` |
| Bookings add bar paints a full-width fade | `app/src/components/bookings-view.module.css:431-443` — `.addBar` is `position: fixed` with `background: linear-gradient(180deg, transparent 0%, var(--surface-2) 55%)` on line 438 |
| The trip page's floating control has no backdrop | `app/src/components/map-panel-toggle.tsx:28-36` — plain fixed pill, `bg-surface` + border + shadow |
| The add-bar's open panel carries its own background | `.chooser` in `bookings-view.module.css` sets `background: var(--surface)` |
| A chevron already exists on this page, unexported | `app/src/components/settings-folio.tsx:36-53` — module-local `Chevron`; `icons.tsx` has no directional icon |

### The problem, stated accurately

"`/settings` has no nav" is too strong. Traced, the actual gap is:
**on a phone, at the section-list level, the only route out of settings is the
22px header logo.** `.paneBack` covers the drilled-in case; the header brand link
covers desktop adequately but is not a recognisable "back" affordance.

The fix below is therefore deliberately small: one text link, styled as the
same back affordance the page already uses, shown at all widths (desktop
duplication with the header brand link is accepted knowingly — it costs one
line and removes the phone dead end).

## Change 1 — back link on `/settings`

**Decision:** an in-page back link, not an app-level rail. Rejected building an
account rail mirroring `TripRail`: it needs a new nav component, a second
`pb-14 md:pb-0` shell, and there is exactly one account-level destination today.

**Reuse, don't invent.** The page already has a back idiom (`.paneBack` +
rotated `Chevron`). The link matches it rather than introducing a `←` glyph.
An `←` was rejected: U+2190 is not in Geist's `latin` subset
(`app/src/app/layout.tsx:13`), so it would resolve through the Noto Sans Thai
fallback (`layout.tsx:23-27`) with mismatched weight and baseline.

**Edits:**

1. `app/src/components/settings-folio.tsx:36` — change `function Chevron` to
   `export function Chevron`. Nothing else. This creates no new client
   boundary: `settings/page.tsx:5-11` already imports from this
   `'use client'` module.
2. `app/src/app/settings/page.tsx` — inside
   `<header className={styles.pageIntro}>`, above `<div className={styles.eyebrow}>`:

   ```tsx
   <Link href="/" className={styles.backLink}>
     <Chevron className={styles.backLinkIcon} aria-hidden />
     All trips
   </Link>
   ```

   plus `import Link from 'next/link'` and adding `Chevron` to the existing
   `@/components/settings-folio` import.
3. `app/src/components/settings-folio.module.css` — add, mirroring `.paneBack`
   (lines 682-696) so the two back links look identical:

   ```css
   .backLink {
     display: inline-flex;
     align-items: center;
     gap: 6px;
     margin: 0 0 8px -6px;
     padding: 0 6px;
     color: var(--color-muted);
     font-size: 0.875rem;
     text-decoration: none;
   }
   .backLinkIcon { transform: rotate(180deg); }
   @media (hover: hover) {
     .backLink:hover { color: var(--foreground); }
   }
   @media (max-width: 860px) {
     .backLink { min-height: 44px; }
   }
   ```

   `min-height` is phone-scoped on purpose: `.pageTitle` already has
   `margin-top: 8px` (line 14) and is `clamp(2rem, 2.8vw, 2.25rem)`, so an
   unconditional 44px box would push the H1 down ~54px on desktop where no
   tap target is needed. `.paneBack` scopes it the same way (base rule at
   line 595 is `display: none`).

   `var(--color-muted)` — not `var(--muted)` — is intentional: it is what
   `.paneBack` uses, and `app/globals.css:121` aliases the two.

   One deliberate divergence from `.paneBack`: the `@media (hover: hover)`
   hover colour. `.paneBack` has none because it only ever renders on a phone;
   `.backLink` renders on desktop too, where a link with no hover feedback
   reads as dead text. The guard matches how the rest of this stylesheet
   handles hover (e.g. `.stubButton`, line 98).

The chevron is `aria-hidden` (already hardcoded inside the component), so
assistive tech announces only "All trips".

**Not touched:** `app/src/app/trip/[id]/settings/page.tsx` — it renders
`TripRail` at line 116 and needs nothing.

## Change 2 — remove the add-bar gradient

**Decision:** remove it at every breakpoint, so mobile and desktop match the
trip page's floating pill.

**Edit:** `app/src/components/bookings-view.module.css` — delete the
`background: linear-gradient(...)` declaration from `.addBar` (currently
line 438). That single declaration; nothing else in the rule.

Traced consequences:

- `.addBar` keeps `position: fixed` (line 432) and `pointer-events: none`
  (line 441), so its now-transparent `padding: 14px 22px` (line 437) box
  intercepts nothing.
- `.add` supplies its own separation — `background: var(--surface)`,
  `border: 1px solid var(--border)`, `box-shadow: var(--shadow-lg)`.
- `.chooser` sets `background: var(--surface)` independently — unaffected.
- The desktop override (`@media (min-width: 768px)`, `bottom: 0` +
  `padding-bottom: calc(16px + env(safe-area-inset-bottom))`) stays: it still
  positions the pill above the safe area.

**No comment changes needed.** The comment at line 451 ("Match the trip-page
floating pill (map-panel-toggle): white surface, fully-rounded, bordered,
elevated") describes `.add`, not the gradient, and reads *more* accurately after
the change. The comment at line 435 about floating above the mobile bottom nav
also stays true.

**Out of scope:** `app/src/components/hotels-view.module.css:419` has an
equivalent `.addBar`, but `/trip/[id]/hotels` redirects to `/bookings`, so that
rule is dead code. Left alone deliberately.

## Verification

A test runner exists (`pnpm test` → `vitest run`), but its 34 files cover lib and
query code only — nothing here is presentational, so neither change is
exercised by it. Run it anyway as a regression guard, then verify by eye:

- `cd app && pnpm lint && pnpm typecheck && pnpm build && pnpm test`
- Manual, `/settings` at 390px and 1280px: back link aligns with the eyebrow,
  H1 spacing unchanged on desktop, 44px tap target on phone.
- Manual, `/settings?s=tokens` at 390px: the new back link and the existing
  `.paneBack` link read as the same control, not two competing ones.
- Manual, `/trip/<id>/bookings` at 390px **scrolled to mid-list**: the add pill
  stays legible over dense `booking-card-stay` rows. This is the one job the
  gradient was doing and the only real regression risk in the change.
- Manual, `/trip/<id>/bookings` at 1280px: pill sits at the bottom edge, no
  ghost band.

## Risks

- Low. Both edits are presentational and reversible.
- The one judgement call is contrast on Change 2: with the fade gone, list
  content scrolls directly under the add pill. The pill's opaque surface plus
  shadow carries the separation — the same treatment the trip page already
  ships. The mid-scroll manual check above is what confirms it.
- Exporting `Chevron` (Change 1, step 1) widens `settings-folio.tsx`'s public
  surface by one component. Accepted as cheaper than duplicating the SVG or
  adding an icon to `icons.tsx` that only this page would use.
