'use client';

import { AdvancedMarker, AdvancedMarkerAnchorPoint, Polyline } from '@vis.gl/react-google-maps';
import { RIDE_COLOR, ROUTE_CASING_COLOR } from '@/lib/map-helpers';
import { RIDE_Z_INDEX } from '@/lib/map-pin';
import {
  CASING_OPACITY,
  CASING_WIDTH,
  ROUTE_OPACITY,
  ROUTE_WIDTH,
  type RideArc,
  type RideEnd,
} from '@/lib/map-route';
import { RideBadge, RideEndDot } from './map-ride-marks';

type Props = {
  /** The shown day's ride arcs (rideArcs) and located ends (rideEnds). */
  arcs: RideArc[];
  ends: RideEnd[];
  /** Route lines toggle (lib/maps/legs-store): rides hide with the legs. */
  show: boolean;
};

// Google draws a dashed Polyline as repeated symbols on an invisible stroke.
const DASH_ICONS = [
  {
    icon: { path: 'M 0,-1 0,1', strokeColor: RIDE_COLOR, strokeOpacity: ROUTE_OPACITY, strokeWeight: ROUTE_WIDTH, scale: 2 },
    offset: '0',
    repeat: '12px',
  },
];

// The shown day's transport rides on the Google trip map (TP-0142): per ride
// a white casing + a dashed neutral arc under the day's legs (route zIndex 3+),
// its located ends and a type badge, all non-clickable (R5) so taps reach the
// pins, legs and POIs. Keyed by booking id, so they unmount with the day.
export function RideLinesGoogle({ arcs, ends, show }: Props) {
  if (!show) return null;
  return (
    <>
      {arcs.map((arc) => (
        <RideArcGoogle key={arc.key} arc={arc} />
      ))}
      {ends.map((e) => (
        <AdvancedMarker
          key={e.key}
          position={e.pos}
          clickable={false}
          zIndex={RIDE_Z_INDEX}
          anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
        >
          <RideEndDot end={e.end} />
        </AdvancedMarker>
      ))}
    </>
  );
}

function RideArcGoogle({ arc }: { arc: RideArc }) {
  return (
    <>
      <Polyline
        path={arc.path}
        geodesic={false}
        clickable={false}
        strokeColor={ROUTE_CASING_COLOR}
        strokeOpacity={CASING_OPACITY}
        strokeWeight={CASING_WIDTH}
        zIndex={1}
      />
      <Polyline
        path={arc.path}
        geodesic={false}
        clickable={false}
        strokeColor={RIDE_COLOR}
        strokeOpacity={0}
        icons={DASH_ICONS}
        zIndex={2}
      />
      <AdvancedMarker
        position={arc.mid}
        clickable={false}
        zIndex={RIDE_Z_INDEX}
        anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
      >
        <RideBadge type={arc.type} />
      </AdvancedMarker>
    </>
  );
}
