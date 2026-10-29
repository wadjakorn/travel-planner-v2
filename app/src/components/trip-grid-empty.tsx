// TripGridEmpty — empty state shown when the user has zero trips.
// Server component; no 'use client'. Async for tServer().

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { Button, buttonClasses } from '@/components/ui';
import { tServer } from '@/lib/i18n';

type Props = {
  onSeed?: (formData: FormData) => Promise<void>;
};

export async function TripGridEmpty({ onSeed }: Props) {
  const t = await tServer();
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">
        ✈️
      </div>
      <h2 className="text-title tracking-tight text-foreground mb-2">
        {t('home_empty_title')}
      </h2>
      <p className="text-sm text-muted max-w-xs mb-8">
        {t('home_empty_body')}
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button asChild className="rounded-full">
          <Link href="/trip/new">{t('new_trip')}</Link>
        </Button>

        {onSeed && (
          <form action={onSeed}>
            <SubmitButton
              className={buttonClasses('secondary', 'md', 'rounded-full')}
            >
              {t('home_seed_demo')}
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
