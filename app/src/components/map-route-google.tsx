'use client';

import { AdvancedMarker, AdvancedMarkerAnchorPoint, Polyline } from '@vis.gl/react-google-maps';
import { ROUTE_CASING_COLOR } from '@/lib/map-helpers';
import { ROUTE_BADGE_Z_INDEX, stopName } from '@/lib/map-pin';
import {
  CASING_OPACITY,
  CASING_WIDTH,
  ROUTE_HIT_WIDTH,
  ROUTE_OPACITY,
  ROUTE_WIDTH,
  type RouteArc as Arc,
} from '@/lib/map-route';
import { RouteBadge } from './map-route-badge';
import { useT } from './i18n-provider';

type Props = {
  /** The shown day's arcs (routeArcs), computed once by the canvas. */
  arcs: Arc[];
  /** Route lines toggle (lib/maps/legs-store). */
  show: boolean;
  /** Arcs and badges take taps. */
  interactive: boolean;
  onSelect: (arc: Arc) => void;
};

// The shown day's route on the Google trip map (inside <Map id="trip-map">):
// per leg a white casing + an arc in its leg colour (already curved, so not
// geodesic), and a mode badge at mid-arc. Polylines sit in the overlay pane,
// below every AdvancedMarker, so pins win a tap. While interactive, an
// invisible wide polyline and a clickable badge select the leg's destination;
// otherwise nothing here takes clicks, so POI taps pass through. Keyed by pin
// ids, so they unmount with the day. zIndex 3-5: above the day's ride lines
// (map-rides-google.tsx, 1-2).
export function RouteLinesGoogle({ arcs, show, interactive, onSelect }: Props) {
  const t = useT();
  if (!show) return null;
  return arcs.map((arc) => (
    <RouteArc
      key={arc.key}
      arc={arc}
      interactive={interactive}
      name={t('map_leg_go', { name: stopName(arc.toPin, t) })}
      onSelect={onSelect}
    />
  ));
}

function RouteArc({
  arc,
  interactive,
  name,
  onSelect,
}: {
  arc: Arc;
  interactive: boolean;
  name: string;
  onSelect: (arc: Arc) => void;
}) {
  const { path, mid, color, toId } = arc;
  const badge = arc.showBadge ? arc.mode : null;
  return (
    <>
      <Polyline
        path={path}
        geodesic={false}
        clickable={false}
        strokeColor={ROUTE_CASING_COLOR}
        strokeOpacity={CASING_OPACITY}
        strokeWeight={CASING_WIDTH}
        zIndex={3}
      />
      <Polyline
        path={path}
        geodesic={false}
        clickable={false}
        strokeColor={color}
        strokeOpacity={ROUTE_OPACITY}
        strokeWeight={ROUTE_WIDTH}
        zIndex={4}
      />
      {interactive && (
        <Polyline
          path={path}
          geodesic={false}
          clickable
          strokeColor={color}
          strokeOpacity={0}
          strokeWeight={ROUTE_HIT_WIDTH}
          zIndex={5}
          onClick={() => onSelect(arc)}
        />
      )}
      {badge && (
        <AdvancedMarker
          position={mid}
          clickable={interactive}
          title={interactive ? name : undefined}
          onClick={interactive ? () => onSelect(arc) : undefined}
          zIndex={ROUTE_BADGE_Z_INDEX}
          anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
        >
          <RouteBadge mode={badge} color={color} toId={toId} interactive={interactive} />
        </AdvancedMarker>
      )}
    </>
  );
}
