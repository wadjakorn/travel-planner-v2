'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/maplibre-worker';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import { mapStyleUrl } from '@/lib/map-style';
import { useTheme } from '@/lib/use-theme';

type LatLng = { lat: number; lng: number };

export default function PinPickerMap({
  center,
  value,
  onPick,
  zoom = 12,
}: {
  center: LatLng;
  value: LatLng | null;
  onPick: (p: LatLng) => void;
  zoom?: number;
}) {
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
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#0071e3',
              border: '2px solid #fff',
              boxShadow: '0 4px 12px rgba(0,113,227,0.5)',
            }}
          />
        </Marker>
      ) : null}
    </Map>
  );
}
