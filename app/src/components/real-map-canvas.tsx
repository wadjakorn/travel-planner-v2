'use client';

import { useState } from 'react';
import {
  Map,
  AdvancedMarker,
  InfoWindow,
  ColorScheme,
  useMap,
} from '@vis.gl/react-google-maps';
import { ZoomIn, Minus, Route, Clock } from '@/components/icons';
import { centroid, deriveZoom, type Pin } from '@/lib/map-helpers';
import { useTheme } from '@/lib/use-theme';
import { PinBadge } from './map-pin-badge';
import { ActiveFocus } from './map-active-focus';
import styles from './map-canvas.module.css';

// Presentational map canvas. The <MapsProvider> is hoisted to the trip layout
// (persistent-map.tsx) so this instance survives client navigation; day/active
// selection + routing live in the parent and arrive via props + onActivate.
type Props = {
  dayLabel: string;
  totalDistance?: string | null;
  totalTime?: string | null;
  pins: Pin[];
  activePlaceId?: string | null;
  onActivate?: (id: string) => void;
};

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';

export default function RealMapCanvas({
  dayLabel,
  totalDistance,
  totalTime,
  pins,
  activePlaceId,
  onActivate,
}: Props) {
  const theme = useTheme();
  const map = useMap('trip-map');
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const center = centroid(pins);
  const zoom = deriveZoom(pins);

  // Manual zoom controls. setZoom clamps to the map's own min/max, so no
  // bounds math is needed here.
  const zoomBy = (delta: number) => {
    if (!map) return;
    const current = map.getZoom() ?? zoom;
    map.setZoom(current + delta);
  };
  const showDistChip = Boolean(totalDistance && totalTime);
  const popupId = hoveredPlaceId ?? activePlaceId ?? null;
  const popupPin = popupId ? pins.find((p) => p.id === popupId) : null;

  return (
    <div className={styles.mapWrap} role="region" aria-label="Trip itinerary map">
        <Map
          id="trip-map"
          style={{ width: '100%', height: '100%' }}
          defaultCenter={center}
          defaultZoom={zoom}
          colorScheme={theme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT}
          {...(MAP_ID ? { mapId: MAP_ID } : {})}
          disableDefaultUI
          gestureHandling="greedy"
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
            <AdvancedMarker
              key={pin.id}
              position={{ lat: pin.lat, lng: pin.lng }}
              onClick={() => onActivate?.(pin.id)}
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
            </AdvancedMarker>
          ))}
          {popupPin ? (
            <InfoWindow
              position={{ lat: popupPin.lat, lng: popupPin.lng }}
              pixelOffset={[0, -32]}
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
                    {[popupPin.category, popupPin.time]
                      .filter(Boolean)
                      .join(' · ')}
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
