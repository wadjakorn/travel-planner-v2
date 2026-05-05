'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Layers, Filter, Locate, ZoomIn, Minus, Route, Clock, GMaps } from '@/components/icons';
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
  category?: string | null;
  time?: string | null;
};

type Mode = 'drive' | 'walk' | 'transit';

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

const MODE_COLOR: Record<Mode, string> = {
  drive: '#0071e3',
  walk: '#22a06b',
  transit: '#ff8a3d',
};

function toGoogleMode(m: Mode): google.maps.TravelMode {
  if (m === 'walk') return google.maps.TravelMode.WALKING;
  if (m === 'transit') return google.maps.TravelMode.TRANSIT;
  return google.maps.TravelMode.DRIVING;
}

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

function PinBadge({
  idx,
  kind,
  active,
}: {
  idx: number;
  kind: string;
  active?: boolean;
}) {
  const bg = active ? '#0071e3' : KIND_COLOR[kind] ?? KIND_COLOR.sight;
  return (
    <div
      style={{
        width: active ? 32 : 28,
        height: active ? 32 : 28,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        fontSize: active ? 13 : 12,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active
          ? '0 4px 12px rgba(0,113,227,0.5)'
          : '0 2px 6px rgba(0,0,0,0.3)',
        border: '2px solid rgba(255,255,255,0.95)',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '-0.02em',
        userSelect: 'none',
        transition: 'transform 120ms ease',
        cursor: 'pointer',
      }}
    >
      {idx}
    </div>
  );
}

