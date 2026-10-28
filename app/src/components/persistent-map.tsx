'use client';

// Persistent, lazy map. Rendered once by the trip layout so the single
// <Map> instance (no fresh WebGL context per navigation) survives client navigation
// between days AND across trip sub-pages (hotels/notes/budget/…). The layout
// can't read searchParams, so day + active place are read from the URL here.
//
// - Lazy: the <Map> only mounts once the itinerary route is first opened; users
//   who never open the map never load maplibre or tiles.
// - Off-itinerary the section is display:none but the map stays MOUNTED, so
//   returning to the itinerary reuses the same WebGL context instead of re-initializing.
// - Keeps `data-trip-map-section` for the mobile full-map CSS (globals.css).

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MapDay } from '@/lib/day-augment';
import { normalizeBBox, type BBox } from '@/lib/places/bias';
import { clearMapViewport, setMapViewport } from '@/lib/maps/viewport-store';
import { useMapPreview } from './map-preview-context';

// Map renderers are client-only (maplibre-gl and the Google Maps JS API both need `window`).
const RealMapCanvas = dynamic(() => import('./real-map-canvas'), { ssr: false });

type Props = { tripId: string; mapDays: MapDay[] };

export function PersistentMap({ tripId, mapDays }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const onItinerary = pathname === `/trip/${tripId}`;

  // Lazy-mount latch: once the itinerary is opened, keep the map mounted for
  // the rest of the session so navigation away and back reuses the same map.
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

  // Search preview (TP-0062). Selecting any place — a pin here or a row in the
  // list, both of which change ?placeId= — exits it.
  const { preview, clearPreview } = useMapPreview();
  const prevActive = useRef(activePlaceId);
  useEffect(() => {
    if (prevActive.current === activePlaceId) return;
    prevActive.current = activePlaceId;
    clearPreview();
  }, [activePlaceId, clearPreview]);

  // Keeps the canvas mounted after a preview on an empty day, through the
  // add -> router.refresh() gap (no WebGL re-init) and until the day changes.
  const [shownForDay, setShownForDay] = useState<number | null>(null);
  if (preview && shownForDay !== dayIdx) setShownForDay(dayIdx);

  function activate(id: string) {
    const next = activePlaceId === id ? '' : id;
    const qs = new URLSearchParams();
    qs.set('day', String(dayIdx));
    if (next) qs.set('placeId', next);
    router.push(`/trip/${tripId}?${qs}`, { scroll: false });
  }

  const canRenderMap = !!day && (day.pins.length > 0 || preview != null || shownForDay === dayIdx);
  const dayIdRef = useRef<string | null>(day?.id ?? null);
  // Layout, not passive: ActiveFocus's passive-effect refit fires a synchronous
  // moveend in the same commit, and it must be tagged with the NEW day.
  useLayoutEffect(() => {
    dayIdRef.current = day?.id ?? null;
  }, [day?.id]);
  const onViewport = useCallback(
    (raw: BBox) => {
      const bbox = normalizeBBox(raw);
      const dayId = dayIdRef.current;
      if (bbox && dayId) setMapViewport({ tripId, dayId, bbox });
      else clearMapViewport();
    },
    [tripId],
  );

  useEffect(() => {
    if (!(everOpened && canRenderMap)) clearMapViewport();
  }, [everOpened, canRenderMap]);
  useEffect(() => clearMapViewport, []);

  return (
    <section
      data-trip-map-section
      className={`relative min-h-0 flex-1 bg-zinc-50 dark:bg-zinc-950 ${
        onItinerary ? 'hidden md:block' : 'hidden'
      }`}
    >
      {everOpened && canRenderMap ? (
          <RealMapCanvas
            dayLabel={`Day ${day.idx + 1} · ${day.label} ${day.num}`}
            totalDistance={day.summaryDistance}
            totalTime={day.summaryTime}
            pins={day.pins}
            activePlaceId={activePlaceId}
            onActivate={activate}
            onViewport={onViewport}
            preview={preview}
          />
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
