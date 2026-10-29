'use client';

import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  ColorScheme,
  Map,
  useMap,
} from '@vis.gl/react-google-maps';
import { useEffect } from 'react';
import { useTheme } from '@/lib/use-theme';
import { GoogleMapsApi } from './google-maps-api';
import { GoogleMapErrorBoundary } from './google-map-error-boundary';
import { useGoogleMapsConfig } from './maps-config-provider';
import { PickDot } from './map-pick-dot';
import { PICKER_FOCUS_ZOOM, type LatLng, type PinPickerMapProps } from './map-renderer-props';

// Google renderer for the pin picker (selected by pin-picker-map.tsx).
// Deliberately no reuseMaps: one billed load per picker open, and the picker's
// options (cursor, clickableIcons, controls) must not leak into the trip map's
// cached instance.
export default function PinPickerMapGoogle({
  center,
  value,
  onPick,
  zoom,
  onCenterChange,
  focus,
}: PinPickerMapProps) {
  const theme = useTheme();
  const { mapId, degraded } = useGoogleMapsConfig();
  return (
    <GoogleMapErrorBoundary>
      <GoogleMapsApi>
        <Map
          style={{ width: '100%', height: '100%' }}
          mapId={mapId}
          colorScheme={theme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT}
          defaultCenter={center}
          defaultZoom={zoom ?? 12}
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
          draggableCursor="crosshair"
          onClick={(e) => {
            if (e.detail.latLng) onPick({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng });
          }}
          onIdle={(e) => {
            if (degraded) return;
            const c = e.map.getCenter();
            if (c) onCenterChange?.(c.toJSON());
          }}
        >
          {degraded ? null : <PickerFocus focus={focus} />}
          {/* No marker on a dead map: setting marker.map after an auth failure throws. */}
          {value && !degraded ? (
            <AdvancedMarker position={value} anchorPoint={AdvancedMarkerAnchorPoint.CENTER}>
              <PickDot />
            </AdvancedMarker>
          ) : null}
        </Map>
      </GoogleMapsApi>
    </GoogleMapErrorBoundary>
  );
}

// setCenter (not panTo): no animation, so reduced motion is respected.
function PickerFocus({ focus }: { focus?: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !focus) return;
    map.setCenter(focus);
    map.setZoom(Math.max(map.getZoom() ?? 0, PICKER_FOCUS_ZOOM));
  }, [map, focus]);
  return null;
}