function ActiveFocus({
  activePin,
  pinsSig,
}: {
  activePin: Pin | null;
  pinsSig: string;
}) {
  const map = useMap();
  // Pan when active changes or pins change.
  useEffect(() => {
    if (!map || !activePin) return;
    map.panTo({ lat: activePin.lat, lng: activePin.lng });
  }, [map, activePin, pinsSig]);
  // Re-center on viewport resize so active pin stays focused.
  useEffect(() => {
    if (!map || !activePin) return;
    function onResize() {
      if (!map || !activePin) return;
      google.maps.event.trigger(map, 'resize');
      map.panTo({ lat: activePin.lat, lng: activePin.lng });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [map, activePin]);
  return null;
}

function MapDirections({
  pins,
  segmentModes,
  dayId,
  setSegmentModeAction,
  persistSegmentLegAction,
}: {
  pins: Pin[];
  segmentModes?: Mode[];
  dayId?: string;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  persistSegmentLegAction?: (formData: FormData) => Promise<void>;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polysRef = useRef<google.maps.Polyline[]>([]);
  const fallbackRef = useRef<google.maps.Polyline | null>(null);
  const fallbackPersistedRef = useRef<Set<number>>(new Set());
  const legPersistedRef = useRef<Set<string>>(new Set());
  const router = useRouter();

  // Stable signature → only refetch when path actually changes
  const sig = pins
    .map((p, i) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}|${segmentModes?.[i] ?? 'drive'}`)
    .join('>');

  useEffect(() => {
    if (!map || !routesLib || pins.length < 2) return;
    let cancelled = false;

    function clearAll() {
      polysRef.current.forEach((p) => p.setMap(null));
      polysRef.current = [];
      fallbackRef.current?.setMap(null);
      fallbackRef.current = null;
    }
    clearAll();

    Promise.all(
      pins.slice(0, -1).map(async (from, i) => {
        const to = pins[i + 1];
        const requestedMode: Mode = segmentModes?.[i] ?? 'drive';
        try {
          const res = await routesLib.Route.computeRoutes({
            origin: { lat: from.lat, lng: from.lng },
            destination: { lat: to.lat, lng: to.lng },
            travelMode: toGoogleMode(requestedMode),
            fields: ['legs.localizedValues', 'distanceMeters', 'path'],
          });
          return {
            ok: true as const,
            i,
            mode: requestedMode,
            requestedMode,
            res,
          };
        } catch {
          // Auto-fallback only for drive → walk (no road / pedestrian-only
          // zone). Transit failures are NOT silently swapped — user picked
          // transit deliberately; we surface a "route unavailable" hint on
          // the segment row and let them click Navigate to view Google's
          // multi-modal suggestion. Walk failures also do not fall back.
          // Fallback persisted once per leg (fallbackPersistedRef).
          if (requestedMode === 'drive') {
            try {
              const res = await routesLib.Route.computeRoutes({
                origin: { lat: from.lat, lng: from.lng },
                destination: { lat: to.lat, lng: to.lng },
                travelMode: toGoogleMode('walk'),
                fields: ['legs.localizedValues', 'distanceMeters', 'path'],
              });
              return {
                ok: true as const,
                i,
                mode: 'walk' as Mode,
                requestedMode,
                res,
              };
            } catch {
              return {
                ok: false as const,
                i,
                mode: requestedMode,
                requestedMode,
                from,
                to,
              };
            }
          }
          return {
            ok: false as const,
            i,
            mode: requestedMode,
            requestedMode,
            from,
            to,
          };
        }
      }),
    ).then((legs) => {
      if (cancelled || !map) return;
      const fallbacksToPersist: Array<{ idx: number; mode: Mode }> = [];
      const legsToPersist: Array<{ idx: number; mode: Mode; distance: string; time: string; sigKey: string }> = [];
      legs.forEach((leg) => {
        if (leg.ok) {
          if (
            leg.mode !== leg.requestedMode &&
            !fallbackPersistedRef.current.has(leg.i)
          ) {
            fallbackPersistedRef.current.add(leg.i);
            fallbacksToPersist.push({ idx: leg.i, mode: leg.mode });
          }
          const route = leg.res.routes?.[0];
          const legData = route?.legs?.[0];
          const distanceText = legData?.localizedValues?.distance ?? '';
          const timeText = legData?.localizedValues?.staticDuration ?? '';
          if (distanceText && timeText) {
            const sigKey = `${leg.i}|${leg.mode}|${distanceText}|${timeText}`;
            if (!legPersistedRef.current.has(sigKey)) {
              legPersistedRef.current.add(sigKey);
              legsToPersist.push({
                idx: leg.i,
                mode: leg.mode,
                distance: distanceText,
                time: timeText,
                sigKey,
              });
            }
          }
          const path = route?.path;
          if (!path || path.length === 0) return;
          const poly = new google.maps.Polyline({
            path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
            strokeColor: MODE_COLOR[leg.mode],
            strokeWeight: 4,
            strokeOpacity: 0.85,
            map,
          });
          polysRef.current.push(poly);
        } else {
          // Fallback: dashed straight line so user sees the link
          const poly = new google.maps.Polyline({
            path: [
              { lat: leg.from.lat, lng: leg.from.lng },
              { lat: leg.to.lat, lng: leg.to.lng },
            ],
            strokeOpacity: 0,
            icons: [
              {
                icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.6, scale: 2, strokeColor: '#9ca3af' },
                offset: '0',
                repeat: '8px',
              },
            ],
            map,
          });
          polysRef.current.push(poly);
        }
      });

      if (
        fallbacksToPersist.length > 0 &&
        dayId &&
        setSegmentModeAction
      ) {
        Promise.all(
          fallbacksToPersist.map((f) => {
            const fd = new FormData();
            fd.set('dayId', dayId);
            fd.set('idx', String(f.idx));
            fd.set('mode', f.mode);
            return setSegmentModeAction(fd).catch(() => undefined);
          }),
        ).then(() => {
          if (!cancelled) router.refresh();
        });
      }

      if (
        legsToPersist.length > 0 &&
        dayId &&
        persistSegmentLegAction
      ) {
        Promise.all(
          legsToPersist.map((leg) => {
            const fd = new FormData();
            fd.set('dayId', dayId);
            fd.set('idx', String(leg.idx));
            fd.set('mode', leg.mode);
            fd.set('distance', leg.distance);
            fd.set('time', leg.time);
            return persistSegmentLegAction(fd).catch(() => undefined);
          }),
        ).then(() => {
          if (!cancelled) router.refresh();
        });
      }
    });

    return () => {
      cancelled = true;
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routesLib, sig]);

  return null;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
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
      <APIProvider apiKey={API_KEY}>
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
      </APIProvider>

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
