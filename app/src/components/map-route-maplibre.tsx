'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layer, Marker, Source, useMap } from 'react-map-gl/maplibre';
import { ROUTE_CASING_COLOR } from '@/lib/map-helpers';
import { ROUTE_BADGE_Z_INDEX, stopName } from '@/lib/map-pin';
import {
  CASING_OPACITY,
  CASING_WIDTH,
  ROUTE_HALO_OPACITY,
  ROUTE_HALO_WIDTH,
  ROUTE_HIT_WIDTH,
  ROUTE_OPACITY,
  ROUTE_WIDTH,
  activeArcKey,
  badgeLabelled,
  legsGeoJSON,
  type RouteArc,
} from '@/lib/map-route';
import { RouteBadge } from './map-route-badge';
import { useT } from './i18n-provider';

const ROUND = { 'line-cap': 'round', 'line-join': 'round' } as const;

/** The invisible tap-target layer; the canvas lists it in the Map's interactiveLayerIds. */
export const ROUTE_HIT_LAYER = 'tp-route-hit';

type Props = {
  /** The shown day's arcs (routeArcs), computed once by the canvas. */
  arcs: RouteArc[];
  /** Route lines toggle (lib/maps/legs-store). */
  show: boolean;
  /** Badges take taps (and the canvas queries the hit layer). */
  interactive: boolean;
  /** The selected stop: its incoming leg gets a halo and an active badge. */
  activePlaceId: string | null;
  onSelect: (arc: RouteArc) => void;
};

/** The map's zoom, rounded: re-renders only when the whole number changes. null until the map is up. */
function useRoundZoom(): number | null {
  const { current: map } = useMap();
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    if (!map) return;
    const read = () => setZoom(Math.round(map.getZoom()));
    read();
    map.on('zoomend', read);
    return () => {
      map.off('zoomend', read);
    };
  }, [map]);
  return zoom;
}

// The shown day's route on the MapLibre trip map (inside react-map-gl <Map>).
// One persistent source whose data swaps per day (no layer churn): a wide,
// invisible hit layer under the casing and line layers; hiding the route flips
// their visibility instead of removing them. Line taps are read by the canvas's
// Map onClick. Leg capsules are DOM markers, buttons only while interactive,
// labelled only when the leg is long enough on screen at the current zoom;
// explicit zIndex because marker DOM order changes as ghosts remount. The
// selected stop's incoming leg gets a halo layer under its casing.
export function RouteLinesMaplibre({ arcs, show, interactive, activePlaceId, onSelect }: Props) {
  const t = useT();
  const zoom = useRoundZoom();
  const data = useMemo(() => legsGeoJSON(arcs), [arcs]);
  const layout = { ...ROUND, visibility: show ? 'visible' : 'none' } as const;
  const activeKey = activeArcKey(arcs, activePlaceId);

  return (
    <>
      <Source id="tp-route" type="geojson" data={data}>
        <Layer
          id={ROUTE_HIT_LAYER}
          type="line"
          layout={layout}
          paint={{ 'line-color': ROUTE_CASING_COLOR, 'line-width': ROUTE_HIT_WIDTH, 'line-opacity': 0 }}
        />
        <Layer
          id="tp-route-halo"
          type="line"
          layout={layout}
          filter={['==', ['get', 'key'], activeKey ?? '']}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': ROUTE_HALO_WIDTH,
            'line-opacity': ROUTE_HALO_OPACITY,
          }}
        />
        <Layer
          id="tp-route-casing"
          type="line"
          layout={layout}
          paint={{
            'line-color': ROUTE_CASING_COLOR,
            'line-width': CASING_WIDTH,
            'line-opacity': CASING_OPACITY,
          }}
        />
        <Layer
          id="tp-route-line"
          type="line"
          layout={layout}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': ROUTE_WIDTH,
            'line-opacity': ROUTE_OPACITY,
          }}
        />
      </Source>
      {show &&
        arcs.map((arc) =>
          arc.showBadge && arc.mode ? (
            <Marker
              key={`route:${arc.key}`}
              longitude={arc.mid.lng}
              latitude={arc.mid.lat}
              anchor="center"
              style={{ pointerEvents: interactive ? 'auto' : 'none', zIndex: ROUTE_BADGE_Z_INDEX }}
              onClick={(e) => {
                if (!interactive) return;
                // The marker sits in the canvas container: unstopped, the Map click
                // would also read the hit layer under the badge.
                e.originalEvent.stopPropagation();
                onSelect(arc);
              }}
            >
              <RouteBadge
                mode={arc.mode}
                color={arc.color}
                toId={arc.toId}
                interactive={interactive}
                name={t('map_leg_go', { name: stopName(arc.toPin, t) })}
                durationMin={arc.info.durationMin}
                hasNote={!!arc.info.note?.trim()}
                labelled={zoom != null && badgeLabelled(arc.chordM, arc.mid.lat, zoom)}
                active={arc.key === activeKey}
              />
            </Marker>
          ) : null,
        )}
    </>
  );
}
