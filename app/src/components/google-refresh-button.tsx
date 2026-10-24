'use client';

// "Update from Google" for the edit-place page (TP-0049). Re-fetches Google
// data for this place; a successful refresh remounts the form via router.refresh().

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { refreshPlaceFromGoogleAction } from '@/app/actions/places';
import type { RefreshOutcome } from '@/lib/services/google-sync-service';

const MESSAGES: Record<RefreshOutcome, string> = {
  ok: 'Updated from Google.',
  not_found: 'Google no longer lists this place.',
  invalid: "Google can't look up this place. Pick it again from search.",
  skipped: 'This place changed while updating. Try again.',
  limit: 'Daily Google update limit reached. Try again tomorrow.',
  unavailable: "Couldn't reach Google. Try again later.",
  error: "Couldn't reach Google. Try again later.",
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
          <button type="submit" disabled={pending} style={{ alignSelf: 'flex-start' }}>
            {pending ? 'Updating…' : 'Update from Google'}
          </button>
          <small>Unsaved changes on this page will be lost.</small>
        </>
      )}
      {state.outcome && !pending && <small role="status">{MESSAGES[state.outcome]}</small>}
    </form>
  );
}
