'use client';

import { useMemo } from 'react';
import { Polyline } from '@vis.gl/react-google-maps';
import { ROUTE_CASING_COLOR, type MapLeg, type Mode, type Pin } from '@/lib/map-helpers';
import { CASING_OPACITY, CASING_WIDTH, ROUTE_WIDTH, googleDash, routeStyle } from '@/lib/map-route';

// The shown day's route on the Google trip map (inside <Map id="trip-map">):
// per leg a white casing + a mode-styled line with a mid-leg arrow. Polylines
// sit in the overlay pane, below every AdvancedMarker, and are not clickable,
// so pin clicks and POI taps pass through. Keyed by pin ids, so they unmount
// with the day.
export function RouteLinesGoogle({ pins, legs }: { pins: Pin[]; legs: MapLeg[] }) {
  return legs.map((leg) => {
    const a = pins[leg.from];
    const b = pins[leg.to];
    if (!a || !b) return null;
    return (
      <RouteLeg key={`${a.id}>${b.id}`} a={a} b={b} mode={leg.mode} />
    );
  });
}

function RouteLeg({ a, b, mode }: { a: Pin; b: Pin; mode: Mode | null }) {
  const path = useMemo(
    () => [
      { lat: a.lat, lng: a.lng },
      { lat: b.lat, lng: b.lng },
    ],
    [a.lat, a.lng, b.lat, b.lng],
  );
  const style = routeStyle(mode);
  const icons = useMemo(() => {
    const s = routeStyle(mode);
    const dash = googleDash(s);
    const out: google.maps.IconSequence[] = [];
    if (dash) {
      out.push({
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 1,
          strokeColor: s.color,
          strokeWeight: ROUTE_WIDTH,
          scale: dash.scale,
        },
        offset: '0',
        repeat: `${dash.repeatPx}px`,
      });
    }
    out.push({
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 3,
        fillColor: s.color,
        fillOpacity: 1,
        strokeColor: ROUTE_CASING_COLOR,
        // Explicit: a polyline symbol's stroke opacity defaults to the
        // polyline's, which is 0 on dashed legs (the rim would vanish).
        strokeOpacity: 1,
        strokeWeight: 1,
      },
      offset: '50%',
    });
    return out;
  }, [mode]);

  return (
    <>
      <Polyline
        path={path}
        geodesic
        clickable={false}
        strokeColor={ROUTE_CASING_COLOR}
        strokeOpacity={CASING_OPACITY}
        strokeWeight={CASING_WIDTH}
        zIndex={1}
      />
      <Polyline
        path={path}
        geodesic
        clickable={false}
        strokeColor={style.color}
        // Dashed legs draw only their dash symbols; the base stroke is hidden.
        strokeOpacity={style.dash ? 0 : 1}
        strokeWeight={ROUTE_WIDTH}
        zIndex={2}
        icons={icons}
      />
    </>
  );
}
