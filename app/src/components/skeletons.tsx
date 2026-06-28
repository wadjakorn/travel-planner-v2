// Shared loading skeletons for the primary lists. Each is a server component
// that mirrors the real layout's dimensions to avoid layout shift on hydrate.
// The wrapper carries aria-busy + an sr-only "Loading" so assistive tech
// announces the pending state (the Skeleton bars themselves are aria-hidden).

import { Skeleton } from '@/components/ui';

function LoadingRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Home trip grid — header bar + responsive card grid. */
export function TripGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <LoadingRegion label="Loading trips">
      <Skeleton className="h-7 w-44 rounded-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            <Skeleton className="h-36 rounded-none" />
            <div className="space-y-2 px-4 py-3.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Trip itinerary — title block + stacked day cards with place rows. */
export function ItinerarySkeleton({ days = 3 }: { days?: number }) {
  return (
    <LoadingRegion label="Loading itinerary">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: days }).map((_, d) => (
          <div key={d} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, p) => (
                <div key={p} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Map panel — full-bleed canvas placeholder with a pin cluster hint. */
export function MapSkeleton() {
  return (
    <LoadingRegion label="Loading map">
      <div className="relative h-full min-h-[320px] w-full overflow-hidden bg-surface-2">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </LoadingRegion>
  );
}
