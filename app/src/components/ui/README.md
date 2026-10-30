# UI primitives & design tokens

Shared, token-driven building blocks. Foundation ticket: `[Foundation] Design
system` (epic *Revamp UX & UI*). Build later screens on these instead of
ad-hoc styles.

## Tokens

Single source of truth: [`app/src/app/globals.css`](../../app/globals.css).
Raw palette ramps (`--brand-50…950`) are static; **semantic** tokens swap per
theme via `[data-theme="dark"]`.

| Token (CSS var)              | Tailwind utility                   | Use for                         |
| ---------------------------- | ---------------------------------- | ------------------------------- |
| `--background`               | `bg-background`                    | page background                 |
| `--surface` / `--surface-2`  | `bg-surface` / `bg-surface-2`      | cards / raised + hover          |
| `--foreground`               | `text-foreground`                  | primary text                    |
| `--muted`                    | `text-muted`                       | secondary text                  |
| `--border` / `--input`       | `border-border` / `border-input`   | dividers / field borders (≥ 3:1) |
| `--border-strong`            | `border-border-strong`             | decorative borders/dots (no 3:1 need) |
| `--ring`                     | `ring-ring`                        | focus ring (≥ 3:1)              |
| `--brand` / `--brand-foreground` | `bg-brand` / `text-brand-foreground` | primary actions             |
| `--accent`                   | `bg-accent`                        | subtle hover/fill               |
| `--success`/`--warning`/`--danger` | `bg-*` / `text-*`            | semantic states                 |
| `--warning-soft` / `--warning-strong` / `--warning-border` | `var(--warning-*)` | amber chip: "Unverified", "Route unavailable" (fill / text / border) |
| `--note-soft` / `--note-fg` / `--note-border` | `var(--note-*)` | pale-yellow note chip on itinerary rows (kept distinct from the warning chip) |
| `--rating` | `var(--rating)` | rating star |
| `--map-route` | `var(--map-route)` | trip-map day route: arc line + mid-arc mode badge (mirrored as `ROUTE_COLOR`) |
| `--map-route-walk/drive/transit` | `var(--map-route-*)` | travel-mode color: itinerary segment icons |
| `--header-h`                 | `top-(--header-h)`, `calc(… var(--header-h))` | offsets below the sticky header (never `57px`) |
| `--dur-fast/base/slow` + `--ease` | `var(--dur-base)` in `transition` | motion: 120 / 180 / 280ms; `--ease` = CSS `ease` |
| `--leading-body` / `--leading-heading` | `line-height: var(--leading-heading)` | 1.5 / 1.3; 1.6 / 1.35 under `[lang\|='th']` |

Radii (`--radius-sm…2xl` → `rounded-md/lg/xl`), shadows
(`shadow-[var(--shadow-sm)]` …), and z-index (`--z-modal` …) live in the same
file. Type scale adds `text-display`, `text-title`, `text-caption` on top of
Tailwind defaults.

Map overlays have their own block (`--map-pin-*`, `--map-route-*`,
`--map-card-*`): **light-locked** — defined in `:root` only, never under
`[data-theme="dark"]`, because pins and popups sit on the map's white
InfoWindow/Popup in both themes. Popup text uses `--map-card-*`, not
`--foreground`/`--muted`. `ROUTE_COLOR` / `ROUTE_CASING_COLOR` in
`lib/map-helpers.ts` mirror the route colors (parity-tested).

**Rule:** never write raw hex in feature components. Use a token utility or
`var(--token)` (the latter for CSS modules). Tints are
`color-mix(in srgb, var(--token) N%, transparent)`.

Enforced by `app/src/components/raw-color-guard.test.ts` (a ratchet): raw
`#hex` / `rgb()` / `rgba()` and Tailwind default-palette classes
(`text-zinc-500`, `bg-red-50` …) are counted per file against
`raw-color-baseline.json`. A file must match its count exactly, so the total can
only go down; files in `STRICT` / `STRICT_PALETTE` hold zero. The only escape
hatch is a line comment `hex-ok: <reason>` — for third-party brand marks (the
Google Maps glyph) and TS mirrors of CSS tokens a renderer needs raw
(`ROUTE_COLOR`, parity-tested). After removing colors (or deleting a file),
regenerate in the same PR:
`UPDATE_RAW_COLOR_BASELINE=1 pnpm vitest run src/components/raw-color-guard.test.ts`.

More rules (guarded by `app/src/app/design-foundations.test.ts`):

- **Text ≥ 12px** — CSS `font-size`, Tailwind `text-[Npx]`, inline `fontSize`
  (OG images excepted). Use `text-xs` for the smallest UI text.
- **Map popups set `fontFamily: var(--font-sans)` explicitly** — Google's
  `.gm-style` forces `Roboto, Arial`, so inheriting is not enough. No
  `-apple-system` stacks.
- **Thai leading** — user content that may be Thai (place, hotel, trip names)
  uses `var(--leading-heading)` or looser, never a tight `1`/`1.1`.
