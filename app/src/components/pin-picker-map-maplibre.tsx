'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/maplibre-worker';
import { useEffect } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import Map, { Marker, NavigationControl, useMap } from 'react-map-gl/maplibre';
import { mapStyleUrl } from '@/lib/map-style';
import { useTheme } from '@/lib/use-theme';
import { PickDot } from './map-pick-dot';
import { PICKER_FOCUS_ZOOM, type LatLng, type PinPickerMapProps } from './map-renderer-props';

export default function PinPickerMap({
  center,
  value,
  onPick,
  zoom = 12,
  onCenterChange,
  focus,
}: PinPickerMapProps) {
  const theme = useTheme();
  const report = (e: { target: MaplibreMap }) => {
    const c = e.target.getCenter();
    onCenterChange?.({ lat: c.lat, lng: c.lng });
  };
  return (
    <Map
      style={{ width: '100%', height: '100%' }}
      initialViewState={{ longitude: center.lng, latitude: center.lat, zoom }}
      mapStyle={mapStyleUrl(theme)}
      cursor="crosshair"
      cooperativeGestures
      onClick={(e) => onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      onLoad={report}
      onMoveEnd={report}
    >
      <PickerFocus focus={focus} />
      <NavigationControl position="top-right" showCompass={false} />
      {value ? (
        <Marker longitude={value.lng} latitude={value.lat}>
          <PickDot />
        </Marker>
      ) : null}
    </Map>
  );
}

function PickerFocus({ focus }: { focus?: LatLng | null }) {
  const { current } = useMap();
  useEffect(() => {
    if (!current || !focus) return;
    current.jumpTo({ center: [focus.lng, focus.lat], zoom: Math.max(current.getZoom(), PICKER_FOCUS_ZOOM) });
  }, [current, focus]);
  return null;
}
