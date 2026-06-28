import * as React from 'react';
import { cn } from './cn';

// Loading placeholder. Pair with aria-hidden; announce loading at region level.
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}
