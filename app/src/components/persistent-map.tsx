'use client';

// Persistent, lazy Dynamic Map. Rendered once by the trip layout so the single
// <Map> instance (one billed Dynamic Maps load) survives client navigation
// between days AND across trip sub-pages (hotels/notes/budget/…). The layout
// can't read searchParams, so day + active place are read from the URL here.
//
// - Lazy: the <Map> only mounts once the itinerary route is first opened; users
//   who never open the map cost zero map loads.
// - Off-itinerary the section is display:none but the map stays MOUNTED, so
//   returning to the itinerary reuses the same load instead of re-initializing.
// - Keeps `data-trip-map-section` for the mobile full-map CSS (globals.css).

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MapDay } from '@/lib/day-augment';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';
import { MapsProvider } from './maps-provider';
import RealMapCanvas from './real-map-canvas';

type Props = { tripId: string; mapDays: MapDay[] };

export function PersistentMap({ tripId, mapDays }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const onItinerary = pathname === `/trip/${tripId}`;

  // Lazy-mount latch: once the itinerary is opened, keep the map mounted for
  // the rest of the session so navigation away and back reuses the same load.
  // Conditional setState during render (React's "adjust state on prop change"
  // pattern) converges in one pass and never un-latches.
  const [everOpened, setEverOpened] = useState(false);
  if (onItinerary && !everOpened) setEverOpened(true);

  const rawDay = Number(searchParams.get('day'));
  const dayIdx =
    Number.isFinite(rawDay) && rawDay >= 0 && rawDay < mapDays.length
      ? rawDay
      : 0;
  const day = mapDays[dayIdx];
  const rawPlaceId = searchParams.get('placeId');
  const activePlaceId =
    rawPlaceId && day?.pins.some((p) => p.id === rawPlaceId)
      ? rawPlaceId
      : null;

  function activate(id: string) {
    const next = activePlaceId === id ? '' : id;
    const qs = new URLSearchParams();
    qs.set('day', String(dayIdx));
    if (next) qs.set('placeId', next);
    router.push(`/trip/${tripId}?${qs}`, { scroll: false });
  }

  // Guard on the public API key, same as the old page-level renderMap() and
  // place-autocomplete.tsx — without it, mounting MapsProvider would init
  // Google Maps with an empty key. No key → show the placeholder instead.
  const canRenderMap = !!GOOGLE_MAPS_API_KEY && !!day && day.pins.length > 0;

  return (
    <section
      data-trip-map-section
      className={`relative min-h-0 flex-1 bg-zinc-50 dark:bg-zinc-950 ${
        onItinerary ? 'hidden md:block' : 'hidden'
      }`}
    >
      {everOpened && canRenderMap ? (
        <MapsProvider>
          <RealMapCanvas
            dayLabel={`Day ${day.idx + 1} · ${day.label} ${day.num}`}
            totalDistance={day.summaryDistance}
            totalTime={day.summaryTime}
            pins={day.pins}
            activePlaceId={activePlaceId}
            onActivate={activate}
          />
        </MapsProvider>
      ) : everOpened ? (
        <div className="flex h-full items-center justify-center p-10 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Add a spot to see it on the map.
          </p>
        </div>
      ) : null}
    </section>
  );
}
