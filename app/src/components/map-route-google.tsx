'use client';

import { useMemo } from 'react';
import { AdvancedMarker, AdvancedMarkerAnchorPoint, Polyline } from '@vis.gl/react-google-maps';
import { ROUTE_CASING_COLOR, type MapLeg, type Pin } from '@/lib/map-helpers';
import { ROUTE_BADGE_Z_INDEX } from '@/lib/map-pin';
import { CASING_OPACITY, CASING_WIDTH, ROUTE_OPACITY, ROUTE_WIDTH, routeArcs } from '@/lib/map-route';
import { RouteBadge } from './map-route-badge';

// The shown day's route on the Google trip map (inside <Map id="trip-map">):
// per leg a white casing + an arc in its leg colour (already curved, so not geodesic), and
// a mode badge at mid-arc. Polylines sit in the overlay pane, below every
// AdvancedMarker; neither they nor the non-clickable badge take clicks, so pin
// clicks and POI taps pass through. Keyed by pin ids, so they unmount with the
// day; `pins`/`legs` are stable per day, so hover re-renders reuse the paths.
export function RouteLinesGoogle({ pins, legs }: { pins: Pin[]; legs: MapLeg[] }) {
  const arcs = useMemo(() => routeArcs(pins, legs), [pins, legs]);
  return arcs.map((arc) => (
    <RouteArc key={arc.key} path={arc.path} badge={arc.showBadge ? arc.mode : null} mid={arc.mid} color={arc.color} />
  ));
}

function RouteArc({
  path,
  mid,
  badge,
  color,
}: {
  path: google.maps.LatLngLiteral[];
  mid: google.maps.LatLngLiteral;
  badge: MapLeg['mode'];
  color: string;
}) {
  return (
    <>
      <Polyline
        path={path}
        geodesic={false}
        clickable={false}
        strokeColor={ROUTE_CASING_COLOR}
        strokeOpacity={CASING_OPACITY}
        strokeWeight={CASING_WIDTH}
        zIndex={1}
      />
      <Polyline
        path={path}
        geodesic={false}
        clickable={false}
        strokeColor={color}
        strokeOpacity={ROUTE_OPACITY}
        strokeWeight={ROUTE_WIDTH}
        zIndex={2}
      />
      {badge && (
        <AdvancedMarker
          position={mid}
          clickable={false}
          zIndex={ROUTE_BADGE_Z_INDEX}
          anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
        >
          <RouteBadge mode={badge} color={color} />
        </AdvancedMarker>
      )}
    </>
  );
}
