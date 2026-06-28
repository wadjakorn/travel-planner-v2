// TripGridEmpty — empty state shown when the user has zero trips.
// Server component; no 'use client'.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { Button, buttonClasses } from '@/components/ui';

type Props = {
  onSeed?: (formData: FormData) => Promise<void>;
};

export function TripGridEmpty({ onSeed }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">
        ✈️
      </div>
      <h2 className="text-title tracking-tight text-foreground mb-2">
        No trips yet
      </h2>
      <p className="text-sm text-muted max-w-xs mb-8">
        Start planning your first trip, or seed the Mt Fuji &amp; Kamakura demo to see what&apos;s
        possible.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button asChild className="rounded-full">
          <Link href="/trip/new">New trip</Link>
        </Button>

        {onSeed && (
          <form action={onSeed}>
            <SubmitButton
              pendingText="Seeding…"
              className={buttonClasses('secondary', 'md', 'rounded-full')}
            >
              Seed demo trip
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
