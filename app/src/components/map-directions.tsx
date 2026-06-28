'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MODE_COLOR, type Mode, type Pin } from '@/lib/map-helpers';
import {
  computeRouteLegAction,
  type ComputeRouteActionResult,
} from '@/app/actions/routes';

type Props = {
  pins: Pin[];
  segmentModes?: Mode[];
  dayId?: string;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  persistSegmentLegAction?: (formData: FormData) => Promise<void>;
};

// Compute one leg via the server action. Returns the action result tagged
// with the leg index + requested mode so we can correlate after Promise.all.
async function callLeg(
  i: number,
  from: Pin,
  to: Pin,
  requestedMode: Mode,
  mode: Mode,
): Promise<{ i: number; requestedMode: Mode; result: ComputeRouteActionResult }> {
  const fd = new FormData();
  fd.set('originLat', String(from.lat));
  fd.set('originLng', String(from.lng));
  fd.set('destLat', String(to.lat));
  fd.set('destLng', String(to.lng));
  fd.set('mode', mode);
  const result = await computeRouteLegAction(fd);
  return { i, requestedMode, result };
}

export function MapDirections({
  pins,
  segmentModes,
  dayId,
  setSegmentModeAction,
  persistSegmentLegAction,
}: Props) {
  const map = useMap();
  const geometryLib = useMapsLibrary('geometry');
  const polysRef = useRef<google.maps.Polyline[]>([]);
  const fallbackPersistedRef = useRef<Set<number>>(new Set());
  const legPersistedRef = useRef<Set<string>>(new Set());
  const router = useRouter();

  const sig = pins
    .map((p, i) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}|${segmentModes?.[i] ?? 'drive'}`)
    .join('>');

  useEffect(() => {
    if (!map || !geometryLib || pins.length < 2) return;
    let cancelled = false;

    function clearAll() {
      polysRef.current.forEach((p) => p.setMap(null));
      polysRef.current = [];
    }
    clearAll();

    Promise.all(
      pins.slice(0, -1).map(async (from, i) => {
        const to = pins[i + 1];
        const requestedMode: Mode = segmentModes?.[i] ?? 'drive';
        const primary = await callLeg(i, from, to, requestedMode, requestedMode);
        if (primary.result.ok) return primary;

        // Auto-fallback only for drive → walk (no road / pedestrian-only
        // zone). Transit failures are NOT silently swapped — user picked
        // transit deliberately; we surface a dashed line on the segment
        // and let them click Navigate for Google's multi-modal suggestion.
        // Walk failures also do not fall back.
        if (requestedMode === 'drive') {
          return callLeg(i, from, to, requestedMode, 'walk');
        }
        return primary;
      }),
    ).then((legs) => {
      if (cancelled || !map) return;
      const fallbacksToPersist: Array<{ idx: number; mode: Mode }> = [];
      const legsToPersist: Array<{
        idx: number;
        mode: Mode;
        distance: string;
        time: string;
        sigKey: string;
      }> = [];

      legs.forEach(({ i, requestedMode, result }) => {
        if (!result.ok) {
          // Render dashed straight line so user sees the link.
          const from = pins[i];
          const to = pins[i + 1];
          const poly = new google.maps.Polyline({
            path: [
              { lat: from.lat, lng: from.lng },
              { lat: to.lat, lng: to.lng },
            ],
            strokeOpacity: 0,
            icons: [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 0.6,
                  scale: 2,
                  strokeColor: '#9ca3af',
                },
                offset: '0',
                repeat: '8px',
              },
            ],
            map,
          });
          polysRef.current.push(poly);
          return;
        }

        const { mode, distance, time, polyline } = result;

        if (mode !== requestedMode && !fallbackPersistedRef.current.has(i)) {
          fallbackPersistedRef.current.add(i);
          fallbacksToPersist.push({ idx: i, mode });
        }

        if (distance && time) {
          const sigKey = `${i}|${mode}|${distance}|${time}`;
          if (!legPersistedRef.current.has(sigKey)) {
            legPersistedRef.current.add(sigKey);
            legsToPersist.push({ idx: i, mode, distance, time, sigKey });
          }
        }

        const path = geometryLib.encoding.decodePath(polyline);
        if (path.length === 0) return;

        // White casing under the colored stroke for legibility on any basemap.
        const casing = new google.maps.Polyline({
          path,
          strokeColor: '#ffffff',
          strokeWeight: 7,
          strokeOpacity: 0.9,
          zIndex: 1,
          map,
        });
        polysRef.current.push(casing);

        const poly = new google.maps.Polyline({
          path,
          strokeColor: MODE_COLOR[mode],
          strokeWeight: 4,
          strokeOpacity: 0.95,
          zIndex: 2,
          map,
        });
        polysRef.current.push(poly);
      });

      if (fallbacksToPersist.length > 0 && dayId && setSegmentModeAction) {
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

      if (legsToPersist.length > 0 && dayId && persistSegmentLegAction) {
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
  }, [map, geometryLib, sig]);

  return null;
}
