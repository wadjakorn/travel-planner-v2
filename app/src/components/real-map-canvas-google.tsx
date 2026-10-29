'use client';

import { useCallback, useId, useState, useSyncExternalStore } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  ColorScheme,
  InfoWindow,
  Map,
  useMap,
} from '@vis.gl/react-google-maps';
import { ZoomIn, Minus, Route, Clock } from '@/components/icons';
import { deriveZoom, frameSig, initialCamera, pinPopups } from '@/lib/map-helpers';
import { useTheme } from '@/lib/use-theme';
import { MapPin } from './map-pin';
import { ActiveFocusGoogle } from './map-active-focus-google';
import { RouteLinesGoogle } from './map-route-google';
import { GoogleMapsApi } from './google-maps-api';
import { GoogleMapErrorBoundary } from './google-map-error-boundary';
import { useGoogleMapsConfig } from './maps-config-provider';
import { useTripMapVisible } from './use-trip-map-visible';
import { PreviewMarker, PreviewPopupBody } from './map-preview-marker';
import { PinCard, PinTooltip } from './pin-card';
import { PREVIEW_Z_INDEX, pinAnchor, pinPopupOffset, pinTitle, pinZIndex } from '@/lib/map-pin';
import { isValidGoogleId } from '@/lib/places/google';
import { travelChipLabel } from '@/lib/map-a11y';
import type { RealMapCanvasProps } from './map-renderer-props';
import styles from './map-canvas.module.css';

// Google renderer for the trip map (selected by real-map-canvas.tsx).
//
// Mount-only-when-visible: APIProvider injects the Maps JS script on mount, so
// nothing (not even the provider) renders until the trip map section is first
// visible. After that it stays latched for the session, like persistent-map's
// everOpened; hiding it again is handled by ActiveFocusGoogle.
export default function RealMapCanvasGoogle(props: RealMapCanvasProps) {
  const visible = useTripMapVisible();
  const [everVisible, setEverVisible] = useState(false);
  // "Adjust state on prop change" pattern: converges in one pass, never un-latches.
  if (visible && !everVisible) setEverVisible(true);
  if (!everVisible) return null;
  return (
    <GoogleMapErrorBoundary>
      <GoogleMapsApi>
        <Inner {...props} />
      </GoogleMapsApi>
    </GoogleMapErrorBoundary>
  );
}

