'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/maplibre-worker';
import { useRef, useState } from 'react';
import Map, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import { ZoomIn, Minus, Route, Clock } from '@/components/icons';
import { FIT_MAX_ZOOM, FIT_PADDING, centroid, deriveZoom, pinBounds } from '@/lib/map-helpers';
import { mapStyleUrl } from '@/lib/map-style';
import { useTheme } from '@/lib/use-theme';
import { PinBadge } from './map-pin-badge';
import { ActiveFocus } from './map-active-focus-maplibre';
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
  const popupId = hoveredPlaceId ?? activePlaceId ?? null;
  const popupPin = popupId ? pins.find((p) => p.id === popupId) : null;

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
        >
          <ActiveFocus
            activePin={
              activePlaceId
                ? pins.find((p) => p.id === activePlaceId) ?? null
                : null
            }
            pins={pins}
            pinsSig={pins.map((p) => p.id).join('|')}
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
                onMouseEnter={() => setHoveredPlaceId(pin.id)}
                onMouseLeave={() => setHoveredPlaceId(null)}
              >
                <PinBadge
                  idx={pin.idx}
                  kind={pin.kind}
                  active={pin.id === activePlaceId}
                />
              </div>
            </Marker>
          ))}
          {popupPin ? (
            <Popup
              longitude={popupPin.lng}
              latitude={popupPin.lat}
              anchor="bottom"
              offset={18}
              closeButton={false}
              closeOnClick={false}
            >
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
            </Popup>
          ) : null}
        </Map>

      {/* Top-left: day-label chip */}
      <div className={styles.overlayTl}>
        <div className={`${styles.mapPill} ${styles.dayPill}`}>{dayLabel}</div>
      </div>

      {/* Bottom-right: zoom +/- buttons */}
      <div className={styles.overlayBr}>
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
        <div className={styles.overlayBl}>
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
