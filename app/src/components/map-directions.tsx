'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MODE_COLOR, toGoogleMode, type Mode, type Pin } from '@/lib/map-helpers';

type Props = {
  pins: Pin[];
  segmentModes?: Mode[];
  dayId?: string;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  persistSegmentLegAction?: (formData: FormData) => Promise<void>;
};

export function MapDirections({
  pins,
  segmentModes,
  dayId,
  setSegmentModeAction,
  persistSegmentLegAction,
}: Props) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polysRef = useRef<google.maps.Polyline[]>([]);
  const fallbackRef = useRef<google.maps.Polyline | null>(null);
  const fallbackPersistedRef = useRef<Set<number>>(new Set());
  const legPersistedRef = useRef<Set<string>>(new Set());
  const router = useRouter();

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
