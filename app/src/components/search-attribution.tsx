'use client';

import { placeProvider } from '@/lib/places/place-id';
import { useT } from '@/components/i18n-provider';
import type { PlaceSuggestion } from '@/lib/places/types';

// Provider attribution (ToS): the names stay as they are in every language.
const GEOAPIFY = 'Geoapify';

export function SearchAttribution({ results }: { results: PlaceSuggestion[] }) {
  const t = useT();
  const [beforeProvider, afterProvider = ''] = t('place_attr_powered_by').split('{provider}');
  const google = results.some((r) => placeProvider(r.id) === 'google');
  return (
    <div style={{ fontSize: 12, color: '#86868b', padding: '4px 10px', textAlign: 'right' }}>
      {google ? (
        <span translate="no">{t('place_attr_google_maps')}</span>
      ) : (
        <>
          {beforeProvider}
          <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer noopener">{GEOAPIFY}</a>
          {afterProvider}
        </>
      )}
    </div>
  );
}
