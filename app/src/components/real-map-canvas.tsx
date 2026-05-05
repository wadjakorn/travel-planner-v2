'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Map,
  AdvancedMarker,
  InfoWindow,
} from '@vis.gl/react-google-maps';
import { Layers, Filter, Locate, ZoomIn, Minus, Route, Clock, GMaps } from '@/components/icons';
import { centroid, deriveZoom, type Mode, type Pin } from '@/lib/map-helpers';
import { MapsProvider } from './maps-provider';
import { PinBadge } from './map-pin-badge';
import { ActiveFocus } from './map-active-focus';
import { MapDirections } from './map-directions';
import styles from './map-canvas.module.css';

type Props = {
  dayLabel: string;
  totalDistance?: string | null;
  totalTime?: string | null;
  pins: Pin[];
  segmentModes?: Mode[];
  dayId?: string;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  persistSegmentLegAction?: (formData: FormData) => Promise<void>;
  activePlaceId?: string | null;
  tripId?: string;
  dayIdx?: number;
};

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';

export default function RealMapCanvas({
  dayLabel,
  totalDistance,
  totalTime,
  pins,
  segmentModes,
  dayId,
  setSegmentModeAction,
  persistSegmentLegAction,
  activePlaceId,
  tripId,
  dayIdx,
}: Props) {
  const router = useRouter();
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const center = centroid(pins);
  const zoom = deriveZoom(pins);
  const showDistChip = Boolean(totalDistance && totalTime);
  const popupId = hoveredPlaceId ?? activePlaceId ?? null;
  const popupPin = popupId ? pins.find((p) => p.id === popupId) : null;

  function activate(id: string) {
    if (!tripId) return;
    const next = activePlaceId === id ? '' : id;
    const qs = new URLSearchParams();
    if (typeof dayIdx === 'number') qs.set('day', String(dayIdx));
    if (next) qs.set('placeId', next);
    router.push(`/trip/${tripId}${qs.toString() ? `?${qs}` : ''}`, { scroll: false });
  }

  return (
    <div className={styles.mapWrap}>
      <MapsProvider>
        <Map
          style={{ width: '100%', height: '100%' }}
          defaultCenter={center}
          defaultZoom={zoom}
          {...(MAP_ID ? { mapId: MAP_ID } : {})}
          disableDefaultUI
          gestureHandling="cooperative"
        >
          <MapDirections
            pins={pins}
            segmentModes={segmentModes}
            dayId={dayId}
            setSegmentModeAction={setSegmentModeAction}
            persistSegmentLegAction={persistSegmentLegAction}
          />
          <ActiveFocus
            activePin={
              activePlaceId
                ? pins.find((p) => p.id === activePlaceId) ?? null
                : null
            }
            pinsSig={pins.map((p) => p.id).join('|')}
          />
          {pins.map((pin) => (
            <AdvancedMarker
              key={pin.id}
              position={{ lat: pin.lat, lng: pin.lng }}
              onClick={() => activate(pin.id)}
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
      </MapsProvider>

      {/* Top-left: day-label chip + Open in Maps */}
      <div className={styles.overlayTl}>
        <div className={`${styles.mapPill} ${styles.dayPill}`}>{dayLabel}</div>
        {pins.length > 0 ? (
          <a
            href={`https://www.google.com/maps/dir/${pins
              .map((p) => `${p.lat},${p.lng}`)
              .join('/')}`}
            target="_blank"
            rel="noreferrer"
            className={`${styles.mapPill} ${styles.openMapsLink}`}
          >
            <GMaps width={13} height={13} />
            Open in Maps
          </a>
        ) : null}
      </div>

      {/* Top-right: Layers / Filter / Locate icon stack */}
      <div className={styles.overlayTr}>
        <div className={styles.mapIconStack}>
          <button type="button" aria-label="Layers">
            <Layers />
          </button>
          <button type="button" aria-label="Filter">
            <Filter />
          </button>
          <button type="button" aria-label="Locate">
            <Locate />
          </button>
        </div>
      </div>

      {/* Bottom-right: zoom +/- buttons */}
      <div className={styles.overlayBr}>
        <div className={styles.zoomStack}>
          <button type="button" aria-label="Zoom in">
            <ZoomIn />
          </button>
          <button type="button" aria-label="Zoom out">
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
