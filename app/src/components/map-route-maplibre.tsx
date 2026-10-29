'use client';

import { useEffect, useMemo } from 'react';
import { Layer, Source, useMap } from 'react-map-gl/maplibre';
import { ROUTE_CASING_COLOR, type MapLeg, type Pin } from '@/lib/map-helpers';
import {
  ARROW_PREFIX,
  ARROW_SIZE,
  CASING_OPACITY,
  CASING_WIDTH,
  ROUTE_MODES,
  ROUTE_WIDTH,
  arrowBitmap,
  arrowImageId,
  legsGeoJSON,
  modeFromArrowImageId,
  routeStyle,
  type RouteMode,
} from '@/lib/map-route';

// The shown day's route on the MapLibre trip map (inside react-map-gl <Map>).
// One persistent source whose data swaps per day (no layer churn); casing, line
// and arrow layers. No interactiveLayerIds, and pins are DOM markers above the
// canvas, so the lines never take clicks.
export function RouteLinesMaplibre({ pins, legs }: { pins: Pin[]; legs: MapLeg[] }) {
  const { current: mapRef } = useMap();
  const data = useMemo(() => legsGeoJSON(pins, legs), [pins, legs]);

  // Arrow icons are generated, not in the basemap sprite. A theme switch
  // (setStyle) drops added images; the resolver re-adds them on demand (it
  // survives style swaps; in maplibre 6 `styleimagemissing` fires too late to fix
  // the current request).
  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    const add = (mode: RouteMode) => {
      const id = arrowImageId(mode);
      if (map.hasImage(id)) return;
      const color = routeStyle(mode === 'none' ? null : mode).color;
      map.addImage(id, arrowBitmap(ARROW_SIZE, color), { pixelRatio: 2 });
    };
    ROUTE_MODES.forEach(add);
    map.setMissingStyleImageResolver((id) => {
      const mode = modeFromArrowImageId(id);
      if (mode) add(mode);
    });
    return () => {
      map.setMissingStyleImageResolver(null);
    };
  }, [mapRef]);

  return (
    <Source id="tp-route" type="geojson" data={data}>
      <Layer
        id="tp-route-casing"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': ROUTE_CASING_COLOR,
          'line-width': CASING_WIDTH,
          'line-opacity': CASING_OPACITY,
        }}
      />
      <Layer
        id="tp-route-line"
        type="line"
        paint={{
          'line-color': ['get', 'color'],
          'line-width': ROUTE_WIDTH,
          // Dash/gap in line widths, same table as routeStyle (transit solid).
          'line-dasharray': [
            'match',
            ['get', 'mode'],
            'walk',
            ['literal', routeStyle('walk').dash],
            'drive',
            ['literal', routeStyle('drive').dash],
            'none',
            ['literal', routeStyle(null).dash],
            ['literal', [1, 0]],
          ],
        }}
      />
      <Layer
        id="tp-route-arrow"
        type="symbol"
        layout={{
          'symbol-placement': 'line-center',
          'icon-image': ['concat', ARROW_PREFIX, ['get', 'mode']],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        }}
      />
    </Source>
  );
}
