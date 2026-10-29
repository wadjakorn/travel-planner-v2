import * as React from 'react';
import { cn } from './cn';

export type FieldSize = 'md' | 'lg';

const baseField =
  'w-full bg-surface text-foreground border border-input rounded-lg px-3 text-sm ' +
  'placeholder:text-muted outline-none transition-colors ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring ' +
  'disabled:opacity-50 disabled:pointer-events-none ' +
  // Keyed off the attribute, so a caller passing a raw aria-invalid gets it too.
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger aria-invalid:focus-visible:border-danger';

const heights: Record<FieldSize, string> = { md: 'h-10', lg: 'h-11' };

/** Field classes for non-`Input` controls that must match (e.g. an autocomplete's input). */
export function inputClasses(opts: { size?: FieldSize; className?: string } = {}): string {
  return cn(baseField, heights[opts.size ?? 'md'], opts.className);
}

// `invalid` renders aria-invalid="true"; false renders nothing; undefined
// leaves an explicit aria-invalid prop alone. Pair it with aria-describedby
// pointing at the error text.
function ariaInvalid(invalid: boolean | undefined, explicit: React.AriaAttributes['aria-invalid']) {
  if (invalid === undefined) return explicit;
  return invalid ? true : undefined;
}

type FieldProps = { invalid?: boolean };

export const Input = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldProps & { size?: FieldSize }
>(function Input({ className, size, invalid, 'aria-invalid': explicit, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={inputClasses({ size, className })}
      aria-invalid={ariaInvalid(invalid, explicit)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(function Textarea({ className, invalid, 'aria-invalid': explicit, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(baseField, 'py-2', className)}
      aria-invalid={ariaInvalid(invalid, explicit)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & FieldProps & { size?: FieldSize }
>(function Select({ className, size, invalid, 'aria-invalid': explicit, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={inputClasses({ size, className })}
      aria-invalid={ariaInvalid(invalid, explicit)}
      {...props}
    />
  );
});

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-sm font-medium text-foreground mb-1.5', className)}
      {...props}
    />
  );
}
