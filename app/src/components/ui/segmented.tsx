'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
};

/** Single choice among 2–5 options: a group of aria-pressed buttons, each
 *  ≥ 32×32 px. With an icon the label becomes the accessible name + tooltip. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5',
        className,
      )}
    >
      {options.map((o) => {
        const pressed = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={pressed}
            aria-label={o.icon ? o.label : undefined}
            title={o.title ?? (o.icon ? o.label : undefined)}
            disabled={disabled}
            onClick={() => {
              if (!pressed) onChange(o.value);
            }}
            className={cn(
              'inline-flex h-8 min-w-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
              o.icon ? 'px-2 [&_svg]:h-4 [&_svg]:w-4' : 'px-2 text-[12px] font-medium',
              pressed ? 'bg-brand text-brand-foreground' : 'text-muted hover:bg-surface-2',
              disabled && 'cursor-wait opacity-50',
            )}
          >
            {o.icon ?? o.label}
          </button>
        );
      })}
    </div>
  );
}
