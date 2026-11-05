'use client';

import { useEffect, useState } from 'react';
import { AdvancedMarker, AdvancedMarkerAnchorPoint, Polyline, useMap } from '@vis.gl/react-google-maps';
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
  /** The selected stop: its incoming leg gets a halo and an active badge. */
  activePlaceId: string | null;
  onSelect: (arc: Arc) => void;
};

/** The map's zoom, rounded: re-renders only when the whole number changes. null until the map is up. */
function useRoundZoom(): number | null {
  const map = useMap();
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    if (!map) return;
    const read = () => {
      const z = map.getZoom();
      setZoom(z == null ? null : Math.round(z));
    };
    read();
    const l = map.addListener('zoom_changed', read);
    return () => l.remove();
  }, [map]);
  return zoom;
}

// The shown day's route on the Google trip map (inside <Map id="trip-map">):
// per leg a white casing + an arc in its leg colour (already curved, so not
// geodesic), and a mode badge at mid-arc. Polylines sit in the overlay pane,
// below every AdvancedMarker, so pins win a tap. While interactive, an
// invisible wide polyline and a clickable badge select the leg's destination;
// otherwise nothing here takes clicks, so POI taps pass through. Keyed by pin
// ids, so they unmount with the day. zIndex 3-6 (halo, casing, line, hit):
// above the day's ride lines (map-rides-google.tsx, 1-2). The badge is a full
// capsule only when the leg is long enough on screen at the current zoom.
export function RouteLinesGoogle({ arcs, show, interactive, activePlaceId, onSelect }: Props) {
  const t = useT();
  const zoom = useRoundZoom();
  if (!show) return null;
  const activeKey = activeArcKey(arcs, activePlaceId);
  return arcs.map((arc) => (
    <RouteArc
      key={arc.key}
      arc={arc}
      interactive={interactive}
      active={arc.key === activeKey}
      labelled={zoom != null && badgeLabelled(arc.chordM, arc.mid.lat, zoom)}
      name={t('map_leg_go', { name: stopName(arc.toPin, t) })}
      onSelect={onSelect}
    />
  ));
}

function RouteArc({
  arc,
  interactive,
  active,
  labelled,
  name,
  onSelect,
}: {
  arc: Arc;
  interactive: boolean;
  active: boolean;
  labelled: boolean;
  name: string;
  onSelect: (arc: Arc) => void;
}) {
  const { path, mid, color, toId } = arc;
  const badge = arc.showBadge ? arc.mode : null;
  return (
    <>
      {active && (
        <Polyline
          path={path}
          geodesic={false}
          clickable={false}
          strokeColor={color}
          strokeOpacity={ROUTE_HALO_OPACITY}
          strokeWeight={ROUTE_HALO_WIDTH}
          zIndex={3}
        />
      )}
      <Polyline
        path={path}
        geodesic={false}
        clickable={false}
        strokeColor={ROUTE_CASING_COLOR}
        strokeOpacity={CASING_OPACITY}
        strokeWeight={CASING_WIDTH}
        zIndex={4}
      />
      <Polyline
        path={path}
        geodesic={false}
        clickable={false}
        strokeColor={color}
        strokeOpacity={ROUTE_OPACITY}
        strokeWeight={ROUTE_WIDTH}
        zIndex={5}
      />
      {interactive && (
        <Polyline
          path={path}
          geodesic={false}
          clickable
          strokeColor={color}
          strokeOpacity={0}
          strokeWeight={ROUTE_HIT_WIDTH}
          zIndex={6}
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
          <RouteBadge
            mode={badge}
            color={color}
            toId={toId}
            interactive={interactive}
            durationMin={arc.info.durationMin}
            hasNote={!!arc.info.note?.trim()}
            labelled={labelled}
            active={active}
          />
        </AdvancedMarker>
      )}
    </>
  );
}
