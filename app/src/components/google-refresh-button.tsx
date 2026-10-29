'use client';

// "Update from Google" for the edit-place page (TP-0049). Re-fetches Google
// data for this place; a successful refresh remounts the form via router.refresh().

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { refreshPlaceFromGoogleAction } from '@/app/actions/places';
import type { RefreshOutcome } from '@/lib/services/google-sync-service';
import { Button } from '@/components/ui';
import { useT } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n-client';

const MESSAGES: Record<RefreshOutcome, MessageKey> = {
  ok: 'place_refresh_ok',
  not_found: 'place_refresh_not_found',
  invalid: 'place_refresh_invalid',
  skipped: 'place_refresh_skipped',
  limit: 'place_refresh_limit',
  unavailable: 'place_refresh_unavailable',
  error: 'place_refresh_unavailable',
};

/**
 * `exhausted` = Google status NOT_FOUND/INVALID: the button is hidden, but the
 * component stays mounted so the result line of the click that caused it
 * (revalidation flips this prop) is still shown until the next navigation.
 */
export function GoogleRefreshButton({
  placeId,
  tripId,
  exhausted = false,
}: {
  placeId: string;
  tripId: string;
  exhausted?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [state, formAction, pending] = useActionState(refreshPlaceFromGoogleAction, {
    outcome: null as RefreshOutcome | null,
  });

  useEffect(() => {
    if (state.outcome === 'ok') router.refresh();
  }, [state, router]);

  if (exhausted && !state.outcome) return null;

  return (
    <form action={formAction} style={{ margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="tripId" value={tripId} />
      {!exhausted && (
        <>
          <Button type="submit" variant="outline" size="sm" loading={pending} className="self-start">
            {t('place_refresh_button')}
          </Button>
          <small>{t('place_refresh_hint')}</small>
        </>
      )}
      {state.outcome && !pending && <small role="status">{t(MESSAGES[state.outcome])}</small>}
    </form>
  );
}
