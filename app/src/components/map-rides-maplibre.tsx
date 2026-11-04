'use client';

import { useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { RIDE_COLOR, ROUTE_CASING_COLOR } from '@/lib/map-helpers';
import { RIDE_Z_INDEX } from '@/lib/map-pin';
import {
  CASING_OPACITY,
  CASING_WIDTH,
  RIDE_DASH,
  ROUTE_OPACITY,
  ROUTE_WIDTH,
  ridesGeoJSON,
  type RideArc,
  type RideEnd,
} from '@/lib/map-route';
import { ROUTE_HIT_LAYER } from './map-route-maplibre';
import { RideBadge, RideEndDot } from './map-ride-marks';

type Props = {
  /** The shown day's ride arcs (rideArcs) and located ends (rideEnds). */
  arcs: RideArc[];
  ends: RideEnd[];
  /** Route lines toggle (lib/maps/legs-store): rides hide with the legs. */
  show: boolean;
};

// The shown day's transport rides on the MapLibre trip map (TP-0142). One
// persistent source whose data swaps per day, like RouteLinesMaplibre. Its
// layers sit under the legs via beforeId = the legs' bottom (hit) layer, so
// draw order never depends on mount order (theme switches reload the style);
// render this after <RouteLinesMaplibre> so that layer exists. Not listed in
// the Map's interactiveLayerIds, and the markers take no pointer events (R5).
export function RideLinesMaplibre({ arcs, ends, show }: Props) {
  const data = useMemo(() => ridesGeoJSON(arcs), [arcs]);
  const layout = { 'line-join': 'round', visibility: show ? 'visible' : 'none' } as const;
  const markerStyle = { pointerEvents: 'none', zIndex: RIDE_Z_INDEX } as const;

  return (
    <>
      <Source id="tp-rides" type="geojson" data={data}>
        <Layer
          id="tp-ride-casing"
          type="line"
          beforeId={ROUTE_HIT_LAYER}
          layout={{ ...layout, 'line-cap': 'round' }}
          paint={{ 'line-color': ROUTE_CASING_COLOR, 'line-width': CASING_WIDTH, 'line-opacity': CASING_OPACITY }}
        />
        <Layer
          id="tp-ride-line"
          type="line"
          beforeId={ROUTE_HIT_LAYER}
          layout={{ ...layout, 'line-cap': 'butt' }}
          paint={{
            'line-color': RIDE_COLOR,
            'line-width': ROUTE_WIDTH,
            'line-opacity': ROUTE_OPACITY,
            'line-dasharray': RIDE_DASH,
          }}
        />
      </Source>
      {show &&
        ends.map((e) => (
          <Marker key={e.key} longitude={e.pos.lng} latitude={e.pos.lat} anchor="center" style={markerStyle}>
            <RideEndDot end={e.end} />
          </Marker>
        ))}
      {show &&
        arcs.map((arc) => (
          <Marker key={`${arc.key}:badge`} longitude={arc.mid.lng} latitude={arc.mid.lat} anchor="center" style={markerStyle}>
            <RideBadge type={arc.type} />
          </Marker>
        ))}
    </>
  );
}
