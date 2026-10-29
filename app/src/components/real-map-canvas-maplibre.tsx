'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/maplibre-worker';
import { useRef } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import Map, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import { ZoomIn, Minus, Route, Clock } from '@/components/icons';
import { FIT_MAX_ZOOM, fitPadding, frameSig, initialCamera, pinBounds, pinPopups } from '@/lib/map-helpers';
import { mapStyleUrl } from '@/lib/map-style';
import { useTheme } from '@/lib/use-theme';
import { POPUP_Z_INDEX, PREVIEW_Z_INDEX, pinAnchor, pinPopupOffset, pinZIndex } from '@/lib/map-pin';
import { MapDegradedChip } from './map-degraded-chip';
import { MapPin } from './map-pin';
import { ActiveFocus } from './map-active-focus-maplibre';
import { RouteLinesMaplibre } from './map-route-maplibre';
import { PreviewMarker, PreviewPopupBody } from './map-preview-marker';
import { PinCard, PinTooltip } from './pin-card';
import type { RealMapCanvasProps } from './map-renderer-props';
import styles from './map-canvas.module.css';

// MapLibre renderer for the trip map (selected by real-map-canvas.tsx).
// Presentational map canvas. Mounted once by the trip layout
// (persistent-map.tsx) so this instance survives client navigation; day/active
// selection + routing live in the parent and arrive via props + onActivate.
export default function RealMapCanvasMaplibre({
  dayLabel,
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
  fallbackFrame = [],
  emptyNote,
}: RealMapCanvasProps) {
  const theme = useTheme();
  const mapRef = useRef<MapRef>(null);
  // Mount-time only (initialViewState); ActiveFocus moves it after.
  const frame = pins.length ? pins : fallbackFrame;
  const { center, zoom } = initialCamera(frame, preview ?? null);
  const bounds = pinBounds(frame);

  // Manual zoom controls. zoomTo clamps to the map's own min/max, so no
  // bounds math is needed here.
  const zoomBy = (delta: number) => {
    const m = mapRef.current;
    if (m) m.zoomTo(m.getZoom() + delta);
  };
  const showDistChip = Boolean(totalDistance && totalTime);
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
  const report = (e: { target: MaplibreMap }) => {
    const b = e.target.getBounds();
    onViewport?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  };

  return (
    <div className={styles.mapWrap} role="region" aria-label="Trip itinerary map">
        <Map
          ref={mapRef}
          id="trip-map"
          // isolate: markers now carry z-indexes (10…1000); keep them inside
          // the map so they don't paint over the chips (z 5), the stop
          // carousel or page overlays. Google's .gm-style already does this.
          style={{ width: '100%', height: '100%', isolation: 'isolate' }}
          initialViewState={
            bounds
              ? { bounds, fitBoundsOptions: { padding: fitPadding(false), maxZoom: FIT_MAX_ZOOM } }
              : { longitude: center.lng, latitude: center.lat, zoom }
          }
          mapStyle={mapStyleUrl(theme)}
          onLoad={report}
          onMoveEnd={report}
        >
          <ActiveFocus
            activePin={
              activePlaceId
                ? pins.find((p) => p.id === activePlaceId) ?? null
                : null
            }
            pins={pins}
            frameSig={frameSig(pins, fallbackFrame)}
            fallback={fallbackFrame}
            preview={preview}
            stripVisible={hidePinCard}
          />
          {/* Day route: canvas layers, so always under the DOM pin markers. */}
          <RouteLinesMaplibre pins={pins} legs={legs ?? []} />
          {pins.map((pin) => {
            const active = pin.id === activePlaceId;
            const highlight = pin.id === hover?.placeId;
            const anchor = pinAnchor(pin.kind);
            return (
              <Marker
                // `anchor` is construction-time in react-map-gl: a kind edit
                // (sight ↔ hotel) must remount the marker to re-anchor it.
                key={`${pin.id}:${anchor}`}
                longitude={pin.lng}
                latitude={pin.lat}
                anchor={anchor}
                style={{ zIndex: pinZIndex(active, highlight) }}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  onActivate?.(pin.id);
                }}
              >
                <div
                  // Mouse only: touch fires a compat enter with no leave, which would
                  // pin the tooltip open after the card is closed.
                  onPointerEnter={(e) => e.pointerType === 'mouse' && onPinHover?.(pin.id)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && onPinHover?.(null)}
                >
                  {/* A named <button>: the custom marker element is not focusable.
                      Its click bubbles to the Marker's listener, so Enter/Space
                      activate once with no extra handler. */}
                  <MapPin pin={pin} active={active} highlight={highlight} interactive />
                </div>
              </Marker>
            );
          })}
          {preview ? (
            <>
              <Marker
                longitude={preview.lng}
                latitude={preview.lat}
                anchor="bottom"
                style={{ zIndex: PREVIEW_Z_INDEX }}
              >
                <PreviewMarker name={preview.name} />
              </Marker>
              {/* closeOnClick off: empty-map clicks must not exit the preview. */}
              <Popup
                longitude={preview.lng}
                latitude={preview.lat}
                anchor="bottom"
                offset={pinPopupOffset('sight', false)}
                style={{ zIndex: POPUP_Z_INDEX }}
                closeButton={false}
                closeOnClick={false}
                maxWidth="none"
                focusAfterOpen={false}
                className="tp-preview-popup"
              >
                <PreviewPopupBody key={preview.id} preview={preview} near={previewNear} />
              </Popup>
            </>
          ) : null}
          {cardPin ? (
            <Popup
              key="card"
              longitude={cardPin.lng}
              latitude={cardPin.lat}
              anchor="bottom"
              offset={pinPopupOffset(cardPin.kind, true)}
              style={{ zIndex: POPUP_Z_INDEX }}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
              maxWidth="none"
              className="tp-preview-popup"
            >
              <PinCard key={cardPin.id} pin={cardPin} onClose={() => onActivate?.(cardPin.id)} />
            </Popup>
          ) : null}
          {tipPin ? (
            <Popup
              key="tip"
              longitude={tipPin.lng}
              latitude={tipPin.lat}
              anchor="bottom"
              offset={pinPopupOffset(tipPin.kind, false)}
              style={{ zIndex: POPUP_Z_INDEX }}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
            >
              <PinTooltip pin={tipPin} />
            </Popup>
          ) : null}
        </Map>

      {/* Top-right: "Backup map" notice while Google is unavailable */}
      <MapDegradedChip />

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
              <div className={styles.mapPill}>
                <Route width={13} height={13} />
                {totalDistance}
              </div>
              <div className={styles.mapPill}>
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
