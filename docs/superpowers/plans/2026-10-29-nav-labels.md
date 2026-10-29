# Trip Navigation Labels Implementation Plan

> **Ticket:** TP-0089

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D1 — keep Notes as is (disabled "coming soon" item).** Do NOT hide it and do NOT re-enable it. Task 1 changes: `railItemIds` keeps `notes` (rendered disabled exactly as today, now with its 12px label); drop the test `never lists notes until it ships` and the commit `fix(nav): hide Notes until it ships`. REQUIREMENTS §3 text: Notes is listed as "coming soon (disabled)". Browser check: Notes visible, disabled, labelled.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every trip-nav item shows a 12px text label under its icon, both in the mobile bottom bar and the desktop rail. The disabled "Notes — coming soon" item is gone until Notes ships. REQUIREMENTS §3 describes the navigation that actually shipped.

**Architecture:** `TripRailLink` (`trip-rail-frame.tsx`) renders an icon pill + label + optional badge itself, instead of taking children. `TripRail` (`trip-rail.tsx`) gets its item list from a pure `railItemIds()`, which never includes `notes` and adds `settings` for owners. The bar keeps its 56px height (`h-14`), so none of the offsets that depend on it change. Only the md+ rail widens, from 56px to 72px.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 tokens, vitest (node env).

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §4.6 (labels at 12px under icons, hide Notes, header vs spec), §5 A7 (min 12px text), §7.4 ("ป้ายใน rail ล่าง"). Shipped IA: `trip-rail.tsx:58-72`, `trip/[id]/bookings/page.tsx` (stays + transport), `hotels/` and `transport/` pages redirect.

**Touches:** `components/trip-rail.tsx`, `components/trip-rail-frame.tsx`, new `components/trip-rail-items.ts`, `REQUIREMENTS.md` §3 + §6 (structure only), `AGENTS-INDEX.md`. No `globals.css` and no layout offsets. The nav's `aria-label="Trip navigation"` is kept because `globals.css:273` uses it to hide the bar in mobile full-map.

**Cross-plan (scrutiny 2026-10-29):**
- `2026-10-29-ds-foundations.md` Task 5 rewrites `trip-rail-frame.tsx:88` to `md:top-(--header-h)` / `md:h-[calc(100dvh_-_var(--header-h))]`, and its font-floor task bumps the badge `text-[10px]` at `trip-rail.tsx:100`. The "exact classes" below are written against today's `57px`. If foundations landed first, keep its `--header-h` forms and its badge size, and change only width, alignment and gap.
- `2026-10-29-header-share-export.md` ships Share and Export (and drops global undo from the spec). The "Not shipped" header line in Task 3 lists only what is still missing **at merge time**. If header lands first, that line is `Not shipped: Help.`
- `2026-10-29-map-day-bar-ghost-pins.md` adds an md+ day bar on the map. At 768 px the map becomes 296 px wide (was 312). The day-bar plan must check its bar at that width.

## Decision needed

1. **Desktop rail: visible labels or tooltip only?** **Default: visible labels.** The rail goes from `md:w-14` (56px) to `md:w-[72px]`, the Material navigation-rail pattern (icon + 12px label). Rationale:
   - `title` tooltips never appear on touch, and the md breakpoint (768–1023px) is mostly tablets.
   - Labels are the review's main complaint (§4.6).
   - Cost: the map is 16px narrower on md+. At 768px it is 296px instead of 312px; the aside is fixed at 400px, `trip-aside-class.ts:6`.
   - Alternative: keep the 56px icon rail and replace `title` with a focus- and hover-visible tooltip. Still invisible on touch.
2. **Header items the spec lists but the app doesn't ship** (Share, Export, undo/redo, Help; review §4.6 and §11 Q5). **Default:** keep them in REQUIREMENTS, moved to an explicit "Not shipped (open decision)" line. That way the spec stops claiming they exist without deleting the intent. Alternative: delete them from the spec.
3. **Hiding Notes.** **Default:** remove it from the item list. Re-adding is one line in `railItemIds` when Notes ships. Alternative: a server feature flag in `lib/feature-flags.ts` (needs an env var + docs for one item; not worth it).
   - **Scrutiny note, for the user:** the Notes page is built and works (`app/trip/[id]/notes/page.tsx`, "Phase 6 Notes & checklists", `notes-view.tsx` with checklists and server actions). It was disabled in `00dedec` as a scope cut, together with Calendar, Budget and Settings, which were re-enabled later. **A third option is to re-enable it** (drop `disabled`). It's the same one-line change, and it resolves the review's complaint by shipping Notes rather than hiding it. Choose "hide" only if Notes is known to be unfit to ship.

## Global Constraints

