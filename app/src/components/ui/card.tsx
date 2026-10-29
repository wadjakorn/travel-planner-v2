import * as React from 'react';
import { cn } from './cn';

/** Surface container. No shadow by default; add one per use. */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-surface text-foreground border border-border rounded-2xl', className)}
      {...props}
    />
  );
}
