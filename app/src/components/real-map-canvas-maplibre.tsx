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
import { PinBadge } from './map-pin-badge';
import { ActiveFocus } from './map-active-focus-maplibre';
import { PreviewMarker, PreviewPopupBody } from './map-preview-marker';
import { PinCard } from './pin-card';
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
  activePlaceId,
  onActivate,
  onViewport,
  preview,
  hidePinCard,
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
          style={{ width: '100%', height: '100%' }}
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
          />
          {pins.map((pin) => (
            <Marker
              key={pin.id}
              longitude={pin.lng}
              latitude={pin.lat}
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
                <PinBadge
                  idx={pin.idx}
                  kind={pin.kind}
                  active={pin.id === activePlaceId}
                />
              </div>
            </Marker>
          ))}
          {preview ? (
            <>
              <Marker longitude={preview.lng} latitude={preview.lat}>
                <PreviewMarker name={preview.name} />
              </Marker>
              {/* closeOnClick off: empty-map clicks must not exit the preview. */}
              <Popup
                longitude={preview.lng}
                latitude={preview.lat}
                anchor="bottom"
                offset={22}
                closeButton={false}
                closeOnClick={false}
                maxWidth="none"
                focusAfterOpen={false}
                className="tp-preview-popup"
              >
                <PreviewPopupBody key={preview.id} preview={preview} />
              </Popup>
            </>
          ) : null}
          {popupPin ? (
            <Popup
              key={pinCard ? 'card' : 'tip'}
              longitude={popupPin.lng}
              latitude={popupPin.lat}
              anchor="bottom"
              offset={18}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
              {...(pinCard ? { maxWidth: 'none', className: 'tp-preview-popup' } : {})}
            >
              {pinCard ? (
                <PinCard key={popupPin.id} pin={popupPin} onClose={() => onActivate?.(popupPin.id)} />
              ) : (
                <div
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: 13,
                    minWidth: 140,
                    color: '#1d1d1f',
                    padding: '4px 6px',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {popupPin.name ?? `Stop ${popupPin.idx}`}
                  </div>
                  {(popupPin.category || popupPin.time) && (
                    <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2 }}>
                      {[popupPin.category, popupPin.time]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </Popup>
          ) : null}
        </Map>

      {/* Top-left: day-label chip */}
      <div className={styles.overlayTl}>
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