- Label text = the existing i18n keys via `tServer()` (`itinerary`, `calendar`, `bookings`, `budget`, `settings`). No new strings. EN today: `Itinerary`, `Calendar`, `Bookings`, `Budget`, `Settings`.
- Label size `text-[12px] leading-4`, never smaller (A7). Labels truncate with an ellipsis (`truncate max-w-full`) and never wrap or overflow the slot.
- Mobile bar height stays `h-14` (56px). These depend on it: `trip-aside-class.ts:6` (`100dvh-57px-56px`), `trip/[id]/layout.tsx:81` (`pb-14`), `bookings-view.module.css:435-436` (FAB `3.5rem`), `map-panel-toggle.tsx:28` (`bottom-20`).
- Keep `<nav aria-label="Trip navigation">` exactly, because full-map hides it by that selector (`globals.css:273`).
- Items: Itinerary · Calendar · Bookings · Budget, plus Settings for the trip owner only. Notes is not rendered. The `/trip/[id]/notes` route still works, and the rail renders there with nothing active (`notes` stays in `RAIL_SEGMENTS`, `trip-rail-frame.tsx:15-21`).
- Active state: icon pill `bg-brand text-brand-foreground`, label `text-foreground font-semibold`. Inactive: `text-muted`, hover `bg-surface-2` on the pill. Colors via tokens only.
- Touch target per item ≥ 44×44: the whole icon+label column is the link.

## Review Focus

1. **Full-map mode on mobile** must still hide the bar. Removing or renaming the nav's `aria-label` silently breaks `globals.css:273`. Manual check in Task 3.
2. **Owner vs editor/viewer item count** (5 vs 4): Settings must stay owner-only (its page `notFound()`s for others). Test `railItemIds` (Task 1).
3. **Bookings badge** with a label below the icon: it must sit on the icon pill's corner, not on the label or outside the 56px bar. Manual screenshot in Task 3.
4. **Long labels** (Thai `แผนเที่ยว` / `การตั้งค่า` once i18n is on, or a longer EN rename) in a ~75px mobile slot or a 64px rail item: they truncate, with no horizontal scroll and no 2-line growth that clips in 56px. Manual check by swapping one label's text in devtools (Task 3).
5. **Direct visit to `/trip/[id]/notes`:** the rail renders with no active item and no layout shift. Manual check in Task 3.

---

### Task 1: Item list without Notes

**Files:**
- Create: `app/src/components/trip-rail-items.ts`
- Test: `app/src/components/trip-rail-items.test.ts`
- Modify: `app/src/components/trip-rail.tsx:22-29` (drop `disabled` from `Item`), `:58-72` (build from `railItemIds`), `:78-90` (delete the disabled branch)

**Interfaces:**
- Consumes: `type TripRailSegment` from `./trip-rail-frame` (type-only import).
- Produces: `export type RailItemId = Exclude<TripRailSegment, 'notes'>` and `export function railItemIds(o: { isOwner: boolean; showSettings: boolean }): RailItemId[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { railItemIds } from './trip-rail-items';
it('owner sees settings last', () =>
  expect(railItemIds({ isOwner: true, showSettings: true })).toEqual(['itinerary', 'calendar', 'bookings', 'budget', 'settings']));
it('non-owner has no settings', () =>
  expect(railItemIds({ isOwner: false, showSettings: true })).toEqual(['itinerary', 'calendar', 'bookings', 'budget']));
it('showSettings=false hides it for owners too', () =>
  expect(railItemIds({ isOwner: true, showSettings: false })).not.toContain('settings'));
it('never lists notes until it ships', () =>
  expect(railItemIds({ isOwner: true, showSettings: true })).not.toContain('notes'));
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/components/trip-rail-items.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `railItemIds`. In `trip-rail.tsx`, keep a `Record<RailItemId, { i18nKey: MessageKey; href: (id: string) => string; Icon }>` config (no notes entry) and map `railItemIds({ isOwner, showSettings })` through it. The bookings badge stays `counts.hotels + counts.transport`.
- [ ] **Step 4:** Re-run → PASS. `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [ ] **Step 5:** Commit `fix(nav): hide Notes until it ships [TP-0089]`

### Task 2: Labels under icons (mobile bar + desktop rail)

**Files:**
- Modify: `app/src/components/trip-rail-frame.tsx:82-90` (nav classes), `:97-127` (`TripRailLink`), `:130-138` (`PendingRing` radius)
- Modify: `app/src/components/trip-rail.tsx:91-105` (pass `icon` / `badge` props)

**Interfaces:**
- Produces:
  ```ts
  export function TripRailLink(props: {
    segment: TripRailSegment;
    href: string;
    label: string;
    icon: React.ReactNode;   // 20×20 svg
    badge?: number;          // >0 renders the count pill (99+ cap kept)
  }): React.JSX.Element // no global JSX namespace in @types/react 19
  ```

