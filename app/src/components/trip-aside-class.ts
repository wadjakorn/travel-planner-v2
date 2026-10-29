// Itinerary list column sizing, shared by the trip page's <aside> and its
// loading skeleton so the two occupy exactly the same box (no map jump when
// the page streams in). dvh, not vh: on tablets 100vh ignores the browser
// toolbar and pushes the map's zoom controls below the fold (TP-0066).
export const TRIP_ASIDE_CLASS =
  'h-[calc(100dvh_-_var(--header-h)_-_56px)] min-h-0 flex-1 overflow-y-auto border-r border-zinc-200 pb-24 dark:border-zinc-800 md:h-[calc(100dvh_-_var(--header-h))] md:w-[400px] md:flex-none md:pb-0 lg:w-[440px]';
