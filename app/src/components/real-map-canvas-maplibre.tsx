'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/maplibre-worker';
import { useRef, useState } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import Map, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import { ZoomIn, Minus, Route, Clock } from '@/components/icons';
import { FIT_MAX_ZOOM, FIT_PADDING, centroid, deriveZoom, pinBounds } from '@/lib/map-helpers';
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
  preview,
  hidePinCard,
  previewNear,
}: RealMapCanvasProps) {
  const theme = useTheme();
  const mapRef = useRef<MapRef>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const center = centroid(pins);
  const zoom = deriveZoom(pins);
  const bounds = pinBounds(pins);

  // Manual zoom controls. zoomTo clamps to the map's own min/max, so no
  // bounds math is needed here.
  const zoomBy = (delta: number) => {
    const m = mapRef.current;
    if (m) m.zoomTo(m.getZoom() + delta);
  };
  const showDistChip = Boolean(totalDistance && totalTime);
  // One popup at a time: the search preview's card wins over hover/active.
  const popupId = preview ? null : hoveredPlaceId ?? activePlaceId ?? null;
  // The active pin gets the card (photo for Google places) with its ✕; hover
  // stays a light tooltip.
  const pinCard = !!popupId && popupId === activePlaceId;
  const popupPin = popupId && !(pinCard && hidePinCard) ? pins.find((p) => p.id === popupId) : null;
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
              ? { bounds, fitBoundsOptions: { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM } }
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
            pinsSig={pins.map((p) => p.id).join('|')}
            preview={preview}
            stripVisible={hidePinCard}
          />
          {/* Day route: canvas layers, so always under the DOM pin markers. */}
          <RouteLinesMaplibre pins={pins} legs={legs ?? []} />
          {pins.map((pin) => {
            const active = pin.id === activePlaceId;
            const anchor = pinAnchor(pin.kind);
            return (
              <Marker
                // `anchor` is construction-time in react-map-gl: a kind edit
                // (sight ↔ hotel) must remount the marker to re-anchor it.
                key={`${pin.id}:${anchor}`}
                longitude={pin.lng}
                latitude={pin.lat}
                anchor={anchor}
                style={{ zIndex: pinZIndex(active) }}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  onActivate?.(pin.id);
                }}
              >
                <div
                  // Mouse only: touch fires a compat enter with no leave, which would
                  // pin the tooltip open after the card is closed.
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHoveredPlaceId(pin.id)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setHoveredPlaceId(null)}
                >
                  {/* A named <button>: the custom marker element is not focusable.
                      Its click bubbles to the Marker's listener, so Enter/Space
                      activate once with no extra handler. */}
                  <MapPin pin={pin} active={active} interactive />
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
          {popupPin ? (
            <Popup
              key={pinCard ? 'card' : 'tip'}
              longitude={popupPin.lng}
              latitude={popupPin.lat}
              anchor="bottom"
              offset={pinPopupOffset(popupPin.kind, pinCard)}
              style={{ zIndex: POPUP_Z_INDEX }}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
              {...(pinCard ? { maxWidth: 'none', className: 'tp-preview-popup' } : {})}
            >
              {pinCard ? (
                <PinCard key={popupPin.id} pin={popupPin} onClose={() => onActivate?.(popupPin.id)} />
              ) : (
                <PinTooltip pin={popupPin} />
              )}
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

      {/* Bottom-left: distance / time chip */}
      {showDistChip && (
        <div data-map-dist className={styles.overlayBl}>
          <div className={styles.mapPill}>
            <Route width={13} height={13} />
            {totalDistance}
          </div>
          <div className={styles.mapPill}>
            <Clock width={13} height={13} />
            {totalTime}
          </div>
        </div>
      )}
    </div>
  );
}