Exact classes:
- Nav (mobile part unchanged except spacing): `fixed inset-x-0 bottom-0 z-30 flex h-14 w-full flex-row items-center justify-between gap-0 border-t border-border bg-surface px-1 transition-transform duration-200`. md+: `md:sticky md:top-[57px] md:bottom-auto md:inset-x-auto md:h-[calc(100dvh-57px)] md:w-[72px] md:shrink-0 md:flex-col md:items-center md:justify-start md:gap-1 md:border-r md:border-t-0 md:py-3`. The hide-on-scroll translate is unchanged.
- Link: `group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-16 md:flex-none md:py-1.5`. Keep `aria-current`. Drop `title` **and `aria-label`**: the visible label is now the accessible name (WCAG 2.5.3), and without the override the Bookings badge count is announced too ("Bookings 3"), where today `aria-label` hides it.
- Icon pill: `relative inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors`. Active `bg-brand text-brand-foreground`; inactive `text-muted group-hover:bg-surface-2 group-hover:text-foreground`. `<PendingRing />` goes inside the pill with `rounded-full`.
- Badge: inside the pill, `absolute -right-1 -top-1` with the current pill classes (`trip-rail.tsx:100`).
- Label: `max-w-full truncate text-[12px] leading-4`. Active `font-semibold text-foreground`; inactive `font-medium text-muted`.
- Height budget (mobile): 4 + 28 + 2 + 16 + 4 = 54px ≤ 56px bar.

- [ ] **Step 1:** Implement `TripRailLink` with the props above and update the frame classes.
- [ ] **Step 2:** `trip-rail.tsx`: `<TripRailLink key segment href label icon={<Icon width={20} height={20} />} badge={…} />`.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test` (tail -3).
- [ ] **Step 4:** Commit `feat(nav): visible labels under rail and bottom-bar icons [TP-0089]`

### Task 3: Spec, index, browser verification

- [ ] **REQUIREMENTS §3** (`REQUIREMENTS.md:17-23`): replace the first three paragraphs with:

  > Left rail (md+): Itinerary (default) · Calendar · Bookings · Budget · Settings (trip owner only). Each item is an icon with a visible 12px label under it. Notes is hidden from navigation until it ships (`/trip/[id]/notes` still renders).
  >
  > Mobile (<768px): the same items as a bottom tab bar (icon + 12px label). It hides while scrolling down and is hidden in full-map mode. There is no overflow menu.
  >
  > Bookings is one page for stays and transport (filter All / Stays / Transport). `/trip/[id]/hotels` and `/trip/[id]/transport` redirect to it.
  >
  > Header: brand · trip title (sm+) · saved-indicator · collaborator avatars · account dropdown. Not shipped (open decision, design review 2026-10-28 §11 Q5): undo/redo, Share, Export, Help.

  The "Modals" and "`/` is public" paragraphs are unchanged.
- [ ] **REQUIREMENTS §6** (`:237-243`): replace the `### Hotels view` / `### Transport view` headings with one intro line, "One Bookings page: stays and transport together, grouped by date, filter All / Stays / Transport, gap-night markers, Add booking chooser (Stay / Transport).", followed by `### Stay card` and `### Transport card`. Keep their existing field lists. The ux-copy-glossary plan does not touch §6.
- [ ] **AGENTS-INDEX.md**:
  - Layout/chrome table: delete the stale `trip-nav.tsx` row. The file does not exist; `TripRail` is the nav.
  - Update the `trip-rail.tsx` / `trip-rail-frame.tsx` row: "icon + 12px label (rail 72px md+, bottom bar 56px mobile); items from `trip-rail-items.ts` `railItemIds` (Notes hidden until shipped, Settings owner-only)".
- [ ] Browser: `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, trip `79efe162-dfb2-46c2-ad46-a34695771b8b`.
  - 390×844: five labelled items (owner), no Notes. Labels are ≥12px (computed style). The Bookings badge sits on the icon corner, and the bar is still 56px tall. Screenshot.
  - Tap Map → full-map: the bar is hidden. Back to List → the bar is back.
  - Scroll the itinerary down → the bar slides away; stop → it returns.
  - In devtools, set one label's text to `การตั้งค่าการเดินทาง` → it truncates with an ellipsis, with no overflow. Reload.
  - Visit `/trip/<id>/notes` → the rail shows with no active item.
  - 1440×900 and 820×1180 (tablet): the 72px rail shows labels, and the active item has a brand pill. Keyboard Tab shows a focus ring on each item. The map still fills the remaining width.
  - Sign in as a non-owner (or check `railItemIds` output via the test) → 4 items.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` (tail -3). Commit `docs: REQUIREMENTS §3 matches shipped navigation [TP-0089]`

## Not done (with reason)

- **Brand/SEO line from §4.6** (`<title>`/description containing "Travel Planner"): this is root metadata in `app/layout.tsx:36-37`, not navigation. It belongs to the landing/SEO work.
- **Badge numerals at 10px** (`trip-rail.tsx:100`): a numeric count pill is not running text. It is left for the DS type-scale pass.
- **Safe-area inset under the bottom bar** (`env(safe-area-inset-bottom)`): not raised by the review, and changing the bar's height would move every offset listed in Global Constraints. Flag for the bottom-sheet work (§12 stage B).
