import * as React from 'react';
import { cn } from './cn';

const baseField =
  'w-full bg-surface text-foreground border border-input rounded-lg px-3 text-sm ' +
  'placeholder:text-muted outline-none transition-colors ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring ' +
  'disabled:opacity-50 disabled:pointer-events-none';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cn(baseField, 'h-10', className)} {...props} />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(baseField, 'py-2', className)} {...props} />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select ref={ref} className={cn(baseField, 'h-10', className)} {...props} />
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
