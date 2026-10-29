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
`--foreground`/`--muted`. `MODE_COLOR` in `lib/map-helpers.ts` mirrors the
route colors (parity-tested).

**Rule:** never write raw hex in feature components. Use a token utility or
`var(--token)` (the latter for CSS modules).

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

## Primitives

```tsx
import { Button, Card, CardHeader, CardBody, CardTitle, Badge, Input, Label, Skeleton } from '@/components/ui';
```

- **Button** — `variant`: primary | secondary | outline | ghost | danger |
  dangerQuiet; `size`: sm | md | lg | icon; `loading` shows a spinner +
  disables. `loading` preserves the button's width and the label's
  accessible name (visually hidden via opacity, not removed from the a11y
  tree). `dangerQuiet` is for a destructive action that must not outrank the
  control beside it.
- **Card** / `CardHeader` / `CardBody` / `CardTitle` — surface container.
- **Badge** — `variant`: neutral | brand | success | warning | danger.
- **Input** / **Textarea** / **Select** / **Label** — form fields with
  consistent focus rings.
- **Skeleton** — pulsing loading placeholder.
- **Modal** — portal-based overlay shell (scrim, focus trap, focus restore,
  Esc, scroll lock, bottom-sheet on mobile / centered dialog on `md`+).
  `onRequestClose` is a request, not a command — it never closes itself; the
  caller decides (e.g. an unsaved-changes guard can refuse it).

All forward refs / spread props and carry visible focus styles.
