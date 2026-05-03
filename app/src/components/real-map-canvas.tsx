'use client';

import { useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { Layers, Filter, Locate, ZoomIn, Minus, Route, Clock } from '@/components/icons';
import styles from './map-canvas.module.css';

const KIND_COLOR: Record<string, string> = {
  hotel: '#5b3fd9',
  food: '#ff8a3d',
  sight: '#0071e3',
  transit: '#1d1d1f',
};

type Pin = {
  id: string;
  idx: number;
  kind: 'hotel' | 'food' | 'sight' | 'transit';
  lat: number;
  lng: number;
  name?: string;
};

type Props = {
  dayLabel: string;
  totalDistance?: string | null;
  totalTime?: string | null;
  pins: Pin[];
};

function centroid(pins: Pin[]): { lat: number; lng: number } {
  if (pins.length === 0) return { lat: 35.65, lng: 139.74 };
  const lat = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
  const lng = pins.reduce((s, p) => s + p.lng, 0) / pins.length;
  return { lat, lng };
}

function deriveZoom(pins: Pin[]): number {
  if (pins.length < 2) return 14;
  const latSpread = Math.max(...pins.map((p) => p.lat)) - Math.min(...pins.map((p) => p.lat));
  if (latSpread > 1) return 8;
  if (latSpread > 0.1) return 11;
  return 14;
}

function PinBadge({ idx, kind }: { idx: number; kind: string }) {
  const bg = KIND_COLOR[kind] ?? KIND_COLOR.sight;
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        border: '2px solid rgba(255,255,255,0.85)',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '-0.02em',
        userSelect: 'none',
      }}
    >
      {idx}
    </div>
  );
}

function MapPolyline({ pins }: { pins: Pin[] }) {
  const map = useMap();
  const polyRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || pins.length < 2) return;
    polyRef.current?.setMap(null);
    polyRef.current = new google.maps.Polyline({
      path: pins.map((p) => ({ lat: p.lat, lng: p.lng })),
      strokeColor: '#c9a35e',
      strokeWeight: 3,
      strokeOpacity: 0.85,
      icons: [
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
          offset: '0',
          repeat: '12px',
        },
      ],
      map,
    });
    return () => {
      polyRef.current?.setMap(null);
      polyRef.current = null;
    };
  }, [map, pins]);

  return null;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';

export default function RealMapCanvas({ dayLabel, totalDistance, totalTime, pins }: Props) {
  const center = centroid(pins);
  const zoom = deriveZoom(pins);
  const showDistChip = Boolean(totalDistance && totalTime);

  return (
    <div className={styles.mapWrap}>
      <APIProvider apiKey={API_KEY}>
        <Map
          style={{ width: '100%', height: '100%' }}
          defaultCenter={center}
          defaultZoom={zoom}
          {...(MAP_ID ? { mapId: MAP_ID } : {})}
          disableDefaultUI
          gestureHandling="cooperative"
        >
          <MapPolyline pins={pins} />
          {pins.map((pin) => (
            <AdvancedMarker key={pin.id} position={{ lat: pin.lat, lng: pin.lng }}>
              <PinBadge idx={pin.idx} kind={pin.kind} />
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>

      {/* Top-left: day-label chip */}
      <div className={styles.overlayTl}>
        <div className={`${styles.mapPill} ${styles.dayPill}`}>{dayLabel}</div>
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
