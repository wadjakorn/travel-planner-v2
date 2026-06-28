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
| `--border` / `--input`       | `border-border` / `border-input`   | dividers / field borders        |
| `--ring`                     | `ring-ring`                        | focus ring                      |
| `--brand` / `--brand-foreground` | `bg-brand` / `text-brand-foreground` | primary actions             |
| `--accent`                   | `bg-accent`                        | subtle hover/fill               |
| `--success`/`--warning`/`--danger` | `bg-*` / `text-*`            | semantic states                 |

Radii (`--radius-sm…2xl` → `rounded-md/lg/xl`), shadows
(`shadow-[var(--shadow-sm)]` …), and z-index (`--z-modal` …) live in the same
file. Type scale adds `text-display`, `text-title`, `text-caption` on top of
Tailwind defaults.

**Rule:** never write raw hex in feature components. Use a token utility or
`var(--token)` (the latter for CSS modules).

## Dark mode

Driven by `data-theme` on `<html>`. `saveSettingsAction` persists a `theme`
cookie (`light` | `dark` | `system`); the root layout resolves it SSR and a
pre-paint script + `ThemeWatcher` handle `system` without a flash. Anything
built on semantic tokens is dark-correct automatically.

## Primitives

```tsx
import { Button, Card, CardHeader, CardBody, CardTitle, Badge, Input, Label, Skeleton } from '@/components/ui';
```

- **Button** — `variant`: primary | secondary | outline | ghost | danger;
  `size`: sm | md | lg | icon; `loading` shows a spinner + disables.
- **Card** / `CardHeader` / `CardBody` / `CardTitle` — surface container.
- **Badge** — `variant`: neutral | brand | success | warning | danger.
- **Input** / **Textarea** / **Select** / **Label** — form fields with
  consistent focus rings.
- **Skeleton** — pulsing loading placeholder.

All forward refs / spread props and carry visible focus styles.
