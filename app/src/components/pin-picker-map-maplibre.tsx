'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/maplibre-worker';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import { mapStyleUrl } from '@/lib/map-style';
import { useTheme } from '@/lib/use-theme';
import { PickDot } from './map-pick-dot';
import type { PinPickerMapProps } from './map-renderer-props';

export default function PinPickerMap({
  center,
  value,
  onPick,
  zoom = 12,
}: PinPickerMapProps) {
  const theme = useTheme();
  return (
    <Map
      style={{ width: '100%', height: '100%' }}
      initialViewState={{ longitude: center.lng, latitude: center.lat, zoom }}
      mapStyle={mapStyleUrl(theme)}
      cursor="crosshair"
      onClick={(e) => onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {value ? (
        <Marker longitude={value.lng} latitude={value.lat}>
          <PickDot />
        </Marker>
      ) : null}
    </Map>
  );
}
