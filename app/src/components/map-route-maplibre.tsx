'use client';

import { useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { ROUTE_CASING_COLOR, type MapLeg, type Pin } from '@/lib/map-helpers';
import { ROUTE_BADGE_Z_INDEX } from '@/lib/map-pin';
import {
  CASING_OPACITY,
  CASING_WIDTH,
  ROUTE_OPACITY,
  ROUTE_WIDTH,
  legsGeoJSON,
  routeArcs,
} from '@/lib/map-route';
import { RouteBadge } from './map-route-badge';

const ROUND = { 'line-cap': 'round', 'line-join': 'round' } as const;

// The shown day's route on the MapLibre trip map (inside react-map-gl <Map>).
// One persistent source whose data swaps per day (no layer churn): casing and
// line layers. No interactiveLayerIds, so the lines never take clicks. Mode
// badges are DOM markers with pointer-events off; explicit zIndex because
// marker DOM order changes as ghosts remount.
export function RouteLinesMaplibre({ pins, legs }: { pins: Pin[]; legs: MapLeg[] }) {
  const arcs = useMemo(() => routeArcs(pins, legs), [pins, legs]);
  const data = useMemo(() => legsGeoJSON(arcs), [arcs]);

  return (
    <>
      <Source id="tp-route" type="geojson" data={data}>
        <Layer
          id="tp-route-casing"
          type="line"
          layout={ROUND}
          paint={{
            'line-color': ROUTE_CASING_COLOR,
            'line-width': CASING_WIDTH,
            'line-opacity': CASING_OPACITY,
          }}
        />
        <Layer
          id="tp-route-line"
          type="line"
          layout={ROUND}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': ROUTE_WIDTH,
            'line-opacity': ROUTE_OPACITY,
          }}
        />
      </Source>
      {arcs.map((arc) =>
        arc.showBadge && arc.mode ? (
          <Marker
            key={`route:${arc.key}`}
            longitude={arc.mid.lng}
            latitude={arc.mid.lat}
            anchor="center"
            style={{ pointerEvents: 'none', zIndex: ROUTE_BADGE_Z_INDEX }}
          >
            <RouteBadge mode={arc.mode} color={arc.color} />
          </Marker>
        ) : null,
      )}
    </>
  );
}
