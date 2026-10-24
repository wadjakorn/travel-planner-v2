'use client';

import { useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  ColorScheme,
  InfoWindow,
  Map,
  useMap,
} from '@vis.gl/react-google-maps';
import { ZoomIn, Minus, Route, Clock } from '@/components/icons';
import { centroid, deriveZoom } from '@/lib/map-helpers';
import { useTheme } from '@/lib/use-theme';
import { PinBadge } from './map-pin-badge';
import { ActiveFocusGoogle } from './map-active-focus-google';
import { GoogleMapsApi } from './google-maps-api';
import { useGoogleMapsConfig } from './maps-config-provider';
import { useTripMapVisible } from './use-trip-map-visible';
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
    <GoogleMapsApi>
      <Inner {...props} />
    </GoogleMapsApi>
  );
}

function Inner({
  dayLabel,
  totalDistance,
  totalTime,
  pins,
  activePlaceId,
  onActivate,
}: RealMapCanvasProps) {
  const theme = useTheme();
  const { mapId } = useGoogleMapsConfig();
  const map = useMap('trip-map');
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  // setZoom clamps to the map's own min/max, so no bounds math is needed here.
  const zoomBy = (delta: number) => {
    if (!map) return;
    map.setZoom((map.getZoom() ?? deriveZoom(pins)) + delta);
  };
  const showDistChip = Boolean(totalDistance && totalTime);
  const popupId = hoveredPlaceId ?? activePlaceId ?? null;
  const popupPin = popupId ? pins.find((p) => p.id === popupId) : null;

  return (
    <div className={styles.mapWrap} role="region" aria-label="Trip itinerary map">
      {/* reuseMaps: remounts reuse the cached google.maps.Map (no new billed
          load). vis.gl recreates the map itself on a colorScheme/mapId change,
          so no key is needed. */}
      <Map
        id="trip-map"
        reuseMaps
        mapId={mapId}
        colorScheme={theme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT}
        style={{ width: '100%', height: '100%' }}
        defaultCenter={centroid(pins)}
        defaultZoom={deriveZoom(pins)}
        disableDefaultUI
        gestureHandling="greedy"
      >
        <ActiveFocusGoogle
          activePin={
            activePlaceId ? pins.find((p) => p.id === activePlaceId) ?? null : null
          }
          pins={pins}
          pinsSig={pins.map((p) => p.id).join('|')}
        />
        {pins.map((pin) => (
          <AdvancedMarker
            key={pin.id}
            position={{ lat: pin.lat, lng: pin.lng }}
            // Google anchors bottom-centre by default; MapLibre Marker centres.
            anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
            onClick={() => onActivate?.(pin.id)}
          >
            <div
              onMouseEnter={() => setHoveredPlaceId(pin.id)}
              onMouseLeave={() => setHoveredPlaceId(null)}
            >
              <PinBadge idx={pin.idx} kind={pin.kind} active={pin.id === activePlaceId} />
            </div>
          </AdvancedMarker>
        ))}
        {popupPin ? (
          <InfoWindow
            position={{ lat: popupPin.lat, lng: popupPin.lng }}
            // Matches the MapLibre Popup offset={18}.
            pixelOffset={[0, -18]}
            disableAutoPan
            headerDisabled
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
                  {[popupPin.category, popupPin.time].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </InfoWindow>
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
