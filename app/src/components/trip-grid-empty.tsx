// TripGridEmpty — empty state shown when the user has zero trips.
// Server component; no 'use client'.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';

type Props = {
  onSeed?: (formData: FormData) => Promise<void>;
};

export function TripGridEmpty({ onSeed }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">
        ✈️
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 mb-2">
        No trips yet
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-8">
        Start planning your first trip, or seed the Mt Fuji &amp; Kamakura demo to see what&apos;s
        possible.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          href="/trip/new"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white transition-colors"
        >
          New trip
        </Link>

        {onSeed && (
          <form action={onSeed}>
            <SubmitButton
              pendingText="Seeding…"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Seed demo trip
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
