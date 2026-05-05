export const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// "alpha" required for google.maps.routes.Route (used by map-directions.tsx).
// Consumed exclusively by `components/maps-provider.tsx` — mount the wrapper,
// don't pass this directly to <APIProvider>, or the Maps JS loader will warn
// "already loaded with different parameters" on any drift.
export const GOOGLE_MAPS_VERSION = 'alpha';
