import { placeProvider } from '@/lib/places/place-id';
import type { PlaceSuggestion } from '@/lib/places/types';

export function SearchAttribution({ results }: { results: PlaceSuggestion[] }) {
  const google = results.some((r) => placeProvider(r.id) === 'google');
  return (
    <div style={{ fontSize: 10, color: '#86868b', padding: '4px 10px', textAlign: 'right' }}>
      {google ? (
        <span translate="no">Google Maps</span>
      ) : (
        <>
          Powered by{' '}
          <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer noopener">Geoapify</a>
          {' '}· © OpenStreetMap
        </>
      )}
    </div>
  );
}
