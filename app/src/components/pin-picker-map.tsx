'use client';

import dynamic from 'next/dynamic';
import { useMapRenderer } from './maps-config-provider';
import type { PinPickerMapProps } from './map-renderer-props';

// Pin picker renderer selector. Each renderer is its own client-only chunk, so
// google mode never requests maplibre-gl and open mode never loads Google.
const PinPickerMapGoogle = dynamic(() => import('./pin-picker-map-google'), { ssr: false });
const PinPickerMapMaplibre = dynamic(() => import('./pin-picker-map-maplibre'), { ssr: false });

export default function PinPickerMap(props: PinPickerMapProps) {
  return useMapRenderer() === 'google' ? (
    <PinPickerMapGoogle {...props} />
  ) : (
    <PinPickerMapMaplibre {...props} />
  );
}