function Inner({
  dayLabel,
  summary,
  totalDistance,
  totalTime,
  pins,
  legs,
  activePlaceId,
  onActivate,
  onViewport,
  hover,
  onPinHover,
  preview,
  hidePinCard,
  previewNear,
  onPoiClick,
  fallbackFrame = [],
  emptyNote,
}: RealMapCanvasProps) {
  const theme = useTheme();
  const summaryId = useId();
  const { mapId, degraded } = useGoogleMapsConfig();
  const map = useMap('trip-map');
  // Markers and the popup attach to the live map instance. After an auth
  // failure the map is dead and setting marker.map throws, so render them only
  // while the map has initialised and the session is not degraded.
  const ready = useMapInitialised(map);
  const overlays = ready && !degraded;

  // setZoom clamps to the map's own min/max, so no bounds math is needed here.
  const zoomBy = (delta: number) => {
    if (!map) return;
    map.setZoom((map.getZoom() ?? deriveZoom(pins)) + delta);
  };
  const showDistChip = Boolean(totalDistance && totalTime);
  // Mount-time only (defaultCenter/defaultZoom); ActiveFocusGoogle moves it after.
  const initial = initialCamera(pins.length ? pins : fallbackFrame, preview ?? null);
  // The active pin keeps its card (photo for Google places, ✕) while hovering
  // another pin adds a light name tooltip (M6). A list hover only lifts the pin.
  const { cardId, tipId } = pinPopups({
    hoveredId: hover?.source === 'map' ? hover.placeId : null,
    activeId: activePlaceId ?? null,
    preview: !!preview,
    hideCard: !!hidePinCard,
  });
  const cardPin = cardId ? pins.find((p) => p.id === cardId) : null;
  const tipPin = tipId ? pins.find((p) => p.id === tipId) : null;

  return (
    <div
      className={styles.mapWrap}
      role="region"
      aria-label="Trip itinerary map"
      aria-describedby={summary ? summaryId : undefined}
      // Focus target when a popup closes from inside (usePopupDismiss).
      data-trip-map
      tabIndex={-1}
    >
      {summary ? (
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
      ) : null}
      {/* reuseMaps: remounts reuse the cached google.maps.Map (no new billed
          load). vis.gl recreates the map itself on a colorScheme/mapId change,
          so no key is needed. */}
      <Map
        id="trip-map"
        reuseMaps
        mapId={mapId}
        colorScheme={theme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT}
        style={{ width: '100%', height: '100%' }}
        defaultCenter={initial.center}
        defaultZoom={initial.zoom}
        disableDefaultUI
        gestureHandling="greedy"
        onClick={(e) => {
          const id = e.detail.placeId;
          // Without a handler, don't stop: Google shows its own info window.
          if (id && onPoiClick && isValidGoogleId(id)) {
            e.stop();
            onPoiClick(id);
          }
        }}
        onIdle={(e) => {
          if (degraded) return;
          const b = e.map.getBounds()?.toJSON();
          if (b) onViewport?.(b);
        }}
      >
        <ActiveFocusGoogle
          activePin={
            activePlaceId ? pins.find((p) => p.id === activePlaceId) ?? null : null
          }
          pins={pins}
          frameSig={frameSig(pins, fallbackFrame)}
          fallback={fallbackFrame}
          preview={preview}
          stripVisible={hidePinCard}
        />
        {/* Day route under the pins (polylines live below the marker pane). */}
        {overlays && <RouteLinesGoogle pins={pins} legs={legs ?? []} />}
        {overlays && pins.map((pin) => {
          const active = pin.id === activePlaceId;
          const highlight = pin.id === hover?.placeId;
          return (
            <AdvancedMarker
              key={pin.id}
              position={{ lat: pin.lat, lng: pin.lng }}
              // The marker element is the focusable button; `title` is its
              // accessible name (MapPin itself is aria-hidden here).
              title={pinTitle(pin)}
              // Every marker sets a zIndex (shared scale in lib/map-pin.ts).
              zIndex={pinZIndex(active, highlight)}
              // Drop tip on the coordinate; the stay square is centered.
              anchorPoint={
                pinAnchor(pin.kind) === 'bottom'
                  ? AdvancedMarkerAnchorPoint.BOTTOM
                  : AdvancedMarkerAnchorPoint.CENTER
              }
              onClick={() => onActivate?.(pin.id)}
            >
              <div
                // Mouse only: touch fires a compat enter with no leave, which would
                // pin the tooltip open after the card is closed.
                onPointerEnter={(e) => e.pointerType === 'mouse' && onPinHover?.(pin.id)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && onPinHover?.(null)}
              >
                <MapPin pin={pin} active={active} highlight={highlight} />
              </div>
            </AdvancedMarker>
          );
        })}
        {overlays && preview ? (
          <>
            <AdvancedMarker
              position={{ lat: preview.lat, lng: preview.lng }}
              anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM}
              zIndex={PREVIEW_Z_INDEX}
            >
              <PreviewMarker name={preview.name} />
            </AdvancedMarker>
            <InfoWindow
              position={{ lat: preview.lat, lng: preview.lng }}
              // Above the preview drop (same geometry as a stop pin).
              pixelOffset={[0, -pinPopupOffset('sight', false)]}
              disableAutoPan
              headerDisabled
              shouldFocus={false}
            >
              <PreviewPopupBody key={preview.id} preview={preview} near={previewNear} />
            </InfoWindow>
          </>
        ) : null}
        {overlays && cardPin ? (
          <InfoWindow
            key="card"
            position={{ lat: cardPin.lat, lng: cardPin.lng }}
            // Above the pin; matches the MapLibre Popup offset.
            pixelOffset={[0, -pinPopupOffset(cardPin.kind, true)]}
            disableAutoPan
            headerDisabled
            shouldFocus={false}
          >
            <PinCard key={cardPin.id} pin={cardPin} onClose={() => onActivate?.(cardPin.id)} />
          </InfoWindow>
        ) : null}
        {overlays && tipPin ? (
          <InfoWindow
            key="tip"
            position={{ lat: tipPin.lat, lng: tipPin.lng }}
            pixelOffset={[0, -pinPopupOffset(tipPin.kind, false)]}
            disableAutoPan
            headerDisabled
            shouldFocus={false}
          >
            <PinTooltip pin={tipPin} />
          </InfoWindow>
        ) : null}
      </Map>

      {/* Top-left: day-label chip */}
      <div data-map-day className={styles.overlayTl}>
        <div className={`${styles.mapPill} ${styles.dayPill}`}>{dayLabel}</div>
      </div>

      {/* Bottom-right: zoom +/- buttons */}
      <div data-map-zoom className={styles.overlayBr}>
        <div className={styles.zoomStack}>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
            <ZoomIn />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
            <Minus />
          </button>
        </div>
      </div>

      {/* Bottom-left: distance / time chip, or the empty-day note */}
      {(showDistChip || emptyNote) && (
        <div data-map-dist className={styles.overlayBl}>
          {emptyNote ? (
            <div className={styles.mapPill} role="status">
              {emptyNote}
            </div>
          ) : (
            <>
              {/* One spoken label; the two visual pills are hidden from AT. */}
              <span className="sr-only">
                {travelChipLabel(totalDistance ?? '', totalTime ?? '')}
              </span>
              <div className={styles.mapPill} aria-hidden>
                <Route width={13} height={13} />
                {totalDistance}
              </div>
              <div className={styles.mapPill} aria-hidden>
                <Clock width={13} height={13} />
                {totalTime}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// True once the map has a rendering type (vector/raster). A reused instance is
// initialised already; a map that fails auth may never get there, so markers
// are not attached to it (Google's marker.js would otherwise throw async).
function useMapInitialised(map: google.maps.Map | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!map) return () => {};
      const h = map.addListener('renderingtype_changed', onChange);
      return () => h.remove();
    },
    [map],
  );
  return useSyncExternalStore(
    subscribe,
    () => (map ? map.getRenderingType() !== 'UNINITIALIZED' : false),
    () => false,
  );
}