- **Motion** — module `transition`s use `--dur-*`, not raw `ms`/`s`.
- **Spacing in CSS modules:** `calc(var(--spacing) * n)` (Tailwind's 0.25rem
  scale); there is no separate `--space-*` scale. Pills use `--radius-full`.

## Dark mode

Driven by `data-theme` on `<html>`. `saveSettingsAction` persists a `theme`
cookie (`light` | `dark` | `system`); the root layout resolves it SSR and a
pre-paint script + `ThemeWatcher` handle `system` without a flash. Anything
built on semantic tokens is dark-correct automatically.

Dark is **pinned to light** for now: `system` resolves to light and the
Appearance picker is "coming soon". It stays that way until the ratchet
baseline's `raw` total is near zero — modules not yet migrated still paint
light-only colors. See `docs/superpowers/plans/2026-10-29-ds-hex-codemod.md`
Decision 2.

## Primitives

```tsx
import { Button, Card, Badge, Input, Label, Modal, Skeleton, Segmented } from '@/components/ui';
```

- **Button** — `variant`: primary | secondary | outline | ghost | danger |
  dangerQuiet; `size`: sm | md | lg | icon; `loading` shows a spinner +
  disables. `loading` preserves the button's width and the label's
  accessible name (visually hidden via opacity, not removed from the a11y
  tree). `dangerQuiet` is for a destructive action that must not outrank the
  control beside it. Submit buttons get `loading` from `SubmitButton` /
  `ActionSubmit` — don't hand-write "Saving…" (a guard in `primitives.test.ts`
  rejects it, and `pendingText` is gone).
- **Card** — surface container (`rounded-2xl`, border, no shadow; add one
  per use). Used by the error/not-found pages.
- **Badge** — `variant`: neutral | brand | success | warning | danger.
- **Input** / **Textarea** / **Select** / **Label** — form fields with
  consistent focus rings. `invalid` sets `aria-invalid="true"` and a danger
  border/ring; point `aria-describedby` at the error text (keep that element
  mounted with `aria-live="polite"` so the change is announced):
  `<Input invalid={err} aria-describedby="dates-msg" />` +
  `<p id="dates-msg" aria-live="polite">{err ? '…' : null}</p>`.
  `size="lg"` (h-11) on Input/Select; `inputClasses({ size })` styles a field
  that isn't an `Input` (e.g. an autocomplete's own `<input>`).
- **Skeleton** — pulsing loading placeholder.
- **Modal** — portal-based overlay shell (scrim, focus trap, focus restore,
  Esc, scroll lock, bottom-sheet on mobile / centered dialog on `md`+).
  `onRequestClose` is a request, not a command — it never closes itself; the
  caller decides (e.g. an unsaved-changes guard can refuse it). The only
  overlay shell: `dialog-guard.test.ts` rejects a hand-rolled
  `role="dialog"`/`aria-modal`. Extra props: `initialFocusRef` (focused on
  open instead of the first focusable), `role` (`dialog` | `alertdialog`),
  `describedBy` (→ `aria-describedby`). A Modal opened inside another stacks
  above it (later portal, same `--z-modal`), takes Escape alone, and returns
  focus into the one below; the scroll lock is ref-counted
  (`scroll-lock.ts`), so both closing at once still unlocks the page.
  Destructive confirmations use `ConfirmDialog` (`components/confirm-dialog.tsx`,
  a `size="sm"` alertdialog with Cancel focused).
- **Segmented** — single choice among 2–5 options (`value`, `options`,
  `onChange`, `ariaLabel`). A `role="group"` of `aria-pressed` buttons, each
  ≥ 32×32 px; an option with an `icon` uses its `label` as `aria-label` +
  `title`. Used by the travel-mode pickers. Don't add `.tp-hit`: 32 px
  buttons 2 px apart already pass WCAG 2.5.8 and 44 px boxes would overlap.

All forward refs / spread props and carry visible focus styles.

## Touch hit area (`.tp-hit`)

`globals.css` defines `.tp-hit` (in `@layer components`, `pointer: coarse`
only): an invisible `::after` grows the element's tappable box to ≥ 44×44 px
around its centre, so the visual size and the desktop layout don't change.
Button `sm` / `icon` carry it already; add it by class to other small
controls (icon links, checklist toggles, inline text links):
`<button className="tp-hit rounded-full p-1.5">…</button>`.

- Neighbours' expanded boxes must not overlap: keep centres ≥ 44 px apart on
  coarse pointers (e.g. `gap-1 pointer-coarse:gap-4` in an icon cluster) or
  make the row ≥ 44 px tall (`pointer-coarse:min-h-11`).
- A later sibling's box paints over an earlier one, so a box spilling into the
  row above steals its taps — keep it inside its own row.
- Not for drag handles (`::after` doesn't inherit `touch-action`) or
  `Segmented` (see above). A control styled only in a CSS module copies the
  same `::after` block there (e.g. `account-menu.module.css .trigger`).
