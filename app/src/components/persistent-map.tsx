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
import { useCallback, useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MapDay } from '@/lib/day-augment';
import { formatNear, nearestStop } from '@/lib/map-preview';
import { normalizeBBox, type BBox } from '@/lib/places/bias';
import type { Units } from '@/lib/units';
import { clearMapViewport, setMapViewport } from '@/lib/maps/viewport-store';
import { stopActivateHref } from '@/lib/map-carousel';
import { useMapPreview } from './map-preview-context';
import { MapStopCarousel } from './map-stop-carousel';
import { useIsWide } from './use-trip-map-visible';
import { useGoogleMapsConfig } from './maps-config-provider';
import { usePoiPreview } from './use-poi-preview';

// Map renderers are client-only (maplibre-gl and the Google Maps JS API both need `window`).
const RealMapCanvas = dynamic(() => import('./real-map-canvas'), { ssr: false });

type Props = { tripId: string; mapDays: MapDay[]; units: Units; canEdit: boolean };

export function PersistentMap({ tripId, mapDays, units, canEdit }: Props) {
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
  const { preview, clearPreview, fullMap } = useMapPreview();
  const isWide = useIsWide();
  const { poiAdd } = useGoogleMapsConfig();
  const onPoiClick = usePoiPreview({
    enabled: poiAdd && canEdit,
    dayId: day?.id ?? null,
    dayLabel: day ? `Day ${day.idx + 1}` : 'day',
  });
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

  // The URL (and so activePlaceId) only changes once the server round-trip
  // lands. Show the pin's card at once instead, so the popup never sits on the
  // old pin with stale content while the new place loads.
  const [shownPlaceId, setShownPlaceId] = useOptimistic(activePlaceId);
  const [, startActivate] = useTransition();
  function activate(id: string) {
    const next = shownPlaceId === id ? null : id;
    clearPreview(); // the URL effect above would too, a round-trip later
    startActivate(() => {
      setShownPlaceId(next);
      router.push(stopActivateHref(tripId, dayIdx, next), { scroll: false });
    });
  }
  // Carousel swipe / card tap: never toggles off, and replaces so Back leaves
  // the trip instead of walking back through every card.
  function select(id: string) {
    if (shownPlaceId === id) return;
    clearPreview();
    startActivate(() => {
      setShownPlaceId(id);
      router.replace(stopActivateHref(tripId, dayIdx, id), { scroll: false });
    });
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
            activePlaceId={shownPlaceId}
            onActivate={activate}
            onViewport={onViewport}
            preview={preview}
            hidePinCard={fullMap && !isWide}
            previewNear={preview ? formatNear(nearestStop(day.pins, preview), units) : null}
            onPoiClick={onPoiClick}
          />
      ) : everOpened ? (
        <div className="flex h-full items-center justify-center p-10 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Add a spot to see it on the map.
          </p>
        </div>
      ) : null}
      {everOpened ? (
        <MapStopCarousel
          tripId={tripId}
          days={mapDays}
          dayIdx={dayIdx}
          activePlaceId={shownPlaceId}
          onSelect={select}
        />
      ) : null}
    </section>
  );
}
